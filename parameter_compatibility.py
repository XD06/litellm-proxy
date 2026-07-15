#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from conversion_core.compatibility import analyze_request as analyze_agent_request


OUTPUT_TOKEN_FIELDS = (
    "max_output_tokens",
    "max_completion_tokens",
    "max_tokens",
    "max_token",
)

_NATIVE_FIELD = {
    "chat_completions": "max_tokens",
    "responses": "max_output_tokens",
    "anthropic_messages": "max_tokens",
}


class ParameterCompatibilityError(ValueError):
    """Raised when common parameter aliases are invalid or contradictory."""

    code = "invalid_output_token_limit"


@dataclass(frozen=True)
class FormatCompatibilityPlan:
    target_format: str
    allowed: bool
    transformations: tuple[Dict[str, Any], ...] = ()
    dropped_hints: tuple[Dict[str, Any], ...] = ()
    blockers: tuple[str, ...] = ()
    fidelity: str = "lossless"

    def as_dict(self) -> Dict[str, Any]:
        return {
            "target_format": self.target_format,
            "allowed": self.allowed,
            "transformations": [dict(item) for item in self.transformations],
            "dropped_hints": [dict(item) for item in self.dropped_hints],
            "blockers": list(self.blockers),
            "fidelity": self.fidelity,
        }


@dataclass(frozen=True)
class OutputTokenLimit:
    value: Optional[int] = None
    source_field: Optional[str] = None
    aliases: tuple[str, ...] = ()

    @property
    def present(self) -> bool:
        return self.value is not None


@dataclass(frozen=True)
class StopSequences:
    value: Optional[tuple[str, ...]] = None
    source_field: Optional[str] = None
    aliases: tuple[str, ...] = ()

    @property
    def present(self) -> bool:
        return self.value is not None


def _positive_integer(field: str, value: Any) -> int:
    # bool is an int subclass and must be rejected explicitly.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ParameterCompatibilityError(f"{field} must be a positive integer")
    return value


def extract_output_token_limit(request: Dict[str, Any], *, client_format: str) -> OutputTokenLimit:
    present = []
    for field in OUTPUT_TOKEN_FIELDS:
        if field in request and request[field] is not None:
            present.append((field, _positive_integer(field, request[field])))

    if not present:
        return OutputTokenLimit()

    values = {value for _, value in present}
    if len(values) != 1:
        details = ", ".join(f"{field}={value}" for field, value in present)
        raise ParameterCompatibilityError(f"conflicting output token limits: {details}")

    preference = {
        "chat_completions": ("max_completion_tokens", "max_tokens", "max_output_tokens", "max_token"),
        "responses": ("max_output_tokens", "max_completion_tokens", "max_tokens", "max_token"),
        "anthropic_messages": ("max_tokens", "max_output_tokens", "max_completion_tokens", "max_token"),
    }.get(client_format, OUTPUT_TOKEN_FIELDS)
    by_name = dict(present)
    source = next((field for field in preference if field in by_name), present[0][0])
    return OutputTokenLimit(value=present[0][1], source_field=source, aliases=tuple(field for field, _ in present))


def output_token_field_for_target(target_format: str, configured_field: Optional[str] = None) -> str:
    configured = str(configured_field or "auto").strip()
    allowed = {"auto", "max_tokens", "max_completion_tokens", "max_output_tokens"}
    if configured not in allowed:
        raise ParameterCompatibilityError(f"invalid output_token_field: {configured}")
    if configured != "auto":
        return configured
    try:
        return _NATIVE_FIELD[target_format]
    except KeyError as exc:
        raise ParameterCompatibilityError(f"unsupported target format: {target_format}") from exc


