#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

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
) -> Dict[str, Any]:
    """Convert a non-streaming request body between canonical formats."""
    if from_format == to_format:
        return request

    pair = (from_format, to_format)
    if pair == (ANTHROPIC, CHAT):
        return to_openai_request(request, resolve_model=resolve_model)
    if pair == (CHAT, ANTHROPIC):
        return openai_chat_request_to_anthropic_request(request, resolve_model=resolve_model)
    if pair == (RESPONSES, CHAT):
        return responses_to_openai_request(request, resolve_model=resolve_model)
    if pair == (CHAT, RESPONSES):
        return openai_chat_request_to_responses_request(request, resolve_model=resolve_model)

    if pair == (ANTHROPIC, RESPONSES):
        chat_req = to_openai_request(request, resolve_model=resolve_model)
        return openai_chat_request_to_responses_request(chat_req, resolve_model=_identity_model)
    if pair == (RESPONSES, ANTHROPIC):
        chat_req = responses_to_openai_request(request, resolve_model=resolve_model)
        return openai_chat_request_to_anthropic_request(chat_req, resolve_model=_identity_model)

    raise ValueError(f"unsupported request conversion: {from_format} -> {to_format}")


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
