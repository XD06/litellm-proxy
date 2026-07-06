#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional

VALID_COOLDOWN_SCOPES = ("none", "key", "provider", "key_provider")
MAX_CONFIGURED_COOLDOWN_S = 86400
MAX_PROVIDER_COOLDOWN_S = 300


@dataclass(frozen=True)
class RetryDecision:
    error_type: str
    retryable: bool
    reason: str
    stop_attempts: bool = False
    cooldown_scope: str = "key"
    cooldown_s: Optional[int] = None
    disables_key: bool = False

    def as_dict(self) -> Dict[str, Any]:
        return {
            "error_type": self.error_type,
            "retryable": bool(self.retryable),
            "reason": self.reason,
            "stop_attempts": bool(self.stop_attempts),
            "cooldown_scope": self.cooldown_scope,
            "cooldown_s": self.cooldown_s,
            "disables_key": bool(self.disables_key),
        }


def _cooldown_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    return ((config.get("retry") or {}).get("cooldown_s") or {})


def _cooldown_s(config: Dict[str, Any], name: str, default_s: int) -> int:
    try:
        return _clamp_int(_cooldown_cfg(config).get(name, default_s), default_s, 0, MAX_CONFIGURED_COOLDOWN_S)
    except Exception:
        return default_s


def _clamp_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        out = int(value)
    except Exception:
        out = int(default)
    return max(min_value, min(max_value, out))