def extract_stop_sequences(request: Dict[str, Any], *, client_format: str) -> StopSequences:
    present = []
    for field in ("stop", "stop_sequences"):
        if field not in request or request[field] is None:
            continue
        raw = request[field]
        if isinstance(raw, str): values = (raw,)
        elif isinstance(raw, list) and all(isinstance(item, str) for item in raw): values = tuple(raw)
        else: raise ParameterCompatibilityError(f"{field} must be a string or an array of strings")
        if any(not item for item in values): raise ParameterCompatibilityError(f"{field} cannot contain empty strings")
        present.append((field, values))
    if not present: return StopSequences()
    if len({values for _, values in present}) != 1:
        details = ", ".join(f"{field}={list(values)!r}" for field, values in present)
        raise ParameterCompatibilityError(f"conflicting stop sequences: {details}")
    preferred = "stop_sequences" if client_format == "anthropic_messages" else "stop"
    by_name = dict(present)
    source = preferred if preferred in by_name else present[0][0]
    return StopSequences(present[0][1], source, tuple(field for field, _ in present))


def apply_stop_sequences(payload: Dict[str, Any], stop: StopSequences, *, target_format: str) -> Dict[str, Any]:
    out = dict(payload)
    out.pop("stop", None); out.pop("stop_sequences", None)
    if not stop.present: return out
    field = "stop_sequences" if target_format == "anthropic_messages" else "stop"
    values = list(stop.value or ())
    out[field] = values[0] if field == "stop" and len(values) == 1 else values
    return out


_NATIVE_ONLY_FIELDS = {
    "chat_completions": {"response_format", "logprobs", "top_logprobs", "reasoning_effort", "modalities", "audio", "prediction"},
    "responses": {"previous_response_id", "store", "include", "truncation", "background", "prompt", "prompt_cache_key", "reasoning", "text", "parallel_tool_calls"},
    "anthropic_messages": {"thinking", "cache_control", "container", "mcp_servers", "context_management", "output_config", "service_tier"},
}


def native_only_request_parameters(request: Dict[str, Any], *, client_format: str) -> tuple[str, ...]:
    return tuple(sorted(key for key in _NATIVE_ONLY_FIELDS.get(client_format, set()) if key in request))


def incompatible_request_parameters(
    request: Dict[str, Any],
    *,
    client_format: str,
    target_format: str,
) -> tuple[str, ...]:
    """Return request fields whose semantics cannot be preserved for one target."""
    if target_format == client_format:
        return ()

    blockers = set()
    for key in _NATIVE_ONLY_FIELDS.get(client_format, set()):
        if key not in request or request.get(key) is None:
            continue
        if client_format == "responses" and key == "store" and request.get(key) is False:
            continue
        if client_format == "responses" and target_format == "chat_completions" and key == "parallel_tool_calls":
            continue
        blockers.add(key)
    return tuple(sorted(blockers))


def format_compatibility_plan(
    request: Dict[str, Any],
    *,
    client_format: str,
    target_format: str,
    mode: str = "safe",
) -> FormatCompatibilityPlan:
    """Describe how one target format can preserve the request semantics."""
    core = analyze_agent_request(
        client_format,
        target_format,
        request,
        mode=str(mode or "safe").strip().lower(),
    )
    transformations = []
    dropped_hints = []
    for item in core.actions:
        payload = item.as_dict()
        if item.action in ("map", "preserve", "stateful"):
            transformations.append(payload)
        elif item.action == "safe_drop":
            dropped_hints.append(payload)
    return FormatCompatibilityPlan(
        target_format=target_format,
        allowed=core.allowed,
        transformations=tuple(transformations),
        dropped_hints=tuple(dropped_hints),
        blockers=core.blockers,
        fidelity=core.fidelity,
    )


def upstream_format_eligibility(
    request: Dict[str, Any],
    *,
    client_format: str,
    candidate_formats: list[str],
    mode: str = "safe",
) -> tuple[list[str], Dict[str, tuple[str, ...]]]:
    """Return allowed upstream formats and per-format semantic blockers."""
    allowed = []
    blocked: Dict[str, tuple[str, ...]] = {}
    for target_format in candidate_formats:
        plan = format_compatibility_plan(
            request,
            client_format=client_format,
            target_format=target_format,
            mode=mode,
        )
        if plan.blockers:
            blocked[target_format] = plan.blockers
        else:
            allowed.append(target_format)
    return allowed, blocked


