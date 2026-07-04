#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
if __name__ == "__main__":
    sys.modules["sse2json"] = sys.modules["__main__"]

"""Minimal proxy: Anthropic /v1/messages -> OpenAI /chat/completions
   Features: thinking blocks (native Anthropic format, rendered by Cherry Studio),
             true SSE streaming (chunk-by-chunk),
             tool call support with memory,
             count_tokens handler for Claude Code compatibility"""
import copy, json, os, uuid, datetime, socket, concurrent.futures, time, re, threading, hmac, queue, errno, random
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import List, Optional
from urllib.request import Request
from urllib.error import HTTPError, URLError

import model_registry
import model_discovery_queue
import scheduler_policy
from audit_store import AdminAuditStore
from config_manager import ConfigValidationError, RuntimeConfigManager
from config_loader import apply_env_overlays, load_base_config, load_config, ZERO_CONFIG_ACTIVE
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
_KEY_PROBE_LOCK = threading.Lock()
_KEY_PROBE_INFLIGHT = {}

# Runtime state persistence for router health and discovered model capabilities.
_ROUTER_STATE_FILE = os.path.join(os.path.dirname(__file__), "tmp", "router_state.json")
_ROUTER_STATE_INTERVAL_S = 60  # Save router state every 60 seconds.
_ROUTER_STATE_SAVE_LOCK = threading.Lock()


def _safe_model_capabilities_for_state(config: Optional[dict] = None) -> dict:
    cfg = config if config is not None else CONFIG
    caps = ((cfg.get("models") or {}).get("provider_model_capabilities") or {})
    providers_cfg = cfg.get("providers") or {}
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
        if entry.get("config_signature"):
            item["config_signature"] = str(entry.get("config_signature") or "")
        if entry.get("error"):
            item["error"] = str(entry.get("error"))[:500]
        out[str(provider)] = item
    return out


def _safe_models_union_snapshot_for_state(config: Optional[dict] = None) -> dict:
    cfg = config if config is not None else CONFIG
    snapshot = ((cfg.get("models") or {}).get("models_union_snapshot") or {})
    if not isinstance(snapshot, dict) or snapshot.get("status") != "ok":
        return {}
    payload = snapshot.get("payload") or {}
    data = payload.get("data") if isinstance(payload, dict) else []
    if not isinstance(data, list):
        return {}
    clean_payload = {
        "data": [
            {
                "type": str(item.get("type") or "model"),
                "id": str(item.get("id") or ""),
                "display_name": str(item.get("display_name") or item.get("id") or ""),
                "created_at": str(item.get("created_at") or ""),
            }
            for item in data
            if isinstance(item, dict) and str(item.get("id") or "").strip()
        ],
        "has_more": False,
    }
    clean_payload["first_id"] = clean_payload["data"][0]["id"] if clean_payload["data"] else ""
    clean_payload["last_id"] = clean_payload["data"][-1]["id"] if clean_payload["data"] else ""
    return {
        "status": "ok",
        "built_at": int(snapshot.get("built_at") or 0),
        "models_source": str(snapshot.get("models_source") or ""),
        "provider": str(snapshot.get("provider") or ""),
        "signature": copy.deepcopy(snapshot.get("signature") or {}),
        "model_ids": [item["id"] for item in clean_payload["data"]],
        "payload": clean_payload,
    }


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
        if entry.get("config_signature"):
            clean["config_signature"] = str(entry.get("config_signature") or "")
        if entry.get("error"):
            clean["error"] = str(entry.get("error"))[:500]
        dest[str(provider)] = clean
        restored_union_ids.update(clean["canonical_map"].keys())
    if hasattr(model_registry, "restore_union_model_ids"):
        model_registry.restore_union_model_ids(restored_union_ids)
    model_registry.bump_models_version()


def _restore_models_union_snapshot(snapshot: dict) -> None:
    if not isinstance(snapshot, dict) or snapshot.get("status") != "ok":
        return
    payload = snapshot.get("payload") or {}
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return
    models_cfg = CONFIG.setdefault("models", {})
    models_cfg["models_union_snapshot"] = copy.deepcopy(snapshot)


def _save_router_state() -> None:
    """Persist router runtime state and discovered model capabilities atomically.

    Uses _request_runtime() to capture a consistent (config, router) snapshot
    so that a concurrent _apply_runtime_config() hot-swap cannot produce a
    torn state file (old config capabilities + new router state or vice
    versa)."""
    try:
        rt = _request_runtime()
        with _ROUTER_STATE_SAVE_LOCK:
            state = {
                "saved_at": time.time(),
                "router": rt.router.dump_state(),
                "model_capabilities": _safe_model_capabilities_for_state(rt.config),
                "union_model_ids": sorted(model_registry.union_model_ids()),
                "models_union_snapshot": _safe_models_union_snapshot_for_state(rt.config),
            }
            os.makedirs(os.path.dirname(_ROUTER_STATE_FILE), exist_ok=True)
            tmp_path = _ROUTER_STATE_FILE + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(state, f)
            try:
                os.replace(tmp_path, _ROUTER_STATE_FILE)
            except OSError as e:
                if e.errno not in (errno.EBUSY, errno.EXDEV):
                    raise
                with open(_ROUTER_STATE_FILE, "w", encoding="utf-8") as f:
                    json.dump(state, f)
                    f.flush()
                    os.fsync(f.fileno())
            finally:
                if os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
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
            _restore_models_union_snapshot(state.get("models_union_snapshot") or {})
        saved_at = router_state.get("saved_at") if isinstance(router_state, dict) else 0
        saved_at = state.get("saved_at") if isinstance(state, dict) and state.get("saved_at") else saved_at
        age = max(0, int(time.time() - float(saved_at or 0)))
        print(f"[proxy] runtime state restored (saved {age}s ago)", flush=True)
    except Exception as e:
        print(f"[proxy] router state load failed: {e}", flush=True)


def _update_health_scores() -> None:
    """Compute provider health scores and feed them to the router for auto mode.

    Uses _request_runtime() so router and observability come from the same
    consistent snapshot, preventing a torn read during config hot-swap."""
    try:
        rt = _request_runtime()
        router = rt.router
        obs = rt.observability
        if router is None or obs is None:
            return
        snap = router.snapshot()
        scores = obs.provider_health_scores(router_snapshot=snap)
        router.update_health_scores(scores)
    except Exception:
        pass


def _start_state_autosave() -> None:
    """Start background runtime state autosave."""
    def _loop():
        while True:
            time.sleep(_ROUTER_STATE_INTERVAL_S)
            _save_router_state()
            _update_health_scores()
    t = threading.Thread(target=_loop, name="router-state-saver", daemon=True)
    t.start()


