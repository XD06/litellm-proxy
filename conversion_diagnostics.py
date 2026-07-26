from __future__ import annotations

import json
import os
import queue
import re
import threading
import time
from typing import Any, Dict, Optional
from urllib.parse import urlsplit, urlunsplit


_REDACTED = "[REDACTED]"
_SENSITIVE_NAMES = {
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "api_key",
    "apikey",
    "password",
    "passwd",
    "secret",
    "client_secret",
    "access_token",
    "refresh_token",
}
_SAFE_KEY_NAMES = {"key_id", "key_index", "key_masked", "cache_key"}
_BEARER_RE = re.compile(r"(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+")
_API_KEY_RE = re.compile(r"(?<![A-Za-z0-9])(?:sk|rk|pk|nvapi|AIza)[-_][A-Za-z0-9._-]{8,}")


def _positive_int(value: Any, default: int, *, minimum: int = 1) -> int:
    try:
        return max(minimum, int(value))
    except (TypeError, ValueError):
        return default


def _is_sensitive_name(name: Any) -> bool:
    normalized = str(name or "").strip().lower()
    if normalized in _SAFE_KEY_NAMES:
        return False
    return normalized in _SENSITIVE_NAMES or normalized.endswith("_api_key") or normalized.endswith("_password")


def _redact_url_credentials(value: str) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return value
    if not parsed.scheme or not parsed.netloc or parsed.username is None:
        return value
    host = parsed.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme, f"{_REDACTED}@{host}", parsed.path, parsed.query, parsed.fragment))


def _redact_text(value: Any, limit: int = 4000) -> str:
    text = str(value or "")
    text = _BEARER_RE.sub(lambda match: f"{match.group(1)} {_REDACTED}", text)
    text = _API_KEY_RE.sub(_REDACTED, text)
    text = re.sub(
        r"(?i)(https?://)([^/@\s:]+):([^/@\s]+)@",
        lambda match: f"{match.group(1)}{_REDACTED}@",
        text,
    )
    text = _redact_url_credentials(text)
    if len(text) > limit:
        return text[:limit] + "...[truncated]"
    return text


def sanitize_diagnostic_value(value: Any, *, depth: int = 0, max_depth: int = 10) -> Any:
    if depth >= max_depth:
        return "[MAX_DEPTH]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, bytes):
        return _redact_text(value.decode("utf-8", errors="replace"))
    if isinstance(value, dict):
        result: Dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 200:
                result["__truncated_fields__"] = len(value) - index
                break
            name = str(key)
            result[name] = _REDACTED if _is_sensitive_name(name) else sanitize_diagnostic_value(
                item,
                depth=depth + 1,
                max_depth=max_depth,
            )
        return result
    if isinstance(value, (list, tuple, set)):
        items = list(value)
        result = [sanitize_diagnostic_value(item, depth=depth + 1, max_depth=max_depth) for item in items[:200]]
        if len(items) > 200:
            result.append({"__truncated_items__": len(items) - 200})
        return result
    return _redact_text(value)


