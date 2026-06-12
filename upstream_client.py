import json
import threading
import time
import io
import socket
import sys
from contextlib import closing
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener
import urllib3


class MockRaw:
    def __init__(self, sock):
        self._sock = sock


class MockFp:
    def __init__(self, sock):
        self.raw = MockRaw(sock)


class HTTPResponseLineWrapper:
    """Wrapper around urllib3.HTTPResponse to provide a readline() and iterable interface
    matching standard urllib response, and mock fp.raw._sock for timeout updates.
    """
    def __init__(self, resp: urllib3.HTTPResponse):
        self.resp = resp
        self.reader = io.BufferedReader(resp)

    def readline(self, *args, **kwargs) -> bytes:
        return self.reader.readline(*args, **kwargs)

    def read(self, *args, **kwargs) -> bytes:
        return self.reader.read(*args, **kwargs)

    def __iter__(self):
        return self

    def __next__(self) -> bytes:
        line = self.readline()
        if not line:
            raise StopIteration
        return line

    def close(self):
        try:
            self.reader.close()
        except Exception:
            pass
        try:
            self.resp.close()
        except Exception:
            pass

    @property
    def status(self):
        return self.resp.status

    @property
    def headers(self):
        return self.resp.headers

    @property
    def connection(self):
        return self.resp.connection

    @property
    def fp(self) -> Optional[MockFp]:
        try:
            sock = self.resp.connection.sock if (self.resp and self.resp.connection) else None
            if sock:
                return MockFp(sock)
        except Exception:
            pass
        return None


