#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Callable, Dict, Optional


def to_openai_request(req: Dict[str, Any], *, resolve_model: Callable[[str], str]) -> Dict[str, Any]:
    """Convert an Anthropic Messages request into an OpenAI Chat Completions payload."""
    msgs = []
    system_val = req.get("system", "")
    if isinstance(system_val, list):
        texts = [b.get("text", "") for b in system_val if isinstance(b, dict) and b.get("type") == "text"]
        system_val = "\n".join(texts).strip()
    if system_val:
        msgs.append({"role": "system", "content": system_val})

    raw_messages = req.get("messages", [])

    thinking_mode = False
    for m in raw_messages:
        if m.get("role") != "assistant":
            continue
        if m.get("reasoning_content") is not None:
            thinking_mode = True
            break
        content = m.get("content", "")
        if not isinstance(content, list):
            continue
        for block in content:
            if block.get("type") == "thinking":
                thinking_mode = True
                break
        if thinking_mode:
            break

    for m in raw_messages:
        role = m["role"]
        content = m.get("content", "")

        if isinstance(content, list):
            text_parts, thinking_parts, tool_results, tool_uses = [], [], [], []

            ordered_parts = []

            for block in content:
                btype = block.get("type", "")
                if btype == "text":
                    text_parts.append(block.get("text", ""))
                    ordered_parts.append({"type": "text", "text": block.get("text", "")})
                elif btype == "thinking":
                    thinking_parts.append(block.get("thinking", ""))
                elif btype == "image":
                    img = _anthropic_image_to_openai(block)
                    if img:
                        ordered_parts.append(img)
                elif btype == "tool_result":
                    result_content = block.get("content", "")
                    if isinstance(result_content, list):
                        texts = [
                            cb.get("text", "")
                            for cb in result_content
                            if isinstance(cb, dict) and cb.get("type") == "text"
                        ]
                        result_content = "\n".join(texts)
                    if block.get("is_error"):
                        result_content = f"[ERROR] {result_content}"
                    tool_results.append(
                        {
                            "role": "tool",
                            "tool_call_id": block.get("tool_use_id", ""),
                            "content": result_content,
                        }
                    )
                elif btype == "tool_use":
                    tool_uses.append(
                        {
                            "id": block.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": block.get("name", ""),
                                "arguments": json.dumps(block.get("input", {}), ensure_ascii=False),
                            },
                        }
                    )

            if role == "assistant":
                regular_text = "\n".join(text_parts) if text_parts else ""
                thinking_text = "\n".join(thinking_parts) if thinking_parts else ""
                oa_msg = {"role": "assistant", "content": regular_text}
                if thinking_text:
                    oa_msg["reasoning_content"] = thinking_text
                elif thinking_mode:
                    oa_msg["reasoning_content"] = "."
                if tool_uses:
                    oa_msg["tool_calls"] = tool_uses
                msgs.append(oa_msg)
            elif role == "user" and tool_results:
                msgs.extend(tool_results)
                all_text = text_parts + thinking_parts
                has_images = any(p["type"] == "image_url" for p in ordered_parts)
                if has_images:
                    if ordered_parts:
                        msgs.append({"role": "user", "content": ordered_parts})
                elif all_text:
                    msgs.append({"role": "user", "content": "\n".join(all_text)})
            else:
                has_images = any(p["type"] == "image_url" for p in ordered_parts)
                if has_images:
                    msgs.append({"role": role, "content": ordered_parts})
                else:
                    all_text = text_parts + thinking_parts
                    combined = "\n".join(all_text) if all_text else ""
                    msgs.append({"role": role, "content": combined if combined else ""})
        else:
            oa_msg = {"role": role, "content": m.get("content") or ""}
            if role == "assistant" and m.get("reasoning_content") is not None:
                oa_msg["reasoning_content"] = m["reasoning_content"]
            elif role == "assistant" and thinking_mode:
                oa_msg["reasoning_content"] = "."
            if role == "assistant" and "tool_calls" in m:
                oa_msg["tool_calls"] = m["tool_calls"]
            msgs.append(oa_msg)

    upstream_model = resolve_model(req.get("model", "deepseek-v4-flash"))
    payload = {
        "model": upstream_model,
        "messages": msgs,
        "max_tokens": req.get("max_tokens", 8192),
        "stream": False,
    }
    if "temperature" in req:
        payload["temperature"] = req["temperature"]
    if "top_p" in req:
        payload["top_p"] = req["top_p"]
    if "stop_sequences" in req:
        payload["stop"] = req["stop_sequences"]

    tools = req.get("tools")
    if tools:
        oai_tools = []
        for t in tools:
            oai_tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("input_schema", {}),
                    },
                }
            )
        payload["tools"] = oai_tools

    tc = req.get("tool_choice")
    if tc:
        tc_type = tc.get("type", "auto")
        if tc_type == "any":
            payload["tool_choice"] = "auto"
        elif tc_type == "none":
            payload["tool_choice"] = "none"
        elif tc_type == "tool":
            payload["tool_choice"] = {"type": "function", "function": {"name": tc.get("name", "")}}

    return {k: v for k, v in payload.items() if v is not None}


