#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Minimal proxy: Anthropic /v1/messages -> OpenAI /chat/completions
   Features: thinking blocks (native Anthropic format, rendered by Cherry Studio),
             true SSE streaming (chunk-by-chunk),
             tool call support with memory,
             count_tokens handler for Claude Code compatibility"""
import copy, json, os, uuid, datetime, sys, socket, concurrent.futures, time, re, threading, hmac, queue
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Optional
from urllib.request import Request
from urllib.error import HTTPError, URLError

import model_registry
import scheduler_policy
from audit_store import AdminAuditStore
from config_manager import ConfigValidationError, RuntimeConfigManager
from config_loader import apply_env_overlays, load_base_config, load_config
from format_adapters import ANTHROPIC, CHAT, RESPONSES, convert_request, convert_response
from observability import ProxyObservability
from proxy_utils import key_value
from request_routes import classify_get, classify_post
from router import UpstreamRouter, parse_retry_after_seconds
from stream_adapters import (
    prefetch_first_stream_line,
    prefetch_initial_stream_lines,
    relay_sse_stream,
    stream_anthropic_sse_to_responses,
    stream_anthropic_sse_to_openai_chat,
    stream_openai_sse_to_anthropic,
    stream_openai_sse_to_responses,
    stream_responses_sse_to_openai_chat,
    stream_responses_sse_to_anthropic,
)
from upstream_client import OpenAIUpstreamClient
from usage_accounting import has_usage, normalize_usage

# ANSI color helpers.
try:
    # Windows Terminal / modern consoles support ANSI; older cmd.exe sets this env
    _HAS_ANSI = sys.platform != "win32" or bool(os.environ.get("WT_SESSION") or os.environ.get("TERM_PROGRAM"))
except Exception:
    _HAS_ANSI = False

def _hprov(provider: str) -> str:
    """Return provider=NAME with NAME highlighted in bold cyan."""
    name = f"\033[1;36m{provider}\033[0m" if _HAS_ANSI else provider
    return f"provider={name}"

def _h(provider: str) -> str:
    """Return provider name alone highlighted in bold cyan."""
    return f"\033[1;36m{provider}\033[0m" if _HAS_ANSI else provider

def _hkey(key: str) -> str:
    """Return key=NAME with key masked value highlighted in bold yellow."""
    name = f"\033[1;33m{key}\033[0m" if _HAS_ANSI else key
    return f"key={name}"

def _hmodel(model: str) -> str:
    """Return model name highlighted in bold magenta."""
    return f"\033[1;35m{model}\033[0m" if _HAS_ANSI else model

def _harrow(s: str) -> str:
    """Return arrow '->' highlighted in bold white."""
    return f"\033[1;37m->\033[0m" if _HAS_ANSI else "->"

# Configuration (config.json + env overlay).
BASE_CONFIG = load_base_config(apply_env=False)
CONFIG_MANAGER = RuntimeConfigManager(BASE_CONFIG)
CONFIG = apply_env_overlays(CONFIG_MANAGER.config)

PORT = int((CONFIG.get("server") or {}).get("port", 4894))
HOST = str((CONFIG.get("server") or {}).get("host", "0.0.0.0")).strip() or "0.0.0.0"
MAX_WORKERS = int((CONFIG.get("server") or {}).get("max_workers", 20))

LOG_DIR = (CONFIG.get("server") or {}).get("log_dir", os.path.join(os.path.dirname(__file__), "proxy_logs"))
if not os.path.isabs(LOG_DIR):
    LOG_DIR = os.path.join(os.path.dirname(__file__), LOG_DIR)

DEBUG_LOG = bool((CONFIG.get("server") or {}).get("debug_disk_log", False))
DIAGNOSTIC_LOG_LOCK = threading.Lock()
_DIAGNOSTIC_QUEUE = queue.Queue(maxsize=1000)
_DIAGNOSTIC_WRITER_THREAD = None
_DIAGNOSTIC_WRITER_RUNNING = False
_DIAGNOSTIC_WRITER_LOCK = threading.Lock()

# Runtime state persistence for router health and discovered model capabilities.
_ROUTER_STATE_FILE = os.path.join(os.path.dirname(__file__), "tmp", "router_state.json")
_ROUTER_STATE_INTERVAL_S = 60  # Save router state every 60 seconds.


def _safe_model_capabilities_for_state() -> dict:
    caps = ((CONFIG.get("models") or {}).get("provider_model_capabilities") or {})
    providers_cfg = CONFIG.get("providers") or {}
    out = {}
    if not isinstance(caps, dict):
        return out
    for provider, entry in caps.items():
        if provider not in providers_cfg or not isinstance(entry, dict):
            continue
        item = {
            "status": str(entry.get("status") or "unknown"),
            "fetched_at": int(entry.get("fetched_at") or 0),
            "models": [str(model) for model in (entry.get("models") or []) if str(model or "").strip()],
            "canonical_map": {
                str(k): str(v)
                for k, v in (entry.get("canonical_map") or {}).items()
                if str(k or "").strip() and str(v or "").strip()
            },
            "formats": [str(fmt) for fmt in (entry.get("formats") or []) if str(fmt or "").strip()],
        }
        if entry.get("error"):
            item["error"] = str(entry.get("error"))[:500]
        out[str(provider)] = item
    return out


def _restore_model_capabilities(caps: dict, union_model_ids: Optional[List[str]] = None) -> None:
    if not isinstance(caps, dict):
        return
    providers_cfg = CONFIG.get("providers") or {}
    models_cfg = CONFIG.setdefault("models", {})
    dest = models_cfg.setdefault("provider_model_capabilities", {})
    restored_union_ids = set(str(mid) for mid in (union_model_ids or []) if str(mid or "").strip())
    for provider, entry in caps.items():
        if provider not in providers_cfg or not isinstance(entry, dict):
            continue
        clean = {
            "status": str(entry.get("status") or "unknown"),
            "fetched_at": int(entry.get("fetched_at") or 0),
            "models": [str(model) for model in (entry.get("models") or []) if str(model or "").strip()],
            "canonical_map": {
                str(k): str(v)
                for k, v in (entry.get("canonical_map") or {}).items()
                if str(k or "").strip() and str(v or "").strip()
            },
            "formats": [str(fmt) for fmt in (entry.get("formats") or []) if str(fmt or "").strip()],
        }
        if entry.get("error"):
            clean["error"] = str(entry.get("error"))[:500]
        dest[str(provider)] = clean
        restored_union_ids.update(clean["canonical_map"].keys())
    if hasattr(model_registry, "restore_union_model_ids"):
        model_registry.restore_union_model_ids(restored_union_ids)


def _save_router_state() -> None:
    """Persist router runtime state and discovered model capabilities atomically."""
    try:
        state = {
            "saved_at": time.time(),
            "router": ROUTER.dump_state(),
            "model_capabilities": _safe_model_capabilities_for_state(),
            "union_model_ids": sorted(model_registry.union_model_ids()),
        }
        os.makedirs(os.path.dirname(_ROUTER_STATE_FILE), exist_ok=True)
        tmp_path = _ROUTER_STATE_FILE + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp_path, _ROUTER_STATE_FILE)
    except Exception as e:
        print(f"[proxy] router state save failed: {e}", flush=True)


def _load_router_state() -> None:
    """Load persisted router state and model capabilities if present."""
    try:
        if not os.path.exists(_ROUTER_STATE_FILE):
            return
        with open(_ROUTER_STATE_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
        router_state = state.get("router") if isinstance(state, dict) and isinstance(state.get("router"), dict) else state
        ROUTER.load_state(router_state)
        if isinstance(state, dict):
            _restore_model_capabilities(
                state.get("model_capabilities") or state.get("provider_model_capabilities") or {},
                state.get("union_model_ids") or [],
            )
        saved_at = router_state.get("saved_at") if isinstance(router_state, dict) else 0
        saved_at = state.get("saved_at") if isinstance(state, dict) and state.get("saved_at") else saved_at
        age = max(0, int(time.time() - float(saved_at or 0)))
        print(f"[proxy] runtime state restored (saved {age}s ago)", flush=True)
    except Exception as e:
        print(f"[proxy] router state load failed: {e}", flush=True)


def _start_state_autosave() -> None:
    """Start background runtime state autosave."""
    def _loop():
        while True:
            time.sleep(_ROUTER_STATE_INTERVAL_S)
            _save_router_state()
    t = threading.Thread(target=_loop, name="router-state-saver", daemon=True)
    t.start()


ROUTER = UpstreamRouter(CONFIG)
UPSTREAM_CLIENT = OpenAIUpstreamClient(CONFIG)
OBSERVABILITY = ProxyObservability(CONFIG)
AUDIT = AdminAuditStore(CONFIG)

# Model mapping (client model -> canonical model)
DISABLE_MAP = bool((CONFIG.get("models") or {}).get("disable_client_model_map", False))
MODEL_MAP = (CONFIG.get("models") or {}).get("client_model_map") or {}


def _refresh_model_mapping_globals() -> None:
    global DISABLE_MAP, MODEL_MAP
    DISABLE_MAP = bool((CONFIG.get("models") or {}).get("disable_client_model_map", False))
    MODEL_MAP = (CONFIG.get("models") or {}).get("client_model_map") or {}


def _apply_runtime_config(new_config: dict) -> None:
    global CONFIG, ROUTER, UPSTREAM_CLIENT, OBSERVABILITY, AUDIT
    old_router = ROUTER
    old_obs = OBSERVABILITY
    old_caps = ((CONFIG.get("models") or {}).get("provider_model_capabilities") or {}) if CONFIG else {}
    CONFIG = apply_env_overlays(new_config)
    # Preserve provider model capabilities across runtime config reloads.
    # Without this, key probes can lose discovered model choices after edits.
    if old_caps:
        providers_cfg = CONFIG.get("providers") or {}
        models_cfg = CONFIG.setdefault("models", {})
        caps = models_cfg.setdefault("provider_model_capabilities", {})
        for prov, entry in old_caps.items():
            if prov in providers_cfg and prov not in caps:
                caps[prov] = entry
    model_registry.clear_cache()
    model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
    ROUTER = UpstreamRouter(CONFIG)
    if old_router is not None:
        ROUTER.migrate_state_from(old_router)
    UPSTREAM_CLIENT = OpenAIUpstreamClient(CONFIG)
    OBSERVABILITY = ProxyObservability(CONFIG)
    if old_obs is not None:
        OBSERVABILITY.migrate_counters_from(old_obs)
    AUDIT = AdminAuditStore(CONFIG)
    _refresh_model_mapping_globals()


def resolve_model(name):
    """Resolve the client-facing model to the canonical model."""
    if DISABLE_MAP:
        return name  # Pass through, no mapping
    canonical = MODEL_MAP.get(name)
    if not canonical:
        # If no explicit client map exists, accept discovered union model aliases.
        try:
            models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
            union_model_ids = model_registry.union_model_ids()
            if models_source == "union" and union_model_ids:
                _best, cands = model_registry.normalize_model_id("", name or "")
                for c in cands:
                    if c in union_model_ids:
                        return c
        except Exception:
            pass
        print(f"[proxy] model pass-through: {name}", flush=True)
        return name or ""
    # Reconcile mapped canonical models against discovered union model aliases.
    try:
        models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
        union_model_ids = model_registry.union_model_ids()
        if models_source == "union" and union_model_ids:
            if canonical in union_model_ids:
                return canonical
            _best, cands = model_registry.normalize_model_id("", canonical or "")
            for c in cands:
                if c in union_model_ids:
                    return c
    except Exception:
        pass
    return canonical


def fetch_upstream_models():
    return model_registry.fetch_upstream_models(CONFIG, ROUTER, UPSTREAM_CLIENT, format_provider=_hprov)


def fetch_provider_models(provider: str):
    return model_registry.fetch_upstream_models(CONFIG, ROUTER, UPSTREAM_CLIENT, format_provider=_hprov, only_provider=provider)


def _provider_model_refresh_signature(config: dict, provider: str) -> str:
    pcfg = ((config.get("providers") or {}).get(provider) or {})
    payload = {
        "base_url": pcfg.get("base_url") or "",
        "models_path": pcfg.get("models_path") or "/v1/models",
        "keys": [key_value(entry) for entry in (pcfg.get("keys") or [])],
        "proxy": pcfg.get("proxy") or {},
        "headers": pcfg.get("headers") or {},
        "user_agent": pcfg.get("user_agent") or "",
    }
    return json.dumps(payload, sort_keys=True, default=str)


def _merge_provider_model_capability_from(source_config: dict, provider: str) -> bool:
    source_caps = ((source_config.get("models") or {}).get("provider_model_capabilities") or {})
    entry = source_caps.get(provider) if isinstance(source_caps, dict) else None
    if not isinstance(entry, dict):
        return False
    if provider not in (CONFIG.get("providers") or {}):
        return False
    if source_config is not CONFIG:
        if _provider_model_refresh_signature(source_config, provider) != _provider_model_refresh_signature(CONFIG, provider):
            return False

    for target in (CONFIG, CONFIG_MANAGER.config):
        providers_cfg = target.get("providers") or {}
        if provider not in providers_cfg:
            continue
        models_cfg = target.setdefault("models", {})
        caps = models_cfg.setdefault("provider_model_capabilities", {})
        caps[provider] = copy.deepcopy(entry)
    model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
    return True


def _probe_error_type(status: int) -> str:
    if status in (401, 403):
        return "key_invalid"
    if status == 429:
        return "rate_limited"
    if status == 402:
        return "quota_or_balance"
    if status >= 500:
        return "server_error"
    if 400 <= status < 500:
        return "client_error"
    return "unknown"


def _pick_probe_model(provider: str) -> Optional[str]:
    """Pick a discovered canonical model for provider key probing."""
    caps = ((CONFIG.get("models") or {}).get("provider_model_capabilities") or {}).get(provider) or {}
    canonical_map = caps.get("canonical_map") if isinstance(caps, dict) else None
    if isinstance(canonical_map, dict) and canonical_map:
        return str(next(iter(canonical_map.keys())))
    manual_map = ((CONFIG.get("models") or {}).get("provider_model_map") or {}).get(provider) or {}
    if isinstance(manual_map, dict) and manual_map:
        return str(next(iter(manual_map.keys())))
    pcfg = ((CONFIG.get("providers") or {}).get(provider) or {})
    static_models = pcfg.get("static_models")
    if isinstance(static_models, list):
        for entry in static_models:
            if isinstance(entry, str):
                mid = entry.strip()
            elif isinstance(entry, dict):
                mid = str(entry.get("id") or "").strip()
            else:
                mid = ""
            if mid:
                return mid
    routes = ((CONFIG.get("models") or {}).get("routes") or {})
    if isinstance(routes, dict):
        for model, route in routes.items():
            if route is None:
                continue
            providers = (route or {}).get("providers") if isinstance(route, dict) else []
            for item in providers or []:
                name = item if isinstance(item, str) else (item or {}).get("name")
                if str(name or "") == provider and str(model or "").strip():
                    return str(model)
        for model, route in routes.items():
            if route is not None and str(model or "").strip():
                return str(model)
    return None


def _request_filter_payload(value) -> dict:
    allowed = {
        "status",
        "client_format",
        "endpoint",
        "model",
        "status_code",
        "provider",
        "upstream_format",
        "error_type",
        "failure_reason",
        "reason",
        "http_status",
    }
    if not isinstance(value, dict):
        return {}
    out = {}
    for key in allowed:
        text = str(value.get(key) or "").strip()
        if text:
            out[key] = text
    return out


def probe_provider_key(provider: str, key_index: int, model: str = "") -> dict:
    """Send a minimal request with one provider key to verify availability."""
    pcfg = (CONFIG.get("providers") or {}).get(provider)
    if not isinstance(pcfg, dict):
        return {"ok": False, "error_type": "unknown", "error": f"unknown provider: {provider}"}
    keys = pcfg.get("keys") or []
    if not (0 <= key_index < len(keys)):
        return {"ok": False, "error_type": "unknown", "error": f"unknown key: {provider}/{key_index}"}

    canonical_model = str(model or "").strip() or _pick_probe_model(provider)
    if not canonical_model:
        try:
            model_registry.models_from_capabilities(CONFIG, ROUTER)
        except Exception:
            pass
        canonical_model = _pick_probe_model(provider)
    if not canonical_model:
        return {"ok": False, "error_type": "no_model", "error": "no models available to probe"}

    fmt = ROUTER._first_supported_format(
        provider, ["chat_completions", "responses", "anthropic_messages"]
    )
    if not fmt:
        return {"ok": False, "error_type": "no_format", "error": "no enabled upstream format"}

    raw_key = key_value(keys[key_index])
    url, headers, provider_model, proxy_url = ROUTER._build_attempt_details(
        provider, canonical_model, raw_key, key_index=key_index, upstream_format=fmt
    )

    base_payload = {
        "model": provider_model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "stream": False,
    }
    try:
        payload = convert_request("chat_completions", fmt, base_payload, resolve_model=lambda m: m)
    except Exception as e:
        return {"ok": False, "error_type": "unknown", "error": _sanitize_diagnostic_text(e, 200)}

    request_id = f"probe-{provider}-k{key_index}-{uuid.uuid4().hex[:8]}"
    OBSERVABILITY.record_request_start(
        request_id,
        client_format="admin_probe",
        endpoint="key_test",
        model=canonical_model,
        stream=False,
        path=f"/-/admin/providers/{provider}/keys/{key_index}/test",
    )
    from router import Attempt as _Attempt
    probe_attempt = _Attempt(
        request_id=request_id,
        attempt_no=1,
        provider=provider,
        key_index=key_index,
        key=raw_key,
        url=url,
        headers=headers,
        provider_model=provider_model,
        upstream_format=fmt,
        proxy_url=proxy_url,
    )
    actual_user_agent = str(headers.get("User-Agent") or headers.get("user-agent") or "")

    try:
        _resp, latency_ms = UPSTREAM_CLIENT.request_json_with_timing(
            url, headers, payload, proxy_url=proxy_url, remaining_timeout_s=15
        )
        OBSERVABILITY.record_first_byte(request_id, latency_ms)
        OBSERVABILITY.record_attempt(request_id, probe_attempt, outcome="success")
        OBSERVABILITY.record_request_end(request_id, status_code=200)
        return {"ok": True, "model": canonical_model, "requested_model": canonical_model, "upstream_model": provider_model, "format": fmt, "latency_ms": latency_ms, "user_agent": actual_user_agent}
    except HTTPError as e:
        status = int(getattr(e, "code", 0) or 0)
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        error_type = _probe_error_type(status)
        OBSERVABILITY.record_attempt(
            request_id, probe_attempt,
            outcome="failed",
            error_type=error_type,
            http_status=status,
            upstream_error_summary=err_body,
        )
        OBSERVABILITY.record_request_end(request_id, status_code=status, error=err_body)
        return {
            "ok": False,
            "http_status": status,
            "error_type": error_type,
            "model": canonical_model,
            "requested_model": canonical_model,
            "upstream_model": provider_model,
            "format": fmt,
            "user_agent": actual_user_agent,
        }
    except (URLError, socket.timeout) as e:
        msg = _sanitize_diagnostic_text(e, 200)
        OBSERVABILITY.record_attempt(
            request_id, probe_attempt,
            outcome="failed",
            error_type="network_error",
            upstream_error_summary=msg,
        )
        OBSERVABILITY.record_request_end(request_id, status_code=0, error=msg)
        return {
            "ok": False,
            "error_type": "network_error",
            "error": msg,
            "model": canonical_model,
            "requested_model": canonical_model,
            "upstream_model": provider_model,
            "format": fmt,
            "user_agent": actual_user_agent,
        }
    except Exception as e:
        msg = _sanitize_diagnostic_text(e, 200)
        OBSERVABILITY.record_attempt(
            request_id, probe_attempt,
            outcome="failed",
            error_type="unknown",
            upstream_error_summary=msg,
        )
        OBSERVABILITY.record_request_end(request_id, status_code=0, error=msg)
        return {
            "ok": False,
            "error_type": "unknown",
            "error": msg,
            "model": canonical_model,
            "requested_model": canonical_model,
            "upstream_model": provider_model,
            "format": fmt,
            "user_agent": actual_user_agent,
        }


def _refresh_models_after_config_change(provider: Optional[str] = None, *, force: bool = False) -> None:
    """Refresh only the affected provider after config changes.

    Client /v1/models is served from saved capabilities/config; discovery I/O is
    limited to startup, manual refresh, and provider-level changes.
    """
    models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
    if models_source not in ("union", "first_healthy_provider"):
        model_registry.clear_cache(provider)
        model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
        return

    if not provider:
        model_registry.clear_cache()
        model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
        return

    if provider not in (CONFIG.get("providers") or {}):
        model_registry.clear_cache(provider)
        model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
        return

    pcfg = ((CONFIG.get("providers") or {}).get(provider) or {})
    if not pcfg.get("enabled", True):
        model_registry.clear_cache(provider)
        model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
        return

    if not force:
        model_registry.clear_cache(provider)
        model_registry.rebuild_union_model_ids_from_capabilities(CONFIG)
        return

    model_registry.clear_cache(provider)
    config_ref = CONFIG
    router_ref = ROUTER
    upstream_client_ref = UPSTREAM_CLIENT

    def _bg_refresh_provider():
        try:
            model_registry.fetch_upstream_models(
                config_ref,
                router_ref,
                upstream_client_ref,
                format_provider=_hprov,
                only_provider=provider,
            )
            if _merge_provider_model_capability_from(config_ref, provider):
                _save_router_state()
        except Exception as e:
            print(
                f"[proxy] provider model refresh after config change failed ({_hprov(provider)}): {_sanitize_diagnostic_text(e, 200)}",
                flush=True,
            )

    threading.Thread(target=_bg_refresh_provider, name=f"model-refresh-{provider}", daemon=True).start()


def _default_models():
    return model_registry.default_models()


def _admin_key() -> str:
    return str((CONFIG.get("server") or {}).get("admin_key") or "").strip()


def _allow_query_admin_key() -> bool:
    """Whether admin auth may be supplied via the ?admin_key= query string.

    Default False: the query string can leak into proxy/gateway access logs and
    browser history. The dashboard always sends the X-Admin-Key header, so it is
    unaffected. Set server.allow_query_admin_key=true to re-enable for bare curl."""
    return bool((CONFIG.get("server") or {}).get("allow_query_admin_key", False))


def _max_request_body_bytes() -> int:
    """Upper bound on the client request body the proxy will buffer.

    Default 32 MiB. 0 or negative disables the limit. Guards against a single
    request declaring a huge Content-Length and exhausting memory under the
    multi-threaded server."""
    try:
        return int((CONFIG.get("server") or {}).get("max_request_body_bytes", 32 * 1024 * 1024))
    except Exception:
        return 32 * 1024 * 1024


def _model_capabilities_snapshot() -> dict:
    caps = ((CONFIG.get("models") or {}).get("provider_model_capabilities") or {})
    providers = {}
    for provider, entry in caps.items():
        if not isinstance(entry, dict):
            continue
        providers[provider] = {
            "status": entry.get("status", "unknown"),
            "fetched_at": entry.get("fetched_at", 0),
            "models": list(entry.get("models") or []),
            "canonical_map": dict(entry.get("canonical_map") or {}),
            "formats": list(entry.get("formats") or []),
        }
        if entry.get("error"):
            providers[provider]["error"] = str(entry.get("error"))[:500]
    return {
        "models_source": str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider")),
        "union_model_ids": sorted(model_registry.union_model_ids()),
        "providers": providers,
    }


def log_request(req_body, oai_payload, upstream_data, anth_resp):
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    with open(os.path.join(LOG_DIR, f"req_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": ts,
            "cherry_request": req_body,
            "openai_payload": oai_payload,
            "upstream_response": upstream_data,
            "anthropic_response": anth_resp,
        }, f, ensure_ascii=False, indent=2)


def _response_usage(*payloads):
    for payload in payloads:
        usage = normalize_usage(payload)
        if has_usage(usage):
            return usage
    return {}


def _classify_http_error(code: int) -> str:
    return scheduler_policy.classify_http_error(CONFIG, int(code or 0)).error_type


def _is_retryable_http(code: int) -> bool:
    return scheduler_policy.classify_http_error(CONFIG, int(code or 0)).retryable


def _same_key_retries_for_transient_errors() -> int:
    retry_cfg = CONFIG.get("retry") or {}
    value = retry_cfg.get("same_key_retries")
    if value is None:
        value = retry_cfg.get("same_key_retry_count", 1)
    try:
        return max(0, min(int(value), 3))
    except Exception:
        return 1


def _is_same_key_retryable_http(status: int, error_body: str, model_name: str) -> bool:
    decision = scheduler_policy.classify_http_error(
        CONFIG,
        int(status or 0),
        error_body=error_body,
        model_name=model_name,
    )
    return bool(decision.retryable and decision.error_type in ("server_error", "network_error", "unknown"))


def _is_model_not_found_error(error_body: str, model_name: str) -> bool:
    return scheduler_policy.is_model_not_found_error(error_body, model_name)


def _is_reasoning_content_error(error_body: str) -> bool:
    return scheduler_policy.is_reasoning_content_error(error_body)


class CachedHTTPError(Exception):
    def __init__(self, code: int, body: str, headers=None):
        super().__init__(body)
        self.code = int(code or 0)
        self.body = body or ""
        self.headers = headers or {}


def _http_error_details(e):
    status = getattr(e, "code", 0) or 0
    headers = getattr(e, "headers", {}) or {}
    if isinstance(e, CachedHTTPError):
        return int(status), e.body[:500], headers
    try:
        body = e.read().decode("utf-8", errors="replace")[:500]
    finally:
        # A real urllib HTTPError holds an open socket; close it after reading the
        # body so the connection is released immediately instead of at GC time.
        try:
            e.close()
        except Exception:
            pass
    return int(status), body, headers


def _mask_diag_secret(value: str) -> str:
    text = str(value or "")
    if len(text) <= 8:
        return "***"
    return f"{text[:6]}**{text[-4:]}"


def _sanitize_diagnostic_text(value, limit: int = 500) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if not text:
        return ""

    def bearer_repl(match):
        return f"{match.group(1)}{_mask_diag_secret(match.group(2))}"

    def key_repl(match):
        return _mask_diag_secret(match.group(1))

    def named_key_repl(match):
        return f"{match.group(1)}{_mask_diag_secret(match.group(2))}"

    text = re.sub(r"(?i)\b(Bearer\s+)([A-Za-z0-9._\-]{10,})", bearer_repl, text)
    text = re.sub(r"\b(sk-[A-Za-z0-9_\-]{8,})\b", key_repl, text)
    text = re.sub(r"(?i)\b((?:api[_-]?key|authorization|x-api-key)[\"']?\s*[:=]\s*[\"']?)([A-Za-z0-9._\-]{10,})", named_key_repl, text)
    if len(text) > limit:
        return text[: max(0, limit - 3)].rstrip() + "..."
    return text


def _upstream_error_diagnostics(stage: str, error_body: str = "", *, exception=None) -> dict:
    diag = {"diagnostic_stage": _sanitize_diagnostic_text(stage, 80) or "unknown"}
    summary = ""
    err_type = ""
    err_code = ""
    err_param = ""
    body = str(error_body or "")
    if body:
        try:
            data = json.loads(body)
            err = data.get("error") if isinstance(data, dict) else None
            if isinstance(err, dict):
                summary = err.get("message") or err.get("detail") or err.get("error") or ""
                err_type = err.get("type") or ""
                err_code = err.get("code") or ""
                err_param = err.get("param") or ""
            elif err is not None:
                summary = str(err)
            elif isinstance(data, dict):
                summary = data.get("message") or data.get("detail") or json.dumps(data, ensure_ascii=False)
            else:
                summary = str(data)
        except (json.JSONDecodeError, ValueError, TypeError):
            summary = body
    elif exception is not None:
        summary = f"{type(exception).__name__}: {exception}"

    fields = {
        "upstream_error_summary": summary,
        "upstream_error_type": err_type,
        "upstream_error_code": err_code,
        "upstream_error_param": err_param,
    }
    for key, value in fields.items():
        clean = _sanitize_diagnostic_text(value)
        if clean:
            diag[key] = clean
    return diag


def _attempt_duration_ms(started_at) -> int:
    try:
        return max(0, int((time.time() - float(started_at)) * 1000))
    except Exception:
        return 0


def _remaining_first_event_timeout(started_at, timeout_s):
    if not timeout_s or timeout_s <= 0:
        return None
    elapsed = time.time() - float(started_at)
    remaining = float(timeout_s) - elapsed
    if remaining <= 0:
        raise socket.timeout(f"first stream event timeout after {timeout_s}s")
    return max(0.001, remaining)


def _transport_stage_for_exception(exception, default_stage: str = "transport_error") -> str:
    text = f"{type(exception).__name__}: {exception}".lower()
    if "first stream event" in text or "first byte" in text or "first token" in text:
        return "before_first_event"
    if "timed out" in text or "timeout" in text:
        return "before_upstream_response"
    return default_stage


def _log_upstream_error(request_id, attempt, status, error_type: str, reason: str, diagnostics: dict) -> None:
    code = diagnostics.get("upstream_error_code") or "-"
    upstream_type = diagnostics.get("upstream_error_type") or "-"
    summary = diagnostics.get("upstream_error_summary") or "-"
    print(
        f"[proxy] UPSTREAM ERROR req={request_id} {_h(attempt.provider)} "
        f"status={status} error_type={error_type} reason={reason} upstream_type={upstream_type} "
        f"upstream_code={code}: {summary}",
        flush=True,
    )


def _diagnostic_log_path() -> str:
    obs = CONFIG.get("observability") or {}
    diag = obs.get("diagnostics") or {}
    raw = str(diag.get("path") or os.path.join("tmp", "proxy_diagnostics.jsonl"))
    if os.path.isabs(raw):
        return raw
    return os.path.join(os.path.dirname(__file__), raw)


def _diagnostic_log_enabled() -> bool:
    obs = CONFIG.get("observability") or {}
    diag = obs.get("diagnostics") or {}
    return bool(diag.get("enabled", True))


def _attempt_key_masked(attempt) -> str:
    raw = str(getattr(attempt, "key", "") or "")
    if not raw:
        return ""
    try:
        return ROUTER.masked_key(raw)
    except Exception:
        return _mask_diag_secret(raw)


def _diagnostic_write_loop() -> None:
    while _DIAGNOSTIC_WRITER_RUNNING:
        try:
            task = _DIAGNOSTIC_QUEUE.get(timeout=1.0)
        except queue.Empty:
            continue
        if task is None:
            _DIAGNOSTIC_QUEUE.task_done()
            break
        path, line = task
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with DIAGNOSTIC_LOG_LOCK:
                with open(path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
        except Exception:
            pass
        finally:
            _DIAGNOSTIC_QUEUE.task_done()


def _start_diagnostic_writer_if_needed() -> None:
    global _DIAGNOSTIC_WRITER_THREAD, _DIAGNOSTIC_WRITER_RUNNING
    if _DIAGNOSTIC_WRITER_RUNNING:
        return
    with _DIAGNOSTIC_WRITER_LOCK:
        if _DIAGNOSTIC_WRITER_RUNNING:
            return
        _DIAGNOSTIC_WRITER_RUNNING = True
        _DIAGNOSTIC_WRITER_THREAD = threading.Thread(
            target=_diagnostic_write_loop,
            name="diagnostic-writer",
            daemon=True
        )
        _DIAGNOSTIC_WRITER_THREAD.start()


def _write_attempt_diagnostic_log(
    request_id,
    attempt,
    *,
    outcome: str,
    error_type: str = "",
    reason: str = "",
    http_status=None,
    duration_ms=None,
    diagnostics=None,
) -> None:
    if not _diagnostic_log_enabled():
        return
    diagnostics = diagnostics or {}
    item = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "request_id": str(request_id or ""),
        "attempt_no": int(getattr(attempt, "attempt_no", 0) or 0),
        "provider": str(getattr(attempt, "provider", "") or ""),
        "key_index": int(getattr(attempt, "key_index", 0) or 0),
        "key_masked": _attempt_key_masked(attempt),
        "provider_model": str(getattr(attempt, "provider_model", "") or ""),
        "upstream_format": str(getattr(attempt, "upstream_format", "") or ""),
        "outcome": str(outcome or ""),
        "error_type": str(error_type or ""),
        "reason": str(reason or ""),
    }
    if duration_ms is not None:
        item["duration_ms"] = max(0, int(duration_ms or 0))
    if http_status is not None:
        item["http_status"] = int(http_status)
    for key in (
        "diagnostic_stage",
        "upstream_error_summary",
        "upstream_error_type",
        "upstream_error_code",
        "upstream_error_param",
    ):
        value = diagnostics.get(key)
        if value:
            item[key] = _sanitize_diagnostic_text(value)
    try:
        path = _diagnostic_log_path()
        line = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
        import sys
        if "unittest" in sys.modules:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with DIAGNOSTIC_LOG_LOCK:
                with open(path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            return
        _start_diagnostic_writer_if_needed()
        _DIAGNOSTIC_QUEUE.put((path, line), block=False)
    except Exception:
        return


def _clear_diagnostic_log() -> dict:
    path = _diagnostic_log_path()
    result = {"path": path, "cleared": False}
    try:
        while not _DIAGNOSTIC_QUEUE.empty():
            try:
                _DIAGNOSTIC_QUEUE.get_nowait()
                _DIAGNOSTIC_QUEUE.task_done()
            except queue.Empty:
                break
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with DIAGNOSTIC_LOG_LOCK:
            with open(path, "w", encoding="utf-8"):
                pass
        result["cleared"] = True
    except Exception as e:
        result["error"] = str(e)
    return result


def _record_failed_attempt(
    request_id,
    attempt,
    *,
    error_type: str,
    reason: str,
    http_status=None,
    duration_ms=None,
    diagnostics=None,
) -> None:
    diagnostics = diagnostics or {}
    OBSERVABILITY.record_attempt(
        request_id,
        attempt,
        outcome="failed",
        error_type=error_type,
        http_status=int(http_status) if http_status is not None else None,
        reason=reason,
        duration_ms=duration_ms,
        **diagnostics,
    )
    _write_attempt_diagnostic_log(
        request_id,
        attempt,
        outcome="failed",
        error_type=error_type,
        reason=reason,
        http_status=http_status,
        duration_ms=duration_ms,
        diagnostics=diagnostics,
    )


def _record_upstream_http_failure(request_id, attempt, status, error_body, decision, retry_after_s, attempt_errors, *, reason=None, duration_ms=None):
    err_type = decision.error_type
    final_reason = reason or decision.reason
    diagnostics = _upstream_error_diagnostics("upstream_http_error", error_body)
    ROUTER.report_failure(
        attempt,
        error_type=err_type,
        http_status=int(status) if status else None,
        retry_after_s=retry_after_s,
    )
    _record_failed_attempt(
        request_id,
        attempt,
        error_type=err_type,
        reason=final_reason,
        http_status=int(status) if status else None,
        duration_ms=duration_ms,
        diagnostics=diagnostics,
    )
    attempt_errors.append(f"{attempt.provider}:{status}:{err_type}:{final_reason}")
    _log_upstream_error(request_id, attempt, status, err_type, final_reason, diagnostics)
    return err_type


def _record_request_conversion_failure(request_id, attempt, client_format: str, exception, attempt_errors, *, duration_ms=None) -> None:
    reason = "request_conversion_unsupported"
    summary = f"Could not convert client {client_format} request to upstream {attempt.upstream_format}: {exception}"
    diagnostics = _upstream_error_diagnostics("request_conversion", exception=exception)
    diagnostics["upstream_error_summary"] = _sanitize_diagnostic_text(summary)
    ROUTER.report_failure(attempt, error_type="provider_compat")
    _record_failed_attempt(
        request_id,
        attempt,
        error_type="provider_compat",
        reason=reason,
        duration_ms=duration_ms,
        diagnostics=diagnostics,
    )
    attempt_errors.append(f"{attempt.provider}:request_conversion:{attempt.upstream_format}")
    print(
        f"[proxy] REQUEST CONVERSION ERROR req={request_id} {_h(attempt.provider)} "
        f"{client_format}->{attempt.upstream_format}: {_sanitize_diagnostic_text(exception, 200)}",
        flush=True,
    )


def _record_transport_failure(
    request_id,
    attempt,
    exception,
    attempt_errors,
    *,
    reason: str = "",
    stage: str = "transport_error",
    duration_ms=None,
) -> None:
    decision = scheduler_policy.classify_transport_error(type(exception).__name__, CONFIG)
    final_reason = reason or decision.reason
    diagnostics = _upstream_error_diagnostics(stage, exception=exception)
    ROUTER.report_failure(attempt, error_type=decision.error_type)
    _record_failed_attempt(
        request_id,
        attempt,
        error_type=decision.error_type,
        reason=final_reason,
        duration_ms=duration_ms,
        diagnostics=diagnostics,
    )
    attempt_errors.append(f"{attempt.provider}:{final_reason}:{type(exception).__name__}")
    print(
        f"[proxy] NETWORK ERROR req={request_id} {_h(attempt.provider)} "
        f"stage={stage} reason={final_reason}: {type(exception).__name__}",
        flush=True,
    )


def _record_proxy_exception(request_id, attempt, exception, attempt_errors, *, duration_ms=None) -> None:
    diagnostics = _upstream_error_diagnostics("proxy_exception", exception=exception)
    ROUTER.report_failure(attempt, error_type="network_error")
    _record_failed_attempt(
        request_id,
        attempt,
        error_type="network_error",
        reason="unknown_exception",
        duration_ms=duration_ms,
        diagnostics=diagnostics,
    )
    attempt_errors.append(f"{attempt.provider}:unknown:{type(exception).__name__}")
    print(
        f"[proxy] ERROR req={request_id} {_h(attempt.provider)} "
        f"stage=proxy_exception: {_sanitize_diagnostic_text(exception, 200)}",
        flush=True,
    )


def _record_stream_interrupted(request_id, attempt, attempt_errors, *, duration_ms=None, stage="stream_interrupted") -> None:
    diagnostics = _upstream_error_diagnostics(stage, exception=RuntimeError("upstream stream interrupted after client response started"))
    ROUTER.report_failure(attempt, error_type="network_error")
    _record_failed_attempt(
        request_id,
        attempt,
        error_type="network_error",
        reason="stream_interrupted",
        duration_ms=duration_ms,
        diagnostics=diagnostics,
    )
    attempt_errors.append(f"{attempt.provider}:stream_interrupted")
    print(
        f"[proxy] STREAM INTERRUPTED req={request_id} {_h(attempt.provider)} "
        f"stage={stage}",
        flush=True,
    )


def _has_forced_tool_choice(payload) -> bool:
    tc = (payload or {}).get("tool_choice")
    if not tc:
        return False
    if isinstance(tc, str):
        return tc not in ("auto", "none")
    if isinstance(tc, dict):
        tc_type = str(tc.get("type") or "").lower()
        return bool(tc_type and tc_type not in ("auto", "none"))
    return False


def _downgrade_tool_choice_for_retry(payload, upstream_format: str) -> None:
    if upstream_format == ANTHROPIC:
        payload["tool_choice"] = {"type": "auto"}
    else:
        payload["tool_choice"] = "auto"


def _chat_upstream_requires_reasoning_content(attempt) -> bool:
    pcfg = (CONFIG.get("providers") or {}).get(getattr(attempt, "provider", "") or "") or {}
    return bool(pcfg.get("force_reasoning_content", False)) or getattr(attempt, "provider", "") in ("deepseek", "opencode")


def _force_chat_reasoning_content_if_needed(attempt, payload, *, log_each: bool = False) -> int:
    if getattr(attempt, "upstream_format", "") != CHAT:
        return 0
    if not _chat_upstream_requires_reasoning_content(attempt):
        return 0

    filled = 0
    for msg in payload.get("messages") or []:
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        if msg.get("reasoning_content") is None or msg.get("reasoning_content") == "":
            # Keep this as a small marker instead of duplicating visible content into hidden reasoning.
            msg["reasoning_content"] = "."
            filled += 1
    if filled and log_each:
        print(f"[proxy] force_reasoning_content provider={attempt.provider} filled={filled}", flush=True)
    return filled


def _anthropic_upstream_requires_thinking(attempt) -> bool:
    pcfg = (CONFIG.get("providers") or {}).get(getattr(attempt, "provider", "") or "") or {}
    return bool(pcfg.get("force_anthropic_thinking", False)) or getattr(attempt, "provider", "") == "deepseek"


def _force_anthropic_thinking_if_needed(attempt, payload, *, log_each: bool = False) -> int:
    if getattr(attempt, "upstream_format", "") != ANTHROPIC:
        return 0
    if not _anthropic_upstream_requires_thinking(attempt):
        return 0

    filled = 0
    for msg in payload.get("messages") or []:
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            if not content.strip():
                continue
            content = [{"type": "text", "text": content}]
        if not isinstance(content, list):
            continue
        has_thinking = any(isinstance(block, dict) and block.get("type") == "thinking" for block in content)
        if has_thinking:
            continue
        msg["content"] = [{"type": "thinking", "thinking": "."}] + content
        filled += 1
    if filled and log_each:
        print(f"[proxy] force_anthropic_thinking provider={attempt.provider} filled={filled}", flush=True)
    return filled


def _request_json_once_with_timing(attempt, payload, *, proxy_url=None, remaining_timeout_s=None):
    if hasattr(UPSTREAM_CLIENT, "request_json_with_timing"):
        return UPSTREAM_CLIENT.request_json_with_timing(
            attempt.url,
            attempt.headers,
            payload,
            proxy_url=proxy_url,
            remaining_timeout_s=remaining_timeout_s,
        )
    started = time.time()
    data = UPSTREAM_CLIENT.request_json(
        attempt.url,
        attempt.headers,
        payload,
        proxy_url=proxy_url,
        remaining_timeout_s=remaining_timeout_s,
    )
    return data, max(0, int((time.time() - started) * 1000))


def _request_json_with_compat_retry(request_id, attempt, payload, *, proxy_url=None, remaining_timeout_s=None):
    same_key_retries = _same_key_retries_for_transient_errors()
    attempt_payload = payload
    try:
        data, first_byte_ms = _request_json_once_with_timing(
            attempt,
            attempt_payload,
            proxy_url=proxy_url,
            remaining_timeout_s=remaining_timeout_s,
        )
        OBSERVABILITY.record_first_byte(request_id, first_byte_ms)
        return data
    except HTTPError as e:
        status, error_body, headers = _http_error_details(e)
        if (
            int(status) in (400, 404)
            and _has_forced_tool_choice(payload)
            and scheduler_policy.should_downgrade_tool_choice(attempt.upstream_format, error_body)
        ):
            _downgrade_tool_choice_for_retry(payload, attempt.upstream_format)
            _record_failed_attempt(
                request_id,
                attempt,
                error_type="provider_compat",
                http_status=int(status) if status else None,
                reason="tool_choice_auto_retry",
                diagnostics=_upstream_error_diagnostics("provider_compat_retry", error_body),
            )
            print(
                f"[proxy] tool_choice downgraded to auto for retry req={request_id} {_h(attempt.provider)}",
                flush=True,
            )
            data, first_byte_ms = _request_json_once_with_timing(
                attempt,
                payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
            )
            OBSERVABILITY.record_first_byte(request_id, first_byte_ms)
            return data
        if same_key_retries > 0 and _is_same_key_retryable_http(status, error_body, attempt_payload.get("model", "")):
            print(
                f"[proxy] same-key retry req={request_id} {_h(attempt.provider)} "
                f"status={int(status) if status else 0}",
                flush=True,
            )
            retry_payload = copy.deepcopy(attempt_payload)
            try:
                data, first_byte_ms = _request_json_once_with_timing(
                    attempt,
                    retry_payload,
                    proxy_url=proxy_url,
                    remaining_timeout_s=remaining_timeout_s,
                )
                OBSERVABILITY.record_first_byte(request_id, first_byte_ms)
                return data
            except HTTPError as retry_error:
                status, error_body, headers = _http_error_details(retry_error)
        raise CachedHTTPError(status, error_body, headers)
    except (URLError, socket.timeout) as e:
        if same_key_retries > 0:
            print(
                f"[proxy] same-key retry req={request_id} {_h(attempt.provider)} "
                f"error={type(e).__name__}",
                flush=True,
            )
            retry_payload = copy.deepcopy(attempt_payload)
            data, first_byte_ms = _request_json_once_with_timing(
                attempt,
                retry_payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
            )
            OBSERVABILITY.record_first_byte(request_id, first_byte_ms)
            return data
        raise


def _has_text(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(_has_text(item) for item in value)
    if isinstance(value, dict):
        for key in ("text", "content", "thinking", "summary"):
            if _has_text(value.get(key)):
                return True
        return False
    return bool(str(value).strip())


def _response_visibility_flags(response_format, response):
    flags = {"has_visible_output": False, "has_reasoning": False, "is_truncated": False}
    if not isinstance(response, dict):
        return flags

    if response_format == CHAT:
        for choice in response.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            if choice.get("finish_reason") == "length":
                flags["is_truncated"] = True
            msg = choice.get("message") or {}
            if not isinstance(msg, dict):
                continue
            if _has_text(msg.get("content")) or bool(msg.get("tool_calls")):
                flags["has_visible_output"] = True
            if _has_text(msg.get("reasoning_content")):
                flags["has_reasoning"] = True
        return flags

    if response_format == ANTHROPIC:
        if response.get("stop_reason") == "max_tokens":
            flags["is_truncated"] = True
        for block in response.get("content") or []:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "text" and _has_text(block.get("text")):
                flags["has_visible_output"] = True
            elif btype == "tool_use":
                flags["has_visible_output"] = True
            elif btype == "thinking" and _has_text(block.get("thinking")):
                flags["has_reasoning"] = True
        return flags

    if response_format == RESPONSES:
        if response.get("status") == "incomplete" or response.get("incomplete_details"):
            flags["is_truncated"] = True
        if _has_text(response.get("output_text")):
            flags["has_visible_output"] = True
        for item in response.get("output") or []:
            if not isinstance(item, dict):
                continue
            itype = item.get("type")
            if item.get("status") == "incomplete":
                flags["is_truncated"] = True
            if itype == "message" and _has_text(item.get("content")):
                flags["has_visible_output"] = True
            elif itype == "function_call":
                flags["has_visible_output"] = True
            elif itype == "reasoning":
                flags["has_reasoning"] = True
        return flags

    return flags


def _visible_output_status(client_format, client_response, *, upstream_format=None, upstream_response=None):
    client_flags = _response_visibility_flags(client_format, client_response)
    upstream_flags = (
        _response_visibility_flags(upstream_format, upstream_response)
        if upstream_format and upstream_response is not None
        else {"has_visible_output": False, "has_reasoning": False, "is_truncated": False}
    )
    return {
        "has_visible_output": bool(client_flags["has_visible_output"]),
        "has_reasoning": bool(client_flags["has_reasoning"] or upstream_flags["has_reasoning"]),
        "is_truncated": bool(client_flags["is_truncated"] or upstream_flags["is_truncated"]),
    }


def _is_empty_visible_output(client_format, client_response, *, upstream_format=None, upstream_response=None):
    status = _visible_output_status(
        client_format,
        client_response,
        upstream_format=upstream_format,
        upstream_response=upstream_response,
    )
    return (
        not status["has_visible_output"]
        and status["has_reasoning"]
        and status["is_truncated"]
    )


def _record_empty_visible_output_failure(request_id, attempt, attempt_errors):
    ROUTER.report_failure(attempt, error_type="empty_visible_output", http_status=200)
    _record_failed_attempt(
        request_id,
        attempt,
        error_type="empty_visible_output",
        http_status=200,
        reason="empty_visible_output_retry",
        diagnostics={
            "diagnostic_stage": "conversion_empty_output",
            "upstream_error_summary": "Converted response contained reasoning/truncation but no visible client text; retrying next candidate.",
        },
    )
    attempt_errors.append(f"{attempt.provider}:200:empty_visible_output")
    print(
        f"[proxy] EMPTY VISIBLE OUTPUT req={request_id} {_h(attempt.provider)}: retrying next provider",
        flush=True,
    )


def _close_upstream_conn(conn) -> None:
    """Best-effort close of an upstream stream response/connection.

    Safe to call with None or an already-consumed/closed response. Guarantees the
    underlying socket is released on every attempt path (success, retry, error)
    instead of waiting for GC, which otherwise leaks sockets during failover."""
    if conn is None:
        return
    try:
        conn.close()
    except Exception:
        pass


def _open_stream_with_compat_retry(
    request_id,
    attempt,
    payload,
    *,
    proxy_url=None,
    remaining_timeout_s=None,
    first_byte_timeout_s=None,
    attempt_started_at=None,
):
    same_key_retries = _same_key_retries_for_transient_errors()
    attempt_payload = payload
    started_at = attempt_started_at or time.time()

    def first_event_remaining():
        return _remaining_first_event_timeout(started_at, first_byte_timeout_s)

    try:
        return UPSTREAM_CLIENT.open_stream(
            attempt.url,
            attempt.headers,
            attempt_payload,
            proxy_url=proxy_url,
            remaining_timeout_s=remaining_timeout_s,
            first_byte_timeout_s=first_event_remaining(),
        )
    except HTTPError as e:
        status, error_body, headers = _http_error_details(e)
        if (
            int(status) in (400, 404)
            and _has_forced_tool_choice(payload)
            and scheduler_policy.should_downgrade_tool_choice(attempt.upstream_format, error_body)
        ):
            _downgrade_tool_choice_for_retry(payload, attempt.upstream_format)
            _record_failed_attempt(
                request_id,
                attempt,
                error_type="provider_compat",
                http_status=int(status) if status else None,
                reason="tool_choice_auto_retry",
                diagnostics=_upstream_error_diagnostics("provider_compat_retry", error_body),
            )
            print(
                f"[proxy] tool_choice downgraded to auto for stream retry req={request_id} {_h(attempt.provider)}",
                flush=True,
            )
            return UPSTREAM_CLIENT.open_stream(
                attempt.url,
                attempt.headers,
                payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
                first_byte_timeout_s=first_event_remaining(),
            )
        if same_key_retries > 0 and _is_same_key_retryable_http(status, error_body, attempt_payload.get("model", "")):
            print(
                f"[proxy] same-key stream retry req={request_id} {_h(attempt.provider)} "
                f"status={int(status) if status else 0}",
                flush=True,
            )
            retry_payload = copy.deepcopy(attempt_payload)
            try:
                return UPSTREAM_CLIENT.open_stream(
                    attempt.url,
                    attempt.headers,
                    retry_payload,
                    proxy_url=proxy_url,
                    remaining_timeout_s=remaining_timeout_s,
                    first_byte_timeout_s=first_event_remaining(),
                )
            except HTTPError as retry_error:
                status, error_body, headers = _http_error_details(retry_error)
        raise CachedHTTPError(status, error_body, headers)
    except (URLError, socket.timeout):
        if same_key_retries > 0:
            print(
                f"[proxy] same-key stream retry req={request_id} {_h(attempt.provider)} transport_error",
                flush=True,
            )
            retry_payload = copy.deepcopy(attempt_payload)
            return UPSTREAM_CLIENT.open_stream(
                attempt.url,
                attempt.headers,
                retry_payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
                first_byte_timeout_s=first_event_remaining(),
            )
        raise


# True streaming: upstream OpenAI SSE to Anthropic SSE.

def _prefetch_first_stream_line(upstream, timeout_s):
    return prefetch_first_stream_line(upstream, timeout_s)


def _prefetch_initial_stream_lines(upstream, timeout_s):
    return prefetch_initial_stream_lines(upstream, timeout_s)


def do_stream(upstream, wfile, original_model, first_byte_timeout_s=None, read_timeout_s=None, initial_lines=None):
    return stream_openai_sse_to_anthropic(
        upstream,
        wfile,
        original_model,
        first_byte_timeout_s=first_byte_timeout_s,
        read_timeout_s=read_timeout_s,
        initial_lines=initial_lines,
    )

# HTTP Handler.

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        # Disable Nagle's algorithm so SSE events are sent immediately,
        # not buffered by TCP kernel.
        try:
            self.request.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass

    def _resp_json(self, data, status=200):
        b = json.dumps(data).encode()
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            # Client disconnected while receiving the response.
            pass

    def _resp_bytes(self, data: bytes, *, content_type: str, status: int = 200):
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass

    def _resp_dashboard(self, endpoint: str):
        allowed = {
            "index.html": ("index.html", "text/html; charset=utf-8"),
            "styles.css": ("styles.css", "text/css; charset=utf-8"),
            "app.js": ("app.js", "application/javascript; charset=utf-8"),
        }
        endpoint = str(endpoint or "index.html").replace("\\", "/").strip("/")
        if not endpoint:
            endpoint = "index.html"
        if endpoint not in allowed:
            return self._resp_json({"error": {"message": f"unknown dashboard asset: {endpoint}"}}, 404)

        filename, content_type = allowed[endpoint]
        path = os.path.join(os.path.dirname(__file__), "dashboard", filename)
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            return self._resp_json({"error": {"message": f"dashboard asset missing: {endpoint}"}}, 404)
        return self._resp_bytes(data, content_type=content_type)

    def _admin_authorized(self) -> bool:
        expected = _admin_key()
        if not expected:
            return False
        supplied = self.headers.get("X-Admin-Key") or ""
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            supplied = auth.split(" ", 1)[1].strip()
        if not supplied and _allow_query_admin_key():
            try:
                from urllib.parse import parse_qs, urlparse

                qs = parse_qs(urlparse(self.path).query or "")
                supplied = (qs.get("admin_key") or [""])[0]
            except Exception:
                supplied = ""
        if not supplied:
            return False
        return hmac.compare_digest(str(supplied), expected)

    def _audit_admin_event(
        self,
        action: str,
        *,
        target: str = "",
        detail: Optional[dict] = None,
        status: str = "success",
        error: str = "",
    ) -> None:
        try:
            source_ip = ""
            if isinstance(getattr(self, "client_address", None), tuple) and self.client_address:
                source_ip = str(self.client_address[0])
            AUDIT.record(
                action,
                target=target,
                status=status,
                detail=detail or {},
                error=error,
                source_ip=source_ip,
                path=str(getattr(self, "path", "") or ""),
            )
        except Exception:
            pass

    def _resp_admin(self, endpoint: str):
        if not self._admin_authorized():
            return self._resp_json({"error": {"message": "admin auth required"}}, 403)
        if endpoint == "status":
            return self._resp_json(
                {
                    "status": "ok",
                    "metrics": OBSERVABILITY.snapshot(),
                    "router": ROUTER.snapshot(),
                    "policy": scheduler_policy.policy_snapshot(CONFIG),
                    "models": _model_capabilities_snapshot(),
                }
            )
        if endpoint == "metrics":
            return self._resp_json(OBSERVABILITY.snapshot())
        if endpoint == "routing":
            return self._resp_json(
                {
                    "router": ROUTER.snapshot(),
                    "policy": scheduler_policy.policy_snapshot(CONFIG),
                }
            )
        if endpoint == "models/capabilities":
            return self._resp_json(_model_capabilities_snapshot())
        if endpoint == "config":
            return self._resp_json(CONFIG_MANAGER.snapshot())
        if endpoint == "config/overlay":
            return self._resp_json(CONFIG_MANAGER.overlay_snapshot())
        if endpoint == "audit":
            params = self._query_params()
            return self._resp_json(AUDIT.list(limit=params.get("limit", 50)))
        if endpoint == "requests":
            filters = self._query_params()
            limit = filters.pop("limit", 50)
            offset = filters.pop("offset", 0)
            return self._resp_json(OBSERVABILITY.list_requests(filters=filters, limit=limit, offset=offset))
        if endpoint.startswith("requests/"):
            request_id = endpoint.split("/", 1)[1]
            detail = OBSERVABILITY.get_request(request_id)
            if detail is None:
                return self._resp_json({"error": {"message": f"unknown request: {request_id}"}}, 404)
            return self._resp_json(detail)
        if endpoint == "metrics/timeseries":
            params = self._query_params()
            return self._resp_json(
                OBSERVABILITY.timeseries(
                    bucket_s=params.get("bucket_s", 60),
                    buckets=params.get("buckets", 30),
                )
            )
        if endpoint.startswith("model-summary/"):
            from urllib.parse import unquote
            model_slug = unquote(endpoint.split("/", 1)[1])
            params = self._query_params()
            refresh = params.get("refresh") == "true"
            proxy = params.get("proxy")
            try:
                from artificial_analysis_api import aa
                result = aa.get(model_slug, proxy=proxy, refresh=refresh)
                return self._resp_json(result)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return self._resp_json({"error": str(e)}, 500)
        return self._resp_json({"error": {"message": f"unknown admin endpoint: {endpoint}"}}, 404)

    def _query_params(self) -> dict:
        try:
            from urllib.parse import parse_qs, urlparse

            qs = parse_qs(urlparse(self.path).query or "")
            return {
                str(k): str((v or [""])[0])
                for k, v in qs.items()
                if str(k).lower() != "admin_key"
            }
        except Exception:
            return {}

    def _resp_admin_mutation(self, endpoint: str):
        if not self._admin_authorized():
            return self._resp_json({"error": {"message": "admin auth required"}}, 403)

        from urllib.parse import unquote
        parts = [unquote(p) for p in str(endpoint or "").strip("/").split("/") if p]
        body = None
        if parts == ["requests", "clear"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "clear_request_history":
                self._audit_admin_event(
                    "request_history_clear_failed",
                    target="requests",
                    status="failed",
                    error="confirmation required",
                )
                return self._resp_json({"error": {"message": "confirm must be clear_request_history"}}, 400)
            result = OBSERVABILITY.clear_history()
            if bool((body or {}).get("include_diagnostics", True)):
                result["diagnostics"] = _clear_diagnostic_log()
            self._audit_admin_event(
                "request_history_cleared",
                target="requests",
                detail={
                    "history_requests_deleted": (result.get("history") or {}).get("requests_deleted", 0),
                    "diagnostics_cleared": bool((result.get("diagnostics") or {}).get("cleared")),
                },
            )
            return self._resp_json({"action": "request_history_cleared", **result})

        if parts == ["requests", "delete"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "delete_request_records":
                self._audit_admin_event(
                    "request_records_delete_failed",
                    target="requests",
                    status="failed",
                    error="confirmation required",
                )
                return self._resp_json({"error": {"message": "confirm must be delete_request_records"}}, 400)
            request_ids = (body or {}).get("request_ids")
            if not isinstance(request_ids, list):
                return self._resp_json({"error": {"message": "request_ids must be a list"}}, 400)
            result = OBSERVABILITY.delete_requests(request_ids)
            self._audit_admin_event(
                "request_records_deleted",
                target="requests",
                detail={
                    "requested": len(request_ids),
                    "history_requests_deleted": (result.get("history") or {}).get("requests_deleted", 0),
                    "memory_recent_deleted": (result.get("memory") or {}).get("recent_requests_deleted", 0),
                },
            )
            return self._resp_json({"action": "request_records_deleted", **result})

        if parts == ["requests", "delete-matching"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "delete_matching_request_records":
                self._audit_admin_event(
                    "request_matching_delete_failed",
                    target="requests",
                    status="failed",
                    error="confirmation required",
                )
                return self._resp_json({"error": {"message": "confirm must be delete_matching_request_records"}}, 400)
            filters = _request_filter_payload((body or {}).get("filters") or {})
            if not filters:
                return self._resp_json({"error": {"message": "at least one filter is required"}}, 400)
            result = OBSERVABILITY.delete_matching_requests(filters)
            history_error = (result.get("history") or {}).get("error")
            if history_error:
                return self._resp_json({"error": {"message": str(history_error)}}, 400)
            self._audit_admin_event(
                "request_matching_records_deleted",
                target="requests",
                detail={
                    "filters": filters,
                    "history_requests_deleted": (result.get("history") or {}).get("requests_deleted", 0),
                    "memory_recent_deleted": (result.get("memory") or {}).get("recent_requests_deleted", 0),
                },
            )
            return self._resp_json({"action": "request_matching_records_deleted", "filters": filters, **result})

        if parts == ["models", "routes", "delete"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            try:
                model = str((body or {}).get("model") or "").strip()
                CONFIG_MANAGER.delete_model_route(model)
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("model_route_deleted", target=model, detail={"model": model})
                return self._resp_json({"action": "model_route_deleted", "model": model, "config": CONFIG_MANAGER.snapshot()})
            except ConfigValidationError as e:
                self._audit_admin_event(
                    "model_route_delete_failed",
                    target=str((body or {}).get("model") or ""),
                    status="failed",
                    detail=body or {},
                    error=str(e),
                )
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["models", "refresh"]:
            model_registry.clear_cache()
            fetch_upstream_models()
            _save_router_state()
            self._audit_admin_event("models_refreshed", target="models")
            return self._resp_json({"action": "models_refreshed", "models": _model_capabilities_snapshot()})

        if parts == ["config", "reload"]:
            try:
                CONFIG_MANAGER.reload(load_base_config(apply_env=False))
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("config_reloaded", target="config")
                return self._resp_json({"action": "config_reloaded", "config": CONFIG_MANAGER.snapshot()})
            except ConfigValidationError as e:
                self._audit_admin_event("config_reload_failed", target="config", status="failed", error=str(e))
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["config", "overlay", "validate"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            try:
                overlay = (body or {}).get("overlay")
                preview = CONFIG_MANAGER.preview_overlay(overlay if overlay is not None else None)
                self._audit_admin_event("config_overlay_validated", target="config/overlay", detail={"has_overlay": preview.get("has_overlay")})
                return self._resp_json({"action": "config_overlay_validated", "preview": preview})
            except ConfigValidationError as e:
                self._audit_admin_event("config_overlay_validate_failed", target="config/overlay", status="failed", error=str(e))
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["config", "overlay", "clear"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "clear_runtime_overlay":
                self._audit_admin_event("config_overlay_clear_failed", target="config/overlay", status="failed", error="confirmation required")
                return self._resp_json({"error": {"message": "confirm must be clear_runtime_overlay"}}, 400)
            result = CONFIG_MANAGER.clear_overlay()
            _apply_runtime_config(CONFIG_MANAGER.config)
            self._audit_admin_event("config_overlay_cleared", target="config/overlay", detail={"backup_path": result.get("backup_path") or ""})
            return self._resp_json(
                {
                    "action": "config_overlay_cleared",
                    "backup_path": result.get("backup_path") or "",
                    "config": CONFIG_MANAGER.snapshot(),
                }
            )

        if parts == ["config", "overlay", "compact"]:
            try:
                result = CONFIG_MANAGER.compact_overlay()
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("config_overlay_compacted", target="config/overlay")
                return self._resp_json(
                    {
                        "action": "config_overlay_compacted",
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )
            except ConfigValidationError as e:
                self._audit_admin_event("config_overlay_compact_failed", target="config/overlay", status="failed", error=str(e))
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["providers"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            try:
                provider = str((body or {}).get("name") or "").strip()
                provider_cfg = {k: v for k, v in (body or {}).items() if k != "name"}
                CONFIG_MANAGER.add_provider(provider, provider_cfg)
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=True)
                self._audit_admin_event("provider_added", target=provider, detail=provider_cfg)
                return self._resp_json({"action": "provider_added", "provider": provider, "config": CONFIG_MANAGER.snapshot()})
            except ConfigValidationError as e:
                self._audit_admin_event(
                    "provider_add_failed",
                    target=str((body or {}).get("name") or ""),
                    status="failed",
                    error=str(e),
                )
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if len(parts) >= 3 and parts[0] == "providers":
            provider = parts[1]
            if len(parts) == 4 and parts[2] == "models" and parts[3] == "refresh":
                if provider not in (CONFIG.get("providers") or {}):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                model_registry.clear_cache(provider)
                fetch_provider_models(provider)
                _save_router_state()
                self._audit_admin_event("provider_models_refreshed", target=f"{provider}/models")
                return self._resp_json(
                    {
                        "action": "provider_models_refreshed",
                        "provider": provider,
                        "models": _model_capabilities_snapshot(),
                    }
                )

            if len(parts) == 3 and parts[2] == "keys":
                body = self._read_json_body()
                if isinstance(body, tuple):
                    return self._resp_json(body[0], body[1])
                try:
                    CONFIG_MANAGER.add_key(provider, (body or {}).get("key") or "", (body or {}).get("proxy") or "")
                    _apply_runtime_config(CONFIG_MANAGER.config)
                    _refresh_models_after_config_change(provider, force=True)
                    self._audit_admin_event("key_added", target=f"{provider}/keys", detail={"key": (body or {}).get("key") or "", "proxy": (body or {}).get("proxy") or ""})
                    return self._resp_json({"action": "key_added", "provider": provider, "config": CONFIG_MANAGER.snapshot()})
                except ConfigValidationError as e:
                    self._audit_admin_event("key_add_failed", target=f"{provider}/keys", status="failed", error=str(e))
                    return self._resp_json({"error": {"message": str(e)}}, 400)

            if len(parts) == 3 and parts[2] == "delete":
                body = self._read_json_body()
                if isinstance(body, tuple):
                    return self._resp_json(body[0], body[1])
                confirm = str((body or {}).get("confirm") or "").strip()
                if confirm != "delete_provider":
                    self._audit_admin_event(
                        "provider_delete_failed",
                        target=provider,
                        status="failed",
                        error="confirmation required",
                    )
                    return self._resp_json({"error": {"message": "confirm must be delete_provider"}}, 400)
                try:
                    CONFIG_MANAGER.delete_provider(provider)
                    _apply_runtime_config(CONFIG_MANAGER.config)
                    _refresh_models_after_config_change()
                    self._audit_admin_event("provider_deleted", target=provider)
                    return self._resp_json({"action": "provider_deleted", "provider": provider, "config": CONFIG_MANAGER.snapshot()})
                except ConfigValidationError as e:
                    self._audit_admin_event("provider_delete_failed", target=provider, status="failed", error=str(e))
                    return self._resp_json({"error": {"message": str(e)}}, 400)

            if len(parts) == 3 and parts[2] in ("enable", "disable"):
                enabled = parts[2] == "enable"
                if not ROUTER.set_provider_enabled(provider, enabled):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                _save_router_state()
                self._audit_admin_event("provider_enabled" if enabled else "provider_disabled", target=provider)
                return self._resp_json(
                    {
                        "action": "provider_enabled" if enabled else "provider_disabled",
                        "provider": provider,
                        "router": ROUTER.snapshot(),
                    }
                )

            if len(parts) == 4 and parts[2] == "cooldown" and parts[3] == "clear":
                if not ROUTER.clear_provider_cooldown(provider):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                _save_router_state()
                self._audit_admin_event("provider_cooldown_cleared", target=provider)
                return self._resp_json(
                    {
                        "action": "provider_cooldown_cleared",
                        "provider": provider,
                        "router": ROUTER.snapshot(),
                    }
                )

            if len(parts) >= 5 and parts[2] == "keys":
                try:
                    key_index = int(parts[3])
                except Exception:
                    return self._resp_json({"error": {"message": f"invalid key index: {parts[3]}"}}, 400)

                if len(parts) == 5 and parts[4] in ("enable", "disable"):
                    enabled = parts[4] == "enable"
                    if not ROUTER.set_key_enabled(provider, key_index, enabled):
                        return self._resp_json(
                            {"error": {"message": f"unknown key: {provider}/{key_index}"}},
                            404,
                        )
                    _save_router_state()
                    self._audit_admin_event(
                        "key_enabled" if enabled else "key_disabled",
                        target=f"{provider}/keys/{key_index}",
                    )
                    return self._resp_json(
                        {
                            "action": "key_enabled" if enabled else "key_disabled",
                            "provider": provider,
                            "key_index": key_index,
                            "router": ROUTER.snapshot(),
                        }
                    )

                if len(parts) == 5 and parts[4] == "delete":
                    body = self._read_json_body()
                    if isinstance(body, tuple):
                        return self._resp_json(body[0], body[1])
                    confirm = str((body or {}).get("confirm") or "").strip()
                    if confirm != "delete_key":
                        self._audit_admin_event(
                            "key_delete_failed",
                            target=f"{provider}/keys/{key_index}",
                            status="failed",
                            error="confirmation required",
                        )
                        return self._resp_json({"error": {"message": "confirm must be delete_key"}}, 400)
                    try:
                        CONFIG_MANAGER.delete_key(provider, key_index)
                        _apply_runtime_config(CONFIG_MANAGER.config)
                        _refresh_models_after_config_change(provider, force=True)
                        self._audit_admin_event("key_deleted", target=f"{provider}/keys/{key_index}")
                        return self._resp_json(
                            {
                                "action": "key_deleted",
                                "provider": provider,
                                "key_index": key_index,
                                "config": CONFIG_MANAGER.snapshot(),
                            }
                        )
                    except ConfigValidationError as e:
                        self._audit_admin_event(
                            "key_delete_failed",
                            target=f"{provider}/keys/{key_index}",
                            status="failed",
                            error=str(e),
                        )
                        return self._resp_json({"error": {"message": str(e)}}, 400)

                if len(parts) == 6 and parts[4] == "state" and parts[5] == "clear":
                    if not ROUTER.clear_key_state(provider, key_index):
                        return self._resp_json(
                            {"error": {"message": f"unknown key: {provider}/{key_index}"}},
                            404,
                        )
                    _save_router_state()
                    self._audit_admin_event("key_state_cleared", target=f"{provider}/keys/{key_index}")
                    return self._resp_json(
                        {
                            "action": "key_state_cleared",
                            "provider": provider,
                            "key_index": key_index,
                            "router": ROUTER.snapshot(),
                        }
                    )

                if len(parts) == 5 and parts[4] == "test":
                    body = self._read_json_body()
                    if isinstance(body, tuple):
                        return self._resp_json(body[0], body[1])
                    probe_model = str((body or {}).get("model") or "").strip()
                    result = probe_provider_key(provider, key_index, model=probe_model)
                    self._audit_admin_event(
                        "key_probed",
                        target=f"{provider}/keys/{key_index}",
                        status="ok" if result.get("ok") else "failed",
                        detail={
                            "ok": bool(result.get("ok")),
                            "format": result.get("format"),
                            "model": result.get("model"),
                            "requested_model": probe_model,
                            "error_type": result.get("error_type"),
                        },
                    )
                    return self._resp_json(
                        {
                            "action": "key_probed",
                            "provider": provider,
                            "key_index": key_index,
                            "result": result,
                        }
                    )

        return self._resp_json({"error": {"message": f"unknown admin endpoint: {endpoint}"}}, 404)

    def _resp_admin_patch(self, endpoint: str):
        if not self._admin_authorized():
            return self._resp_json({"error": {"message": "admin auth required"}}, 403)

        from urllib.parse import unquote
        parts = [unquote(p) for p in str(endpoint or "").strip("/").split("/") if p]
        body = self._read_json_body()
        if isinstance(body, tuple):
            return self._resp_json(body[0], body[1])

        try:
            if parts == ["routing"]:
                CONFIG_MANAGER.update_routing(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("routing_updated", target="routing", detail=body or {})
                return self._resp_json({"action": "routing_updated", "config": CONFIG_MANAGER.snapshot()})

            if parts == ["retry"]:
                CONFIG_MANAGER.update_retry(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("retry_updated", target="retry", detail=body or {})
                return self._resp_json({"action": "retry_updated", "config": CONFIG_MANAGER.snapshot()})

            if parts == ["retry", "failure-policies"]:
                CONFIG_MANAGER.update_failure_policy(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                error_type = str((body or {}).get("error_type") or "").strip()
                self._audit_admin_event("failure_policy_updated", target=error_type, detail=body or {})
                return self._resp_json({"action": "failure_policy_updated", "error_type": error_type, "config": CONFIG_MANAGER.snapshot()})

            if parts == ["models", "routes"]:
                CONFIG_MANAGER.update_model_route(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                model = str((body or {}).get("model") or "").strip()
                self._audit_admin_event("model_route_updated", target=model, detail=body or {})
                return self._resp_json({"action": "model_route_updated", "model": model, "config": CONFIG_MANAGER.snapshot()})

            if parts == ["proxy"]:
                CONFIG_MANAGER.update_global_proxy(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("global_proxy_updated", target="proxy", detail=body or {})
                return self._resp_json({"action": "global_proxy_updated", "config": CONFIG_MANAGER.snapshot()})

            if len(parts) == 2 and parts[0] == "providers":
                provider = parts[1]
                CONFIG_MANAGER.update_provider(provider, body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                refresh_fields = {"base_url", "models_path", "keys", "proxy", "headers", "user_agent"}
                _refresh_models_after_config_change(provider, force=any(k in refresh_fields for k in (body or {}).keys()))
                self._audit_admin_event("provider_updated", target=provider, detail=body or {})
                return self._resp_json({"action": "provider_updated", "provider": provider, "config": CONFIG_MANAGER.snapshot()})

            if len(parts) == 4 and parts[0] == "providers" and parts[2] == "keys":
                provider = parts[1]
                try:
                    key_index = int(parts[3])
                except Exception:
                    return self._resp_json({"error": {"message": f"invalid key index: {parts[3]}"}}, 400)
                CONFIG_MANAGER.update_key(provider, key_index, body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=True)
                self._audit_admin_event("key_updated", target=f"{provider}/keys/{key_index}", detail=body or {})
                return self._resp_json(
                    {
                        "action": "key_updated",
                        "provider": provider,
                        "key_index": key_index,
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )

            if len(parts) == 4 and parts[0] == "providers" and parts[2] == "formats":
                provider = parts[1]
                fmt = parts[3]
                CONFIG_MANAGER.update_format(provider, fmt, body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=True)
                self._audit_admin_event("format_updated", target=f"{provider}/formats/{fmt}", detail=body or {})
                return self._resp_json(
                    {
                        "action": "format_updated",
                        "provider": provider,
                        "format": fmt,
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )
        except ConfigValidationError as e:
            self._audit_admin_event(
                "admin_patch_failed",
                target="/".join(parts),
                status="failed",
                detail=body or {},
                error=str(e),
            )
            return self._resp_json({"error": {"message": str(e)}}, 400)

        return self._resp_json({"error": {"message": f"unknown admin endpoint: {endpoint}"}}, 404)

    def _read_body_bounded(self):
        """Read the request body defensively.

        Returns (body_bytes, None) on success, or (b"", (error_dict, status)) when
        Content-Length is malformed (400) or exceeds the configured limit (413)."""
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            return b"", ({"error": {"message": "invalid Content-Length"}}, 400)
        if length <= 0:
            return b"", None
        limit = _max_request_body_bytes()
        if limit > 0 and length > limit:
            return b"", ({"error": {"message": f"request body too large (max {limit} bytes)"}}, 413)
        return self.rfile.read(length), None

    def _read_json_body(self):
        body, err = self._read_body_bounded()
        if err is not None:
            return err
        if not body:
            return {}
        try:
            data = json.loads(body)
        except Exception as e:
            return {"error": {"message": f"invalid JSON: {e}"}}, 400
        if not isinstance(data, dict):
            return {"error": {"message": "JSON body must be an object"}}, 400
        return data

    MODELS = _default_models()

    def log_request_detail(self, prefix, path, headers, body=None):
        """Log request details to a file for debugging. Only active when PROXY_DEBUG=true."""
        if not DEBUG_LOG:
            return
        import datetime
        os.makedirs(LOG_DIR, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        with open(os.path.join(LOG_DIR, f"debug_{ts}_{prefix}.txt"), "w", encoding="utf-8") as f:
            f.write(f"Path: {path}\n")
            f.write(f"Headers: {dict(headers)}\n")
            if body:
                f.write(f"Body:\n{body[:5000]}\n")

    def do_GET(self):
        from urllib.parse import urlparse
        clean_path = urlparse(self.path).path
        route = classify_get(clean_path)
        print(f"[proxy] GET {clean_path}", flush=True)
        self.log_request_detail("GET", self.path, self.headers)
        if route.endpoint == "health":
            self._resp_json({"status": "ok"})
        elif route.family == "dashboard":
            self._resp_dashboard(route.endpoint)
        elif route.family == "admin":
            self._resp_admin(route.endpoint)
        elif route.endpoint == "models" and route.implemented:
            models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
            if models_source in ("first_healthy_provider", "union"):
                print(f"[proxy] Models: using saved capabilities ({models_source})", flush=True)
                self._resp_json(model_registry.models_from_capabilities(CONFIG, ROUTER))
            else:
                print(f"[proxy] Models: using hardcoded list", flush=True)
                self._resp_json(self.MODELS)
        else:
            self._resp_json({"error": {"message": f"unknown endpoint: {self.path}"}}, 404)

    def _proxy_openai_chat_completions(self, req, request_id, start_ts):
        is_stream = bool(req.get("stream", False))
        original_model = req.get("model", "")
        resolved_model = resolve_model(original_model or "")
        canonical_model = resolved_model
        OBSERVABILITY.record_request_start(
            request_id,
            client_format=CHAT,
            endpoint="chat_completions",
            model=canonical_model,
            stream=is_stream,
            path="/v1/chat/completions",
        )
        msgs_count = len(req.get("messages", []))
        print(f"[proxy] openai passthrough stream={is_stream} model={_hmodel(original_model)} msgs={msgs_count}", flush=True)
        if resolved_model != original_model:
            print(f"[proxy] model alias: {original_model} -> {resolved_model}", flush=True)

        attempt_errors = []
        log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", True))
        has_attempt = False
        total_start = time.time()
        routing_cfg = CONFIG.get("routing") or {}
        connect_t = int(routing_cfg.get("connect_timeout_s", 15))
        read_t = int(routing_cfg.get("read_timeout_s", 120))
        first_byte_t = int(routing_cfg.get("first_token_timeout_s", 30))  # Total budget before first stream event.
        max_attempts = int(routing_cfg.get("max_attempts", 6))
        max_budget = (connect_t + read_t) * min(3, max(1, max_attempts))
        allowed_formats = ["chat_completions", "responses", "anthropic_messages"]

        for attempt in ROUTER.iter_attempts(
            canonical_model,
            is_stream,
            request_id,
            client_headers=self.headers,
            client_format="chat_completions",
            allowed_upstream_formats=allowed_formats,
        ):
            has_attempt = True
            elapsed = time.time() - total_start
            remaining = max(connect_t, int(max_budget - elapsed))
            key_masked = ROUTER.masked_key(attempt.key)
            if log_each:
                proxy_tag = f" proxy={attempt.proxy_url}" if attempt.proxy_url else " proxy=direct"
                print(
                    f"[proxy] req={request_id} attempt={attempt.attempt_no} {_hprov(attempt.provider)} {_hkey(key_masked)}{proxy_tag} format={attempt.upstream_format} model={_hmodel(canonical_model)} {_harrow('->')} {_hmodel(attempt.provider_model)}",
                    flush=True,
                )

            attempt_started = time.time()
            try:
                payload = dict(
                    convert_request(
                        CHAT,
                        attempt.upstream_format,
                        req,
                        resolve_model=resolve_model,
                    )
                )
            except ValueError as e:
                _record_request_conversion_failure(request_id, attempt, CHAT, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                continue
            payload["model"] = attempt.provider_model
            payload["stream"] = is_stream if attempt.upstream_format in (CHAT, RESPONSES, ANTHROPIC) else False
            _force_chat_reasoning_content_if_needed(attempt, payload, log_each=log_each)
            _force_anthropic_thinking_if_needed(attempt, payload, log_each=log_each)
            response_started = False
            upstream_conn = None

            try:
                if is_stream:
                    upstream_conn = _open_stream_with_compat_retry(
                        request_id,
                        attempt,
                        payload,
                        proxy_url=attempt.proxy_url,
                        remaining_timeout_s=remaining,
                        first_byte_timeout_s=first_byte_t if first_byte_t > 0 else None,
                        attempt_started_at=attempt_started,
                    )
                    first_event_remaining = _remaining_first_event_timeout(attempt_started, first_byte_t) if first_byte_t > 0 else None
                    initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                    OBSERVABILITY.record_first_byte(request_id)

                    self.close_connection = True
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-Accel-Buffering", "no")
                    self.end_headers()
                    response_started = True

                    if attempt.upstream_format == CHAT:
                        stream_resp = relay_sse_stream(upstream_conn, self.wfile, initial_lines=initial_lines)
                    elif attempt.upstream_format == RESPONSES:
                        stream_resp = stream_responses_sse_to_openai_chat(
                            upstream_conn,
                            self.wfile,
                            original_model,
                            read_timeout_s=read_t,
                            initial_lines=initial_lines,
                        )
                    else:
                        stream_resp = stream_anthropic_sse_to_openai_chat(
                            upstream_conn,
                            self.wfile,
                            original_model,
                            read_timeout_s=read_t,
                            initial_lines=initial_lines,
                        )
                    if stream_resp is None:
                        _record_stream_interrupted(
                            request_id,
                            attempt,
                            attempt_errors,
                            duration_ms=_attempt_duration_ms(attempt_started),
                        )
                        OBSERVABILITY.record_request_end(request_id, status_code=502, error="stream_interrupted")
                        return
                    ROUTER.report_success(attempt)
                    OBSERVABILITY.record_attempt(
                        request_id,
                        attempt,
                        outcome="success",
                        usage=_response_usage(stream_resp),
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    return

                upstream_data = _request_json_with_compat_retry(
                    request_id,
                    attempt,
                    payload,
                    proxy_url=attempt.proxy_url,
                    remaining_timeout_s=remaining,
                )
                client_response = convert_response(
                    attempt.upstream_format,
                    CHAT,
                    upstream_data,
                    original_model=original_model,
                )
                if _is_empty_visible_output(
                    CHAT,
                    client_response,
                    upstream_format=attempt.upstream_format,
                    upstream_response=upstream_data,
                ):
                    _record_empty_visible_output_failure(request_id, attempt, attempt_errors)
                    continue
                ROUTER.report_success(attempt)
                OBSERVABILITY.record_attempt(
                    request_id,
                    attempt,
                    outcome="success",
                    usage=_response_usage(client_response, upstream_data),
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                OBSERVABILITY.record_request_end(request_id, status_code=200)
                return self._resp_json(client_response)

            except (HTTPError, CachedHTTPError) as e:
                status, error_body, headers = _http_error_details(e)
                retry_after_s = parse_retry_after_seconds(headers.get("Retry-After"))
                decision = scheduler_policy.classify_http_error(
                    CONFIG,
                    int(status),
                    error_body=error_body,
                    model_name=payload.get("model", ""),
                )
                _record_upstream_http_failure(
                    request_id,
                    attempt,
                    status,
                    error_body,
                    decision,
                    retry_after_s,
                    attempt_errors,
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                if decision.stop_attempts:
                    break
                continue

            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError) as e:
                if response_started:
                    print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                    OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                    return
                _record_transport_failure(request_id, attempt, e, attempt_errors, stage="client_disconnected", duration_ms=_attempt_duration_ms(attempt_started))
                continue

            except (URLError, socket.timeout) as e:
                err_label = "timeout" if isinstance(e, socket.timeout) else "network_error"
                stage = "streaming_idle_timeout" if response_started and isinstance(e, socket.timeout) else _transport_stage_for_exception(e)
                _record_transport_failure(
                    request_id,
                    attempt,
                    e,
                    attempt_errors,
                    reason=err_label,
                    stage=stage,
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                if response_started:
                    OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                    return
                continue

            except Exception as e:
                if response_started:
                    print(f"[proxy] STREAM ERROR req={request_id} {_h(attempt.provider)}: {type(e).__name__}", flush=True)
                    _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                    return
                _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                continue

            finally:
                _close_upstream_conn(upstream_conn)

        if not has_attempt:
            if is_stream:
                OBSERVABILITY.record_request_end(request_id, status_code=501)
                return self._resp_json(
                    {
                        "error": {
                            "message": "Chat Completions streaming currently requires a native Chat Completions, Responses, or Anthropic Messages upstream provider",
                            "request_id": request_id,
                        }
                    },
                    501,
                )
            OBSERVABILITY.record_request_end(request_id, status_code=400)
            return self._resp_json(
                {"error": {"message": f"No provider supports model '{canonical_model}'", "request_id": request_id}},
                400,
            )

        dur_ms = int((time.time() - start_ts) * 1000)
        err_msg = f"All upstream attempts failed (req={request_id}, {dur_ms}ms): " + "; ".join(attempt_errors[-10:])
        OBSERVABILITY.record_request_end(request_id, status_code=502, error=err_msg)
        return self._resp_json({"error": {"message": err_msg, "request_id": request_id}}, 502)

    def _proxy_openai_responses(self, req, request_id, start_ts, path="/openai/v1/responses"):
        is_stream = bool(req.get("stream", False))
        original_model = req.get("model", "")
        resolved_model = resolve_model(original_model or "")
        canonical_model = resolved_model
        OBSERVABILITY.record_request_start(
            request_id,
            client_format=RESPONSES,
            endpoint="responses",
            model=canonical_model,
            stream=is_stream,
            path=path,
        )
        print(f"[proxy] responses stream={is_stream} model={_hmodel(original_model)}", flush=True)
        if resolved_model != original_model:
            print(f"[proxy] model alias: {original_model} -> {resolved_model}", flush=True)

        allowed_formats = [RESPONSES, CHAT, ANTHROPIC]
        attempt_errors = []
        log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", True))
        has_attempt = False
        total_start = time.time()
        routing_cfg = CONFIG.get("routing") or {}
        connect_t = int(routing_cfg.get("connect_timeout_s", 15))
        read_t = int(routing_cfg.get("read_timeout_s", 120))
        first_byte_t = int(routing_cfg.get("first_token_timeout_s", 30))  # Total budget before first stream event.
        max_attempts = int(routing_cfg.get("max_attempts", 6))
        max_budget = (connect_t + read_t) * min(3, max(1, max_attempts))

        for attempt in ROUTER.iter_attempts(
            canonical_model,
            is_stream,
            request_id,
            client_headers=self.headers,
            client_format="responses",
            allowed_upstream_formats=allowed_formats,
        ):
            has_attempt = True
            elapsed = time.time() - total_start
            remaining = max(connect_t, int(max_budget - elapsed))
            key_masked = ROUTER.masked_key(attempt.key)
            if log_each:
                proxy_tag = f" proxy={attempt.proxy_url}" if attempt.proxy_url else " proxy=direct"
                print(
                    f"[proxy] req={request_id} attempt={attempt.attempt_no} {_hprov(attempt.provider)} {_hkey(key_masked)}{proxy_tag} format={attempt.upstream_format} model={_hmodel(canonical_model)} {_harrow('->')} {_hmodel(attempt.provider_model)}",
                    flush=True,
                )

            attempt_started = time.time()
            try:
                payload = dict(
                    convert_request(
                        RESPONSES,
                        attempt.upstream_format,
                        req,
                        resolve_model=resolve_model,
                    )
                )
            except ValueError as e:
                _record_request_conversion_failure(request_id, attempt, RESPONSES, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                continue
            payload["model"] = attempt.provider_model
            payload["stream"] = is_stream if attempt.upstream_format in (RESPONSES, CHAT, ANTHROPIC) else False
            _force_chat_reasoning_content_if_needed(attempt, payload, log_each=log_each)
            _force_anthropic_thinking_if_needed(attempt, payload, log_each=log_each)

            response_started = False
            upstream_conn = None
            try:
                if is_stream:
                    upstream_conn = _open_stream_with_compat_retry(
                        request_id,
                        attempt,
                        payload,
                        proxy_url=attempt.proxy_url,
                        remaining_timeout_s=remaining,
                        first_byte_timeout_s=first_byte_t if first_byte_t > 0 else None,
                        attempt_started_at=attempt_started,
                    )
                    first_event_remaining = _remaining_first_event_timeout(attempt_started, first_byte_t) if first_byte_t > 0 else None
                    if attempt.upstream_format in (RESPONSES, ANTHROPIC):
                        initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                    else:
                        first_line = _prefetch_first_stream_line(upstream_conn, first_event_remaining)
                        initial_lines = [first_line] if first_line else None
                    OBSERVABILITY.record_first_byte(request_id)

                    self.close_connection = True
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-Accel-Buffering", "no")
                    self.end_headers()
                    response_started = True

                    stream_resp = None
                    if attempt.upstream_format == RESPONSES:
                        stream_resp = relay_sse_stream(upstream_conn, self.wfile, initial_lines=initial_lines)
                    elif attempt.upstream_format == CHAT:
                        stream_resp = stream_openai_sse_to_responses(
                            upstream_conn,
                            self.wfile,
                            original_model,
                            read_timeout_s=read_t,
                            initial_lines=initial_lines,
                        )
                    else:
                        stream_resp = stream_anthropic_sse_to_responses(
                            upstream_conn,
                            self.wfile,
                            original_model,
                            read_timeout_s=read_t,
                            initial_lines=initial_lines,
                        )
                    if stream_resp is None:
                        _record_stream_interrupted(
                            request_id,
                            attempt,
                            attempt_errors,
                            duration_ms=_attempt_duration_ms(attempt_started),
                        )
                        OBSERVABILITY.record_request_end(request_id, status_code=502, error="stream_interrupted")
                        return
                    ROUTER.report_success(attempt)
                    OBSERVABILITY.record_attempt(
                        request_id,
                        attempt,
                        outcome="success",
                        usage=_response_usage(stream_resp),
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    return

                upstream_data = _request_json_with_compat_retry(
                    request_id,
                    attempt,
                    payload,
                    proxy_url=attempt.proxy_url,
                    remaining_timeout_s=remaining,
                )
                client_response = convert_response(
                    attempt.upstream_format,
                    RESPONSES,
                    upstream_data,
                    original_model=original_model,
                )
                if _is_empty_visible_output(
                    RESPONSES,
                    client_response,
                    upstream_format=attempt.upstream_format,
                    upstream_response=upstream_data,
                ):
                    _record_empty_visible_output_failure(request_id, attempt, attempt_errors)
                    continue
                ROUTER.report_success(attempt)
                OBSERVABILITY.record_attempt(
                    request_id,
                    attempt,
                    outcome="success",
                    usage=_response_usage(client_response, upstream_data),
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                OBSERVABILITY.record_request_end(request_id, status_code=200)
                return self._resp_json(client_response)

            except (HTTPError, CachedHTTPError) as e:
                status, error_body, headers = _http_error_details(e)
                retry_after_s = parse_retry_after_seconds(headers.get("Retry-After"))
                decision = scheduler_policy.classify_http_error(
                    CONFIG,
                    int(status),
                    error_body=error_body,
                    model_name=payload.get("model", ""),
                )
                _record_upstream_http_failure(
                    request_id,
                    attempt,
                    status,
                    error_body,
                    decision,
                    retry_after_s,
                    attempt_errors,
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                if decision.stop_attempts:
                    break
                continue

            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError) as e:
                if response_started:
                    print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                    OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                    return
                _record_transport_failure(request_id, attempt, e, attempt_errors, stage="client_disconnected", duration_ms=_attempt_duration_ms(attempt_started))
                continue

            except (URLError, socket.timeout) as e:
                err_label = "timeout" if isinstance(e, socket.timeout) else "network_error"
                stage = "streaming_idle_timeout" if response_started and isinstance(e, socket.timeout) else _transport_stage_for_exception(e)
                _record_transport_failure(
                    request_id,
                    attempt,
                    e,
                    attempt_errors,
                    reason=err_label,
                    stage=stage,
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                if response_started:
                    OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                    return
                continue

            except Exception as e:
                if response_started:
                    print(f"[proxy] STREAM ERROR req={request_id} {_h(attempt.provider)}: {type(e).__name__}", flush=True)
                    _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                    return
                _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                continue

            finally:
                _close_upstream_conn(upstream_conn)

        if not has_attempt:
            if is_stream:
                OBSERVABILITY.record_request_end(request_id, status_code=501)
                return self._resp_json(
                    {
                        "error": {
                            "message": "Responses streaming currently requires a native Responses, Chat Completions, or Anthropic Messages upstream provider",
                            "request_id": request_id,
                        }
                    },
                    501,
                )
            OBSERVABILITY.record_request_end(request_id, status_code=400)
            return self._resp_json(
                {"error": {"message": f"No provider supports model '{canonical_model}'", "request_id": request_id}},
                400,
            )

        dur_ms = int((time.time() - start_ts) * 1000)
        err_msg = f"All upstream attempts failed (req={request_id}, {dur_ms}ms): " + "; ".join(attempt_errors[-10:])
        OBSERVABILITY.record_request_end(request_id, status_code=502, error=err_msg)
        return self._resp_json({"error": {"message": err_msg, "request_id": request_id}}, 502)

    def do_PATCH(self):
        from urllib.parse import urlparse
        clean_path = urlparse(self.path).path
        route = classify_post(clean_path)
        self.log_request_detail("PATCH", self.path, self.headers)
        print(f"[proxy] PATCH {clean_path}", flush=True)

        if route.family == "admin":
            return self._resp_admin_patch(route.endpoint)
        return self._resp_json({"error": {"message": f"unknown endpoint: {self.path}"}}, 404)

    def do_POST(self):
        from urllib.parse import urlparse
        clean_path = urlparse(self.path).path
        route = classify_post(clean_path)
        self.log_request_detail("POST", self.path, self.headers)
        print(f"[proxy] POST {clean_path}", flush=True)

        if route.family == "admin":
            return self._resp_admin_mutation(route.endpoint)

        # Handle count_tokens endpoint (Claude Code calls this)
        if route.endpoint == "count_tokens" and route.implemented:
            body, err = self._read_body_bounded()
            if err is not None:
                return self._resp_json(err[0], err[1])
            try:
                req = json.loads(body)
            except Exception:
                return self._resp_json({"error": {"message": "invalid JSON"}}, 400)
            # Estimate token count (rough char/4 count)
            text = json.dumps(req)
            est_tokens = max(1, len(text) // 4)
            print(f"  count_tokens: est={est_tokens}", flush=True)
            return self._resp_json({"input_tokens": est_tokens, "output_tokens": 0})

        is_responses = route.endpoint == "responses" and route.family == "responses" and route.implemented
        is_anthropic_messages = route.endpoint == "messages" and route.family == "anthropic" and route.implemented
        is_chat_completions = route.endpoint == "chat_completions" and route.family == "chat_completions" and route.implemented
        if not (is_anthropic_messages or is_chat_completions or is_responses):
            print(f"[proxy] UNKNOWN POST path: {self.path}", flush=True)
            return self._resp_json({"error": {"message": f"unknown endpoint: {self.path}"}}, 404)

        body, err = self._read_body_bounded()
        if err is not None:
            return self._resp_json(err[0], err[1])
        try:
            req = json.loads(body)
        except Exception as e:
            return self._resp_json({"error": {"message": str(e)}}, 400)

        request_id = self.headers.get("X-Request-Id") or self.headers.get("X-Request-ID") or uuid.uuid4().hex
        start_ts = time.time()

        if is_chat_completions:
            return self._proxy_openai_chat_completions(req, request_id, start_ts)
        if is_responses:
            return self._proxy_openai_responses(req, request_id, start_ts, path=clean_path)

        is_stream = req.get("stream", False)
        original_model = req.get("model", "deepseek-v4-flash")
        msgs_count = len(req.get("messages", []))
        tools_count = len(req.get("tools", []))
        print(f"[proxy] stream={is_stream} model={_hmodel(original_model)} msgs={msgs_count} tools={tools_count}", flush=True)

        try:
            # Rebuild union aliases from saved capabilities/config without upstream I/O.
            try:
                if str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider")) == "union":
                    if not model_registry.has_cached_models("__union__"):
                        model_registry.models_from_capabilities(CONFIG, ROUTER)
            except Exception:
                pass
            resolved_model = resolve_model(original_model or "")
            if resolved_model != original_model:
                print(f"[proxy] model alias: {original_model} -> {resolved_model}", flush=True)
            canonical_model = resolved_model
            OBSERVABILITY.record_request_start(
                request_id,
                client_format=ANTHROPIC,
                endpoint="messages",
                model=canonical_model,
                stream=bool(is_stream),
                path="/anthropic/v1/messages" if not route.legacy else "/v1/messages",
            )

            payload_base = None
            if DEBUG_LOG:
                payload_base = convert_request(ANTHROPIC, CHAT, req, resolve_model=resolve_model)
                for i, m in enumerate(payload_base.get("messages", [])[:5]):
                    if "reasoning_content" in m:
                        rv = m.get("reasoning_content")
                        rlen = len(rv) if isinstance(rv, str) else 0
                        rc = f" reasoning=SET(len={rlen})"
                    else:
                        rc = " reasoning=NO"
                    tc = " tools=" + str(len(m.get("tool_calls", [])))
                    c_preview = (m.get("content") or "")[:60]
                    print(f"  msg[{i}] role={m['role']}{rc}{tc} {c_preview!r}", flush=True)

            attempt_errors = []
            log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", True))
            has_attempt = False
            total_start = time.time()
            routing_cfg = (CONFIG.get("routing") or {})
            connect_t = int(routing_cfg.get("connect_timeout_s", 15))
            read_t = int(routing_cfg.get("read_timeout_s", 120))
            first_byte_t = int(routing_cfg.get("first_token_timeout_s", 30))  # Total budget before first stream event.
            max_attempts = int(routing_cfg.get("max_attempts", 6))
            # Keep a bounded global routing budget across attempts.
            max_budget = (connect_t + read_t) * min(3, max(1, max_attempts))

            allowed_formats = [ANTHROPIC, CHAT, RESPONSES]
            for attempt in ROUTER.iter_attempts(
                canonical_model,
                bool(is_stream),
                request_id,
                client_headers=self.headers,
                client_format=ANTHROPIC,
                allowed_upstream_formats=allowed_formats,
            ):
                has_attempt = True
                # Shrink per-attempt timeout as total routing budget is consumed.
                elapsed = time.time() - total_start
                remaining = max(connect_t, int(max_budget - elapsed))
                has_attempt = True
                key_masked = ROUTER.masked_key(attempt.key)
                if log_each:
                    proxy_tag = f" proxy={attempt.proxy_url}" if attempt.proxy_url else " proxy=direct"
                    print(
                        f"[proxy] req={request_id} attempt={attempt.attempt_no} {_hprov(attempt.provider)} {_hkey(key_masked)}{proxy_tag} format={attempt.upstream_format} model={_hmodel(canonical_model)} {_harrow('->')} {_hmodel(attempt.provider_model)}",
                        flush=True,
                    )

                attempt_started = time.time()
                try:
                    payload = dict(
                        convert_request(
                            ANTHROPIC,
                            attempt.upstream_format,
                            req,
                            resolve_model=resolve_model,
                        )
                    )
                except ValueError as e:
                    _record_request_conversion_failure(request_id, attempt, ANTHROPIC, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    continue
                payload["model"] = attempt.provider_model
                payload["stream"] = bool(is_stream) if attempt.upstream_format in (ANTHROPIC, CHAT, RESPONSES) else False
                _force_chat_reasoning_content_if_needed(attempt, payload, log_each=log_each)
                _force_anthropic_thinking_if_needed(attempt, payload, log_each=log_each)

                response_started = False
                upstream_conn = None
                try:
                    if is_stream:
                        # Open upstream stream and prefetch the first event before sending headers.
                        upstream_conn = _open_stream_with_compat_retry(request_id, attempt, payload, proxy_url=attempt.proxy_url, remaining_timeout_s=remaining, first_byte_timeout_s=first_byte_t if first_byte_t > 0 else None, attempt_started_at=attempt_started)
                        first_event_remaining = _remaining_first_event_timeout(attempt_started, first_byte_t) if first_byte_t > 0 else None
                        if attempt.upstream_format in (ANTHROPIC, RESPONSES):
                            initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                        else:
                            first_line = _prefetch_first_stream_line(upstream_conn, first_event_remaining)
                            initial_lines = [first_line] if first_line else None
                        OBSERVABILITY.record_first_byte(request_id)

                        self.close_connection = True
                        self.send_response(200)
                        self.send_header("Content-Type", "text/event-stream")
                        self.send_header("Cache-Control", "no-cache")
                        self.send_header("X-Accel-Buffering", "no")
                        self.end_headers()
                        response_started = True

                        if attempt.upstream_format == "anthropic_messages":
                            native_usage = relay_sse_stream(upstream_conn, self.wfile, initial_lines=initial_lines)
                            anth_resp = {"streamed": True, "native": True, "usage": native_usage}
                        elif attempt.upstream_format == RESPONSES:
                            anth_resp = stream_responses_sse_to_anthropic(
                                upstream_conn,
                                self.wfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                        else:
                            anth_resp = do_stream(upstream_conn, self.wfile, original_model, read_timeout_s=read_t, initial_lines=initial_lines)
                        if anth_resp is None:
                            _record_stream_interrupted(
                                request_id,
                                attempt,
                                attempt_errors,
                                duration_ms=_attempt_duration_ms(attempt_started),
                            )
                            OBSERVABILITY.record_request_end(request_id, status_code=502, error="stream_interrupted")
                            return
                        ROUTER.report_success(attempt)
                        OBSERVABILITY.record_attempt(
                            request_id,
                            attempt,
                            outcome="success",
                            usage=_response_usage(anth_resp),
                            duration_ms=_attempt_duration_ms(attempt_started),
                        )
                        OBSERVABILITY.record_request_end(request_id, status_code=200)
                        if DEBUG_LOG:
                            log_request(
                                req,
                                payload,
                                {"streamed": True, "provider": attempt.provider, "key": key_masked},
                                anth_resp,
                            )
                        return

                    upstream_data = _request_json_with_compat_retry(request_id, attempt, payload, proxy_url=attempt.proxy_url, remaining_timeout_s=remaining)
                    if attempt.upstream_format == ANTHROPIC:
                        anth_resp = upstream_data
                    else:
                        anth_resp = convert_response(
                            attempt.upstream_format,
                            ANTHROPIC,
                            upstream_data,
                            original_model=original_model,
                        )
                    if _is_empty_visible_output(
                        ANTHROPIC,
                        anth_resp,
                        upstream_format=attempt.upstream_format,
                        upstream_response=upstream_data,
                    ):
                        _record_empty_visible_output_failure(request_id, attempt, attempt_errors)
                        continue
                    ROUTER.report_success(attempt)
                    OBSERVABILITY.record_attempt(
                        request_id,
                        attempt,
                        outcome="success",
                        usage=_response_usage(anth_resp, upstream_data),
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    self._resp_json(anth_resp)
                    if DEBUG_LOG:
                        log_request(req, payload, upstream_data, anth_resp)
                    return

                except (HTTPError, CachedHTTPError) as e:
                    status, error_body, headers = _http_error_details(e)
                    retry_after_s = parse_retry_after_seconds(headers.get("Retry-After"))
                    decision = scheduler_policy.classify_http_error(
                        CONFIG,
                        int(status),
                        error_body=error_body,
                        model_name=payload.get("model", ""),
                    )
                    err_type = decision.error_type

                    # reasoning_content errors can be retried after stripping that field.
                    if scheduler_policy.should_strip_reasoning_content(attempt.upstream_format, error_body):
                        stripped = 0
                        for msg in payload.get("messages", []):
                            if msg.get("role") == "assistant" and "reasoning_content" in msg:
                                del msg["reasoning_content"]
                                stripped += 1
                        if stripped:
                            print(f"[proxy] reasoning_content stripped from {stripped} msg(s), retrying...", flush=True)
                        # Continue with the next attempt after reporting this failed attempt.
                        _record_upstream_http_failure(
                            request_id,
                            attempt,
                            status,
                            error_body,
                            decision,
                            retry_after_s,
                            attempt_errors,
                            reason="reasoning_content_retry",
                            duration_ms=_attempt_duration_ms(attempt_started),
                        )
                        continue

                    _record_upstream_http_failure(
                        request_id,
                        attempt,
                        status,
                        error_body,
                        decision,
                        retry_after_s,
                        attempt_errors,
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )

                    if decision.stop_attempts:
                        break
                    continue

                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError) as e:
                    if response_started:
                        print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                        OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                        return
                    _record_transport_failure(request_id, attempt, e, attempt_errors, stage="client_disconnected", duration_ms=_attempt_duration_ms(attempt_started))
                    continue

                except URLError as e:
                    stage = _transport_stage_for_exception(e)
                    _record_transport_failure(
                        request_id,
                        attempt,
                        e,
                        attempt_errors,
                        reason="network_error",
                        stage=stage,
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )
                    if response_started:
                        OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                        return
                    continue

                except socket.timeout as e:
                    stage = "streaming_idle_timeout" if response_started else _transport_stage_for_exception(e)
                    _record_transport_failure(
                        request_id,
                        attempt,
                        e,
                        attempt_errors,
                        reason="timeout",
                        stage=stage,
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )
                    if response_started:
                        OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                        return
                    continue

                except Exception as e:
                    if response_started:
                        print(f"[proxy] STREAM ERROR req={request_id} {_h(attempt.provider)}: {type(e).__name__}", flush=True)
                        _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                        OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                        return
                    _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    continue

                finally:
                    _close_upstream_conn(upstream_conn)

            # All attempts failed before writing SSE/response body.
            if not has_attempt:
                if is_stream:
                    OBSERVABILITY.record_request_end(request_id, status_code=501)
                    return self._resp_json(
                        {
                            "error": {
                                "message": "Anthropic Messages streaming currently requires a native Anthropic Messages, Chat Completions, or Responses upstream provider",
                                "request_id": request_id,
                            }
                        },
                        501,
                    )
                OBSERVABILITY.record_request_end(request_id, status_code=400)
                return self._resp_json(
                    {"error": {"message": f"No provider supports model '{canonical_model}'", "request_id": request_id}}, 400
                )
            dur_ms = int((time.time() - start_ts) * 1000)
            err_msg = f"All upstream attempts failed (req={request_id}, {dur_ms}ms): " + "; ".join(attempt_errors[-10:])
            if DEBUG_LOG:
                try:
                    log_request(req, {"stream": bool(is_stream)}, {"error": err_msg}, None)
                except Exception:
                    pass
            OBSERVABILITY.record_request_end(request_id, status_code=502, error=err_msg)
            return self._resp_json({"error": {"message": err_msg, "request_id": request_id}}, 502)

        except Exception as e:
            dur_ms = int((time.time() - start_ts) * 1000)
            err_msg = f"{type(e).__name__}: {str(e)[:500]}"
            print(f"[proxy] FATAL req={request_id} {dur_ms}ms: {err_msg}", flush=True)
            if DEBUG_LOG:
                try:
                    log_request(req, {"stream": bool(is_stream)}, {"error": err_msg}, None)
                except Exception:
                    pass
            try:
                OBSERVABILITY.record_request_end(request_id, status_code=502, error=err_msg)
            except Exception:
                pass
            return self._resp_json({"error": {"message": err_msg, "request_id": request_id}}, 502)

    def log_message(self, *args):
        pass

class _ThreadPoolHTTPServer(ThreadingMixIn, HTTPServer):
    """HTTPServer with a fixed-size thread pool. Prevents resource
    exhaustion from unlimited concurrent streaming connections."""
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, *args, max_workers=20, **kwargs):
        self._executor = None  # Initialize before server_bind so server_close is safe after bind failures.
        super().__init__(*args, **kwargs)
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="proxy"
        )

    def process_request(self, request, client_address):
        self._executor.submit(self.process_request_thread, request, client_address)

    def server_close(self):
        if self._executor is not None:
            self._executor.shutdown(wait=False)
        super().server_close()


def _prefetch_model_summaries():
    try:
        models = set()
        models_cfg = CONFIG.get("models") or {}
        
        # 1. Configured routes
        routes = models_cfg.get("routes") or {}
        if isinstance(routes, dict):
            for m in routes.keys():
                if m:
                    models.add(str(m))
                    
        # 2. Configured provider model mapping
        prov_map = models_cfg.get("provider_model_map") or {}
        if isinstance(prov_map, dict):
            for mapping in prov_map.values():
                if isinstance(mapping, dict):
                    for client_m, prov_m in mapping.items():
                        if client_m:
                            models.add(str(client_m))
                        if prov_m:
                            models.add(str(prov_m))
                            
        # 3. Client model map
        client_map = models_cfg.get("client_model_map") or {}
        if isinstance(client_map, dict):
            for client_m, mapped_m in client_map.items():
                if client_m:
                    models.add(str(client_m))
                if mapped_m:
                    models.add(str(mapped_m))
                    
        # 4. Provider model capabilities
        caps = models_cfg.get("provider_model_capabilities") or {}
        if isinstance(caps, dict):
            for entry in caps.values():
                if isinstance(entry, dict) and "models" in entry:
                    for m in entry["models"]:
                        if m:
                            models.add(str(m))
                            
        # 5. Union model ids from registry
        try:
            import model_registry
            for m in model_registry.union_model_ids():
                if m:
                    models.add(str(m))
        except Exception:
            pass
            
        # 6. Default models
        try:
            import model_registry
            for m in model_registry.default_models().get("data", []):
                mid = m.get("id")
                if mid:
                    models.add(str(mid))
        except Exception:
            pass
            
        # 7. Historical request models and attempt models from SQLite database
        try:
            if OBSERVABILITY and hasattr(OBSERVABILITY, "_history") and OBSERVABILITY._history and OBSERVABILITY._history.enabled:
                with OBSERVABILITY._history._connect() as conn:
                    # Get models from requests
                    for row in conn.execute("SELECT DISTINCT model FROM requests WHERE model IS NOT NULL AND model != ''"):
                        if row[0]:
                            models.add(str(row[0]))
                    # Get provider models from attempts
                    for row in conn.execute("SELECT DISTINCT provider_model FROM attempts WHERE provider_model IS NOT NULL AND provider_model != ''"):
                        if row[0]:
                            models.add(str(row[0]))
        except Exception as e:
            print(f"[proxy] Failed to fetch historical models for prefetching: {e}", flush=True)

        # Remove empty strings
        models = {m.strip() for m in models if m and m.strip()}
        if not models:
            return
            
        print(f"[proxy] Background prefetching Model Summaries for {len(models)} models...", flush=True)
        def do_prefetch():
            import time
            from artificial_analysis_api import aa
            # Wait a few seconds for the proxy to start serving, then start fetching
            time.sleep(5)
            for m in sorted(list(models)):
                try:
                    # aa.get performs a resolved check; if cached locally, it returns immediately.
                    # Otherwise it fetches & parses.
                    res = aa.get(m)
                    # Sleep slightly between network fetches to avoid spamming artificial analysis
                    if res and not res.get("cached") and not res.get("error"):
                        time.sleep(1.5)
                except Exception as e:
                    print(f"[proxy] Failed to prefetch summary for {m}: {e}", flush=True)
            print("[proxy] Background prefetching of Model Summaries complete.", flush=True)
            
        import threading
        t = threading.Thread(target=do_prefetch, daemon=True)
        t.start()
    except Exception as e:
        print(f"[proxy] Failed to start prefetcher: {e}", flush=True)


if __name__ == "__main__":
    # Restore runtime state before model prefetch.
    _load_router_state()
    _prefetch_model_summaries()
    # Start autosave before serving requests.
    _start_state_autosave()

    # Warm model list so first user request is less likely to block.
    try:
        models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
        if models_source in ("union", "first_healthy_provider"):
            fetch_upstream_models()
            _save_router_state()
    except Exception:
        pass

    s = _ThreadPoolHTTPServer((HOST, PORT), Handler, max_workers=MAX_WORKERS)
    s.timeout = 0.5
    log_info = f" (debug logging ON)" if DEBUG_LOG else ""
    print(f"Proxy on http://localhost:{PORT}/v1/messages", flush=True)
    print(f"Bind: {HOST}:{PORT}  Workers: {MAX_WORKERS}  Logs: {LOG_DIR}{log_info}", flush=True)
    if HOST in ("0.0.0.0", "::"):
        print(
            "[proxy][WARN] Bound to all interfaces; the proxy and Admin API are reachable "
            "from the network and protected only by the admin key. "
            "Set server.host to 127.0.0.1 to restrict to localhost.",
            flush=True,
        )
    try:
        s.serve_forever()
    except KeyboardInterrupt:
        print("\n[proxy] Shutting down...", flush=True)
        _save_router_state()
        s.server_close()