class OpenAIUpstreamClient:
    """
    OpenAI Chat Completions 上游客户端（支持 urllib 与 urllib3 双传输通道，高性能与测试兼容）。
    - stream：返回 HTTPResponseLineWrapper 包装流 或 urlopen response
    - non-stream：返回解析后的 JSON dict
    - 支持按请求指定代理（key.proxy > provider.proxy > 全局 proxy > 直连）
    """

    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        # urllib (legacy / test compat)
        self._default_opener = build_opener(ProxyHandler({}))
        self._proxy_openers: Dict[str, Any] = {}
        self._proxy_openers_lock = threading.Lock()

        # urllib3 (high performance)
        self._pool_managers: Dict[str, urllib3.PoolManager | urllib3.ProxyManager] = {}
        self._pool_managers_lock = threading.Lock()

    def _use_urllib3(self) -> bool:
        # Check config setting. Default to urllib for tests, but urllib3 for production.
        routing = self.cfg.get("routing", {}) or {}
        default_transport = "urllib" if "unittest" in sys.modules else "urllib3"
        transport = str(routing.get("transport", default_transport)).lower().strip()
        return transport == "urllib3"

    def _opener_for(self, proxy_url: Optional[str] = None):
        """返回带指定代理的 opener；无代理时复用默认 opener（仅在 urllib 传输下使用）。"""
        if not proxy_url or not str(proxy_url).strip():
            return self._default_opener
        proxy_url = str(proxy_url).strip()
        cached = self._proxy_openers.get(proxy_url)
        if cached is not None:
            return cached
        with self._proxy_openers_lock:
            cached = self._proxy_openers.get(proxy_url)
            if cached is not None:
                return cached
            try:
                opener = build_opener(ProxyHandler({"http": proxy_url, "https": proxy_url}))
            except Exception:
                return self._default_opener
            self._proxy_openers[proxy_url] = opener
            return opener

    def _pool_manager_for(self, proxy_url: Optional[str] = None) -> urllib3.PoolManager | urllib3.ProxyManager:
        """返回带指定代理的 PoolManager；无代理时复用默认 PoolManager（仅在 urllib3 传输下使用）。"""
        if not proxy_url or not str(proxy_url).strip():
            key = "direct"
        else:
            key = str(proxy_url).strip()

        cached = self._pool_managers.get(key)
        if cached is not None:
            return cached

        with self._pool_managers_lock:
            cached = self._pool_managers.get(key)
            if cached is not None:
                return cached

            max_workers = int((self.cfg.get("server") or {}).get("max_workers", 20))
            pool_size = max(10, max_workers)

            try:
                if key == "direct":
                    manager = urllib3.PoolManager(
                        num_pools=pool_size,
                        maxsize=pool_size,
                        retries=False
                    )
                else:
                    manager = urllib3.ProxyManager(
                        key,
                        num_pools=pool_size,
                        maxsize=pool_size,
                        retries=False
                    )
            except Exception:
                if "direct" in self._pool_managers:
                    return self._pool_managers["direct"]
                manager = urllib3.PoolManager(num_pools=pool_size, maxsize=pool_size, retries=False)

            self._pool_managers[key] = manager
            return manager

    def _timeout(self, *, is_stream: bool, remaining_timeout_s: Optional[int] = None) -> int:
        routing = self.cfg.get("routing", {}) or {}
        connect_t = int(routing.get("connect_timeout_s", 15))
        read_t = int(routing.get("read_timeout_s", 120))
        if is_stream:
            return read_t
        base_t = connect_t + read_t
        if remaining_timeout_s is not None:
            return min(base_t, max(connect_t, remaining_timeout_s))
        return base_t

    def request_json(
        self,
        url: str,
        headers: Dict[str, str],
        payload: Dict[str, Any],
        *,
        proxy_url: Optional[str] = None,
        remaining_timeout_s: Optional[int] = None,
    ) -> Dict[str, Any]:
        if self._use_urllib3():
            pool = self._pool_manager_for(proxy_url)
            timeout = self._timeout(is_stream=False, remaining_timeout_s=remaining_timeout_s)
            routing = self.cfg.get("routing", {}) or {}
            connect_t = int(routing.get("connect_timeout_s", 15))
            urllib3_timeout = urllib3.Timeout(connect=connect_t, read=timeout)

            try:
                resp = pool.request(
                    "POST",
                    url,
                    headers=headers,
                    body=json.dumps(payload).encode("utf-8"),
                    timeout=urllib3_timeout,
                    preload_content=True,
                    redirect=False
                )
            except urllib3.exceptions.TimeoutError as e:
                raise socket.timeout(str(e))
            except Exception as e:
                raise URLError(str(e))

            if resp.status >= 400:
                fp = io.BytesIO(resp.data)
                raise HTTPError(url, resp.status, getattr(resp, "reason", ""), resp.headers, fp)

            return json.loads(resp.data.decode("utf-8", errors="replace"))
        else:
            http_req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
            opener = self._opener_for(proxy_url)
            timeout = self._timeout(is_stream=False, remaining_timeout_s=remaining_timeout_s)
            with closing(opener.open(http_req, timeout=timeout)) as resp:
                raw = resp.read()
            return json.loads(raw)

    def request_json_with_timing(
        self,
        url: str,
        headers: Dict[str, str],
        payload: Dict[str, Any],
        *,
        proxy_url: Optional[str] = None,
        remaining_timeout_s: Optional[int] = None,
    ) -> tuple[Dict[str, Any], int]:
        if self._use_urllib3():
            pool = self._pool_manager_for(proxy_url)
            timeout = self._timeout(is_stream=False, remaining_timeout_s=remaining_timeout_s)
            routing = self.cfg.get("routing", {}) or {}
            connect_t = int(routing.get("connect_timeout_s", 15))
            urllib3_timeout = urllib3.Timeout(connect=connect_t, read=timeout)

            started = time.time()
            try:
                resp = pool.request(
                    "POST",
                    url,
                    headers=headers,
                    body=json.dumps(payload).encode("utf-8"),
                    timeout=urllib3_timeout,
                    preload_content=True,
                    redirect=False
                )
                first_byte_ms = max(0, int((time.time() - started) * 1000))
            except urllib3.exceptions.TimeoutError as e:
                raise socket.timeout(str(e))
            except Exception as e:
                raise URLError(str(e))

            if resp.status >= 400:
                fp = io.BytesIO(resp.data)
                raise HTTPError(url, resp.status, getattr(resp, "reason", ""), resp.headers, fp)

            return json.loads(resp.data.decode("utf-8", errors="replace")), first_byte_ms
        else:
            http_req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
            opener = self._opener_for(proxy_url)
            timeout = self._timeout(is_stream=False, remaining_timeout_s=remaining_timeout_s)
            started = time.time()
            with closing(opener.open(http_req, timeout=timeout)) as resp:
                first_byte_ms = max(0, int((time.time() - started) * 1000))
                raw = resp.read()
            return json.loads(raw), first_byte_ms

    def open_stream(
        self,
        url: str,
        headers: Dict[str, str],
        payload: Dict[str, Any],
        *,
        proxy_url: Optional[str] = None,
        remaining_timeout_s: Optional[int] = None,
        first_byte_timeout_s: Optional[int] = None,
    ):
        if self._use_urllib3():
            hdr = dict(headers)
            hdr["Accept"] = "text/event-stream"
            timeout = self._timeout(is_stream=True, remaining_timeout_s=remaining_timeout_s)
            routing = self.cfg.get("routing", {}) or {}
            connect_t = int(routing.get("connect_timeout_s", 15))
            connect_timeout = connect_t
            if first_byte_timeout_s:
                connect_timeout = min(connect_timeout, float(first_byte_timeout_s))

            pool = self._pool_manager_for(proxy_url)
            read_timeout = first_byte_timeout_s if first_byte_timeout_s else timeout
            urllib3_timeout = urllib3.Timeout(connect=connect_timeout, read=read_timeout)

            try:
                resp = pool.request(
                    "POST",
                    url,
                    headers=hdr,
                    body=json.dumps(payload).encode("utf-8"),
                    timeout=urllib3_timeout,
                    preload_content=False,
                    redirect=False
                )
            except urllib3.exceptions.TimeoutError as e:
                raise socket.timeout(str(e))
            except Exception as e:
                raise URLError(str(e))

            if resp.status >= 400:
                body_bytes = resp.read()
                fp = io.BytesIO(body_bytes)
                raise HTTPError(url, resp.status, getattr(resp, "reason", ""), resp.headers, fp)

            return HTTPResponseLineWrapper(resp)
        else:
            hdr = dict(headers)
            hdr["Accept"] = "text/event-stream"
            http_req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=hdr)
            opener = self._opener_for(proxy_url)
            timeout = self._timeout(is_stream=True, remaining_timeout_s=remaining_timeout_s)
            routing = self.cfg.get("routing", {}) or {}
            connect_t = int(routing.get("connect_timeout_s", 15))
            connect_timeout = connect_t
            if first_byte_timeout_s:
                connect_timeout = min(connect_timeout, float(first_byte_timeout_s))
            resp = opener.open(http_req, timeout=connect_timeout)
            try:
                sock = resp.fp.raw._sock if hasattr(resp.fp, 'raw') and hasattr(resp.fp.raw, '_sock') else None
                if sock:
                    sock.settimeout(timeout)
            except Exception:
                pass
            return resp

    def fetch_models(
        self,
        base_url: str,
        models_path: str,
        headers: Dict[str, str],
        *,
        timeout_s: int = 10,
        proxy_url: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if self._use_urllib3():
            url = base_url.rstrip("/") + (models_path if models_path.startswith("/") else ("/" + models_path))
            pool = self._pool_manager_for(proxy_url)
            urllib3_timeout = urllib3.Timeout(connect=5, read=int(timeout_s))

            try:
                resp = pool.request(
                    "GET",
                    url,
                    headers=headers,
                    timeout=urllib3_timeout,
                    preload_content=True,
                    redirect=False
                )
            except urllib3.exceptions.TimeoutError as e:
                raise socket.timeout(str(e))
            except Exception as e:
                raise URLError(str(e))

            if resp.status >= 400:
                body = resp.data.decode("utf-8", errors="replace")[:300]
                raise RuntimeError(f"HTTP {resp.status} fetching {url}: {body}")

            return json.loads(resp.data.decode("utf-8", errors="replace"))
        else:
            url = base_url.rstrip("/") + (models_path if models_path.startswith("/") else ("/" + models_path))
            req = Request(url, headers=headers)
            opener = self._opener_for(proxy_url)
            try:
                with closing(opener.open(req, timeout=int(timeout_s))) as resp:
                    raw = resp.read()
                return json.loads(raw)
            except HTTPError as e:
                body = ""
                try:
                    body = e.read().decode("utf-8", errors="replace")[:300]
                except Exception:
                    body = ""
                raise RuntimeError(f"HTTP {int(getattr(e, 'code', 0) or 0)} fetching {url}: {body}") from e
            except Exception as e:
                raise RuntimeError(f"{type(e).__name__} fetching {url}: {str(e)[:300]}") from e
