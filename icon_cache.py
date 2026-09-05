"""品牌图标本地代理缓存。

前端此前直连 unpkg CDN 取 @lobehub/icons SVG，国内经常慢到图标
长时间空白。本模块把字节缓存在本地：内存 LRU（64 项）+ 磁盘
data/icon_cache/，上游优先 npmmirror（国内快），失败回退 unpkg。
图标是公开静态资源，slug 经严格 allowlist 校验，无路径穿越风险。
"""
from __future__ import annotations

import os
import re
import threading
import time
import urllib.request
from collections import OrderedDict
from typing import Optional

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
_TYPE_OK = ("color", "mono")
_MAX_BYTES = 100 * 1024
_MEM_MAX = 64
_TIMEOUT_S = 8.0


def _cache_dir() -> str:
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "icon_cache")
    os.makedirs(d, exist_ok=True)
    return d


def normalize(slug: str, typ: str) -> tuple[Optional[str], str]:
    """校验并规范化，非法返回 (None, typ)。"""
    s = (slug or "").strip().lower()
    t = (typ or "mono").strip().lower()
    if t not in _TYPE_OK:
        t = "mono"
    if not _SLUG_RE.match(s):
        return None, t
    return s, t


def upstream_urls(slug: str, typ: str) -> list[str]:
    """与前端 getLobeIconCDN(cdn) 等价的 URL 构造（svg / color|mono）。"""
    name = slug + ("" if typ == "mono" else "-color")
    return [
        f"https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/{name}.svg",
        f"https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{name}.svg",
    ]


_mem: "OrderedDict[tuple[str, str], bytes]" = OrderedDict()
_mem_lock = threading.Lock()
_key_locks: dict[tuple[str, str], threading.Lock] = {}
_key_locks_guard = threading.Lock()


def _key_lock(key: tuple[str, str]) -> threading.Lock:
    with _key_locks_guard:
        lock = _key_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _key_locks[key] = lock
        return lock


def _mem_get(key: tuple[str, str]) -> Optional[bytes]:
    with _mem_lock:
        data = _mem.get(key)
        if data is not None:
            _mem.move_to_end(key)
        return data


def _mem_set(key: tuple[str, str], data: bytes) -> None:
    with _mem_lock:
        _mem[key] = data
        _mem.move_to_end(key)
        while len(_mem) > _MEM_MAX:
            _mem.popitem(last=False)


def _valid_svg(data: bytes) -> bool:
    if not data or len(data) > _MAX_BYTES:
        return False
    head = data.lstrip(b"\xef\xbb\xbf \t\r\n")[:4].lower()
    return head.startswith(b"<svg")


def _fetch_upstream(slug: str, typ: str) -> Optional[bytes]:
    urls = upstream_urls(slug, typ)
    if typ == "color":
        # 部分品牌（如 anthropic/groq）上游没有 color 版：回退 mono，
        # 避免前端选型失误导致图标永久缺失。
        urls += upstream_urls(slug, "mono")
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "litellm-proxy-icon-cache/1.0"})
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
                if getattr(resp, "status", 200) != 200:
                    continue
                data = resp.read(_MAX_BYTES + 1)
            if _valid_svg(data):
                return data
        except Exception:
            continue
    return None


def get_icon(slug: str, typ: str = "mono") -> Optional[bytes]:
    """内存 -> 磁盘 -> 上游（三级）。非法 slug / 上游失败返回 None。"""
    slug, typ = normalize(slug, typ)
    if slug is None:
        return None
    key = (slug, typ)
    data = _mem_get(key)
    if data is not None:
        return data
    path = os.path.join(_cache_dir(), f"{slug}-{typ}.svg")
    try:
        if os.path.isfile(path) and os.path.getsize(path) <= _MAX_BYTES:
            with open(path, "rb") as f:
                data = f.read()
            if _valid_svg(data):
                _mem_set(key, data)
                return data
    except OSError:
        pass
    # 同一图标并发只允许一个上游请求（控制台一次渲染几十个同品牌图标）。
    with _key_lock(key):
        data = _mem_get(key)
        if data is not None:
            return data
        try:
            if os.path.isfile(path) and os.path.getsize(path) <= _MAX_BYTES:
                with open(path, "rb") as f:
                    data = f.read()
                if _valid_svg(data):
                    _mem_set(key, data)
                    return data
        except OSError:
            pass
        data = _fetch_upstream(slug, typ)
        if not _valid_svg(data or b""):
            return None
        try:
            tmp = path + f".{os.getpid()}.{time.time_ns()}.tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
        except OSError:
            pass
        _mem_set(key, data)
        return data


def cache_stats() -> dict:
    with _mem_lock:
        keys = list(_mem.keys())
    try:
        files = [f for f in os.listdir(_cache_dir()) if f.endswith(".svg")]
    except OSError:
        files = []
    return {"memory_items": len(keys), "disk_files": len(files)}