class ConversionDiagnosticStore:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        config = config or {}
        raw = ((config.get("observability") or {}).get("conversion_diagnostics") or {})
        if not isinstance(raw, dict):
            raw = {}
        self.enabled = bool(raw.get("enabled", True))
        self.max_file_bytes = _positive_int(raw.get("max_file_bytes"), 8 * 1024 * 1024, minimum=1024)
        self.retained_files = _positive_int(raw.get("retained_files"), 7)
        self.max_context_bytes = _positive_int(raw.get("max_context_bytes"), 64 * 1024, minimum=256)
        self._queue: queue.Queue = queue.Queue(maxsize=_positive_int(raw.get("queue_size"), 256))
        self._file_lock = threading.RLock()
        self._state_lock = threading.Lock()
        self._closed = False
        self._dropped = 0
        self._records = 0
        self._updated_at = 0.0

        log_dir = str((config.get("server") or {}).get("log_dir") or "proxy_logs").strip() or "proxy_logs"
        if not os.path.isabs(log_dir):
            log_dir = os.path.join(os.path.dirname(__file__), log_dir)
        configured_path = str(raw.get("path") or "conversion_errors.jsonl").strip() or "conversion_errors.jsonl"
        self.path = configured_path if os.path.isabs(configured_path) else os.path.join(log_dir, configured_path)
        self.path = os.path.abspath(self.path)
        self._worker: Optional[threading.Thread] = None
        if self.enabled:
            self._load_existing_state()

    def _ensure_worker(self) -> bool:
        if not self.enabled or self._closed:
            return False
        with self._state_lock:
            if self._worker is not None and self._worker.is_alive():
                return True
            self._worker = threading.Thread(target=self._run, name="conversion-diagnostics", daemon=True)
            self._worker.start()
            return True

    def _paths(self) -> list[str]:
        return [self.path] + [f"{self.path}.{index}" for index in range(1, self.retained_files)]

    def _load_existing_state(self) -> None:
        records = 0
        updated_at = 0.0
        for path in self._paths():
            try:
                updated_at = max(updated_at, os.path.getmtime(path))
                with open(path, "rb") as handle:
                    records += sum(1 for line in handle if line.strip())
            except OSError:
                continue
        self._records = records
        self._updated_at = updated_at

    def _error_payload(self, error: Any) -> Dict[str, Any]:
        if hasattr(error, "as_dict") and callable(error.as_dict):
            try:
                value = error.as_dict()
                if isinstance(value, dict):
                    return sanitize_diagnostic_value(value)
            except Exception:
                pass
        return {
            "type": type(error).__name__ if error is not None else "conversion_error",
            "code": _redact_text(getattr(error, "code", "conversion_error")),
            "field": _redact_text(getattr(error, "field", "")),
            "message": _redact_text(error),
            "details": sanitize_diagnostic_value(getattr(error, "details", {}) or {}),
        }

    def _bounded_context(self, context: Any) -> Any:
        sanitized = sanitize_diagnostic_value(context if context is not None else {})
        encoded = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(encoded) <= self.max_context_bytes:
            return sanitized
        preview = encoded[: self.max_context_bytes].decode("utf-8", errors="ignore")
        return {"truncated": True, "original_bytes": len(encoded), "preview": preview}

    def record(self, *, error: Any = None, context: Any = None, **fields: Any) -> bool:
        if not self.enabled or self._closed:
            return False
        if not self._ensure_worker():
            return False
        record = {
            "timestamp": time.time(),
            **{str(key): sanitize_diagnostic_value(value) for key, value in fields.items() if value not in (None, "")},
            "error": self._error_payload(error),
            "context": self._bounded_context(context),
        }
        try:
            self._queue.put_nowait(("record", record))
            return True
        except queue.Full:
            with self._state_lock:
                self._dropped += 1
            return False

    def _rotate_locked(self, incoming_bytes: int) -> None:
        try:
            current_size = os.path.getsize(self.path)
        except OSError:
            current_size = 0
        if current_size <= 0 or current_size + incoming_bytes <= self.max_file_bytes:
            return
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        for index in range(self.retained_files - 1, 0, -1):
            source = self.path if index == 1 else f"{self.path}.{index - 1}"
            target = f"{self.path}.{index}"
            try:
                os.replace(source, target)
            except FileNotFoundError:
                continue
            except OSError:
                continue

    def _write(self, record: Dict[str, Any]) -> None:
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        with self._file_lock:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            self._rotate_locked(len(line))
            with open(self.path, "ab") as handle:
                handle.write(line)
                handle.flush()
            with self._state_lock:
                self._records += 1
                self._updated_at = time.time()

    def _run(self) -> None:
        while True:
            kind, payload = self._queue.get()
            try:
                if kind == "stop":
                    if isinstance(payload, threading.Event):
                        payload.set()
                    return
                if kind == "flush":
                    if isinstance(payload, threading.Event):
                        payload.set()
                    continue
                if kind == "record":
                    try:
                        self._write(payload)
                    except Exception:
                        with self._state_lock:
                            self._dropped += 1
            finally:
                self._queue.task_done()

    def flush(self, timeout: float = 5.0) -> bool:
        if not self.enabled or self._worker is None:
            return True
        marker = threading.Event()
        try:
            self._queue.put(("flush", marker), timeout=max(0.01, float(timeout)))
        except queue.Full:
            return False
        return marker.wait(max(0.01, float(timeout)))

    def export_bytes(self) -> bytes:
        if not self.enabled:
            return b""
        self.flush()
        chunks = []
        with self._file_lock:
            for path in reversed(self._paths()):
                try:
                    with open(path, "rb") as handle:
                        chunks.append(handle.read())
                except OSError:
                    continue
        return b"".join(chunks)

    def status(self) -> Dict[str, Any]:
        files = 0
        total_bytes = 0
        with self._file_lock:
            for path in self._paths():
                try:
                    total_bytes += os.path.getsize(path)
                    files += 1
                except OSError:
                    continue
        with self._state_lock:
            return {
                "enabled": self.enabled,
                "path": self.path,
                "records": self._records,
                "files": files,
                "bytes": total_bytes,
                "dropped": self._dropped,
                "queued": self._queue.qsize() if self.enabled else 0,
                "updated_at": self._updated_at,
            }

    def clear(self) -> Dict[str, Any]:
        self.flush()
        removed = 0
        with self._file_lock:
            for path in self._paths():
                try:
                    os.remove(path)
                    removed += 1
                except FileNotFoundError:
                    continue
                except OSError:
                    continue
            with self._state_lock:
                self._records = 0
                self._updated_at = 0.0
        return {"cleared": True, "files_removed": removed}

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if not self.enabled or self._worker is None:
            return
        marker = threading.Event()
        try:
            self._queue.put(("stop", marker), timeout=1.0)
            marker.wait(2.0)
        except queue.Full:
            pass
        self._worker.join(timeout=2.0)