def _bool_value(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in ("true", "1", "yes", "on"):
            return True
        if text in ("false", "0", "no", "off"):
            return False
    return bool(default)


def _configured_failure_policy(config: Dict[str, Any], error_type: str) -> Dict[str, Any]:
    raw = ((config.get("retry") or {}).get("failure_policies") or {})
    if not isinstance(raw, dict):
        return {}
    entry = raw.get(error_type)
    return entry if isinstance(entry, dict) else {}


def _apply_failure_policy_override(
    base: Dict[str, Any],
    override: Dict[str, Any],
    *,
    allow_retry_after: bool,
) -> Dict[str, Any]:
    if not override:
        return base

    out = dict(base)
    if "cooldown_scope" in override:
        scope = str(override.get("cooldown_scope") or "").strip()
        if scope in VALID_COOLDOWN_SCOPES:
            out["cooldown_scope"] = scope
    if "cooldown_s" in override and (allow_retry_after or not bool(out.get("used_retry_after"))):
        out["cooldown_s"] = _clamp_int(override.get("cooldown_s"), out.get("cooldown_s", 0), 0, MAX_CONFIGURED_COOLDOWN_S)
    if "provider_cooldown_s" in override:
        out["provider_cooldown_s"] = _clamp_int(
            override.get("provider_cooldown_s"),
            out.get("provider_cooldown_s", 0),
            0,
            MAX_PROVIDER_COOLDOWN_S,
        )
    if "disables_key" in override:
        out["disables_key"] = _bool_value(override.get("disables_key"), bool(out.get("disables_key", False)))

    scope = out.get("cooldown_scope")
    if scope == "none":
        out["cooldown_s"] = 0
        out["provider_cooldown_s"] = 0
        out["disables_key"] = False
    elif scope == "provider":
        out["cooldown_s"] = 0
        out["disables_key"] = False
        if int(out.get("provider_cooldown_s") or 0) <= 0:
            out["provider_cooldown_s"] = min(max(1, int(base.get("cooldown_s") or 1)), 30)
    elif scope == "key":
        out["provider_cooldown_s"] = 0
    elif scope == "key_provider" and int(out.get("provider_cooldown_s") or 0) <= 0:
        out["provider_cooldown_s"] = min(max(1, int(out.get("cooldown_s") or 1)), 30)

    out.pop("used_retry_after", None)
    return out


def failure_policy_for_error_type(
    config: Dict[str, Any],
    error_type: str,
    *,
    retry_after_s: Optional[int] = None,
) -> Dict[str, Any]:
    retry_cfg = config.get("retry", {}) or {}
    error_type = str(error_type or "unknown")
    override = _configured_failure_policy(config, error_type)

    if error_type == "key_invalid":
        cooldown_s = _cooldown_s(config, "key_invalid", 3600)
        base = {
            "error_type": error_type,
            "cooldown_scope": "key",
            "cooldown_s": cooldown_s,
            "disables_key": True,
            "provider_cooldown_s": 0,
        }
        return _apply_failure_policy_override(base, override, allow_retry_after=True)
    if error_type in ("provider_compat", "empty_visible_output"):
        base = {
            "error_type": error_type,
            "cooldown_scope": "none",
            "cooldown_s": 0,
            "disables_key": False,
            "provider_cooldown_s": 0,
        }
        return _apply_failure_policy_override(base, override, allow_retry_after=True)
    if error_type == "rate_limited":
        used_retry_after = False
        if retry_cfg.get("respect_retry_after", True) and retry_after_s is not None:
            # Clamp an upstream-supplied Retry-After to a sane upper bound.
            # Without this a malicious or buggy upstream could send
            # ``Retry-After: 999999999`` and disable a key for ~31 years.
            # MAX_CONFIGURED_COOLDOWN_S (86400s = 24h) is the same cap applied
            # to operator-configured cooldowns.
            cooldown_s = max(0, min(int(retry_after_s), MAX_CONFIGURED_COOLDOWN_S))
            used_retry_after = True
        else:
            cooldown_s = _cooldown_s(config, "rate_limit", 30)
        base = {
            "error_type": error_type,
            "cooldown_scope": "key",
            "cooldown_s": cooldown_s,
            "disables_key": False,
            "provider_cooldown_s": 0,
            "used_retry_after": used_retry_after,
        }
        return _apply_failure_policy_override(base, override, allow_retry_after=False)
    if error_type == "quota_or_balance":
        cooldown_s = _cooldown_s(config, "quota_or_balance", 3600)
        base = {
            "error_type": error_type,
            "cooldown_scope": "key",
            "cooldown_s": cooldown_s,
            "disables_key": False,
            "provider_cooldown_s": 0,
        }
        return _apply_failure_policy_override(base, override, allow_retry_after=True)
    if error_type == "network_error":
        cooldown_s = _cooldown_s(config, "network_error", 10)
        base = {
            "error_type": error_type,
            "cooldown_scope": "key",
            "cooldown_s": cooldown_s,
            "disables_key": False,
            "provider_cooldown_s": 0,
        }
        return _apply_failure_policy_override(base, override, allow_retry_after=True)
    if error_type == "server_error":
        cooldown_s = _cooldown_s(config, "server_error", 10)
        base = {
            "error_type": error_type,
            "cooldown_scope": "key",
            "cooldown_s": cooldown_s,
            "disables_key": False,
            "provider_cooldown_s": 0,
        }
        return _apply_failure_policy_override(base, override, allow_retry_after=True)

    cooldown_s = _cooldown_s(config, "server_error", 10)
    base = {
        "error_type": error_type,
        "cooldown_scope": "key",
        "cooldown_s": cooldown_s,
        "disables_key": False,
        "provider_cooldown_s": 0,
    }
    return _apply_failure_policy_override(base, override, allow_retry_after=True)


def _decision(
    config: Dict[str, Any],
    error_type: str,
    retryable: bool,
    reason: str,
    *,
    stop_attempts: bool = False,
) -> RetryDecision:
    failure_policy = failure_policy_for_error_type(config, error_type)
    return RetryDecision(
        error_type,
        retryable,
        reason,
        stop_attempts=stop_attempts,
        cooldown_scope=failure_policy["cooldown_scope"],
        cooldown_s=failure_policy["cooldown_s"],
        disables_key=failure_policy["disables_key"],
    )


def is_model_not_found_error(error_body: str, model_name: str) -> bool:
    if not model_name:
        return False
    try:
        data = json.loads(error_body)
        err = data.get("error") or {}
        if isinstance(err, dict):
            text = (err.get("message") or err.get("type") or err.get("code") or "").lower()
        else:
            text = str(err).lower()
    except (json.JSONDecodeError, ValueError):
        text = str(error_body or "").lower()
    keywords = [
        "not found",
        "does not exist",
        "not supported",
        "not_found",
        "no model",
        "unavailable",
        "not_found_error",
        "not available",
    ]
    return any(kw in text for kw in keywords)


def is_reasoning_content_error(error_body: str) -> bool:
    try:
        data = json.loads(error_body)
        err = data.get("error") or {}
        msg = (err.get("message") or "") if isinstance(err, dict) else str(err)
    except (json.JSONDecodeError, ValueError):
        msg = str(error_body or "")
    return "reasoning_content" in msg.lower()


def is_tool_choice_unsupported_error(error_body: str) -> bool:
    try:
        data = json.loads(error_body)
        err = data.get("error") or {}
        msg = (err.get("message") or err.get("type") or err.get("code") or "") if isinstance(err, dict) else str(err)
    except (json.JSONDecodeError, ValueError):
        msg = str(error_body or "")
    text = msg.lower().replace("-", "_")
    return "tool_choice" in text and (
        "thinking mode" in text
        or "does not support" in text
        or "not support" in text
        or "not supported" in text
        or "unsupported" in text
    )


def is_thinking_content_required_error(error_body: str) -> bool:
    try:
        data = json.loads(error_body)
        err = data.get("error") or {}
        msg = (err.get("message") or err.get("type") or err.get("code") or "") if isinstance(err, dict) else str(err)
    except (json.JSONDecodeError, ValueError):
        msg = str(error_body or "")
    text = msg.lower().replace("-", "_")
    return (
        ("content[].thinking" in text or "thinking" in text)
        and ("must be passed back" in text or "passed back to the api" in text or "required" in text)
    )


def classify_http_error(
    config: Dict[str, Any],
    status_code: int,
    *,
    error_body: str = "",
    model_name: str = "",
) -> RetryDecision:
    retry_cfg = config.get("retry", {}) or {}
    key_fatal = set(retry_cfg.get("key_fatal_status") or [401, 403])
    retryable_cfg = set(retry_cfg.get("retryable_status") or [])
    status = int(status_code or 0)

    if status in key_fatal:
        return _decision(config, "key_invalid", False, "key_fatal_status", stop_attempts=False)
    if status == 429:
        return _decision(config, "rate_limited", True, "rate_limited")
    if status == 402:
        return _decision(config, "quota_or_balance", True, "quota_or_balance")
    if status in (400, 404):
        if is_tool_choice_unsupported_error(error_body):
            return _decision(config, "provider_compat", True, "tool_choice_unsupported")
        if is_thinking_content_required_error(error_body):
            return _decision(config, "provider_compat", True, "thinking_content_required")
        if is_model_not_found_error(error_body, model_name):
            return _decision(config, "client_error", False, "model_not_found", stop_attempts=True)
        return _decision(config, "server_error", True, "provider_mismatch")
    if status == 422:
        return _decision(config, "client_error", False, "schema_or_client_error", stop_attempts=True)
    if 500 <= status <= 599:
        return _decision(config, "server_error", True, "server_error")
    if status in retryable_cfg:
        return _decision(config, "unknown", True, "configured_retryable_status")
    return _decision(config, "unknown", False, "not_retryable_status", stop_attempts=True)


def classify_transport_error(error_name: str, config: Optional[Dict[str, Any]] = None) -> RetryDecision:
    reason = "timeout" if "timeout" in str(error_name).lower() else "network_error"
    return _decision(config or {}, "network_error", True, reason)


def should_strip_reasoning_content(upstream_format: str, error_body: str) -> bool:
    return upstream_format == "chat_completions" and is_reasoning_content_error(error_body)


def should_downgrade_tool_choice(upstream_format: str, error_body: str) -> bool:
    return upstream_format in ("chat_completions", "responses", "anthropic_messages") and is_tool_choice_unsupported_error(error_body)


def policy_snapshot(config: Dict[str, Any]) -> Dict[str, Any]:
    retry_cfg = config.get("retry", {}) or {}
    routing_cfg = config.get("routing", {}) or {}
    rule_table = _policy_rules(config)
    return {
        "max_attempts": int(routing_cfg.get("max_attempts", 6)),
        "connect_timeout_s": int(routing_cfg.get("connect_timeout_s", 15)),
        "read_timeout_s": int(routing_cfg.get("read_timeout_s", 120)),
        "first_token_timeout_s": int(routing_cfg.get("first_token_timeout_s", 30)),
        "format_preference": str(routing_cfg.get("format_preference", "priority_first")),
        "retryable_status": list(retry_cfg.get("retryable_status") or []),
        "key_fatal_status": list(retry_cfg.get("key_fatal_status") or [401, 403]),
        "same_key_retries": int(retry_cfg.get("same_key_retries", 1) or 0),
        "key_failure_ladder_s": list(retry_cfg.get("key_failure_ladder_s") or [10, 60, 3600]),
        "respect_retry_after": bool(retry_cfg.get("respect_retry_after", True)),
        "cooldown_s": dict(retry_cfg.get("cooldown_s") or {}),
        "failure_policies": {
            error_type: failure_policy_for_error_type(config, error_type)
            for error_type in (
                "key_invalid",
                "rate_limited",
                "quota_or_balance",
                "server_error",
                "network_error",
                "provider_compat",
                "empty_visible_output",
                "client_error",
                "unknown",
            )
        },
        "rule_table": rule_table,
        "rules": {
            "401_403": "key_invalid; cool down/disable key, continue if other attempts exist",
            "429": "rate_limited; respect Retry-After when configured",
            "402": "provider quota/balance; long key cooldown, retry another provider/key",
            "400_404_model_not_found": "client_error; stop attempts",
            "400_tool_choice_unsupported": "provider compatibility; retry once with auto tool_choice, then continue rotation if needed",
            "400_thinking_content_required": "provider compatibility; retry another provider/format without cooling the key",
            "400_404_other": "provider mismatch; retry another provider/key",
            "422": "client_error; stop attempts",
            "5xx": "server_error; retry another provider/key",
            "network_timeout": "network_error; cool current key, then retry another key/provider before response starts",
            "stream_started": "do not transparently switch once bytes were sent to client",
        },
    }


def _policy_rules(config: Dict[str, Any]) -> list:
    return [
        {
            "match": "HTTP 401/403 or configured key_fatal_status",
            "decision": _decision(config, "key_invalid", False, "key_fatal_status").as_dict(),
            "retry_next_attempt": True,
            "notes": "Key is treated as invalid/fatal; other providers or keys may still be attempted.",
        },
        {
            "match": "HTTP 429",
            "decision": _decision(config, "rate_limited", True, "rate_limited").as_dict(),
            "retry_next_attempt": True,
            "notes": "Retry-After overrides configured cooldown when enabled and present.",
        },
        {
            "match": "HTTP 402",
            "decision": _decision(config, "quota_or_balance", True, "quota_or_balance").as_dict(),
            "retry_next_attempt": True,
            "notes": "Quota/balance failures cool the current key for longer than ordinary server errors.",
        },
        {
            "match": "HTTP 400/404 model not found",
            "decision": _decision(config, "client_error", False, "model_not_found", stop_attempts=True).as_dict(),
            "retry_next_attempt": False,
            "notes": "Stops attempts because the requested model is considered invalid for this route.",
        },
        {
            "match": "HTTP 400/404 tool_choice unsupported",
            "decision": _decision(config, "provider_compat", True, "tool_choice_unsupported").as_dict(),
            "retry_next_attempt": True,
            "notes": "The request layer may first retry the same provider once with tool_choice auto.",
        },
        {
            "match": "HTTP 400/404 thinking content required",
            "decision": _decision(config, "provider_compat", True, "thinking_content_required").as_dict(),
            "retry_next_attempt": True,
            "notes": "Some thinking-mode providers reject converted history unless prior thinking blocks are passed back.",
        },
        {
            "match": "HTTP 400/404 other",
            "decision": _decision(config, "server_error", True, "provider_mismatch").as_dict(),
            "retry_next_attempt": True,
            "notes": "Treated as provider mismatch or endpoint incompatibility.",
        },
        {
            "match": "HTTP 422",
            "decision": _decision(config, "client_error", False, "schema_or_client_error", stop_attempts=True).as_dict(),
            "retry_next_attempt": False,
            "notes": "Schema/client parameter errors are not hidden by rotation.",
        },
        {
            "match": "HTTP 5xx",
            "decision": _decision(config, "server_error", True, "server_error").as_dict(),
            "retry_next_attempt": True,
            "notes": "Retries another provider/key before the response starts.",
        },
        {
            "match": "Transport timeout/network error",
            "decision": classify_transport_error("timeout", config).as_dict(),
            "retry_next_attempt": True,
            "notes": "Default handling is key-scoped so sibling keys on the same provider can still be tried.",
        },
        {
            "match": "HTTP 200 empty visible output",
            "decision": _decision(config, "empty_visible_output", True, "empty_visible_output_retry").as_dict(),
            "retry_next_attempt": True,
            "notes": "Only applies to non-streaming responses after conversion; no cooldown is applied.",
        },
        {
            "match": "Duplicate provider/key/format candidate in same request",
            "decision": {
                "error_type": "candidate_duplicate",
                "retryable": False,
                "reason": "request_local_candidate_dedup",
                "stop_attempts": False,
                "cooldown_scope": "none",
                "cooldown_s": 0,
                "disables_key": False,
            },
            "retry_next_attempt": True,
            "notes": "The router skips a candidate already tried in the same client request; max_attempts is an upper bound, not a reason to repeat the same key.",
        },
        {
            "match": "Stream already started",
            "decision": {
                "error_type": "stream_started",
                "retryable": False,
                "reason": "response_already_started",
                "stop_attempts": True,
                "cooldown_scope": "none",
                "cooldown_s": 0,
                "disables_key": False,
            },
            "retry_next_attempt": False,
            "notes": "Once bytes were sent to the client, transparent provider switching is disabled.",
        },
    ]