def to_anthropic_message(upstream_resp: Dict[str, Any], original_model: Optional[str] = None) -> Dict[str, Any]:
    """Convert a full OpenAI Chat Completions response into an Anthropic message."""
    choice = upstream_resp["choices"][0]
    msg = choice["message"]
    content = []

    reasoning = msg.get("reasoning_content", "")
    text = msg.get("content", "")
    if reasoning and reasoning.strip():
        content.append(
            {
                "type": "thinking",
                "thinking": reasoning.strip(),
                "signature": uuid.uuid4().hex,
            }
        )
    if text and text.strip():
        content.append({"type": "text", "text": text.strip()})

    for tc in msg.get("tool_calls") or []:
        fn = tc.get("function", {})
        try:
            args = json.loads(fn.get("arguments", "{}"))
        except json.JSONDecodeError:
            args = {}
        content.append(
            {
                "type": "tool_use",
                "id": tc.get("id", f"call_{uuid.uuid4().hex[:24]}"),
                "name": fn.get("name", "unknown"),
                "input": args,
            }
        )

    usg = upstream_resp.get("usage", {})
    reason_map = {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens"}
    return {
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "role": "assistant",
        "content": content,
        "model": original_model or upstream_resp.get("model", "unknown"),
        "stop_reason": reason_map.get(choice.get("finish_reason"), choice.get("finish_reason")),
        "stop_sequence": None,
        "usage": {
            "input_tokens": usg.get("prompt_tokens", 0),
            "output_tokens": usg.get("completion_tokens", 0),
        },
    }


def _anthropic_image_to_openai(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert an Anthropic image block to an OpenAI image_url content part."""
    source = block.get("source") or {}
    src_type = str(source.get("type") or "")
    if src_type == "url":
        url = str(source.get("url") or "")
        if not url:
            return None
        return {"type": "image_url", "image_url": {"url": url}}
    if src_type == "base64":
        media_type = str(source.get("media_type") or "image/png")
        data = str(source.get("data") or "")
        if not data:
            return None
        return {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{data}"}}
    return None


def _openai_image_to_anthropic(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert an OpenAI image_url content part to an Anthropic image block."""
    url = ""
    image_url = block.get("image_url")
    if isinstance(image_url, dict):
        url = str(image_url.get("url") or "")
    elif isinstance(image_url, str):
        url = image_url
    if not url:
        return None
    # data:image/png;base64,...
    if url.startswith("data:"):
        header, _, data = url.partition(",")
        # header: data:<media_type>;base64
        media_type = "image/png"
        if ";" in header and "/" in header:
            media_type = header.split(":")[1].split(";")[0] if ":" in header else "image/png"
        return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}
    return {"type": "image", "source": {"type": "url", "url": url}}


def _openai_image_to_responses(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert an OpenAI image_url content part to a Responses input_image item."""
    url = ""
    image_url = block.get("image_url")
    if isinstance(image_url, dict):
        url = str(image_url.get("url") or "")
    elif isinstance(image_url, str):
        url = image_url
    if not url:
        return None
    return {"type": "input_image", "image_url": url}


def _responses_image_to_openai(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert a Responses input_image item to an OpenAI image_url content part."""
    url = str(block.get("image_url") or "")
    if not url:
        return None
    return {"type": "image_url", "image_url": {"url": url}}


def _has_openai_image_content(content: Any) -> bool:
    """Check if OpenAI chat content list contains image_url blocks."""
    if not isinstance(content, list):
        return False
    return any(isinstance(b, dict) and b.get("type") == "image_url" for b in content)


def _openai_content_parts_with_images(content: Any) -> list:
    """Convert OpenAI chat content list to parts, preserving images.
    Returns a list of content parts (text + image_url), or empty list."""
    parts = []
    if not isinstance(content, list):
        text = _chat_content_to_text(content)
        if text:
            parts.append({"type": "text", "text": text})
        return parts
    for block in content:
        if not isinstance(block, dict):
            if isinstance(block, str) and block:
                parts.append({"type": "text", "text": block})
            continue
        btype = block.get("type")
        if btype == "text":
            text = str(block.get("text") or "")
            if text:
                parts.append({"type": "text", "text": text})
        elif btype == "image_url":
            img = _openai_image_to_anthropic(block)
            if img:
                parts.append(img)
    return parts


def _responses_content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
                continue
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype in ("input_text", "output_text", "text"):
                parts.append(str(block.get("text", "")))
            elif "text" in block:
                parts.append(str(block.get("text", "")))
        return "\n".join([p for p in parts if p])
    if isinstance(content, dict):
        return _responses_content_to_text([content])
    return str(content)


def _responses_reasoning_to_text(item: Dict[str, Any]) -> str:
    for key in ("summary", "content", "text"):
        text = _responses_content_to_text(item.get(key))
        if text:
            return text
    return ""


def _responses_input_item_to_chat_messages(item: Any) -> list:
    if isinstance(item, str):
        return [{"role": "user", "content": item}]
    if not isinstance(item, dict):
        return []

    item_type = item.get("type")
    if item_type == "reasoning":
        reasoning = _responses_reasoning_to_text(item)
        if reasoning:
            return [{"role": "assistant", "content": "", "reasoning_content": reasoning}]
        return []

    if item_type == "function_call_output":
        return [
            {
                "role": "tool",
                "tool_call_id": item.get("call_id") or item.get("id") or "",
                "content": _responses_content_to_text(item.get("output")),
            }
        ]

    if item_type == "function_call":
        call_id = item.get("call_id") or item.get("id") or f"call_{uuid.uuid4().hex[:24]}"
        return [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {
                            "name": item.get("name", ""),
                            "arguments": item.get("arguments", "{}"),
                        },
                    }
                ],
            }
        ]

    role = item.get("role")
    if role:
        if role == "developer":
            role = "system"
        raw_content = item.get("content")
        # Check if content contains image blocks
        has_images = False
        if isinstance(raw_content, list):
            for cb in raw_content:
                if isinstance(cb, dict) and cb.get("type") == "input_image":
                    has_images = True
                    break
        if has_images:
            content_parts = []
            for cb in raw_content:
                if not isinstance(cb, dict):
                    if isinstance(cb, str) and cb:
                        content_parts.append({"type": "text", "text": cb})
                    continue
                ctype = cb.get("type")
                if ctype in ("input_text", "output_text", "text"):
                    text = str(cb.get("text") or "")
                    if text:
                        content_parts.append({"type": "text", "text": text})
                elif ctype == "input_image":
                    img = _responses_image_to_openai(cb)
                    if img:
                        content_parts.append(img)
            if content_parts:
                return [{"role": role, "content": content_parts}]
            return []
        content = _responses_content_to_text(raw_content)
        if content or role in ("assistant", "tool"):
            return [{"role": role, "content": content}]

    return []


