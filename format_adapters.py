#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

from conversion_core import (
    ConversionContext,
    ConversionError,
    PreparedRequest,
    ResponsesSessionStore,
    SessionStoreLimits,
    prepare_request as prepare_agent_request,
    translate_response as translate_agent_response,
)
from parameter_compatibility import (
    OutputTokenLimit, ParameterCompatibilityError, apply_output_token_limit,
    apply_stop_sequences, extract_output_token_limit, extract_stop_sequences,
)

CHAT = "chat_completions"
RESPONSES = "responses"
ANTHROPIC = "anthropic_messages"


_SESSION_STORE: Optional[ResponsesSessionStore] = None


def configure_responses_session_store(config: Dict[str, Any]) -> Optional[ResponsesSessionStore]:
    """Configure bounded local state used for cross-format Responses sessions."""
    global _SESSION_STORE
    observability = config.get("observability") or {}
    raw = observability.get("responses_sessions") or {}
    if not isinstance(raw, dict) or not bool(raw.get("enabled", True)):
        _SESSION_STORE = None
        return None
    path = str(raw.get("path") or os.path.join("tmp", "proxy_sessions.sqlite3"))
    if not os.path.isabs(path):
        path = os.path.join(os.path.dirname(__file__), path)

    def positive_int(name: str, default: int) -> int:
        try:
            return max(1, int(raw.get(name, default)))
        except (TypeError, ValueError):
            return default

    limits = SessionStoreLimits(
        ttl_seconds=positive_int("ttl_seconds", 24 * 60 * 60),
        max_records=positive_int("max_records", 10_000),
        max_total_bytes=positive_int("max_total_bytes", 256 * 1024 * 1024),
        max_record_bytes=positive_int("max_record_bytes", 4 * 1024 * 1024),
        max_chain_depth=positive_int("max_chain_depth", 64),
    )
    _SESSION_STORE = ResponsesSessionStore(path, limits=limits)
    _SESSION_STORE.initialize()
    return _SESSION_STORE


def responses_session_store() -> Optional[ResponsesSessionStore]:
    return _SESSION_STORE


def _identity_model(name: str) -> str:
    return name


def _anthropic_reasoning_effort(thinking: Any) -> Optional[str]:
    if not isinstance(thinking, dict) or str(thinking.get("type") or "enabled") == "disabled":
        return None
    explicit = str(thinking.get("effort") or "").strip().lower()
    if explicit in ("low", "medium", "high"):
        return explicit
    try:
        budget = int(thinking.get("budget_tokens") or 0)
    except (TypeError, ValueError):
        budget = 0
    if budget and budget <= 2048:
        return "low"
    if budget and budget > 8192:
        return "high"
    return "medium"


def prepare_request_conversion(
    from_format: str,
    to_format: str,
    request: Dict[str, Any],
    *,
    resolve_model: Callable[[str], str],
    output_token_field: Optional[str] = None,
    anthropic_default_max_tokens: Optional[int] = None,
    semantic_conversion_mode: str = "safe",
    session_store: Optional[ResponsesSessionStore] = None,
) -> PreparedRequest:
    """Prepare a request and retain response-conversion context."""
    token_limit = extract_output_token_limit(request, client_format=from_format)
    stop_sequences = extract_stop_sequences(request, client_format=from_format)
    if from_format == to_format and not token_limit.present and not stop_sequences.present:
        source_request = request
    else:
        source_request = apply_output_token_limit(request, token_limit, target_format=from_format)
        source_request = apply_stop_sequences(source_request, stop_sequences, target_format=from_format)

    try:
        prepared = prepare_agent_request(
            from_format,
            to_format,
            source_request,
            resolve_model=resolve_model,
            mode=semantic_conversion_mode,
            session_store=session_store if session_store is not None else _SESSION_STORE,
        )
    except ConversionError as exc:
        if exc.code == "conversion_blocked":
            raise ParameterCompatibilityError(str(exc)) from exc
        raise
    converted = prepared.payload

    if not token_limit.present and to_format == ANTHROPIC and anthropic_default_max_tokens:
        token_limit = OutputTokenLimit(value=int(anthropic_default_max_tokens), source_field="proxy_default", aliases=())
    if token_limit.present or from_format != to_format:
        converted = apply_output_token_limit(
            converted, token_limit, target_format=to_format, configured_field=output_token_field,
        )
    if stop_sequences.present:
        converted = apply_stop_sequences(converted, stop_sequences, target_format=to_format)

    prepared.payload = converted
    return prepared


def convert_request(
    from_format: str,
    to_format: str,
    request: Dict[str, Any],
    *,
    resolve_model: Callable[[str], str],
    output_token_field: Optional[str] = None,
    anthropic_default_max_tokens: Optional[int] = None,
    semantic_conversion_mode: str = "safe",
    session_store: Optional[ResponsesSessionStore] = None,
) -> Dict[str, Any]:
    """Convert a request while preserving output-token and stop semantics."""
    return prepare_request_conversion(
        from_format,
        to_format,
        request,
        resolve_model=resolve_model,
        output_token_field=output_token_field,
        anthropic_default_max_tokens=anthropic_default_max_tokens,
        semantic_conversion_mode=semantic_conversion_mode,
        session_store=session_store,
    ).payload


def convert_response(
    from_format: str,
    to_format: str,
    response: Dict[str, Any],
    *,
    original_model: Optional[str] = None,
    context: Optional[ConversionContext] = None,
) -> Dict[str, Any]:
    """Convert a non-streaming response body between canonical formats."""
    return translate_agent_response(
        from_format,
        to_format,
        response,
        original_model=original_model,
        context=context,
    )
