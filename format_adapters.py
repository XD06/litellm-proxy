#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from parameter_compatibility import (
    OutputTokenLimit, apply_output_token_limit, apply_stop_sequences,
    extract_output_token_limit, extract_stop_sequences,
)
from protocol_adapters import (
    anthropic_message_to_openai_chat_response,
    openai_chat_request_to_anthropic_request,
    openai_chat_request_to_responses_request,
    openai_chat_response_to_responses_response,
    responses_response_to_openai_chat_response,
    responses_to_openai_request,
    to_anthropic_message,
    to_openai_request,
)

CHAT = "chat_completions"
RESPONSES = "responses"
ANTHROPIC = "anthropic_messages"


def _identity_model(name: str) -> str:
    return name


def convert_request(
    from_format: str,
    to_format: str,
    request: Dict[str, Any],
    *,
    resolve_model: Callable[[str], str],
    output_token_field: Optional[str] = None,
    anthropic_default_max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Convert a request while preserving its output-token limit semantics."""
    token_limit = extract_output_token_limit(request, client_format=from_format)
    stop_sequences = extract_stop_sequences(request, client_format=from_format)
    if from_format == to_format and not token_limit.present and not stop_sequences.present:
        return request
    source_request = apply_output_token_limit(request, token_limit, target_format=from_format)
    source_request = apply_stop_sequences(source_request, stop_sequences, target_format=from_format)

    if from_format == to_format:
        converted = source_request
    else:
        pair = (from_format, to_format)
        if pair == (ANTHROPIC, CHAT):
            converted = to_openai_request(source_request, resolve_model=resolve_model)
        elif pair == (CHAT, ANTHROPIC):
            converted = openai_chat_request_to_anthropic_request(source_request, resolve_model=resolve_model)
        elif pair == (RESPONSES, CHAT):
            converted = responses_to_openai_request(source_request, resolve_model=resolve_model)
        elif pair == (CHAT, RESPONSES):
            converted = openai_chat_request_to_responses_request(source_request, resolve_model=resolve_model)
        elif pair == (ANTHROPIC, RESPONSES):
            chat_req = to_openai_request(source_request, resolve_model=resolve_model)
            converted = openai_chat_request_to_responses_request(chat_req, resolve_model=_identity_model)
        elif pair == (RESPONSES, ANTHROPIC):
            chat_req = responses_to_openai_request(source_request, resolve_model=resolve_model)
            converted = openai_chat_request_to_anthropic_request(chat_req, resolve_model=_identity_model)
        else:
            raise ValueError(f"unsupported request conversion: {from_format} -> {to_format}")

    if not token_limit.present and to_format == ANTHROPIC and anthropic_default_max_tokens:
        token_limit = OutputTokenLimit(value=int(anthropic_default_max_tokens), source_field="proxy_default", aliases=())
    converted = apply_output_token_limit(
        converted, token_limit, target_format=to_format, configured_field=output_token_field,
    )
    return apply_stop_sequences(converted, stop_sequences, target_format=to_format)


def convert_response(
    from_format: str,
    to_format: str,
    response: Dict[str, Any],
    *,
    original_model: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert a non-streaming response body between canonical formats."""
    if from_format == to_format:
        return response

    pair = (from_format, to_format)
    if pair == (CHAT, ANTHROPIC):
        return to_anthropic_message(response, original_model=original_model)
    if pair == (ANTHROPIC, CHAT):
        return anthropic_message_to_openai_chat_response(response, original_model=original_model)
    if pair == (CHAT, RESPONSES):
        return openai_chat_response_to_responses_response(response, original_model=original_model)
    if pair == (RESPONSES, CHAT):
        return responses_response_to_openai_chat_response(response, original_model=original_model)

    if pair == (ANTHROPIC, RESPONSES):
        chat_resp = anthropic_message_to_openai_chat_response(response, original_model=original_model)
        return openai_chat_response_to_responses_response(chat_resp, original_model=original_model)
    if pair == (RESPONSES, ANTHROPIC):
        chat_resp = responses_response_to_openai_chat_response(response, original_model=original_model)
        return to_anthropic_message(chat_resp, original_model=original_model)

    raise ValueError(f"unsupported response conversion: {from_format} -> {to_format}")