def _responses_tool_to_chat_tool(tool: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(tool, dict):
        return None
    if tool.get("type") != "function":
        return tool

    if isinstance(tool.get("function"), dict):
        fn = dict(tool.get("function") or {})
        if "strict" not in fn and "strict" in tool:
            fn["strict"] = tool.get("strict")
        return {"type": "function", "function": fn}

    fn = {
        "name": tool.get("name", ""),
        "description": tool.get("description", ""),
        "parameters": tool.get("parameters", {}),
    }
    if "strict" in tool:
        fn["strict"] = tool.get("strict")
    return {"type": "function", "function": fn}


def _responses_tool_choice_to_chat(tool_choice: Any) -> Any:
    if not isinstance(tool_choice, dict):
        return tool_choice
    if tool_choice.get("type") == "function" and "function" not in tool_choice:
        return {"type": "function", "function": {"name": tool_choice.get("name", "")}}
    return tool_choice


def responses_to_openai_request(req: Dict[str, Any], *, resolve_model: Callable[[str], str]) -> Dict[str, Any]:
    """Convert an OpenAI Responses request into an OpenAI Chat Completions payload."""
    messages = []

    instructions = _responses_content_to_text(req.get("instructions"))
    if instructions:
        messages.append({"role": "system", "content": instructions})

    input_value = req.get("input", "")
    if isinstance(input_value, list):
        for item in input_value:
            messages.extend(_responses_input_item_to_chat_messages(item))
    else:
        messages.extend(_responses_input_item_to_chat_messages(input_value))

    payload: Dict[str, Any] = {
        "model": resolve_model(req.get("model", "")),
        "messages": messages,
        "stream": bool(req.get("stream", False)),
    }

    if "max_output_tokens" in req:
        payload["max_tokens"] = req["max_output_tokens"]
    elif "max_tokens" in req:
        payload["max_tokens"] = req["max_tokens"]

    for key in ("temperature", "top_p", "presence_penalty", "frequency_penalty", "seed"):
        if key in req:
            payload[key] = req[key]

    if "stop" in req:
        payload["stop"] = req["stop"]

    if "tool_choice" in req:
        payload["tool_choice"] = _responses_tool_choice_to_chat(req["tool_choice"])

    tools = req.get("tools") or []
    if tools:
        chat_tools = []
        for tool in tools:
            chat_tool = _responses_tool_to_chat_tool(tool)
            if chat_tool:
                chat_tools.append(chat_tool)
        if chat_tools:
            payload["tools"] = chat_tools

    return {k: v for k, v in payload.items() if v is not None}


def openai_chat_response_to_responses_response(
    upstream_resp: Dict[str, Any],
    original_model: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert a full OpenAI Chat Completions response into an OpenAI Responses response."""
    choices = upstream_resp.get("choices") or []
    choice = choices[0] if choices else {}
    msg = choice.get("message") or {}
    reasoning = str(msg.get("reasoning_content") or "").strip()
    text = msg.get("content") or ""
    output = []

    if reasoning:
        output.append(
            {
                "id": f"rs_{uuid.uuid4().hex[:24]}",
                "type": "reasoning",
                "status": "completed",
                "summary": [{"type": "summary_text", "text": reasoning}],
            }
        )

    if text:
        output.append(
            {
                "id": f"msg_{uuid.uuid4().hex[:24]}",
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": text, "annotations": []}],
            }
        )

    for tc in msg.get("tool_calls") or []:
        fn = tc.get("function") or {}
        output.append(
            {
                "id": f"fc_{uuid.uuid4().hex[:24]}",
                "type": "function_call",
                "status": "completed",
                "call_id": tc.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                "name": fn.get("name", ""),
                "arguments": fn.get("arguments", "{}"),
            }
        )

    usage = upstream_resp.get("usage") or {}
    input_tokens = usage.get("prompt_tokens", usage.get("input_tokens", 0))
    output_tokens = usage.get("completion_tokens", usage.get("output_tokens", 0))
    total_tokens = usage.get("total_tokens", input_tokens + output_tokens)

    finish_reason = choice.get("finish_reason")
    status = "incomplete" if finish_reason == "length" else "completed"

    return {
        "id": f"resp_{uuid.uuid4().hex[:24]}",
        "object": "response",
        "created_at": int(time.time()),
        "status": status,
        "model": original_model or upstream_resp.get("model", "unknown"),
        "output": output,
        "output_text": text or "",
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
        },
    }


def _chat_content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if "text" in block:
                    parts.append(str(block.get("text", "")))
                elif "content" in block:
                    parts.append(_chat_content_to_text(block.get("content")))
        return "\n".join([p for p in parts if p])
    return str(content)


def _openai_tool_to_anthropic_tool(tool: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(tool, dict):
        return None
    if tool.get("type") == "function":
        fn = tool.get("function") or {}
        return {
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {}),
        }
    return None


def _append_anthropic_assistant_message(messages: list, blocks: list) -> None:
    content = blocks if blocks else ""
    if (
        messages
        and messages[-1].get("role") == "assistant"
        and isinstance(messages[-1].get("content"), list)
        and isinstance(content, list)
        and content
        and all(isinstance(block, dict) and block.get("type") == "tool_use" for block in content)
    ):
        messages[-1]["content"].extend(content)
        return
    messages.append({"role": "assistant", "content": content})


def openai_chat_request_to_anthropic_request(
    req: Dict[str, Any],
    *,
    resolve_model: Callable[[str], str],
) -> Dict[str, Any]:
    """Convert an OpenAI Chat Completions request into an Anthropic Messages request."""
    system_parts = []
    messages = []

    for msg in req.get("messages") or []:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role in ("system", "developer"):
            text = _chat_content_to_text(msg.get("content"))
            if text:
                system_parts.append(text)
            continue

        if role == "tool":
            tool_result = {
                "type": "tool_result",
                "tool_use_id": msg.get("tool_call_id", ""),
                "content": _chat_content_to_text(msg.get("content")),
            }
            if (
                messages
                and messages[-1].get("role") == "user"
                and isinstance(messages[-1].get("content"), list)
                and all(isinstance(block, dict) and block.get("type") == "tool_result" for block in messages[-1]["content"])
            ):
                messages[-1]["content"].append(tool_result)
            else:
                messages.append({"role": "user", "content": [tool_result]})
            continue

        if role == "assistant":
            blocks = []
            reasoning = msg.get("reasoning_content")
            if reasoning:
                blocks.append({"type": "thinking", "thinking": str(reasoning)})
            text = _chat_content_to_text(msg.get("content"))
            if text:
                blocks.append({"type": "text", "text": text})
            for tc in msg.get("tool_calls") or []:
                fn = tc.get("function") or {}
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except (json.JSONDecodeError, TypeError):
                    args = {}
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": tc.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                        "name": fn.get("name", ""),
                        "input": args,
                    }
                )
            _append_anthropic_assistant_message(messages, blocks)
            continue

        if role == "user":
            raw_content = msg.get("content")
            if _has_openai_image_content(raw_content):
                blocks = _openai_content_parts_with_images(raw_content)
                messages.append({"role": "user", "content": blocks if blocks else ""})
            else:
                messages.append({"role": "user", "content": _chat_content_to_text(raw_content)})

    payload: Dict[str, Any] = {
        "model": resolve_model(req.get("model", "")),
        "messages": messages,
        "max_tokens": req.get("max_tokens", req.get("max_output_tokens", 8192)),
        "stream": bool(req.get("stream", False)),
    }

    if system_parts:
        payload["system"] = "\n".join(system_parts)
    if "temperature" in req:
        payload["temperature"] = req["temperature"]
    if "top_p" in req:
        payload["top_p"] = req["top_p"]
    if "stop" in req:
        payload["stop_sequences"] = req["stop"]

    tools = []
    for tool in req.get("tools") or []:
        converted = _openai_tool_to_anthropic_tool(tool)
        if converted:
            tools.append(converted)
    if tools:
        payload["tools"] = tools

    tc = req.get("tool_choice")
    if isinstance(tc, str):
        if tc in ("auto", "any", "none"):
            payload["tool_choice"] = {"type": tc}
    elif isinstance(tc, dict):
        if tc.get("type") == "function":
            payload["tool_choice"] = {"type": "tool", "name": ((tc.get("function") or {}).get("name") or "")}
        elif tc.get("type"):
            payload["tool_choice"] = tc

    return {k: v for k, v in payload.items() if v is not None}


def anthropic_message_to_openai_chat_response(
    upstream_resp: Dict[str, Any],
    original_model: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert an Anthropic Messages response into an OpenAI Chat Completions response."""
    text_parts = []
    thinking_parts = []
    tool_calls = []

    for block in upstream_resp.get("content") or []:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            text_parts.append(str(block.get("text", "")))
        elif btype == "thinking":
            thinking_parts.append(str(block.get("thinking", "")))
        elif btype == "tool_use":
            tool_calls.append(
                {
                    "id": block.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                    "type": "function",
                    "function": {
                        "name": block.get("name", ""),
                        "arguments": json.dumps(block.get("input") or {}, ensure_ascii=False),
                    },
                }
            )

    message: Dict[str, Any] = {"role": "assistant", "content": "\n".join([p for p in text_parts if p])}
    reasoning = "\n".join([p for p in thinking_parts if p])
    if reasoning:
        message["reasoning_content"] = reasoning
    if tool_calls:
        message["tool_calls"] = tool_calls

    stop_map = {"end_turn": "stop", "tool_use": "tool_calls", "max_tokens": "length", "stop_sequence": "stop"}
    usage = upstream_resp.get("usage") or {}
    prompt_tokens = usage.get("input_tokens", 0)
    completion_tokens = usage.get("output_tokens", 0)

    return {
        "id": f"chatcmpl_{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": original_model or upstream_resp.get("model", "unknown"),
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": stop_map.get(upstream_resp.get("stop_reason"), upstream_resp.get("stop_reason") or "stop"),
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def openai_chat_request_to_responses_request(
    req: Dict[str, Any],
    *,
    resolve_model: Callable[[str], str],
) -> Dict[str, Any]:
    """Convert an OpenAI Chat Completions request into an OpenAI Responses request."""
    instructions = []
    input_items = []

    for msg in req.get("messages") or []:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        text = _chat_content_to_text(msg.get("content"))
        if role in ("system", "developer"):
            if text:
                instructions.append(text)
            continue
        if role == "tool":
            input_items.append(
                {
                    "type": "function_call_output",
                    "call_id": msg.get("tool_call_id", ""),
                    "output": text,
                }
            )
            continue
        if role == "assistant":
            if text:
                input_items.append({"role": "assistant", "content": [{"type": "output_text", "text": text}]})
            for tc in msg.get("tool_calls") or []:
                fn = tc.get("function") or {}
                input_items.append(
                    {
                        "type": "function_call",
                        "call_id": tc.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                        "name": fn.get("name", ""),
                        "arguments": fn.get("arguments", "{}"),
                    }
                )
            continue
        if role == "user":
            raw_content = msg.get("content")
            if _has_openai_image_content(raw_content):
                content_parts = []
                if isinstance(raw_content, list):
                    for block in raw_content:
                        if not isinstance(block, dict):
                            if isinstance(block, str) and block:
                                content_parts.append({"type": "input_text", "text": block})
                            continue
                        btype = block.get("type")
                        if btype == "text":
                            text = str(block.get("text") or "")
                            if text:
                                content_parts.append({"type": "input_text", "text": text})
                        elif btype == "image_url":
                            img = _openai_image_to_responses(block)
                            if img:
                                content_parts.append(img)
                if content_parts:
                    input_items.append({"role": "user", "content": content_parts})
                else:
                    input_items.append({"role": "user", "content": [{"type": "input_text", "text": ""}]})
            else:
                input_items.append({"role": "user", "content": [{"type": "input_text", "text": text}]})

    payload: Dict[str, Any] = {
        "model": resolve_model(req.get("model", "")),
        "input": input_items,
        "stream": bool(req.get("stream", False)),
    }

    if instructions:
        payload["instructions"] = "\n".join(instructions)
    if "max_tokens" in req:
        payload["max_output_tokens"] = req["max_tokens"]
    elif "max_output_tokens" in req:
        payload["max_output_tokens"] = req["max_output_tokens"]

    for key in ("temperature", "top_p", "presence_penalty", "frequency_penalty", "seed"):
        if key in req:
            payload[key] = req[key]
    if "stop" in req:
        payload["stop"] = req["stop"]
    if "tool_choice" in req:
        payload["tool_choice"] = req["tool_choice"]

    tools = []
    for tool in req.get("tools") or []:
        if not isinstance(tool, dict):
            continue
        if tool.get("type") == "function":
            fn = tool.get("function") or {}
            tools.append(
                {
                    "type": "function",
                    "name": fn.get("name", ""),
                    "description": fn.get("description", ""),
                    "parameters": fn.get("parameters", {}),
                }
            )
        else:
            tools.append(tool)
    if tools:
        payload["tools"] = tools

    return {k: v for k, v in payload.items() if v is not None}


def responses_response_to_openai_chat_response(
    upstream_resp: Dict[str, Any],
    original_model: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert an OpenAI Responses response into an OpenAI Chat Completions response."""
    text_parts = []
    reasoning_parts = []
    tool_calls = []

    for item in upstream_resp.get("output") or []:
        if not isinstance(item, dict):
            continue
        itype = item.get("type")
        if itype == "message":
            text = _responses_content_to_text(item.get("content"))
            if text:
                text_parts.append(text)
        elif itype == "reasoning":
            reasoning = _responses_reasoning_to_text(item)
            if reasoning:
                reasoning_parts.append(reasoning)
        elif itype == "function_call":
            tool_calls.append(
                {
                    "id": item.get("call_id") or item.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                    "type": "function",
                    "function": {
                        "name": item.get("name", ""),
                        "arguments": item.get("arguments", "{}"),
                    },
                }
            )

    if not text_parts and upstream_resp.get("output_text"):
        text_parts.append(str(upstream_resp.get("output_text")))

    message: Dict[str, Any] = {"role": "assistant", "content": "\n".join([p for p in text_parts if p])}
    reasoning_text = "\n".join([p for p in reasoning_parts if p])
    if reasoning_text:
        message["reasoning_content"] = reasoning_text
    if tool_calls:
        message["tool_calls"] = tool_calls

    usage = upstream_resp.get("usage") or {}
    prompt_tokens = usage.get("input_tokens", usage.get("prompt_tokens", 0))
    completion_tokens = usage.get("output_tokens", usage.get("completion_tokens", 0))
    total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)
    finish_reason = "tool_calls" if tool_calls else ("length" if upstream_resp.get("status") == "incomplete" else "stop")

    return {
        "id": f"chatcmpl_{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": original_model or upstream_resp.get("model", "unknown"),
        "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
    }