def _start_health_score_updater() -> None:
    """Start a lightweight background loop that refreshes provider health
    scores every 15 seconds for the auto routing mode."""
    def _loop():
        while True:
            time.sleep(15)
            _update_health_scores()
    t = threading.Thread(target=_loop, name="health-score-updater", daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Idle health checker
# ---------------------------------------------------------------------------
# A background thread that proactively probes provider key availability when
# the proxy is idle (no active requests).  The goal is to discover stale
# cooldowns / dead keys *before* a real user request hits them, so the first
# request after an idle period routes to a working provider on the first try.
#
# Key design decisions:
#
# 1. **Adaptive cadence**: the probe interval adapts to request activity.
#    Right after a request finishes, we check every 30s (the user may send
#    another request soon).  As the idle period grows, we back off to 60s,
#    then 5min, and eventually 3-6h for long-idle "freshness" checks.
#
# 2. **Priority-ordered**: providers are probed in routing-mode order —
#    priority_failover sorts by priority (highest first), auto mode sorts by
#    health-adjusted priority.  We stop at the first healthy provider because
#    that is the one the next request will use.  Lower-priority providers
#    are only checked if higher-priority ones are unavailable.
#
# 3. **Non-interfering**: the probe uses upstream_client's own transport
#    (not the request worker pool), so it never blocks real traffic.  Probe
#    failures feed into the existing router.report_failure() cooldown
#    mechanism — no new state management.
#
# 4. **Only for priority-ordered modes**: round_robin / weighted_rr / random
#    have no fixed priority, so "check highest priority first" is meaningless.
#    In those modes the checker sleeps quietly.

_IDLE_CHECK_INTERVAL_RECENT_S = 30      # Last request finished < 2 min ago
_IDLE_CHECK_INTERVAL_MEDIUM_S = 60      # Last request finished 2-10 min ago
_IDLE_CHECK_INTERVAL_LONG_S = 300       # Last request finished 10+ min ago
_IDLE_CHECK_INTERVAL_DEEP_S = (3 * 3600, 6 * 3600)  # 3-6h random for deep idle
_IDLE_CHECK_INTERVAL_INITIAL_S = 45     # First-ever probe delay (cold start)

# Thresholds for the idle tiers (seconds since last request finished).
_IDLE_TIER_RECENT_S = 120        # < 2 min → "recent" (30s cadence)
_IDLE_TIER_MEDIUM_S = 600        # < 10 min → "medium" (60s cadence)
#                               # >= 10 min → "long" (5min cadence)
#                               # >= 30 min → "deep" (3-6h random cadence)
_IDLE_TIER_DEEP_S = 1800         # 30 min

# ---------------------------------------------------------------------------
# Idle probe schedule — shared state for metrics display
# ---------------------------------------------------------------------------
# The idle health checker stores its *actual* computed interval here so that
# the /admin/metrics endpoint can show a stable countdown instead of calling
# _idle_tier_info() (which returns a fresh random for the "deep" tier) on
# every 5-second poll.  Without this, the frontend's "cadence" value would
# jump randomly every poll.
#
# Thread-safety: Python's GIL guarantees that dict key reads/writes are
# atomic, so a simple dict is sufficient for display purposes.  The worst
# case is reading a stale value for one poll cycle, which is harmless.
_idle_probe_schedule = {"interval_s": 0.0, "computed_at": 0.0}


def _idle_tier_info(last_finished_at: float, now: float) -> tuple[str, float]:
    """Return (tier_name, interval_s) for the current idle state.

    Tier names are stable strings used in probe events and the frontend:
      - "cold_start"   — no request has ever completed (45s cadence)
      - "recent"       — last request < 2 min ago (30s cadence)
      - "medium"       — 2-10 min ago (60s cadence)
      - "long"         — 10-30 min ago (5 min cadence)
      - "deep"         — 30+ min ago (3-6h random cadence)
    """
    if last_finished_at == 0.0:
        return "cold_start", _IDLE_CHECK_INTERVAL_INITIAL_S
    idle_s = max(0.0, now - last_finished_at)
    if idle_s < _IDLE_TIER_RECENT_S:
        return "recent", _IDLE_CHECK_INTERVAL_RECENT_S
    if idle_s < _IDLE_TIER_MEDIUM_S:
        return "medium", _IDLE_CHECK_INTERVAL_MEDIUM_S
    if idle_s < _IDLE_TIER_DEEP_S:
        return "long", _IDLE_CHECK_INTERVAL_LONG_S
    return "deep", random.uniform(_IDLE_CHECK_INTERVAL_DEEP_S[0], _IDLE_CHECK_INTERVAL_DEEP_S[1])


def _idle_check_interval_s(last_finished_at: float, now: float) -> float:
    """Return the probe interval based on how long since the last request."""
    return _idle_tier_info(last_finished_at, now)[1]


def _idle_probe_one_provider(rt, provider: str, *, idle_tier: str = "", next_probe_in_s: float = 0, suggested_model: str = "", model_source: str = "") -> bool:
    """Probe a single provider, trying all available keys before giving up.

    Returns True if any key succeeds (provider is healthy), False if all keys
    fail or the provider should be skipped.

    This mirrors the real routing behavior in ``iter_attempts``: within a single
    provider, we try each available key in order.  Only when ALL keys have been
    tried (and failed) do we return False, allowing the caller to move on to
    the next provider.

    Uses the RuntimeContext snapshot (rt) for consistent access to config,
    router, and upstream_client.

    If suggested_model is provided, it will be used instead of auto-selecting
    a model for this provider. This enables the new global model selection
    strategy where we pick a model from any provider and test it on the
    highest priority provider that supports it.
    """
    router = rt.router
    config = rt.config
    upstream_client = rt.upstream_client
    observability = rt.observability

    def _record_probe(**event) -> None:
        try:
            event.setdefault("provider", provider)
            if idle_tier:
                event.setdefault("idle_tier", idle_tier)
            if next_probe_in_s:
                event.setdefault("next_probe_in_s", int(next_probe_in_s))
            observability.record_health_probe(event)
        except Exception:
            pass

    pcfg = (config.get("providers") or {}).get(provider)
    if not isinstance(pcfg, dict) or not pcfg.get("enabled", True):
        _record_probe(outcome="skipped", reason="provider disabled", action="none")
        return False

    keys = pcfg.get("keys") or []
    if not keys:
        _record_probe(outcome="skipped", reason="no keys configured", action="none")
        return False

    # Build the ordered list of key indices to try:
    # 1. Available keys first (not in cooldown, not disabled)
    # 2. Then cooled-down keys as fallback — the whole point of the idle
    #    probe is to check whether a cooled-down key has recovered.
    now = time.time()
    available_key_indices: list[int] = []
    cooldown_key_indices: list[int] = []
    with router._lock:
        for i in range(len(keys)):
            ks = router._keys_state.get((provider, i))
            if ks is None or ks.available(now):
                available_key_indices.append(i)
            else:
                cooldown_key_indices.append(i)

    # If no keys are available, fall back to probing all keys anyway.
    # The idle probe exists to check recovery, so we should still try.
    key_indices_to_try = available_key_indices + cooldown_key_indices
    if not key_indices_to_try:
        key_indices_to_try = list(range(len(keys)))

    if not key_indices_to_try:
        _record_probe(outcome="skipped", reason="no available key", action="none")
        return False

    # --- Setup that doesn't change per-key: model, format, payload ---
    canonical_model = ""
    final_model_source = model_source

    # Use suggested model if provided and supported
    if suggested_model and _provider_supports_model(provider, suggested_model, config):
        canonical_model = str(suggested_model)
        if not final_model_source:
            final_model_source = "global_recent_success"
    else:
        canonical_model, final_model_source = _pick_probe_model_with_source(provider, observability=observability, config=config)

    if not canonical_model:
        _record_probe(outcome="skipped", reason="no probe model", action="none")
        return False

    fmt = router._first_supported_format(
        provider, ["chat_completions", "responses", "anthropic_messages"]
    )
    if not fmt:
        _record_probe(
            model=canonical_model,
            model_source=final_model_source,
            outcome="skipped",
            reason="no supported format",
            action="none",
        )
        return False

    # Build the base payload once — only the key/url/headers change per key.
    # We need a provider_model for the payload; use the first key to build
    # attempt details and extract it.  The provider_model is the same for all
    # keys of the same provider+model+format combination.
    first_raw_key = key_value(keys[key_indices_to_try[0]])
    _, _, provider_model, _ = router._build_attempt_details(
        provider, canonical_model, first_raw_key, key_index=key_indices_to_try[0], upstream_format=fmt
    )

    base_payload = {
        "model": provider_model,
        "messages": [{"role": "user", "content": ""}],
        "max_tokens": 1,
        "temperature": 0,
        "stream": False,
    }
    try:
        payload = convert_request("chat_completions", fmt, base_payload, resolve_model=lambda m: m)
    except Exception:
        _record_probe(
            model=canonical_model,
            model_source=final_model_source,
            upstream_model=provider_model,
            format=fmt,
            outcome="skipped",
            reason="request conversion failed",
            action="none",
        )
        return False

    # --- Try each key in order ---
    from router import Attempt as _Attempt
    request_id_base = f"idle-probe-{provider}-{uuid.uuid4().hex[:8]}"

    for attempt_no, key_index in enumerate(key_indices_to_try, start=1):
        raw_key = key_value(keys[key_index])
        url, headers, key_provider_model, proxy_url = router._build_attempt_details(
            provider, canonical_model, raw_key, key_index=key_index, upstream_format=fmt
        )
        # provider_model may differ per key if provider_model_map is key-specific,
        # but in practice it's the same.  Use the per-key value for safety.
        if key_provider_model:
            payload["model"] = key_provider_model

        probe_attempt = _Attempt(
            request_id=f"{request_id_base}-{attempt_no}",
            attempt_no=attempt_no,
            provider=provider,
            key_index=key_index,
            key=raw_key,
            url=url,
            headers=headers,
            provider_model=key_provider_model or provider_model,
            upstream_format=fmt,
            proxy_url=proxy_url,
        )

        probe_base = {
            "key_index": key_index,
            "key_id": router.key_id(raw_key),
            "model": canonical_model,
            "model_source": final_model_source,
            "upstream_model": key_provider_model or provider_model,
            "format": fmt,
        }

        try:
            _resp, _latency_ms = upstream_client.request_json_with_timing(
                url, headers, payload, proxy_url=proxy_url, remaining_timeout_s=15
            )
            # Success — provider is healthy.  Clear any stale cooldown.
            router.clear_provider_cooldown(provider)
            _record_probe(
                **probe_base,
                outcome="success",
                latency_ms=_latency_ms,
                reason="probe succeeded",
                action="cleared_provider_cooldown",
            )
            print(f"[proxy] {_hprov(provider)} idle probe {_harrow('->')} {_h('ok')} {_hmodel(canonical_model)} key#{key_index} {_latency_ms}ms", flush=True)
            return True
        except HTTPError as e:
            status = int(getattr(e, "code", 0) or 0)
            error_type = _probe_error_type(status)
            if error_type == "client_error" and final_model_source not in ("recent_success", "recent_success_global"):
                # Model-level rejection (e.g. 404 for a fallback model).
                # Trying other keys won't help — it's the same model.
                _record_probe(
                    **probe_base,
                    outcome="failed",
                    http_status=status,
                    error_type=error_type,
                    reason="fallback probe model rejected",
                    action="observed_only",
                )
                print(f"[proxy] {_hprov(provider)} idle probe {_harrow('->')} observed_only HTTP {status} {_hmodel(canonical_model)} key#{key_index}", flush=True)
                return False
            # Key-level failure — report it and try the next key.
            router.report_failure(
                probe_attempt,
                error_type=error_type,
                http_status=status,
            )
            policy = scheduler_policy.failure_policy_for_error_type(config, error_type)
            _record_probe(
                **probe_base,
                outcome="failed",
                http_status=status,
                error_type=error_type,
                cooldown_s=policy.get("cooldown_s"),
                provider_cooldown_s=policy.get("provider_cooldown_s"),
                reason=f"HTTP {status}",
                action="reported_failure",
            )
            print(f"[proxy] {_hprov(provider)} idle probe {_harrow('->')} FAIL HTTP {status} ({error_type}) {_hmodel(canonical_model)} key#{key_index}, trying next key...", flush=True)
            continue  # try next key
        except (URLError, socket.timeout) as e:
            router.report_failure(
                probe_attempt,
                error_type="network_error",
            )
            policy = scheduler_policy.failure_policy_for_error_type(config, "network_error")
            _record_probe(
                **probe_base,
                outcome="failed",
                error_type="network_error",
                cooldown_s=policy.get("cooldown_s"),
                provider_cooldown_s=policy.get("provider_cooldown_s"),
                reason=type(e).__name__,
                action="reported_failure",
            )
            print(f"[proxy] {_hprov(provider)} idle probe {_harrow('->')} FAIL {type(e).__name__} {_hmodel(canonical_model)} key#{key_index}, trying next key...", flush=True)
            continue  # try next key
        except Exception as e:
            router.report_failure(
                probe_attempt,
                error_type="unknown",
            )
            policy = scheduler_policy.failure_policy_for_error_type(config, "unknown")
            _record_probe(
                **probe_base,
                outcome="failed",
                error_type="unknown",
                cooldown_s=policy.get("cooldown_s"),
                provider_cooldown_s=policy.get("provider_cooldown_s"),
                reason=type(e).__name__,
                action="reported_failure",
            )
            print(f"[proxy] {_hprov(provider)} idle probe {_harrow('->')} FAIL {type(e).__name__} {_hmodel(canonical_model)} key#{key_index}, trying next key...", flush=True)
            continue  # try next key

    # All keys exhausted — provider is unhealthy.
    return False


def _build_probe_plan(observability, config, router) -> list[tuple[str, str, str]]:
    """Build a prioritized probe plan: list of (provider, model, source) tuples.

    The plan combines the global model selection with priority-ordered probing:

    1. Find the most recent successful model across ALL providers.
    2. Build a list of providers that support this model, sorted by priority
       descending.  These are the providers the next real request (if it uses
       the same model) would try in order — so we pre-check them in the same
       order.
    3. If no provider supports the recent model (or there is no recent model),
       fall back to probing all providers in priority order, each with their
       own default probe model.

    This ensures we identify the *first healthy provider* the next request
    would use, which is the whole point of idle health checking: prepare for
    routing so the next request doesn't have to try one-by-one.
    """
    cfg = config
    providers_cfg = cfg.get("providers") or {}

    # --- Build priority-ordered provider list ---
    provider_priorities = []
    for name, pcfg in providers_cfg.items():
        if not (pcfg or {}).get("enabled", True):
            continue
        priority = router._provider_priority(str(name))
        if hasattr(router, '_auto_adjusted_priority'):
            priority = router._auto_adjusted_priority(str(name), priority)
        provider_priorities.append((str(name), priority))
    provider_priorities.sort(key=lambda x: -x[1])

    if not provider_priorities:
        return []

    # --- Find the most recent successful model globally ---
    # Use latest_successful_model_global() which iterates _recent in
    # temporal order (newest first) and returns the first success.
    # Previously we iterated providers in config-dict order and took the
    # last non-None result, which ignored temporal ordering — a request
    # for model B made AFTER model A could be overshadowed by A if A's
    # provider appeared later in the config dict.
    recent_model = None
    if observability is not None:
        try:
            recent_model = observability.latest_successful_model_global()
        except Exception:
            pass

    plan: list[tuple[str, str, str]] = []

    # --- Phase 1: providers that support the recent model, in priority order ---
    if recent_model:
        for provider_name, _priority in provider_priorities:
            if _provider_supports_model(provider_name, recent_model, cfg):
                plan.append((provider_name, str(recent_model), "recent_success_global"))

    # --- Phase 2: remaining providers with their own default model ---
    # If Phase 1 produced entries, Phase 2 only covers providers not yet in
    # the plan.  If Phase 1 is empty (no recent model or no supporter), Phase 2
    # covers all providers — this is the fallback path.
    planned_providers = {p for p, _, _ in plan}
    for provider_name, _priority in provider_priorities:
        if provider_name in planned_providers:
            continue
        fallback_model, model_source = _pick_probe_model_with_source(
            provider_name, observability=observability, config=config
        )
        if fallback_model:
            source_label = f"fallback_{model_source}" if recent_model else f"no_recent_{model_source}"
            plan.append((provider_name, fallback_model, source_label))

    return plan


def _idle_health_check_round() -> None:
    """Run one round of idle health checking.

    Uses a probe plan that combines global model selection with
    priority-ordered probing:
    1. Find the most recent successful model across all providers
    2. Probe providers that support this model in priority order
    3. Stop at the first healthy provider — that is the one the next
       real request (if using the same model) will use

    This prepares for routing: the next request can immediately use the
    pre-verified healthy provider without trial-and-error failover.

    Only runs for priority_failover and auto modes (the only modes with a
    meaningful "highest priority" concept).
    """
    try:
        rt = _request_runtime()
        router = rt.router
        config = rt.config
        observability = rt.observability

        # Don't run if there are active requests — we only probe when idle.
        with observability._lock:
            in_flight = int(observability._counters.get("requests_in_flight") or 0)
        if in_flight > 0:
            return

        # Only run for priority-ordered modes.
        provider_select = str((config.get("routing") or {}).get("provider_select") or "priority_failover").strip()
        if provider_select not in ("priority_failover", "auto"):
            return

        # Compute the current idle tier so each probe event carries it.
        last_finished = observability.last_request_finished_at()
        now = time.time()
        idle_tier, interval_s = _idle_tier_info(last_finished, now)

        # Build a prioritized probe plan: [(provider, model, source), ...]
        plan = _build_probe_plan(observability, config, router)

        if not plan:
            return

        # Probe in priority order.  Stop at the first healthy provider —
        # that is the one the next real request will use, so there is no
        # need to check lower-priority ones.
        for provider_name, model, source in plan:
            healthy = _idle_probe_one_provider(
                rt, provider_name,
                idle_tier=idle_tier,
                next_probe_in_s=interval_s,
                suggested_model=model,
                model_source=source,
            )
            if healthy:
                break

    except Exception as e:
        print(f"[proxy] idle health check round error: {type(e).__name__}: {e}", flush=True)


_IDLE_SLEEP_CHUNK_S = 30  # Max sleep before re-checking last_finished_at


def _start_idle_health_checker() -> None:
    """Start the adaptive idle health checker daemon thread.

    The sleep is chunked into ≤30s segments so that when a long deep-idle
    interval (3-6h) is in effect and a real request arrives, the loop wakes
    up within 30s, sees the updated ``last_request_finished_at``, and
    recomputes a much shorter interval — effectively waking up early.
    """

    def _loop():
        while True:
            try:
                rt = _request_runtime()
                observability = rt.observability
                last_finished = observability.last_request_finished_at()
                now = time.time()
                interval = _idle_check_interval_s(last_finished, now)
                # Store for /admin/metrics display (countdown).
                _idle_probe_schedule["interval_s"] = interval
                _idle_probe_schedule["computed_at"] = now

                # Chunk the sleep so we can detect activity changes mid-sleep.
                remaining = interval
                woken_early = False
                while remaining > 0:
                    chunk = min(remaining, _IDLE_SLEEP_CHUNK_S)
                    time.sleep(chunk)
                    remaining -= chunk
                    # If we're in a long idle interval but a request just
                    # finished, recompute the interval (it will be much
                    # shorter now) and break out of the chunked sleep.
                    if remaining > 0:
                        new_last = observability.last_request_finished_at()
                        if new_last != last_finished:
                            woken_early = True
                            break

                # Re-check: a request may have arrived during our sleep.
                with observability._lock:
                    in_flight = int(observability._counters.get("requests_in_flight") or 0)
                if in_flight > 0:
                    continue  # not idle anymore — skip this round

                # If we woke early due to activity change, skip this round
                # and let the next loop iteration recompute a fresh interval.
                if woken_early:
                    continue

                _idle_health_check_round()
            except Exception:
                # Never let the loop die — sleep and try again.
                time.sleep(30)

    t = threading.Thread(target=_loop, name="idle-health-checker", daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Patrol health checker (全量巡检保活)
# ---------------------------------------------------------------------------
# A separate background thread that does a FULL sweep of all enabled
# providers × all keys at a long, fixed interval (1-3h random).  Unlike the
# adaptive idle checker (which only probes the recent model's top providers
# and stops at the first healthy one), the patrol checks EVERY key to:
#
# 1. Discover stale cooldowns / dead keys that the idle checker missed
#    (especially during deep idle when the idle checker runs every 3-6h).
# 2. Proactively trigger the circuit breaker on repeatedly failing keys,
#    so the next real request skips them without trial-and-error.
#
# Uses STREAMING probes (stream=true) and reads only the first SSE data
# event before closing the connection — this minimises token consumption
# because the provider never actually generates meaningful content.
#
# Events are recorded with idle_tier="patrol" so the frontend can
# distinguish them from idle-checker probes in the same display area.

_PATROL_INTERVAL_S = (3600, 3 * 3600)   # 1-3 hours random between rounds
_PATROL_DELAY_S = (3, 5)                 # 3-5 seconds random between probes
_PATROL_FIRST_BYTE_TIMEOUT_S = 15         # Max wait for first SSE event


def _patrol_probe_one_key(rt, provider: str, key_index: int, *, canonical_model: str = "", model_source: str = "") -> bool:
    """Probe a single key of a provider using a streaming request.

    Sends a minimal streaming request (max_tokens=1, stream=true) and reads
    only the first SSE ``data:`` line.  If a valid data event is received,
    the key is healthy — we close the connection immediately without
    consuming the full response, minimising token usage.

    Reuses the same model selection, format selection, attempt building,
    and cooldown/circuit-breaker logic as the idle health checker, ensuring
    both mechanisms operate on consistent data.

    Returns True if the key is healthy, False otherwise.
    """
    router = rt.router
    config = rt.config
    upstream_client = rt.upstream_client
    observability = rt.observability

    def _record_probe(**event) -> None:
        try:
            event.setdefault("provider", provider)
            event.setdefault("idle_tier", "patrol")
            observability.record_health_probe(event)
        except Exception:
            pass

    pcfg = (config.get("providers") or {}).get(provider)
    if not isinstance(pcfg, dict) or not pcfg.get("enabled", True):
        _record_probe(outcome="skipped", reason="provider disabled", action="none")
        return False

    keys = pcfg.get("keys") or []
    if not (0 <= key_index < len(keys)):
        _record_probe(key_index=key_index, outcome="skipped", reason="key index out of range", action="none")
        return False

    # Pick a model to probe (reuse the same selection logic as idle checker)
    if not canonical_model:
        canonical_model, model_source = _pick_probe_model_with_source(
            provider, observability=observability, config=config
        )
    if not canonical_model:
        _record_probe(key_index=key_index, outcome="skipped", reason="no probe model", action="none")
        return False

    fmt = router._first_supported_format(
        provider, ["chat_completions", "responses", "anthropic_messages"]
    )
    if not fmt:
        _record_probe(
            key_index=key_index,
            model=canonical_model,
            model_source=model_source,
            outcome="skipped",
            reason="no supported format",
            action="none",
        )
        return False

    raw_key = key_value(keys[key_index])
    url, headers, provider_model, proxy_url = router._build_attempt_details(
        provider, canonical_model, raw_key, key_index=key_index, upstream_format=fmt
    )

    # Build a STREAMING payload — stream=true so we can read just the first
    # SSE event and close, without waiting for the full completion.
    base_payload = {
        "model": provider_model,
        "messages": [{"role": "user", "content": ""}],
        "max_tokens": 1,
        "temperature": 0,
        "stream": True,
    }
    try:
        payload = convert_request("chat_completions", fmt, base_payload, resolve_model=lambda m: m)
    except Exception:
        _record_probe(
            key_index=key_index,
            key_id=router.key_id(raw_key),
            model=canonical_model,
            model_source=model_source,
            upstream_model=provider_model,
            format=fmt,
            outcome="skipped",
            reason="request conversion failed",
            action="none",
        )
        return False

    from router import Attempt as _Attempt
    request_id = f"patrol-{provider}-k{key_index}-{uuid.uuid4().hex[:8]}"
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

    probe_base = {
        "key_index": key_index,
        "key_id": router.key_id(raw_key),
        "model": canonical_model,
        "model_source": model_source,
        "upstream_model": provider_model,
        "format": fmt,
    }

    stream_conn = None
    started_at = time.time()
    try:
        stream_conn = upstream_client.open_stream(
            url, headers, payload,
            proxy_url=proxy_url,
            remaining_timeout_s=15,
            first_byte_timeout_s=_PATROL_FIRST_BYTE_TIMEOUT_S,
        )
        # Read lines until we find the first SSE "data:" event.
        # A valid data line means the provider accepted the request and
        # started streaming — the key is healthy.
        found_data = False
        for _line in range(64):  # Bounded read; skip comments/keepalives
            line = b""
            try:
                line = stream_conn.readline()
            except socket.timeout:
                # Expected when first_byte_timeout fires before any data
                # arrives — treat as "no data event" (soft failure).
                break
            if not line:
                break
            line_str = line.decode("utf-8", errors="replace").strip()
            if line_str.startswith("data:"):
                data_content = line_str[5:].strip()
                if data_content and data_content != "[DONE]":
                    found_data = True
                    break
                # [DONE] or empty data — keep reading, the real event
                # should come before [DONE].

        latency_ms = max(0, int((time.time() - started_at) * 1000))

        if found_data:
            # Key is healthy — clear cooldowns.
            router.clear_provider_cooldown(provider)
            _record_probe(
                **probe_base,
                outcome="success",
                latency_ms=latency_ms,
                reason="patrol stream first event received",
                action="cleared_provider_cooldown",
            )
            print(f"[proxy] {_hprov(provider)} patrol {_harrow('->')} {_h('ok')} {_hmodel(canonical_model)} key#{key_index} {latency_ms}ms", flush=True)
            return True
        else:
            # Stream opened but no data event within the read bound.
            # Treat as a soft failure — the connection worked but something
            # is odd (e.g. upstream returned an empty stream).
            _record_probe(
                **probe_base,
                outcome="failed",
                error_type="unknown",
                latency_ms=latency_ms,
                reason="patrol stream opened but no data event",
                action="observed_only",
            )
            print(f"[proxy] {_hprov(provider)} patrol {_harrow('->')} no-data {_hmodel(canonical_model)} key#{key_index}", flush=True)
            return False

    except HTTPError as e:
        status = int(getattr(e, "code", 0) or 0)
        error_type = _probe_error_type(status)
        # Same logic as idle probe: model-level errors (404) don't try
        # other keys, but for patrol we're checking individual keys, so
        # we just record and report.
        if error_type == "client_error":
            # Model-level rejection (e.g. 404) — in patrol context this is
            # always a model issue, not a key issue.  Don't report_failure
            # or every key will be unfairly penalised for the same bad model.
            _record_probe(
                **probe_base,
                outcome="failed",
                http_status=status,
                error_type=error_type,
                reason="patrol model rejected",
                action="observed_only",
            )
        else:
            router.report_failure(
                probe_attempt,
                error_type=error_type,
                http_status=status,
            )
            policy = scheduler_policy.failure_policy_for_error_type(config, error_type)
            _record_probe(
                **probe_base,
                outcome="failed",
                http_status=status,
                error_type=error_type,
                cooldown_s=policy.get("cooldown_s"),
                provider_cooldown_s=policy.get("provider_cooldown_s"),
                reason=f"HTTP {status}",
                action="reported_failure",
            )
        print(f"[proxy] {_hprov(provider)} patrol {_harrow('->')} FAIL HTTP {status} ({error_type}) {_hmodel(canonical_model)} key#{key_index}", flush=True)
        return False
    except (URLError, socket.timeout) as e:
        router.report_failure(
            probe_attempt,
            error_type="network_error",
        )
        policy = scheduler_policy.failure_policy_for_error_type(config, "network_error")
        _record_probe(
            **probe_base,
            outcome="failed",
            error_type="network_error",
            cooldown_s=policy.get("cooldown_s"),
            provider_cooldown_s=policy.get("provider_cooldown_s"),
            reason=type(e).__name__,
            action="reported_failure",
        )
        print(f"[proxy] {_hprov(provider)} patrol {_harrow('->')} FAIL {type(e).__name__} {_hmodel(canonical_model)} key#{key_index}", flush=True)
        return False
    except Exception as e:
        router.report_failure(
            probe_attempt,
            error_type="unknown",
        )
        policy = scheduler_policy.failure_policy_for_error_type(config, "unknown")
        _record_probe(
            **probe_base,
            outcome="failed",
            error_type="unknown",
            cooldown_s=policy.get("cooldown_s"),
            provider_cooldown_s=policy.get("provider_cooldown_s"),
            reason=type(e).__name__,
            action="reported_failure",
        )
        print(f"[proxy] {_hprov(provider)} patrol {_harrow('->')} FAIL {type(e).__name__} {_hmodel(canonical_model)} key#{key_index}", flush=True)
        return False
    finally:
        _close_upstream_conn(stream_conn)


def _patrol_health_check_round() -> None:
    """Run one full patrol round: check ALL enabled providers × ALL keys.

    Unlike the idle health checker (which stops at the first healthy
    provider), the patrol checks every key of every provider to build a
    complete picture of the system's health.

    Probes are sent sequentially with a 3-5s random delay between each
    probe (even across different providers) to avoid burst traffic.
    """
    try:
        rt = _request_runtime()
        router = rt.router
        config = rt.config
        observability = rt.observability

        # Don't run if there are active requests.
        with observability._lock:
            in_flight = int(observability._counters.get("requests_in_flight") or 0)
        if in_flight > 0:
            return

        providers_cfg = config.get("providers") or {}

        # Build priority-ordered provider list (reuse the same logic as
        # _build_probe_plan to ensure consistency).
        provider_priorities = []
        for name, pcfg in providers_cfg.items():
            if not (pcfg or {}).get("enabled", True):
                continue
            priority = router._provider_priority(str(name))
            if hasattr(router, "_auto_adjusted_priority"):
                priority = router._auto_adjusted_priority(str(name), priority)
            provider_priorities.append((str(name), priority))
        provider_priorities.sort(key=lambda x: -x[1])

        if not provider_priorities:
            return

        total_probes = 0
        total_ok = 0

        for provider_name, _priority in provider_priorities:
            pcfg = providers_cfg.get(provider_name) or {}
            keys = pcfg.get("keys") or []
            if not keys:
                continue

            # Pick ONE model for this provider (reuse the same selection logic).
            canonical_model, model_source = _pick_probe_model_with_source(
                provider_name, observability=observability, config=config
            )
            if not canonical_model:
                observability.record_health_probe({
                    "provider": provider_name,
                    "idle_tier": "patrol",
                    "outcome": "skipped",
                    "reason": "no probe model",
                    "action": "none",
                })
                continue

            for key_index in range(len(keys)):
                # Check if a real request arrived during our patrol — bail out.
                with observability._lock:
                    in_flight = int(observability._counters.get("requests_in_flight") or 0)
                if in_flight > 0:
                    print(f"[proxy] patrol round interrupted: request in flight", flush=True)
                    return

                # Random delay between probes (3-5s), even across providers.
                if total_probes > 0:
                    delay = random.uniform(_PATROL_DELAY_S[0], _PATROL_DELAY_S[1])
                    time.sleep(delay)

                total_probes += 1
                healthy = _patrol_probe_one_key(
                    rt, provider_name, key_index,
                    canonical_model=canonical_model,
                    model_source=model_source,
                )
                if healthy:
                    total_ok += 1

        print(f"[proxy] patrol round complete: {total_ok}/{total_probes} keys healthy", flush=True)

    except Exception as e:
        print(f"[proxy] patrol round error: {type(e).__name__}: {e}", flush=True)


def _start_patrol_health_checker() -> None:
    """Start the patrol health checker daemon thread.

    Runs on a fixed 1-3h random interval, independent of the adaptive
    idle checker's cadence.  The patrol does a full sweep of all
    providers × keys to discover dead keys and trigger circuit breakers.
    """

    def _loop():
        while True:
            try:
                interval = random.uniform(_PATROL_INTERVAL_S[0], _PATROL_INTERVAL_S[1])
                # Chunk the sleep so we can exit cleanly on shutdown.
                remaining = interval
                while remaining > 0:
                    chunk = min(remaining, 60)
                    time.sleep(chunk)
                    remaining -= chunk

                _patrol_health_check_round()
            except Exception:
                # Never let the loop die.
                time.sleep(60)

    t = threading.Thread(target=_loop, name="patrol-health-checker", daemon=True)
    t.start()


ROUTER = UpstreamRouter(CONFIG)
UPSTREAM_CLIENT = OpenAIUpstreamClient(CONFIG)
OBSERVABILITY = ProxyObservability(CONFIG)
AUDIT = AdminAuditStore(CONFIG)


class RuntimeContext:
    """Immutable snapshot of the live runtime objects.

    Config hot-swap reassigns the single module global RUNTIME to a freshly
    built RuntimeContext in one atomic step, so a request thread that captures
    RUNTIME once sees a consistent (config, router, client, observability,
    audit) set instead of a torn mix during reload.

    Fields are intentionally not frozen: the bundle object identity is what
    matters; mutations happen by swapping the whole RUNTIME reference, not by
    editing fields in place.
    """

    __slots__ = ("config", "router", "upstream_client", "observability", "audit")

    def __init__(self, config, router, upstream_client, observability, audit):
        self.config = config
        self.router = router
        self.upstream_client = upstream_client
        self.observability = observability
        self.audit = audit


RUNTIME = RuntimeContext(CONFIG, ROUTER, UPSTREAM_CLIENT, OBSERVABILITY, AUDIT)


# Model mapping (client model -> canonical model)
DISABLE_MAP = bool((CONFIG.get("models") or {}).get("disable_client_model_map", False))
MODEL_MAP = (CONFIG.get("models") or {}).get("client_model_map") or {}


def _refresh_model_mapping_globals() -> None:
    global DISABLE_MAP, MODEL_MAP
    DISABLE_MAP = bool((CONFIG.get("models") or {}).get("disable_client_model_map", False))
    MODEL_MAP = (CONFIG.get("models") or {}).get("client_model_map") or {}


def _apply_runtime_config(new_config: dict) -> None:
    global CONFIG, ROUTER, UPSTREAM_CLIENT, OBSERVABILITY, AUDIT, RUNTIME
    old_router = ROUTER
    old_obs = OBSERVABILITY
    old_upstream_client = UPSTREAM_CLIENT
    old_caps = dict(((CONFIG.get("models") or {}).get("provider_model_capabilities") or {})) if CONFIG else {}
    new_config = apply_env_overlays(new_config)
    # Preserve provider model capabilities across runtime config reloads.
    # Without this, key probes can lose discovered model choices after edits.
    if old_caps:
        providers_cfg = new_config.get("providers") or {}
        models_cfg = new_config.setdefault("models", {})
        caps = models_cfg.setdefault("provider_model_capabilities", {})
        for prov, entry in old_caps.items():
            if prov in providers_cfg and prov not in caps:
                caps[prov] = entry
    model_registry.clear_cache()
    model_registry.rebuild_models_union_snapshot(new_config)
    new_router = UpstreamRouter(new_config)
    if old_router is not None:
        new_router.migrate_state_from(old_router)
    new_upstream_client = OpenAIUpstreamClient(new_config)
    new_observability = ProxyObservability(new_config)
    if old_obs is not None:
        new_observability.migrate_counters_from(old_obs)
    new_audit = AdminAuditStore(new_config)

    # Atomic swap: a single STORE_GLOBAL on RUNTIME is the linearization point.
    # Every reader that captured RUNTIME before this line keeps the old set;
    # every reader after sees the new set. The legacy module globals below are
    # refreshed for backwards compatibility only and are not relied on for
    # request-thread consistency.
    new_runtime = RuntimeContext(new_config, new_router, new_upstream_client, new_observability, new_audit)
    RUNTIME = new_runtime
    CONFIG = new_config
    ROUTER = new_router
    UPSTREAM_CLIENT = new_upstream_client
    OBSERVABILITY = new_observability
    AUDIT = new_audit
    _refresh_model_mapping_globals()
    # After a config reload, re-scan providers through the discovery queue so
    # newly added providers get discovered and removed ones are dropped. The
    # queue's per-provider TTL/retry cadence prevents a reload storm.
    if MODEL_DISCOVERY_QUEUE is not None:
        MODEL_DISCOVERY_QUEUE.enqueue_all(force=False)
    _save_router_state()

    # Deferred cleanup of the old upstream client. We must NOT close it
    # synchronously because in-flight requests may still be using the old
    # RuntimeContext (which holds old_upstream_client). Stream requests can
    # last minutes; closing the pool immediately would break their sockets.
    # A delayed close (driven by the configured read timeout) gives all
    # in-flight requests time to finish naturally.
    if old_upstream_client is not None and old_upstream_client is not new_upstream_client:
        _close_fn = getattr(old_upstream_client, "close", None)
        if callable(_close_fn):
            _retire_delay = max(
                int((new_config.get("routing") or {}).get("read_timeout_s", 120)) * 3,
                300,
            )
            _timer = threading.Timer(_retire_delay, _close_fn)
            _timer.daemon = True
            _timer.start()


def _request_runtime() -> "RuntimeContext":
    """Return a consistent runtime snapshot for one request/operation.

    In production the legacy module globals are always kept in sync with the
    RUNTIME bundle (see _apply_runtime_config), so the identity check matches
    and we return the cached bundle -- a single atomic snapshot taken at swap
    time. Request threads that capture this once see a consistent
    (config, router, client, observability, audit) set.

    In tests the legacy globals are frequently patched directly
    (patch.object(sse2json, "ROUTER", ...)). When that happens the identity
    check fails and we rebuild a fresh bundle from the (patched) globals, so
    request handlers still observe the fake objects the test installed.
    """
    if (
        RUNTIME.config is CONFIG
        and RUNTIME.router is ROUTER
        and RUNTIME.upstream_client is UPSTREAM_CLIENT
        and RUNTIME.observability is OBSERVABILITY
        and RUNTIME.audit is AUDIT
    ):
        return RUNTIME
    return RuntimeContext(CONFIG, ROUTER, UPSTREAM_CLIENT, OBSERVABILITY, AUDIT)


# ---------------------------------------------------------------------------
# Thread-local request runtime
# ---------------------------------------------------------------------------
# Request handlers capture a RuntimeContext snapshot at entry and set it here
# so that module-level helper functions (_record_*, compat retry, etc.) can
# access the same consistent (config, router, client, observability) set
# instead of reading the module globals which may have been swapped by a
# concurrent _apply_runtime_config() hot-reload.
_request_rt = threading.local()


def _set_request_rt(rt: "RuntimeContext") -> None:
    """Bind a RuntimeContext to the current thread for the duration of a request."""
    _request_rt.ctx = rt


def _clear_request_rt() -> None:
    """Clear the thread-local runtime after the request finishes."""
    _request_rt.ctx = None


def _current_rt() -> "RuntimeContext":
    """Return the thread-local runtime if set, otherwise fall back to _request_runtime()."""
    rt = getattr(_request_rt, "ctx", None)
    if rt is not None:
        return rt
    return _request_runtime()


def resolve_model(name, config=None):
    """Resolve the client-facing model to the canonical model.
    
    Uses provided config to avoid race conditions during hot-swaps.
    Falls back to global CONFIG if no config provided (for backwards compatibility).
    """
    # Use provided config to avoid race conditions during hot-swaps.
    # When config is passed (from request handlers), read model_map and
    # disable_map directly from it so the mapping is consistent with the
    # runtime snapshot. When no config is passed (tests, admin paths),
    # fall back to the global MODEL_MAP / DISABLE_MAP which are kept in
    # sync with CONFIG by _refresh_model_mapping_globals().
    if config is not None:
        cfg = config
        models_cfg = cfg.get("models") or {}
        disable_map = bool(models_cfg.get("disable_client_model_map", False))
        model_map = models_cfg.get("client_model_map") or {}
    else:
        cfg = CONFIG
        disable_map = DISABLE_MAP
        model_map = MODEL_MAP
    
    if disable_map:
        return name  # Pass through, no mapping
    canonical = model_map.get(name)
    if not canonical:
        # If no explicit client map exists, accept discovered union model aliases.
        try:
            models_source = str((cfg.get("models") or {}).get("models_source", "first_healthy_provider"))
            union_model_ids = model_registry.union_model_ids()
            if models_source == "union" and union_model_ids:
                _best, cands = model_registry.normalize_model_id("", name or "")
                for c in cands:
                    if c in union_model_ids:
                        return c
        except Exception:
            pass
        if _should_log_each_request():
            print(f"[proxy] model pass-through: {name}", flush=True)
        return name or ""
    # Reconcile mapped canonical models against discovered union model aliases.
    try:
        models_source = str((cfg.get("models") or {}).get("models_source", "first_healthy_provider"))
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
    model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
    model_registry.bump_models_version()
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


def _provider_supports_model(provider: str, model: str, config: dict) -> bool:
    """Check whether *provider* currently has *model* in its configured model
    lists (manual map, discovered capabilities, static_models, or routes)
    AND the model is not disabled for this provider.

    Used by _pick_probe_model_with_source to validate that a model returned
    by latest_successful_model_for_provider is still recognised by the
    provider's current configuration.  Without this check, a stale model
    name from a previous config (or a custom test model that no real provider
    recognises) would cause the probe to fail with HTTP 404.

    Also checks provider_model_disabled — a model may be listed in the config
    but explicitly disabled (e.g. via the dashboard toggle).  Such models
    must not be selected for probing.
    """
    if not model or not provider:
        return False
    model = str(model).strip()
    lower_model = model.lower()
    models_cfg = config.get("models") or {}

    # 0. Check if the model is explicitly disabled for this provider.
    #    provider_model_disabled checks both exact and case-insensitive keys.
    if model_registry.provider_model_disabled(config, provider, model):
        return False

    # 1. provider_model_map (manual configuration)
    #    Keys are client model names; values are upstream provider model names.
    #    Check both sides since latest_successful_model_for_provider may
    #    return either form.
    manual_map = (models_cfg.get("provider_model_map") or {}).get(provider) or {}
    if isinstance(manual_map, dict):
        if model in manual_map or lower_model in manual_map:
            # Even if the key exists, the mapped value might have been
            # disabled.  Check the canonical (key) side too.
            return True
        for v in manual_map.values():
            if str(v or "").strip() == model:
                # The upstream model name matches — but we need to ensure
                # the canonical key isn't disabled.
                for k, val in manual_map.items():
                    if str(val or "").strip() == model and not model_registry.provider_model_disabled(config, provider, str(k)):
                        return True
                # All canonical keys mapping to this upstream model are disabled
                return False

    # 2. Discovered capabilities canonical_map
    #    Keys are client-facing model names; values are upstream provider
    #    model names.  latest_successful_model_for_provider returns the
    #    provider-side name (a value), so we must check both sides.
    caps = (models_cfg.get("provider_model_capabilities") or {}).get(provider) or {}
    if isinstance(caps, dict):
        canonical_map = caps.get("canonical_map") or {}
        if model in canonical_map or lower_model in canonical_map:
            return True
        for v in canonical_map.values():
            if str(v or "").strip() == model:
                # Check that at least one canonical key mapping to this
                # upstream model is not disabled.
                for k, val in canonical_map.items():
                    if str(val or "").strip() == model and not model_registry.provider_model_disabled(config, provider, str(k)):
                        return True
                return False

    # 3. static_models
    pcfg = (config.get("providers") or {}).get(provider) or {}
    static_models = pcfg.get("static_models")
    if isinstance(static_models, list):
        for entry in static_models:
            if isinstance(entry, str):
                if entry.strip() == model:
                    return True
            elif isinstance(entry, dict):
                if str(entry.get("id") or "").strip() == model:
                    return True

    # 4. Routes that include this provider
    routes = models_cfg.get("routes") or {}
    if isinstance(routes, dict):
        for route_model, route in routes.items():
            if route is None:
                continue
            providers = (route or {}).get("providers") if isinstance(route, dict) else []
            for item in providers or []:
                name = item if isinstance(item, str) else (item or {}).get("name")
                if str(name or "") == provider and str(route_model or "").strip() == model:
                    return True

    return False


def _pick_probe_model_with_source(provider: str, observability=None, config=None) -> tuple[Optional[str], str]:
    """Pick a discovered canonical model for provider key probing.

    *config* should be the runtime snapshot (``rt.config``) to ensure the
    probe sees a consistent view during config hot-swap.  Falls back to the
    module-level ``CONFIG`` for callers that are not inside a request/
    probe context (e.g. the manual key-test endpoint).

    Model selection priority:
    1. ``recent_success`` — the upstream model from the most recent successful
       request on THIS provider, BUT only if the provider's current config
       still recognises that model (validated via _provider_supports_model).
       This prevents 404s when the model name is stale (e.g. from a previous
       config) or is a custom test name that no real provider supports.
    2. ``capability`` — first model from the provider's discovered canonical_map.
    3. ``manual_map`` — first model from provider_model_map config.
    4. ``static`` — first entry from the provider's static_models list.
    5. ``route`` / ``route_fallback`` — model from routing config.
    """
    cfg = config if config is not None else CONFIG
    if observability is not None:
        try:
            recent_model = observability.latest_successful_model_for_provider(provider)
        except Exception:
            recent_model = None
        if recent_model and _provider_supports_model(provider, recent_model, cfg):
            return str(recent_model), "recent_success"
    caps = ((cfg.get("models") or {}).get("provider_model_capabilities") or {}).get(provider) or {}
    canonical_map = caps.get("canonical_map") if isinstance(caps, dict) else None
    if isinstance(canonical_map, dict) and canonical_map:
        for mid in canonical_map.keys():
            mid_str = str(mid)
            if not model_registry.provider_model_disabled(cfg, provider, mid_str):
                return mid_str, "capability"
    manual_map = ((cfg.get("models") or {}).get("provider_model_map") or {}).get(provider) or {}
    if isinstance(manual_map, dict) and manual_map:
        for mid in manual_map.keys():
            mid_str = str(mid)
            if not model_registry.provider_model_disabled(cfg, provider, mid_str):
                return mid_str, "manual_map"
    pcfg = ((cfg.get("providers") or {}).get(provider) or {})
    static_models = pcfg.get("static_models")
    if isinstance(static_models, list):
        for entry in static_models:
            if isinstance(entry, str):
                mid = entry.strip()
            elif isinstance(entry, dict):
                mid = str(entry.get("id") or "").strip()
            else:
                mid = ""
            if mid and not model_registry.provider_model_disabled(cfg, provider, mid):
                return mid, "static"
    routes = ((cfg.get("models") or {}).get("routes") or {})
    if isinstance(routes, dict):
        for model, route in routes.items():
            if route is None:
                continue
            providers = (route or {}).get("providers") if isinstance(route, dict) else []
            for item in providers or []:
                name = item if isinstance(item, str) else (item or {}).get("name")
                if str(name or "") == provider and str(model or "").strip():
                    if not model_registry.provider_model_disabled(cfg, provider, str(model)):
                        return str(model), "route"
        for model, route in routes.items():
            if route is not None and str(model or "").strip():
                if not model_registry.provider_model_disabled(cfg, provider, str(model)):
                    return str(model), "route_fallback"
    return None, ""


def _pick_probe_model(provider: str, observability=None, config=None) -> Optional[str]:
    model, _source = _pick_probe_model_with_source(provider, observability=observability, config=config)
    return model


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
    """Send a minimal request with one provider key to verify availability.

    Concurrent dashboard clicks for the same provider/key/model share one
    upstream probe so the request history does not fill with duplicate tests.
    """
    probe_key = (str(provider), int(key_index), str(model or "").strip())
    with _KEY_PROBE_LOCK:
        future = _KEY_PROBE_INFLIGHT.get(probe_key)
        if future is None:
            future = concurrent.futures.Future()
            _KEY_PROBE_INFLIGHT[probe_key] = future
            owner = True
        else:
            owner = False

    if not owner:
        try:
            result = future.result(timeout=20)
            copied = copy.deepcopy(result)
            copied["deduped"] = True
            return copied
        except Exception as e:
            return {"ok": False, "error_type": "probe_inflight_error", "error": _sanitize_diagnostic_text(e, 200)}

    try:
        result = _probe_provider_key_once(provider, key_index, model=model)
        future.set_result(copy.deepcopy(result))
        return result
    except Exception as e:
        future.set_exception(e)
        raise
    finally:
        with _KEY_PROBE_LOCK:
            if _KEY_PROBE_INFLIGHT.get(probe_key) is future:
                _KEY_PROBE_INFLIGHT.pop(probe_key, None)


def _probe_provider_key_once(provider: str, key_index: int, model: str = "") -> dict:
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

    # Reject models that are explicitly disabled for this provider —
    # sending a probe with a disabled model wastes an upstream request
    # and always fails with 404.
    if model_registry.provider_model_disabled(CONFIG, provider, canonical_model):
        return {"ok": False, "error_type": "model_disabled", "error": f"model '{canonical_model}' is disabled for provider '{provider}'"}

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
        "messages": [{"role": "user", "content": ""}],
        "max_tokens": 1,
        "temperature": 0,
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
        OBSERVABILITY.record_attempt(request_id, probe_attempt, outcome="success", first_byte_ms=latency_ms)
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


def _mark_provider_models_pending(provider: str) -> None:
    """Flag a provider's capability snapshot as refreshing.

    The background discovery thread overwrites this with status "ok" or "error"
    when it finishes. Until then the dashboard can show a "refreshing" state
    instead of an empty models list. Existing models/canonical_map are preserved
    so a failed refresh still surfaces the last known list rather than nothing.
    """
    if not provider:
        return
    caps = (CONFIG.get("models") or {}).setdefault("provider_model_capabilities", {})
    existing = caps.get(provider) if isinstance(caps.get(provider), dict) else {}
    caps[provider] = {
        "status": "pending",
        "fetched_at": int(time.time()),
        "models": list(existing.get("models") or []),
        "canonical_map": dict(existing.get("canonical_map") or {}),
        "formats": list(existing.get("formats") or []),
        "config_signature": model_registry.provider_config_signature(CONFIG, provider),
    }
    if existing.get("error"):
        caps[provider]["error"] = str(existing.get("error"))[:500]
    model_registry.bump_models_version()


def _refresh_models_after_config_change(provider: Optional[str] = None, *, force: bool = False) -> None:
    """Refresh only the affected provider after config changes.

    Client /v1/models is served from saved capabilities/config; discovery I/O is
    limited to startup, manual refresh, and provider-level changes.
    """
    models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
    if models_source not in ("union", "first_healthy_provider"):
        model_registry.clear_cache(provider)
        model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
        return

    if not provider:
        model_registry.clear_cache()
        model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
        return

    if provider not in (CONFIG.get("providers") or {}):
        model_registry.clear_cache(provider)
        model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
        return

    pcfg = ((CONFIG.get("providers") or {}).get(provider) or {})
    if not pcfg.get("enabled", True):
        model_registry.clear_cache(provider)
        model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
        return

    if not force:
        model_registry.clear_cache(provider)
        model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
        return

    model_registry.clear_cache(provider)
    _mark_provider_models_pending(provider)
    model_registry.rebuild_models_union_snapshot(CONFIG, ROUTER)
    # Route through the background discovery queue when available: it caches ok
    # snapshots (so an unchanged provider is not re-fetched), retries failures
    # on a slow cadence, and runs in its own thread (never the request worker
    # pool). Fall back to the legacy per-call thread only if the queue is not
    # running yet (e.g. very early startup).
    if MODEL_DISCOVERY_QUEUE is not None:
        MODEL_DISCOVERY_QUEUE.enqueue(provider, force=True)
        return
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


# ---------------------------------------------------------------------------
# Background model discovery queue
# ---------------------------------------------------------------------------
# Replaces the previous "one-shot union fetch at startup with an 8s timeout".
# A single daemon worker pulls providers from a queue and discovers their
# models sequentially, caching ok snapshots for a TTL and retrying
# missing/failed providers on a slow cadence. This runs in its own thread and
# never touches the request-forwarding worker pool, so it cannot block or slow
# down real traffic. Providers that were unreachable at startup (slow /v1/models,
# proxy required) get discovered automatically once they come back, without the
# user having to click "Refresh models" for each one.
def _enabled_provider_names() -> list:
    rt = _request_runtime()
    providers = rt.config.get("providers") or {}
    return [str(name) for name, pcfg in providers.items() if (pcfg or {}).get("enabled", True)]


def _provider_capability_snapshot(provider: str):
    rt = _request_runtime()
    caps = ((rt.config.get("models") or {}).get("provider_model_capabilities") or {})
    entry = caps.get(provider)
    if isinstance(entry, dict):
        current_sig = model_registry.provider_config_signature(rt.config, provider)
        if entry.get("config_signature") != current_sig:
            stale = dict(entry)
            stale["status"] = "stale"
            stale["fetched_at"] = 0
            return stale
    return entry


def _discovery_fetch_provider(provider: str) -> None:
    """Fetch one provider's models inside the discovery worker thread.

    Uses _request_runtime() to capture a consistent (config, router,
    upstream_client) snapshot so that a concurrent _apply_runtime_config()
    hot-swap cannot produce a torn set of objects from different config
    generations. Exceptions are absorbed by the queue, which schedules a retry.
    """
    rt = _request_runtime()
    config_ref = rt.config
    router_ref = rt.router
    upstream_client_ref = rt.upstream_client
    try:
        _mark_provider_models_pending(provider)
    except Exception:
        pass
    model_registry.fetch_upstream_models(
        config_ref,
        router_ref,
        upstream_client_ref,
        format_provider=_hprov,
        only_provider=provider,
    )
    if _merge_provider_model_capability_from(config_ref, provider):
        _save_router_state()


MODEL_DISCOVERY_QUEUE: Optional[model_discovery_queue.ModelDiscoveryQueue] = None


def _start_model_discovery_queue() -> None:
    global MODEL_DISCOVERY_QUEUE
    models_source = str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider"))
    if models_source not in ("union", "first_healthy_provider"):
        return
    if MODEL_DISCOVERY_QUEUE is not None:
        MODEL_DISCOVERY_QUEUE.stop()
    MODEL_DISCOVERY_QUEUE = model_discovery_queue.ModelDiscoveryQueue(
        fetch_provider_fn=_discovery_fetch_provider,
        get_snapshot_fn=_provider_capability_snapshot,
        providers_fn=_enabled_provider_names,
        enabled_fn=lambda: True,
    )
    MODEL_DISCOVERY_QUEUE.start()


def _default_models():
    return model_registry.default_models()


def _should_log_each_request() -> bool:
    """Whether per-request path logging is enabled.

    Reads the global CONFIG so callers inside do_POST (which shadows CONFIG with
    a local runtime snapshot later in the method) do not hit UnboundLocalError.
    """
    return bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", False))


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


def _stream_flush_policy():
    try:
        routing = (_current_rt().config.get("routing") or {})
        interval_ms = int(routing.get("stream_flush_interval_ms", 0))
        flush_bytes = int(routing.get("stream_flush_bytes", 0))
        return interval_ms, flush_bytes
    except Exception:
        return 0, 0


def _config_choice(config: dict, section: str, key: str, default: str, allowed: set) -> str:
    try:
        value = str(((config.get(section) or {}).get(key, default)) or default).strip().lower()
    except Exception:
        return default
    return value if value in allowed else default


def _native_nonstream_mode(config: dict = None) -> str:
    return _config_choice(config or CONFIG, "routing", "native_nonstream_mode", "validated", {"safe", "validated"})


def _native_stream_mode(config: dict = None) -> str:
    return _config_choice(config or CONFIG, "routing", "native_stream_mode", "guarded", {"safe", "guarded"})


def _native_stream_usage_mode(config: dict = None) -> str:
    return _config_choice(config or CONFIG, "observability", "native_stream_usage", "full", {"full", "off"})


def _discovery_status() -> dict:
    """Expose the background discovery-queue state so the dashboard can show
    which providers are queued / cooling down, and the TTL/retry cadence."""
    if MODEL_DISCOVERY_QUEUE is None:
        return {"running": False, "queued": 0, "queued_providers": [], "cooldowns": []}
    return MODEL_DISCOVERY_QUEUE.snapshot_status()


def _model_capabilities_snapshot() -> dict:
    caps = ((CONFIG.get("models") or {}).get("provider_model_capabilities") or {})
    providers_cfg = CONFIG.get("providers") or {}
    providers = {}
    for provider, entry in caps.items():
        if not isinstance(entry, dict):
            continue
        if provider not in providers_cfg:
            continue
        status = entry.get("status", "unknown")
        try:
            if entry.get("config_signature") and entry.get("config_signature") != model_registry.provider_config_signature(CONFIG, provider):
                status = "stale"
        except Exception:
            pass
        providers[provider] = {
            "status": status,
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
    return scheduler_policy.classify_http_error(_current_rt().config, int(code or 0)).error_type


def _is_retryable_http(code: int) -> bool:
    return scheduler_policy.classify_http_error(_current_rt().config, int(code or 0)).retryable


def _same_key_retries_for_transient_errors() -> int:
    retry_cfg = _current_rt().config.get("retry") or {}
    value = retry_cfg.get("same_key_retries")
    if value is None:
        value = retry_cfg.get("same_key_retry_count", 1)
    try:
        return max(0, min(int(value), 3))
    except Exception:
        return 1


def _is_same_key_retryable_http(status: int, error_body: str, model_name: str) -> bool:
    decision = scheduler_policy.classify_http_error(
        _current_rt().config,
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


def _attempt_first_byte_ms(started_at) -> int:
    """Compute per-attempt first-byte latency from attempt start time."""
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


# Windows socket disconnect error codes (WSAE*) surfaced via OSError.winerror.
# 10053 = WSAECONNABORTED, 10054 = WSAECONNRESET, 10058 = WSAESHUTDOWN.
_WINDOWS_DISCONNECT_WINERRORS = {10053, 10054, 10058}


def is_client_disconnect_error(exc: BaseException) -> bool:
    """Return True when exc indicates the *client* (not the upstream provider)
    closed or reset the connection.

    Treating these as client-side 499 prevents cooling a healthy provider just
    because the downstream client went away. Covers the explicit exception
    classes plus generic OSError with common disconnect errno/winerror values
    (the latter shows up on Windows and some TLS stacks). Also unwraps
    urllib URLError whose .reason carries the underlying OSError.
    """
    # Unwrap URLError.reason (urllib wraps socket errors).
    if isinstance(exc, URLError):
        reason = getattr(exc, "reason", None)
        if isinstance(reason, BaseException):
            exc = reason
    if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, ConnectionRefusedError)):
        return True
    if isinstance(exc, OSError):
        code = getattr(exc, "errno", None)
        if code in (errno.EPIPE, errno.ECONNRESET, errno.ESHUTDOWN):
            return True
        winerr = getattr(exc, "winerror", None)
        if winerr in _WINDOWS_DISCONNECT_WINERRORS:
            return True
    return False


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
    _current_rt().observability.record_attempt(
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
    _current_rt().router.report_failure(
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
    _current_rt().router.report_failure(attempt, error_type="provider_compat")
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
    decision = scheduler_policy.classify_transport_error(type(exception).__name__, _current_rt().config)
    final_reason = reason or decision.reason
    diagnostics = _upstream_error_diagnostics(stage, exception=exception)
    _current_rt().router.report_failure(attempt, error_type=decision.error_type)
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
    _current_rt().router.report_failure(attempt, error_type="network_error")
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
    _current_rt().router.report_failure(attempt, error_type="network_error")
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
    pcfg = (_current_rt().config.get("providers") or {}).get(getattr(attempt, "provider", "") or "") or {}
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
    pcfg = (_current_rt().config.get("providers") or {}).get(getattr(attempt, "provider", "") or "") or {}
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
    _client = _current_rt().upstream_client
    if hasattr(_client, "request_json_with_timing"):
        return _client.request_json_with_timing(
            attempt.url,
            attempt.headers,
            payload,
            proxy_url=proxy_url,
            remaining_timeout_s=remaining_timeout_s,
        )
    started = time.time()
    data = _client.request_json(
        attempt.url,
        attempt.headers,
        payload,
        proxy_url=proxy_url,
        remaining_timeout_s=remaining_timeout_s,
    )
    return data, max(0, int((time.time() - started) * 1000))


def _request_raw_once_with_timing(attempt, payload, *, proxy_url=None, remaining_timeout_s=None):
    _client = _current_rt().upstream_client
    if hasattr(_client, "request_raw_with_timing"):
        return _client.request_raw_with_timing(
            attempt.url,
            attempt.headers,
            payload,
            proxy_url=proxy_url,
            remaining_timeout_s=remaining_timeout_s,
        )
    data, first_byte_ms = _request_json_once_with_timing(
        attempt,
        payload,
        proxy_url=proxy_url,
        remaining_timeout_s=remaining_timeout_s,
    )
    return json.dumps(data).encode("utf-8"), first_byte_ms


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
        _current_rt().observability.record_first_byte(request_id, first_byte_ms)
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
            _current_rt().observability.record_first_byte(request_id, first_byte_ms)
            return data
        if same_key_retries > 0 and _is_same_key_retryable_http(status, error_body, attempt_payload.get("model", "")):
            print(
                f"[proxy] same-key retry req={request_id} {_h(attempt.provider)} "
                f"status={int(status) if status else 0}",
                flush=True,
            )
            retry_payload = dict(attempt_payload)
            try:
                data, first_byte_ms = _request_json_once_with_timing(
                    attempt,
                    retry_payload,
                    proxy_url=proxy_url,
                    remaining_timeout_s=remaining_timeout_s,
                )
                _current_rt().observability.record_first_byte(request_id, first_byte_ms)
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
            retry_payload = dict(attempt_payload)
            data, first_byte_ms = _request_json_once_with_timing(
                attempt,
                retry_payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
            )
            _current_rt().observability.record_first_byte(request_id, first_byte_ms)
            return data
        raise


def _request_raw_with_compat_retry(request_id, attempt, payload, *, proxy_url=None, remaining_timeout_s=None):
    same_key_retries = _same_key_retries_for_transient_errors()
    attempt_payload = payload
    try:
        raw, first_byte_ms = _request_raw_once_with_timing(
            attempt,
            attempt_payload,
            proxy_url=proxy_url,
            remaining_timeout_s=remaining_timeout_s,
        )
        _current_rt().observability.record_first_byte(request_id, first_byte_ms)
        return raw
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
                f"[proxy] tool_choice downgraded to auto for raw retry req={request_id} {_h(attempt.provider)}",
                flush=True,
            )
            raw, first_byte_ms = _request_raw_once_with_timing(
                attempt,
                payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
            )
            _current_rt().observability.record_first_byte(request_id, first_byte_ms)
            return raw
        if same_key_retries > 0 and _is_same_key_retryable_http(status, error_body, attempt_payload.get("model", "")):
            print(
                f"[proxy] same-key raw retry req={request_id} {_h(attempt.provider)} "
                f"status={int(status) if status else 0}",
                flush=True,
            )
            retry_payload = dict(attempt_payload)
            try:
                raw, first_byte_ms = _request_raw_once_with_timing(
                    attempt,
                    retry_payload,
                    proxy_url=proxy_url,
                    remaining_timeout_s=remaining_timeout_s,
                )
                _current_rt().observability.record_first_byte(request_id, first_byte_ms)
                return raw
            except HTTPError as retry_error:
                status, error_body, headers = _http_error_details(retry_error)
        raise CachedHTTPError(status, error_body, headers)
    except (URLError, socket.timeout) as e:
        if same_key_retries > 0:
            print(
                f"[proxy] same-key raw retry req={request_id} {_h(attempt.provider)} "
                f"error={type(e).__name__}",
                flush=True,
            )
            retry_payload = dict(attempt_payload)
            raw, first_byte_ms = _request_raw_once_with_timing(
                attempt,
                retry_payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
            )
            _current_rt().observability.record_first_byte(request_id, first_byte_ms)
            return raw
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
    _current_rt().router.report_failure(attempt, error_type="empty_visible_output", http_status=200)
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
        return _current_rt().upstream_client.open_stream(
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
            return _current_rt().upstream_client.open_stream(
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
            retry_payload = dict(attempt_payload)
            try:
                return _current_rt().upstream_client.open_stream(
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
            retry_payload = dict(attempt_payload)
            return _current_rt().upstream_client.open_stream(
                attempt.url,
                attempt.headers,
                retry_payload,
                proxy_url=proxy_url,
                remaining_timeout_s=remaining_timeout_s,
                first_byte_timeout_s=first_event_remaining(),
            )
        raise


# True streaming: upstream OpenAI SSE to Anthropic SSE.

def _stream_prefetch_bounds():
    """Read prelude bounds from routing config. 0 disables a bound."""
    routing = (_current_rt().config.get("routing") or {})
    try:
        max_lines = int(routing.get("stream_prefetch_max_lines", 128))
    except Exception:
        max_lines = 128
    try:
        max_bytes = int(routing.get("stream_prefetch_max_bytes", 65536))
    except Exception:
        max_bytes = 65536
    return max_lines, max_bytes


def _prefetch_first_stream_line(upstream, timeout_s):
    max_lines, max_bytes = _stream_prefetch_bounds()
    return prefetch_first_stream_line(upstream, timeout_s)


def _prefetch_initial_stream_lines(upstream, timeout_s):
    # prefetch_initial_stream_lines only buffers skipped lines when
    # preserve_skipped=True (native pass-through). The bounds protect that path.
    max_lines, max_bytes = _stream_prefetch_bounds()
    return prefetch_initial_stream_lines(
        upstream,
        timeout_s,
        preserve_skipped=True,
        max_skipped_lines=max_lines,
        max_skipped_bytes=max_bytes,
    )


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

import admin_routes

class Handler(BaseHTTPRequestHandler, admin_routes.AdminRoutesMixin):
    def setup(self):
        super().setup()
        # Disable Nagle's algorithm so SSE events are sent immediately,
        # not buffered by TCP kernel.
        try:
            self.request.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass

    def _send_route_trace_headers(self, attempt, key_masked=None):
        """Inject routing trace headers so the dashboard Playground can display
        which provider/key was selected for this request."""
        try:
            self.send_header("X-Route-Provider", str(attempt.provider))
            self.send_header("X-Route-Key", str(key_masked or ""))
            self.send_header("X-Route-Format", str(attempt.upstream_format))
            self.send_header("X-Route-Model", str(getattr(attempt, "provider_model", "")))
            self.send_header("X-Route-Attempt", str(attempt.attempt_no))
        except Exception:
            pass

    def _resp_json(self, data, status=200, extra_headers=None):
        b = json.dumps(data).encode()
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            if extra_headers:
                for k, v in extra_headers.items():
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(b)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            # Client disconnected while receiving the response.
            pass

    def _resp_bytes(self, data: bytes, *, content_type: str, status: int = 200, extra_headers=None):
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            if extra_headers:
                for k, v in extra_headers.items():
                    self.send_header(k, v)
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
        try:
            return self._do_GET_impl()
        finally:
            _clear_request_rt()

    def _do_GET_impl(self):
        from urllib.parse import urlparse
        clean_path = urlparse(self.path).path
        route = classify_get(clean_path)
        if _should_log_each_request():
            print(f"[proxy] GET {clean_path}")
        self.log_request_detail("GET", self.path, self.headers)
        if route.endpoint == "health":
            self._resp_json({"status": "ok"})
        elif route.family == "dashboard":
            self._resp_dashboard(route.endpoint)
        elif route.family == "admin":
            self._resp_admin(route.endpoint)
        elif route.endpoint == "models" and route.implemented:
            rt = _request_runtime()
            models_source = str((rt.config.get("models") or {}).get("models_source", "first_healthy_provider"))
            if models_source in ("first_healthy_provider", "union"):
                if _should_log_each_request():
                    print(f"[proxy] Models: using saved capabilities ({models_source})")
                self._resp_json(model_registry.models_from_capabilities(rt.config, rt.router))
            else:
                if _should_log_each_request():
                    print(f"[proxy] Models: using hardcoded list")
                self._resp_json(self.MODELS)
        else:
            self._resp_json({"error": {"message": f"unknown endpoint: {self.path}"}}, 404)

    def _proxy_openai_chat_completions(self, req, request_id, start_ts):
        # Snapshot the live runtime once so the whole request sees a consistent
        # (config, router, client, observability, audit) set even if a config
        # hot-swap happens concurrently in another thread. Local names shadow
        # the module globals for reads; nothing here reassigns them.
        rt = _request_runtime()
        _set_request_rt(rt)
        CONFIG = rt.config
        ROUTER = rt.router
        UPSTREAM_CLIENT = rt.upstream_client
        OBSERVABILITY = rt.observability
        is_stream = bool(req.get("stream", False))
        original_model = req.get("model", "")
        resolved_model = resolve_model(original_model or "", rt.config)
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
        attempt_errors = []
        log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", False))
        if log_each:
            print(f"[proxy] openai passthrough stream={is_stream} model={_hmodel(original_model)} msgs={msgs_count}", flush=True)
            if resolved_model != original_model:
                print(f"[proxy] model alias: {original_model} -> {resolved_model}", flush=True)
        has_attempt = False
        total_start = time.time()
        routing_cfg = CONFIG.get("routing") or {}
        connect_t = int(routing_cfg.get("connect_timeout_s", 15))
        read_t = int(routing_cfg.get("read_timeout_s", 120))
        first_byte_t = int(routing_cfg.get("first_token_timeout_s", 30))  # Total budget before first stream event.
        max_attempts = int(routing_cfg.get("max_attempts", 6))
        max_budget = (connect_t + read_t) * min(3, max(1, max_attempts))
        allowed_formats = ["chat_completions", "responses", "anthropic_messages"]
        converted_payloads = {}

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
            fmt = attempt.upstream_format
            if fmt not in converted_payloads:
                try:
                    converted_payloads[fmt] = convert_request(
                        CHAT,
                        fmt,
                        req,
                        resolve_model=resolve_model,
                    )
                except ValueError as e:
                    _record_request_conversion_failure(request_id, attempt, CHAT, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    continue
            payload = dict(converted_payloads[fmt])
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
                    if attempt.upstream_format == CHAT and _native_stream_mode(CONFIG) == "guarded":
                        initial_lines = None
                    else:
                        initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                    attempt_first_byte = _attempt_first_byte_ms(attempt_started)
                    OBSERVABILITY.record_first_byte(request_id)

                    self.close_connection = True
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-Accel-Buffering", "no")
                    self._send_route_trace_headers(attempt, key_masked)
                    self.end_headers()
                    response_started = True

                    interval_ms, flush_bytes = _stream_flush_policy()
                    from stream_adapters import BufferedSSEWriter
                    bwfile = BufferedSSEWriter(self.wfile, interval_ms, flush_bytes)

                    try:
                        if attempt.upstream_format == CHAT:
                            stream_resp = relay_sse_stream(
                                upstream_conn,
                                bwfile,
                                initial_lines=initial_lines,
                                collect_usage=_native_stream_usage_mode(CONFIG) != "off",
                                read_timeout_s=read_t,
                                client_format="chat_completions",
                            )
                        elif attempt.upstream_format == RESPONSES:
                            stream_resp = stream_responses_sse_to_openai_chat(
                                upstream_conn,
                                bwfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                        else:
                            stream_resp = stream_anthropic_sse_to_openai_chat(
                                upstream_conn,
                                bwfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                    finally:
                        bwfile.force_flush()

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
                        first_byte_ms=attempt_first_byte,
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    return

                raw_response = None
                if attempt.upstream_format == CHAT and _native_nonstream_mode(CONFIG) == "validated":
                    raw_response = _request_raw_with_compat_retry(
                        request_id,
                        attempt,
                        payload,
                        proxy_url=attempt.proxy_url,
                        remaining_timeout_s=remaining,
                    )
                    upstream_data = json.loads(raw_response)
                    client_response = upstream_data
                else:
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
                    first_byte_ms=_attempt_first_byte_ms(attempt_started),
                )
                OBSERVABILITY.record_request_end(request_id, status_code=200)
                _route_hdrs = {
                    "X-Route-Provider": str(attempt.provider),
                    "X-Route-Key": str(key_masked or ""),
                    "X-Route-Format": str(attempt.upstream_format),
                    "X-Route-Model": str(getattr(attempt, "provider_model", "")),
                    "X-Route-Attempt": str(attempt.attempt_no),
                }
                if raw_response is not None:
                    return self._resp_bytes(raw_response, content_type="application/json", extra_headers=_route_hdrs)
                return self._resp_json(client_response, extra_headers=_route_hdrs)

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
                # Once bytes were sent to the client, a disconnect-style error on
                # a write is the client going away, not an upstream failure.
                # Treat it as 499 and do NOT cool the provider/key.
                if response_started and is_client_disconnect_error(e):
                    print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                    OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                    return
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
        # Snapshot the live runtime once for whole-request consistency during
        # config hot-swap. See _proxy_openai_chat_completions for rationale.
        rt = _request_runtime()
        _set_request_rt(rt)
        CONFIG = rt.config
        ROUTER = rt.router
        UPSTREAM_CLIENT = rt.upstream_client
        OBSERVABILITY = rt.observability
        is_stream = bool(req.get("stream", False))
        original_model = req.get("model", "")
        resolved_model = resolve_model(original_model or "", rt.config)
        canonical_model = resolved_model
        OBSERVABILITY.record_request_start(
            request_id,
            client_format=RESPONSES,
            endpoint="responses",
            model=canonical_model,
            stream=is_stream,
            path=path,
        )
        allowed_formats = [RESPONSES, CHAT, ANTHROPIC]
        attempt_errors = []
        log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", False))
        if log_each:
            print(f"[proxy] responses stream={is_stream} model={_hmodel(original_model)}", flush=True)
            if resolved_model != original_model:
                print(f"[proxy] model alias: {original_model} -> {resolved_model}", flush=True)
        has_attempt = False
        total_start = time.time()
        routing_cfg = CONFIG.get("routing") or {}
        connect_t = int(routing_cfg.get("connect_timeout_s", 15))
        read_t = int(routing_cfg.get("read_timeout_s", 120))
        first_byte_t = int(routing_cfg.get("first_token_timeout_s", 30))  # Total budget before first stream event.
        max_attempts = int(routing_cfg.get("max_attempts", 6))
        max_budget = (connect_t + read_t) * min(3, max(1, max_attempts))
        converted_payloads = {}

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
            fmt = attempt.upstream_format
            if fmt not in converted_payloads:
                try:
                    converted_payloads[fmt] = convert_request(
                        RESPONSES,
                        fmt,
                        req,
                        resolve_model=resolve_model,
                    )
                except ValueError as e:
                    _record_request_conversion_failure(request_id, attempt, RESPONSES, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    continue
            payload = dict(converted_payloads[fmt])
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
                    if attempt.upstream_format == RESPONSES and _native_stream_mode(CONFIG) == "guarded":
                        initial_lines = None
                    elif attempt.upstream_format in (RESPONSES, ANTHROPIC):
                        initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                    else:
                        first_line = _prefetch_first_stream_line(upstream_conn, first_event_remaining)
                        initial_lines = [first_line] if first_line else None
                    attempt_first_byte = _attempt_first_byte_ms(attempt_started)
                    OBSERVABILITY.record_first_byte(request_id)

                    self.close_connection = True
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-Accel-Buffering", "no")
                    self._send_route_trace_headers(attempt, key_masked)
                    self.end_headers()
                    response_started = True

                    interval_ms, flush_bytes = _stream_flush_policy()
                    from stream_adapters import BufferedSSEWriter
                    bwfile = BufferedSSEWriter(self.wfile, interval_ms, flush_bytes)

                    stream_resp = None
                    try:
                        if attempt.upstream_format == RESPONSES:
                            stream_resp = relay_sse_stream(
                                upstream_conn,
                                bwfile,
                                initial_lines=initial_lines,
                                collect_usage=_native_stream_usage_mode(CONFIG) != "off",
                                read_timeout_s=read_t,
                                client_format="responses",
                            )
                        elif attempt.upstream_format == CHAT:
                            stream_resp = stream_openai_sse_to_responses(
                                upstream_conn,
                                bwfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                        else:
                            stream_resp = stream_anthropic_sse_to_responses(
                                upstream_conn,
                                bwfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                    finally:
                        bwfile.force_flush()

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
                        first_byte_ms=attempt_first_byte,
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    return

                raw_response = None
                if attempt.upstream_format == RESPONSES and _native_nonstream_mode(CONFIG) == "validated":
                    raw_response = _request_raw_with_compat_retry(
                        request_id,
                        attempt,
                        payload,
                        proxy_url=attempt.proxy_url,
                        remaining_timeout_s=remaining,
                    )
                    upstream_data = json.loads(raw_response)
                    client_response = upstream_data
                else:
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
                    first_byte_ms=_attempt_first_byte_ms(attempt_started),
                )
                OBSERVABILITY.record_request_end(request_id, status_code=200)
                _route_hdrs = {
                    "X-Route-Provider": str(attempt.provider),
                    "X-Route-Key": str(key_masked or ""),
                    "X-Route-Format": str(attempt.upstream_format),
                    "X-Route-Model": str(getattr(attempt, "provider_model", "")),
                    "X-Route-Attempt": str(attempt.attempt_no),
                }
                if raw_response is not None:
                    return self._resp_bytes(raw_response, content_type="application/json", extra_headers=_route_hdrs)
                return self._resp_json(client_response, extra_headers=_route_hdrs)

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
                # Once bytes were sent to the client, a disconnect-style error on
                # a write is the client going away, not an upstream failure.
                # Treat it as 499 and do NOT cool the provider/key.
                if response_started and is_client_disconnect_error(e):
                    print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                    OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                    return
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
        try:
            return self._do_PATCH_impl()
        finally:
            _clear_request_rt()

    def _do_PATCH_impl(self):
        from urllib.parse import urlparse
        clean_path = urlparse(self.path).path
        route = classify_post(clean_path)
        self.log_request_detail("PATCH", self.path, self.headers)
        print(f"[proxy] PATCH {clean_path}", flush=True)

        if route.family == "admin":
            return self._resp_admin_patch(route.endpoint)
        return self._resp_json({"error": {"message": f"unknown endpoint: {self.path}"}}, 404)

    def do_POST(self):
        try:
            return self._do_POST_impl()
        finally:
            _clear_request_rt()

    def _do_POST_impl(self):
        from urllib.parse import urlparse
        clean_path = urlparse(self.path).path
        route = classify_post(clean_path)
        self.log_request_detail("POST", self.path, self.headers)
        if _should_log_each_request():
            print(f"[proxy] POST {clean_path}")

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

        # Anthropic Messages branch: snapshot the live runtime once for
        # whole-request consistency during config hot-swap.
        rt = _request_runtime()
        _set_request_rt(rt)
        CONFIG = rt.config
        ROUTER = rt.router
        UPSTREAM_CLIENT = rt.upstream_client
        OBSERVABILITY = rt.observability
        is_stream = req.get("stream", False)
        original_model = req.get("model", "deepseek-v4-flash")
        msgs_count = len(req.get("messages", []))
        tools_count = len(req.get("tools", []))
        log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", False))
        if log_each:
            print(f"[proxy] stream={is_stream} model={_hmodel(original_model)} msgs={msgs_count} tools={tools_count}", flush=True)

        try:
            # Rebuild union aliases from saved capabilities/config without upstream I/O.
            try:
                if str((CONFIG.get("models") or {}).get("models_source", "first_healthy_provider")) == "union":
                    if not model_registry.has_cached_models("__union__"):
                        model_registry.models_from_capabilities(CONFIG, ROUTER)
            except Exception:
                pass
            resolved_model = resolve_model(original_model or "", rt.config)
            if resolved_model != original_model and log_each:
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
            converted_payloads = {}
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
                fmt = attempt.upstream_format
                if fmt not in converted_payloads:
                    try:
                        converted_payloads[fmt] = convert_request(
                            ANTHROPIC,
                            fmt,
                            req,
                            resolve_model=resolve_model,
                        )
                    except ValueError as e:
                        _record_request_conversion_failure(request_id, attempt, ANTHROPIC, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                        continue
                payload = dict(converted_payloads[fmt])
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
                        if attempt.upstream_format == ANTHROPIC and _native_stream_mode(CONFIG) == "guarded":
                            initial_lines = None
                        elif attempt.upstream_format in (ANTHROPIC, RESPONSES):
                            initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                        else:
                            first_line = _prefetch_first_stream_line(upstream_conn, first_event_remaining)
                            initial_lines = [first_line] if first_line else None
                        attempt_first_byte = _attempt_first_byte_ms(attempt_started)
                        OBSERVABILITY.record_first_byte(request_id)

                        self.close_connection = True
                        self.send_response(200)
                        self.send_header("Content-Type", "text/event-stream")
                        self.send_header("Cache-Control", "no-cache")
                        self.send_header("X-Accel-Buffering", "no")
                        self._send_route_trace_headers(attempt, key_masked)
                        self.end_headers()
                        response_started = True

                        interval_ms, flush_bytes = _stream_flush_policy()
                        from stream_adapters import BufferedSSEWriter
                        bwfile = BufferedSSEWriter(self.wfile, interval_ms, flush_bytes)

                        try:
                            if attempt.upstream_format == "anthropic_messages":
                                native_usage = relay_sse_stream(
                                    upstream_conn,
                                    bwfile,
                                    initial_lines=initial_lines,
                                    collect_usage=_native_stream_usage_mode(CONFIG) != "off",
                                    read_timeout_s=read_t,
                                    client_format="anthropic_messages",
                                )
                                anth_resp = {"streamed": True, "native": True, "usage": native_usage}
                            elif attempt.upstream_format == RESPONSES:
                                anth_resp = stream_responses_sse_to_anthropic(
                                    upstream_conn,
                                    bwfile,
                                    original_model,
                                    read_timeout_s=read_t,
                                    initial_lines=initial_lines,
                                )
                            else:
                                anth_resp = do_stream(upstream_conn, bwfile, original_model, read_timeout_s=read_t, initial_lines=initial_lines)
                        finally:
                            bwfile.force_flush()

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
                            first_byte_ms=attempt_first_byte,
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

                    raw_response = None
                    if attempt.upstream_format == ANTHROPIC and _native_nonstream_mode(CONFIG) == "validated":
                        raw_response = _request_raw_with_compat_retry(request_id, attempt, payload, proxy_url=attempt.proxy_url, remaining_timeout_s=remaining)
                        upstream_data = json.loads(raw_response)
                        anth_resp = upstream_data
                    else:
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
                        first_byte_ms=_attempt_first_byte_ms(attempt_started),
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    _route_hdrs = {
                        "X-Route-Provider": str(attempt.provider),
                        "X-Route-Key": str(key_masked or ""),
                        "X-Route-Format": str(attempt.upstream_format),
                        "X-Route-Model": str(getattr(attempt, "provider_model", "")),
                        "X-Route-Attempt": str(attempt.attempt_no),
                    }
                    if raw_response is not None:
                        self._resp_bytes(raw_response, content_type="application/json", extra_headers=_route_hdrs)
                    else:
                        self._resp_json(anth_resp, extra_headers=_route_hdrs)
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
                    # Once bytes were sent to the client, a disconnect-style error
                    # on a write is the client going away, not an upstream failure.
                    # Treat it as 499 and do NOT cool the provider/key.
                    if response_started and is_client_disconnect_error(e):
                        print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                        OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                        return
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
        self.request_queue_size = max(32, int(max_workers) * 2)
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
                with OBSERVABILITY._history._connection() as conn:
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
            # Warm the resolve cache for every known model name FIRST, before
            # the sleep, so it is ready by the time the first dashboard pricing
            # query arrives. This is pure local index work, no network.
            try:
                aa._index.load_local()
                for m in sorted(list(models)):
                    try:
                        aa._index.resolve(m)
                    except Exception:
                        pass
                print(f"[proxy] Resolve cache warmed for {len(models)} models.", flush=True)
            except Exception:
                pass
            # Wait a few seconds for the proxy to start serving, then start fetching
            time.sleep(5)
            # Optional proxy for fetching from artificialanalysis.ai (faster
            # from regions with restricted direct access). Read from config
            # observability.pricing.proxy or AA_PROXY env.
            aa_proxy = ""
            try:
                aa_proxy = str(((CONFIG.get("observability") or {}).get("pricing") or {}).get("proxy") or os.environ.get("AA_PROXY") or "").strip()
            except Exception:
                pass
            for m in sorted(list(models)):
                try:
                    # aa.get performs a resolved check; if cached locally, it returns immediately.
                    # Otherwise it fetches & parses (through aa_proxy if configured).
                    res = aa.get(m, proxy=aa_proxy or None)
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


def main():
    """CLI entry point. Supports --config, --port, --host, --init."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="litellm-proxy",
        description="Format-aware LLM API proxy with 3-format conversion, smart routing & web dashboard.",
    )
    parser.add_argument("--config", type=str, default=None, help="Path to config.json (default: auto-detect)")
    parser.add_argument("--port", type=int, default=None, help="Override server.port (default: 4894)")
    parser.add_argument("--host", type=str, default=None, help="Override server.host (default: 0.0.0.0)")
    parser.add_argument("--init", action="store_true", help="Create config.json from template and exit")
    args = parser.parse_args()

    # --init: create a config from the example and exit
    if args.init:
        import shutil
        example = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.example.jsonc")
        target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
        if os.path.exists(target):
            print(f"config.json already exists at {target}")
            return
        if os.path.exists(example):
            shutil.copy2(example, target)
            print(f"Created config.json from template. Edit it and add your API keys, then run:")
            print(f"  python sse2json.py")
        else:
            print("Template config.example.jsonc not found. Please create config.json manually.")
        return

    # Apply CLI overrides to environment so they get picked up by config loader
    if args.config:
        os.environ["PROXY_CONFIG_PATH"] = args.config
    if args.port:
        os.environ["PROXY_PORT"] = str(args.port)
    if args.host:
        os.environ["PROXY_HOST"] = args.host

    # Reload configuration from disk (picks up PROXY_CONFIG_PATH) and apply
    # environment overlays (picks up PROXY_HOST / PROXY_PORT / etc.), then
    # rebuild all runtime objects (router, upstream client, observability).
    # This is necessary because the module-level CONFIG / ROUTER / etc. were
    # created during import, before CLI args were parsed.
    CONFIG_MANAGER.reload(load_base_config(apply_env=False))
    _apply_runtime_config(CONFIG_MANAGER.config)

    # Restore runtime state before model prefetch.
    _load_router_state()
    _prefetch_model_summaries()
    # Start autosave before serving requests.
    _start_state_autosave()
    _start_health_score_updater()

    # Start the background model-discovery queue.
    _start_model_discovery_queue()

    # Start the adaptive idle health checker.
    _start_idle_health_checker()

    # Start the patrol health checker (full sweep every 1-3h).
    _start_patrol_health_checker()

    # Read host/port/max_workers from the freshly rebuilt CONFIG
    global HOST, PORT, MAX_WORKERS
    PORT = int((CONFIG.get("server") or {}).get("port", 4894))
    HOST = str((CONFIG.get("server") or {}).get("host", "0.0.0.0")).strip() or "0.0.0.0"
    MAX_WORKERS = int((CONFIG.get("server") or {}).get("max_workers", 20))

    s = _ThreadPoolHTTPServer((HOST, PORT), Handler, max_workers=MAX_WORKERS)
    s.timeout = 0.5
    log_info = f" (debug logging ON)" if DEBUG_LOG else ""
    print(f"Proxy on http://localhost:{PORT}/v1/messages", flush=True)
    print(f"Bind: {HOST}:{PORT}  Workers: {MAX_WORKERS}  Logs: {LOG_DIR}{log_info}", flush=True)
    if ZERO_CONFIG_ACTIVE:
        providers = list((CONFIG.get("providers") or {}).keys())
        print(f"[proxy] Zero-config mode: detected {len(providers)} provider(s) from environment variables: {', '.join(providers)}", flush=True)
        print(f"[proxy] Tip: create config.json for full control, or open the dashboard to configure providers.", flush=True)
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
        UPSTREAM_CLIENT.close()
        s.server_close()


if __name__ == "__main__":
    main()


