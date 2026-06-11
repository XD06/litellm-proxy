#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import threading
import time
from contextlib import closing
from typing import Any, Dict, Optional
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener


class OpenAIUpstreamClient:
    """
    OpenAI Chat Completions 上游客户端（urllib 版本，零依赖）。
    - stream：返回 urlopen response（可迭代读取 SSE 行）
    - non-stream：返回解析后的 JSON dict
    - 支持按请求指定代理（key.proxy > provider.proxy > 全局 proxy > 直连）
    """

    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        # 关键点：
        # urllib.request.build_opener() 默认会安装 ProxyHandler，并可能读取环境变量
        # HTTP_PROXY/HTTPS_PROXY/ALL_PROXY 等，导致“即使配置里 proxy=direct 也走系统代理”。
        # 这里显式传入一个空 ProxyHandler，确保默认 opener 永远不走代理（除非我们显式指定 proxy_url）。
        self._default_opener = build_opener(ProxyHandler({}))  # 强制直连的默认 opener
        self._proxy_openers: Dict[str, Any] = {}
        self._proxy_openers_lock = threading.Lock()

    def _opener_for(self, proxy_url: Optional[str] = None):
        """返回带指定代理的 opener；无代理时复用默认 opener。

        按 proxy_url 缓存 opener，避免每个走代理的请求都重建（重建是热路径上的
        无谓分配，也阻碍后续连接复用）。"""
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

    def _timeout(self, *, is_stream: bool, remaining_timeout_s: Optional[int] = None) -> int:
        routing = self.cfg.get("routing", {}) or {}
        connect_t = int(routing.get("connect_timeout_s", 30))
        read_t = int(routing.get("read_timeout_s", 180))
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
        hdr = dict(headers)
        hdr["Accept"] = "text/event-stream"
        http_req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=hdr)
        opener = self._opener_for(proxy_url)
        timeout = self._timeout(is_stream=True, remaining_timeout_s=remaining_timeout_s)
        # 使用首字节超时（如果指定）作为初始连接超时
        connect_timeout = first_byte_timeout_s if first_byte_timeout_s else timeout
        resp = opener.open(http_req, timeout=connect_timeout)
        # 如果指定了首字节超时，设置 socket 超时以便在首字节到达后可以延长
        if first_byte_timeout_s:
            try:
                sock = resp.fp.raw._sock if hasattr(resp.fp, 'raw') and hasattr(resp.fp.raw, '_sock') else None
                if sock:
                    sock.settimeout(timeout)  # 收到连接后恢复为正常读取超时
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
        url = base_url.rstrip("/") + (models_path if models_path.startswith("/") else ("/" + models_path))
        req = Request(url, headers=headers)
        opener = self._opener_for(proxy_url)
        try:
            with closing(opener.open(req, timeout=int(timeout_s))) as resp:
                raw = resp.read()
            return json.loads(raw)
        except HTTPError:
            return None
        except Exception:
            return None
