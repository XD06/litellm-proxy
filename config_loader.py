#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置加载与覆盖：
- 默认读取与本文件同目录下的 config.json（若存在）
- 允许用环境变量覆盖关键字段（便于快速切换）
- 兼容旧环境变量：UPSTREAM_URL / UPSTREAM_API_KEY / PROXY_PORT / ...
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from proxy_utils import normalize_key_entries, normalize_proxy_config


SUPPORTED_FORMATS = ("chat_completions", "responses", "anthropic_messages")
DEFAULT_FORMAT_PATHS = {
    "chat_completions": "/v1/chat/completions",
    "responses": "/v1/responses",
    "anthropic_messages": "/v1/messages",
}
LEGACY_FORMAT_PATH_KEYS = {
    "chat_completions": "chat_completions_path",
    "responses": "responses_path",
    "anthropic_messages": "anthropic_messages_path",
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """深度合并 dict：override 覆盖 base。"""
    out = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _json_env(name: str) -> Any:
    v = os.environ.get(name)
    if not v:
        return None
    try:
        return json.loads(v)
    except Exception:
        return None


def _env_int(name: str, default: int) -> int:
    """Parse a numeric env var, falling back to ``default`` with a warning."""
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except Exception:
        print(f"[config] WARNING: {name}={raw!r} is not an integer; using default {default}.", flush=True)
        return default


def _ensure_path(value: Any, default: str) -> str:
    path = str(value or "").strip()
    if not path:
        return default
    if path.startswith("http://") or path.startswith("https://"):
        path = urlparse(path).path or default
    if not path.startswith("/"):
        path = "/" + path
    return path


def _split_base_and_format_path(full_url: str) -> Tuple[str, Optional[str], Optional[str]]:
    p = urlparse(full_url)
    if not p.scheme or not p.netloc:
        return full_url.rstrip("/"), None, None

    scheme_netloc = f"{p.scheme}://{p.netloc}"
    path = p.path or ""
    known_suffixes = (
        ("chat_completions", "/v1/chat/completions"),
        ("chat_completions", "/chat/completions"),
        ("responses", "/v1/responses"),
        ("responses", "/responses"),
        ("anthropic_messages", "/v1/messages"),
        ("anthropic_messages", "/messages"),
    )

    for fmt, suffix in known_suffixes:
        idx = path.find(suffix)
        if idx != -1:
            prefix = path[:idx]
            base_url = scheme_netloc + prefix
            return base_url.rstrip("/"), fmt, suffix

    return full_url.rstrip("/"), None, None


def _infer_default_format(provider_name: str, base_url: str) -> str:
    parsed = urlparse(base_url or "")
    haystack = f"{provider_name} {base_url} {parsed.path}".lower()
    if "anthropic" in haystack:
        return "anthropic_messages"
    if "responses" in haystack or "response" in haystack or "codex" in haystack:
        return "responses"
    return "chat_completions"


def _normalize_formats(
    provider_name: str,
    out: Dict[str, Any],
    *,
    detected_format: Optional[str] = None,
    detected_path: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    raw_formats = out.get("formats")
    explicit_formats = isinstance(raw_formats, dict)
    formats: Dict[str, Dict[str, Any]] = {
        fmt: {"enabled": False, "path": DEFAULT_FORMAT_PATHS[fmt]}
        for fmt in SUPPORTED_FORMATS
    }

    if explicit_formats:
        for fmt in SUPPORTED_FORMATS:
            entry = raw_formats.get(fmt)
            if isinstance(entry, dict):
                normalized_entry = {
                    "enabled": bool(entry.get("enabled", True)),
                    "path": _ensure_path(entry.get("path"), DEFAULT_FORMAT_PATHS[fmt]),
                }
                parameters = entry.get("parameters")
                if isinstance(parameters, dict):
                    output_token_field = str(parameters.get("output_token_field") or "auto").strip()
                    allowed_fields = {"auto", "max_tokens", "max_completion_tokens", "max_output_tokens"}
                    if output_token_field not in allowed_fields:
                        raise ValueError(f"invalid output_token_field for {provider_name}.{fmt}: {output_token_field}")
                    native_fields = {"chat_completions": {"auto", "max_tokens", "max_completion_tokens"}, "responses": {"auto", "max_output_tokens"}, "anthropic_messages": {"auto", "max_tokens"}}
                    if output_token_field not in native_fields[fmt]:
                        raise ValueError(f"output_token_field {output_token_field} is invalid for {fmt}")
                    normalized_entry["parameters"] = {"output_token_field": output_token_field}
                formats[fmt] = normalized_entry
            elif isinstance(entry, bool):
                formats[fmt]["enabled"] = entry
            elif isinstance(entry, str):
                formats[fmt] = {"enabled": True, "path": _ensure_path(entry, DEFAULT_FORMAT_PATHS[fmt])}
        out["formats"] = formats
        return formats

    legacy_paths: Dict[str, str] = {}
    for fmt, key in LEGACY_FORMAT_PATH_KEYS.items():
        if out.get(key):
            legacy_paths[fmt] = _ensure_path(out.get(key), DEFAULT_FORMAT_PATHS[fmt])

    if detected_format in SUPPORTED_FORMATS:
        legacy_paths[detected_format] = _ensure_path(detected_path, DEFAULT_FORMAT_PATHS[detected_format])

    if legacy_paths:
        for fmt, path in legacy_paths.items():
            formats[fmt] = {"enabled": True, "path": path}
    else:
        inferred = _infer_default_format(provider_name, out.get("base_url") or "")
        formats[inferred] = {"enabled": True, "path": DEFAULT_FORMAT_PATHS[inferred]}

    out["formats"] = formats
    return formats


def _split_base_and_chat_path(full_url: str) -> Tuple[str, str]:
    """
    将类似:
      https://opencode.ai/zen/go/v1/chat/completions
    拆为:
      base_url=https://opencode.ai/zen/go
      chat_path=/v1/chat/completions

    若无法识别标准 suffix，则回退：
      base_url=scheme://netloc
      chat_path=path
    """
    p = urlparse(full_url)
    if not p.scheme or not p.netloc:
        return "", "/v1/chat/completions"

    base_url, detected_format, detected_path = _split_base_and_format_path(full_url)
    if detected_format:
        return base_url, _ensure_path(detected_path, "/v1/chat/completions")

    path = (p.path or "").rstrip("/")
    if path.endswith("/v1"):
        return full_url.rstrip("/")[:-3].rstrip("/"), "/v1/chat/completions"

    scheme_netloc = f"{p.scheme}://{p.netloc}"
    return scheme_netloc, path if path.startswith("/") else ("/" + path)


def _normalize_provider_entry(name: str, pcfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    允许用户只填写 base_url + keys，并且 base_url 可以是：
      - https://api.xxx.com
      - https://api.xxx.com/v1
      - https://api.xxx.com/v1/chat/completions
    自动补齐/修正：
      - base_url（去掉末尾的 /v1 或 /v1/chat/completions）
      - chat_completions_path（默认 /v1/chat/completions）
      - models_path（默认 /v1/models）
      - headers / enabled
    """
    out = dict(pcfg or {})

    base_url = str(out.get("base_url") or "").strip()
    detected_format: Optional[str] = None
    detected_path: Optional[str] = None
    if base_url:
        # 如果传了完整 endpoint URL，则拆分为 base_url + formats.<format>.path
        b, detected_format, detected_path = _split_base_and_format_path(base_url)
        parsed = urlparse(base_url)
        pth = (parsed.path or "").rstrip("/")

        if detected_format:
            out["base_url"] = b
        elif pth.endswith("/v1"):
            # https://host/.../v1 -> base_url 去掉 /v1
            out["base_url"] = (base_url.rstrip("/")[:-3]).rstrip("/")  # remove trailing '/v1'
        else:
            # 普通 base_url（可能带路径但不带 /v1/chat/completions）
            out["base_url"] = base_url.rstrip("/")

    out.setdefault("models_path", "/v1/models")
    out.setdefault("headers", {"User-Agent": "Mozilla/5.0"})
    out.setdefault("enabled", True)

    keys = out.get("keys")
    out["keys"] = normalize_key_entries(keys)

    formats = _normalize_formats(
        name,
        out,
        detected_format=detected_format,
        detected_path=detected_path,
    )

    # 兼容旧字段：保留 path 入口，实际格式能力以 formats 为准。
    out["chat_completions_path"] = formats["chat_completions"]["path"]
    out["responses_path"] = formats["responses"]["path"]
    out["anthropic_messages_path"] = formats["anthropic_messages"]["path"]

    if not str(out["models_path"]).startswith("/"):
        out["models_path"] = "/" + str(out["models_path"])

    return out


def _normalize_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(cfg)
    out.setdefault("server", {})
    out.setdefault("routing", {})
    out.setdefault("retry", {})
    out.setdefault("models", {})
    out.setdefault("providers", {})
    out.setdefault("observability", {})
    out.setdefault("proxy", {})  # global fallback proxy; provider/key can override it.

    # normalize global proxy: 支持字符串 "http://..." 或 dict {"http":"...","https":"..."}
    out["proxy"] = normalize_proxy_config(out.get("proxy"))

    # normalize providers
    providers = out.get("providers") or {}
    if not isinstance(providers, dict):
        providers = {}
    norm = {}
    for name, pcfg in providers.items():
        if pcfg is None:
            continue
        if not isinstance(pcfg, dict):
            continue
        normalized = _normalize_provider_entry(str(name), pcfg)
        # normalize provider-level proxy (same logic as global)
        normalized["proxy"] = normalize_proxy_config(normalized.get("proxy"))
        norm[str(name)] = normalized
    out["providers"] = norm

    # default provider pool：如果用户没填，默认用 providers 的 key 顺序
    if not (out.get("routing") or {}).get("default_provider_pool"):
        out["routing"]["default_provider_pool"] = list(norm.keys())

    return out


def _default_config() -> Dict[str, Any]:
    return {
        "server": {
            "host": "0.0.0.0",
            "port": 4894,
            "max_workers": 20,
            "log_dir": "proxy_logs",
            "debug_disk_log": False,
            "admin_key": "",
        },
        "routing": {
            "default_provider_pool": ["default"],
            "provider_select": "priority_failover",
            # priority_first (default): provider priority decides global order,
            # same-format (native) only wins ties. native_first: legacy, all
            # native providers precede all fallback providers.
            "format_preference": "priority_first",
            "semantic_conversion": "safe",
            "max_attempts": 6,
            "connect_timeout_s": 15,
            "read_timeout_s": 120,
            "first_token_timeout_s": 30,
            # Bounds for the SSE prelude buffered before client headers are sent.
            # Protects against pathological upstreams that emit infinite
            # comments/keepalives without a data event. 0 disables a bound.
            "stream_prefetch_max_lines": 128,
            "stream_prefetch_max_bytes": 65536,
            "native_nonstream_mode": "validated",
            "native_stream_mode": "guarded",
            "anthropic_default_max_tokens": 4096,
        },
        "retry": {
            "retryable_status": [408, 409, 425, 429, 500, 502, 503, 504],
            "key_fatal_status": [401, 403],
            "same_key_retries": 1,
            "cooldown_s": {
                "rate_limit": 30,
                "server_error": 10,
                "network_error": 10,
                "key_invalid": 3600,
                "quota_or_balance": 3600,
            },
            "key_failure_ladder_s": [10, 60, 3600],
            "credential_failure_ladder_s": [3600, 21600, 86400],
            "compatibility_failure_ladder_s": [10, 60, 3600],
            "failure_policies": {
                "key_invalid": {"cooldown_scope": "key", "cooldown_s": 3600, "disables_key": True},
                "rate_limited": {"cooldown_scope": "key", "cooldown_s": 30, "disables_key": False},
                "quota_or_balance": {"cooldown_scope": "key", "cooldown_s": 3600, "disables_key": False},
                "server_error": {"cooldown_scope": "key", "cooldown_s": 10, "disables_key": False},
                "network_error": {
                    "cooldown_scope": "key",
                    "cooldown_s": 10,
                    "provider_cooldown_s": 0,
                    "disables_key": False,
                },
                "provider_compat": {"cooldown_scope": "none", "cooldown_s": 0, "disables_key": False},
                "empty_visible_output": {"cooldown_scope": "none", "cooldown_s": 0, "disables_key": False},
                "client_error": {"cooldown_scope": "none", "cooldown_s": 0, "disables_key": False},
                "unknown": {"cooldown_scope": "key", "cooldown_s": 10, "disables_key": False},
            },
            "respect_retry_after": True,
            "backoff": {"mode": "exp", "base_s": 2, "max_s": 120},
        },
        "models": {
            "disable_client_model_map": False,
            "client_model_map": {},
            "routes": {},
            "provider_model_map": {},
            "provider_model_variants": {},
            "provider_model_capabilities": {},
            "provider_key_model_capabilities": {},
            "assume_supports_unknown_models": True,
            "models_source": "first_healthy_provider",
        },
        "providers": {
            "default": {
                "base_url": "https://opencode.ai/zen/go",
                "chat_completions_path": "/v1/chat/completions",
                "models_path": "/v1/models",
                "keys": ["your key"],
                "headers": {"User-Agent": "Mozilla/5.0"},
                "enabled": True,
            }
        },
        "observability": {
            "log_level": "info",
            "log_key_mask": {"prefix": 6, "suffix": 2},
            "log_provider_on_each_request": False,
            "native_stream_usage": "full",
            "history": {
                "enabled": True,
                "path": "tmp/proxy_history.sqlite3",
                "retention_days": 30,
            },
            "responses_sessions": {
                "enabled": True,
                "path": "tmp/proxy_sessions.sqlite3",
                "ttl_seconds": 86400,
                "max_records": 10000,
                "max_total_bytes": 268435456,
                "max_record_bytes": 4194304,
                "max_chain_depth": 64,
            },
            "audit": {
                "enabled": True,
                "path": "tmp/admin_audit.jsonl",
                "max_records": 1000,
            },
        },
    }


def _apply_env_overlays(cfg: Dict[str, Any]) -> Dict[str, Any]:
    overlay: Dict[str, Any] = {}

    # ---- common server env ----
    if os.environ.get("PROXY_HOST"):
        overlay = _deep_merge(overlay, {"server": {"host": os.environ["PROXY_HOST"]}})
    if os.environ.get("PROXY_PORT"):
        # NM11: a non-numeric PROXY_PORT used to crash startup with a bare
        # ValueError. Fall back to the default port and warn instead.
        overlay = _deep_merge(overlay, {"server": {"port": _env_int("PROXY_PORT", 4894)}})
    if os.environ.get("PROXY_MAX_WORKERS"):
        overlay = _deep_merge(overlay, {"server": {"max_workers": _env_int("PROXY_MAX_WORKERS", 20)}})
    if os.environ.get("PROXY_LOG_DIR"):
        overlay = _deep_merge(overlay, {"server": {"log_dir": os.environ["PROXY_LOG_DIR"]}})
    if os.environ.get("PROXY_DEBUG"):
        overlay = _deep_merge(
            overlay,
            {"server": {"debug_disk_log": os.environ.get("PROXY_DEBUG", "").lower() in ("true", "1", "yes")}},
        )
    if os.environ.get("PROXY_ADMIN_KEY"):
        overlay = _deep_merge(overlay, {"server": {"admin_key": os.environ.get("PROXY_ADMIN_KEY")}})

    # ---- legacy single-upstream env ----
    upstream_url = os.environ.get("UPSTREAM_URL")
    upstream_key = os.environ.get("UPSTREAM_API_KEY")
    if upstream_url or upstream_key:
        # Convert to a 'default' provider, overriding whatever config.json had.
        base_url, chat_path = _split_base_and_chat_path(upstream_url or cfg["providers"]["default"]["base_url"] + cfg["providers"]["default"]["chat_completions_path"])
        legacy_provider = {
            "default": {
                "base_url": base_url,
                "chat_completions_path": chat_path,
                "models_path": "/v1/models",
                "keys": [upstream_key or cfg["providers"]["default"]["keys"][0]],
                "headers": {"User-Agent": "Mozilla/5.0"},
                "enabled": True,
            }
        }
        overlay = _deep_merge(overlay, {"providers": legacy_provider, "routing": {"default_provider_pool": ["default"]}})

    # ---- MODEL_MAP / DISABLE_MODEL_MAP compatibility ----
    if os.environ.get("DISABLE_MODEL_MAP") is not None:
        overlay = _deep_merge(
            overlay,
            {"models": {"disable_client_model_map": os.environ.get("DISABLE_MODEL_MAP", "").lower() in ("true", "1", "yes")}},
        )
    env_map = os.environ.get("MODEL_MAP")
    if env_map:
        try:
            overlay = _deep_merge(overlay, {"models": {"client_model_map": json.loads(env_map)}})
        except Exception:
            pass

    # ---- structured JSON overlays ----
    providers_json = _json_env("PROXY_PROVIDERS_JSON")
    if isinstance(providers_json, dict):
        overlay = _deep_merge(overlay, {"providers": providers_json})

    routes_json = _json_env("PROXY_MODEL_ROUTES_JSON")
    if isinstance(routes_json, dict):
        overlay = _deep_merge(overlay, {"models": {"routes": routes_json}})

    # ---- per-provider keys override: PROXY_PROVIDER_KEYS__<provider>=["k1","k2"] ----
    for k, v in os.environ.items():
        if not k.startswith("PROXY_PROVIDER_KEYS__"):
            continue
        provider_name = k.split("__", 1)[1]
        try:
            keys_list = json.loads(v)
        except Exception:
            continue
        if isinstance(keys_list, list):
            overlay = _deep_merge(overlay, {"providers": {provider_name: {"keys": keys_list}}})

    return _deep_merge(cfg, overlay)


# ---------------------------------------------------------------------------
# Zero-config: well-known environment variable → provider preset mapping.
# When no config.json exists and the default provider still has a placeholder
# key, the proxy scans os.environ for any of these variables and auto-
# generates provider entries so the user can start the proxy with zero
# configuration file edits.
# ---------------------------------------------------------------------------
PROVIDER_ENV_PRESETS: Dict[str, Dict[str, Any]] = {
    "OPENAI_API_KEY": {
        "name": "openai",
        "base_url": "https://api.openai.com",
        "formats": {"chat_completions": True, "responses": True},
        "priority": 10,
    },
    "ANTHROPIC_API_KEY": {
        "name": "anthropic",
        "base_url": "https://api.anthropic.com",
        "formats": {"anthropic_messages": True},
        "priority": 10,
    },
    "DEEPSEEK_API_KEY": {
        "name": "deepseek",
        "base_url": "https://api.deepseek.com",
        "formats": {"chat_completions": True},
        "priority": 8,
    },
    "GROQ_API_KEY": {
        "name": "groq",
        "base_url": "https://api.groq.com/openai",
        "formats": {"chat_completions": True},
        "priority": 7,
    },
    "OPENROUTER_API_KEY": {
        "name": "openrouter",
        "base_url": "https://openrouter.ai/api",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "MISTRAL_API_KEY": {
        "name": "mistral",
        "base_url": "https://api.mistral.ai",
        "formats": {"chat_completions": True},
        "priority": 7,
    },
    "TOGETHER_AI_API_KEY": {
        "name": "together",
        "base_url": "https://api.together.xyz",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "FIREWORKS_API_KEY": {
        "name": "fireworks",
        "base_url": "https://api.fireworks.ai/inference",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "PERPLEXITY_API_KEY": {
        "name": "perplexity",
        "base_url": "https://api.perplexity.ai",
        "formats": {"chat_completions": True},
        "priority": 5,
    },
    "XAI_API_KEY": {
        "name": "xai",
        "base_url": "https://api.x.ai",
        "formats": {"chat_completions": True},
        "priority": 7,
    },
    "SILICONFLOW_API_KEY": {
        "name": "siliconflow",
        "base_url": "https://api.siliconflow.cn",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "MOONSHOT_API_KEY": {
        "name": "moonshot",
        "base_url": "https://api.moonshot.cn",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "ZHIPUAI_API_KEY": {
        "name": "zhipuai",
        "base_url": "https://open.bigmodel.cn/api/paas",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "DASHSCOPE_API_KEY": {
        "name": "dashscope",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
    "VOLC_API_KEY": {
        "name": "volcengine",
        "base_url": "https://ark.cn-beijing.volces.com/api",
        "formats": {"chat_completions": True},
        "priority": 6,
    },
}

# Reverse lookup: env var name → provider name (for fast membership tests)
_ENV_TO_PROVIDER_NAME = {env: preset["name"] for env, preset in PROVIDER_ENV_PRESETS.items()}


def _is_placeholder_key(key_value: str) -> bool:
    """Check if a key string is the default placeholder."""
    return not key_value or key_value in ("your key", "your-key", "YOUR_KEY", "")


def generate_config_from_env() -> Dict[str, Any]:
    """Scan os.environ for well-known API key variables and generate provider configs.

    Returns a dict with a "providers" key containing all detected providers,
    and a "routing.default_provider_pool" listing them in priority order.
    Returns an empty dict if no known env vars are found.
    """
    detected: list[tuple[str, str, Dict[str, Any]]] = []  # (env_var, key_value, preset)

    for env_var, preset in PROVIDER_ENV_PRESETS.items():
        key_value = os.environ.get(env_var, "").strip()
        if not key_value:
            continue
        detected.append((env_var, key_value, preset))

    if not detected:
        return {}

    providers: Dict[str, Any] = {}
    pool: list[str] = []

    # Sort by priority descending so highest-priority providers come first.
    detected.sort(key=lambda item: item[2].get("priority", 0), reverse=True)

    for env_var, key_value, preset in detected:
        name = preset["name"]
        provider_cfg: Dict[str, Any] = {
            "base_url": preset["base_url"],
            "keys": [key_value],
            "headers": {"User-Agent": "Mozilla/5.0"},
            "enabled": True,
        }
        # Apply format flags
        formats = preset.get("formats") or {}
        for fmt, enabled in formats.items():
            if fmt in SUPPORTED_FORMATS and enabled:
                provider_cfg.setdefault("formats", {})[fmt] = {"enabled": True, "path": DEFAULT_FORMAT_PATHS[fmt]}
        if "priority" in preset:
            provider_cfg["priority"] = preset["priority"]
        providers[name] = provider_cfg
        pool.append(name)

    result: Dict[str, Any] = {"providers": providers}
    if pool:
        result["routing"] = {"default_provider_pool": pool}
    return result


def _has_real_providers(cfg: Dict[str, Any]) -> bool:
    """Check if the config has at least one provider with a non-placeholder key."""
    providers = cfg.get("providers") or {}
    for pcfg in providers.values():
        if not isinstance(pcfg, dict):
            continue
        keys = pcfg.get("keys") or []
        for key in keys:
            kv = key if isinstance(key, str) else (key.get("key") if isinstance(key, dict) else "")
            if not _is_placeholder_key(kv):
                return True
    return False


def _configured_config_path() -> str:
    return os.environ.get("PROXY_CONFIG_PATH") or os.path.join(os.path.dirname(__file__), "config.json")


def _configured_runtime_config_path() -> str:
    return os.environ.get("PROXY_RUNTIME_CONFIG_PATH") or os.path.join(os.path.dirname(__file__), "runtime_config.json")


# Module-level flag: set to True when zero-config providers were injected
# so the startup code can print a helpful banner.
ZERO_CONFIG_ACTIVE: bool = False


def load_base_config(*, apply_env: bool = True) -> Dict[str, Any]:
    global ZERO_CONFIG_ACTIVE
    ZERO_CONFIG_ACTIVE = False
    cfg = _default_config()

    config_path = _configured_config_path()
    config_file_exists = os.path.exists(config_path)

    if config_file_exists:
        try:
            with open(config_path, "r", encoding="utf-8-sig") as f:
                file_cfg = json.load(f)
            if isinstance(file_cfg, dict):
                # 如果用户显式提供 providers，则以文件为准（避免保留 default provider）
                if isinstance(file_cfg.get("providers"), dict):
                    cfg["providers"] = {}
                cfg = _deep_merge(cfg, file_cfg)
        except Exception as e:
            # 配置文件解析失败时，回退到默认配置（保持可启动性），但打印
            # 警告让运维知道配置未加载——否则用户可能带着占位符 key 启动而不自知。
            print(
                f"[config] WARNING: failed to parse {config_path}: "
                f"{type(e).__name__}: {e}; falling back to defaults.",
                flush=True,
            )

    # Zero-config: if no config file exists (or the config still has only
    # the placeholder default provider), scan environment variables for
    # well-known API keys and auto-generate provider entries.
    if not config_file_exists or not _has_real_providers(cfg):
        env_cfg = generate_config_from_env()
        if env_cfg.get("providers"):
            # Replace placeholder default provider with env-detected providers.
            cfg["providers"] = env_cfg["providers"]
            if env_cfg.get("routing", {}).get("default_provider_pool"):
                cfg.setdefault("routing", {})["default_provider_pool"] = env_cfg["routing"]["default_provider_pool"]
            ZERO_CONFIG_ACTIVE = True

    if apply_env:
        cfg = _apply_env_overlays(cfg)
    cfg = _normalize_config(cfg)
    return cfg


def apply_env_overlays(cfg: Dict[str, Any]) -> Dict[str, Any]:
    return _normalize_config(_apply_env_overlays(cfg))


def load_config() -> Dict[str, Any]:
    cfg = load_base_config(apply_env=False)

    runtime_config_path = _configured_runtime_config_path()

    if os.path.exists(runtime_config_path):
        try:
            with open(runtime_config_path, "r", encoding="utf-8-sig") as f:
                runtime_cfg = json.load(f)
            if isinstance(runtime_cfg, dict):
                cfg = _deep_merge(cfg, runtime_cfg)
        except Exception as e:
            print(
                f"[config] WARNING: failed to parse {runtime_config_path}: "
                f"{type(e).__name__}: {e}; ignoring runtime overlay.",
                flush=True,
            )

    return apply_env_overlays(cfg)