def request_compatibility_profile(request: Dict[str, Any], *, client_format: str) -> str:
    """Return a stable, non-content signature for compatibility circuit isolation."""
    features = set()
    if request.get("tools"):
        features.add("tools")
    tool_choice = request.get("tool_choice")
    if tool_choice not in (None, "auto"):
        features.add("forced_tool_choice")
    if any(request.get(key) is not None for key in ("reasoning", "reasoning_effort", "thinking")):
        features.add("reasoning")
    if any(request.get(key) is not None for key in ("response_format", "text", "output_config")):
        features.add("structured_output")
    if request.get("audio") is not None or request.get("modalities"):
        features.add("audio")

    def scan(value: Any) -> None:
        if isinstance(value, dict):
            kind = str(value.get("type") or "")
            if "image" in kind:
                features.add("vision")
            if "audio" in kind:
                features.add("audio")
            for child in value.values():
                scan(child)
        elif isinstance(value, list):
            for child in value:
                scan(child)

    scan(request.get("messages"))
    scan(request.get("input"))
    return "+".join(sorted(features)) or "plain"


def parameter_adaptations(request: Dict[str, Any], *, client_format: str, target_format: str, output_token_field: Optional[str] = None, anthropic_default_max_tokens: Optional[int] = None, semantic_conversion_mode: str = "safe") -> list[Dict[str, Any]]:
    changes = []
    limit = extract_output_token_limit(request, client_format=client_format)
    if limit.present:
        target = output_token_field_for_target(target_format, output_token_field)
        if limit.source_field != target: changes.append({"source": limit.source_field, "target": target, "value": limit.value})
    elif target_format == "anthropic_messages" and anthropic_default_max_tokens:
        changes.append({"source": "proxy_default", "target": "max_tokens", "value": anthropic_default_max_tokens})
    stop = extract_stop_sequences(request, client_format=client_format)
    if stop.present:
        target = "stop_sequences" if target_format == "anthropic_messages" else "stop"
        if stop.source_field != target: changes.append({"source": stop.source_field, "target": target, "value": list(stop.value or ())})
    plan = format_compatibility_plan(
        request,
        client_format=client_format,
        target_format=target_format,
        mode=semantic_conversion_mode,
    )
    changes.extend(dict(item) for item in plan.transformations)
    changes.extend(dict(item) for item in plan.dropped_hints)
    return changes


def apply_output_token_limit(
    payload: Dict[str, Any],
    limit: OutputTokenLimit,
    *,
    target_format: str,
    configured_field: Optional[str] = None,
) -> Dict[str, Any]:
    """Return a copy with exactly one target-format output-token field."""
    out = dict(payload)
    for field in OUTPUT_TOKEN_FIELDS:
        out.pop(field, None)
    if limit.present:
        field = output_token_field_for_target(target_format, configured_field)
        out[field] = limit.value
    return out


def alternate_output_token_payload(
    payload: Dict[str, Any],
    *,
    upstream_format: str,
    status: int,
    error_body: str,
) -> Optional[Dict[str, Any]]:
    """Swap Chat token field once when a 400/422 explicitly rejects it."""
    if upstream_format != "chat_completions" or int(status or 0) not in (400, 422):
        return None
    text = str(error_body or "").lower()
    rejection_markers = ("unsupported", "unknown parameter", "unrecognized", "not supported", "not permitted")
    if not any(marker in text for marker in rejection_markers):
        return None

    if "max_completion_tokens" in payload and "max_completion_tokens" in text:
        old_field, new_field = "max_completion_tokens", "max_tokens"
    elif "max_tokens" in payload and "max_tokens" in text:
        old_field, new_field = "max_tokens", "max_completion_tokens"
    else:
        return None

    retry = dict(payload)
    value = retry.pop(old_field)
    retry[new_field] = value
    return retry
