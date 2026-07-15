from __future__ import annotations

import time
from typing import Any, Dict, List

from ..common import (
    content_text,
    json_dumps,
    new_id,
    normalize_stop,
    normalize_tool_schema,
    reasoning_text,
    text_block,
    unwrap_custom_tool_arguments,
)
from ..model import (
    RESPONSES,
    AgentRequest,
    AgentResponse,
    AgentTool,
    AgentToolChoice,
    AgentTurn,
    ContentBlock,
    ConversionContext,
    ConversionReport,
    Usage,
)


def _append_turn(turns: List[AgentTurn], role: str, blocks: List[ContentBlock], *, item_id: str = "", status: str = "") -> None:
    if not blocks:
        return
    if turns and turns[-1].role == role and not item_id and not turns[-1].item_id:
        turns[-1].content.extend(blocks)
        return
    turns.append(AgentTurn(role=role, content=blocks, item_id=item_id, status=status))


def _message_content(blocks: Any, *, role: str) -> List[ContentBlock]:
    if isinstance(blocks, str):
        return [text_block(blocks, source_format=RESPONSES)] if blocks else []
    if isinstance(blocks, dict):
        blocks = [blocks]
    if not isinstance(blocks, list):
        return []
    out: List[ContentBlock] = []
    for block in blocks:
        if isinstance(block, str):
            out.append(text_block(block, source_format=RESPONSES))
            continue
        if not isinstance(block, dict):
            continue
        kind = str(block.get("type") or "")
        if kind in ("input_text", "output_text", "text"):
            out.append(text_block(block.get("text"), source_format=RESPONSES))
        elif kind in ("input_image", "output_image"):
            out.append(
                ContentBlock(
                    kind="image",
                    url=str(block.get("image_url") or ""),
                    file_id=str(block.get("file_id") or ""),
                    detail=str(block.get("detail") or ""),
                    source_format=RESPONSES,
                    raw=dict(block),
                )
            )
        elif kind in ("input_file", "output_file"):
            out.append(
                ContentBlock(
                    kind="file",
                    file_id=str(block.get("file_id") or ""),
                    file_url=str(block.get("file_url") or ""),
                    data=str(block.get("file_data") or ""),
                    filename=str(block.get("filename") or ""),
                    source_format=RESPONSES,
                    raw=dict(block),
                )
            )
        elif kind in ("refusal", "input_refusal"):
            out.append(ContentBlock(kind="refusal", text=str(block.get("refusal") or block.get("text") or ""), source_format=RESPONSES, raw=dict(block)))
        else:
            out.append(ContentBlock(kind="opaque", source_format=RESPONSES, raw=dict(block)))
    return out


def _parse_input(agent: AgentRequest, value: Any) -> None:
    if isinstance(value, str):
        _append_turn(agent.turns, "user", [text_block(value, source_format=RESPONSES)])
        return
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        return
    for item in value:
        if isinstance(item, str):
            _append_turn(agent.turns, "user", [text_block(item, source_format=RESPONSES)])
            continue
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "")
        role = str(item.get("role") or "")
        if item_type in ("message", "easy_input_message") or role:
            target_role = "system" if role in ("system", "developer") else (role or "user")
            blocks = _message_content(item.get("content"), role=target_role)
            if target_role == "system":
                agent.system.extend(blocks)
            else:
                _append_turn(
                    agent.turns,
                    target_role,
                    blocks,
                    item_id=str(item.get("id") or ""),
                    status=str(item.get("status") or ""),
                )
            continue
        if item_type in ("function_call", "custom_tool_call"):
            custom = item_type == "custom_tool_call"
            raw_input = item.get("input") if custom else None
            arguments = json_dumps({"content": str(raw_input or "")}) if custom else str(item.get("arguments") or "")
            _append_turn(
                agent.turns,
                "assistant",
                [
                    ContentBlock(
                        kind="custom_tool_call" if custom else "tool_call",
                        call_id=str(item.get("call_id") or item.get("id") or new_id("call")),
                        name=str(item.get("name") or ""),
                        arguments=arguments,
                        input=raw_input,
                        status=str(item.get("status") or ""),
                        source_format=RESPONSES,
                        raw=dict(item),
                    )
                ],
            )
            continue
        if item_type in ("function_call_output", "custom_tool_call_output"):
            _append_turn(
                agent.turns,
                "user",
                [
                    ContentBlock(
                        kind="tool_result",
                        call_id=str(item.get("call_id") or item.get("id") or ""),
                        output=item.get("output", ""),
                        status=str(item.get("status") or ""),
                        source_format=RESPONSES,
                        raw={**dict(item), "_custom": item_type == "custom_tool_call_output"},
                    )
                ],
            )
            continue
        if item_type == "reasoning":
            _append_turn(
                agent.turns,
                "assistant",
                [
                    ContentBlock(
                        kind="reasoning",
                        text=reasoning_text(item),
                        encrypted_content=str(item.get("encrypted_content") or ""),
                        status=str(item.get("status") or ""),
                        source_format=RESPONSES,
                        raw=dict(item),
                    )
                ],
            )
            continue
        agent.turns.append(AgentTurn(role="assistant", content=[ContentBlock(kind="opaque", source_format=RESPONSES, raw=dict(item))]))


def _parse_tools(value: Any) -> List[AgentTool]:
    tools: List[AgentTool] = []
    for tool in value or []:
        if not isinstance(tool, dict):
            continue
        kind = str(tool.get("type") or "function")
        if kind == "function":
            fn = tool.get("function") if isinstance(tool.get("function"), dict) else tool
            tools.append(
                AgentTool(
                    kind="function",
                    name=str(fn.get("name") or ""),
                    description=str(fn.get("description") or ""),
                    input_schema=normalize_tool_schema(fn.get("parameters") or {}),
                    strict=fn.get("strict") if "strict" in fn else tool.get("strict"),
                    allowed_callers=list(tool.get("allowed_callers") or []),
                    raw=dict(tool),
                )
            )
        elif kind == "custom":
            tools.append(
                AgentTool(
                    kind="custom",
                    name=str(tool.get("name") or ""),
                    description=str(tool.get("description") or ""),
                    format=dict(tool.get("format") or {}) if isinstance(tool.get("format"), dict) else {},
                    allowed_callers=list(tool.get("allowed_callers") or []),
                    raw=dict(tool),
                )
            )
        else:
            tools.append(AgentTool(kind=kind, name=str(tool.get("name") or ""), description=str(tool.get("description") or ""), raw=dict(tool)))
    return tools


def _parse_tool_choice(value: Any, parallel: Any) -> AgentToolChoice:
    choice = AgentToolChoice(parallel=parallel if isinstance(parallel, bool) else None)
    if isinstance(value, str):
        choice.mode = value
    elif isinstance(value, dict):
        kind = str(value.get("type") or "")
        name = str(value.get("name") or ((value.get("function") or {}).get("name") if isinstance(value.get("function"), dict) else "") or "")
        if kind in ("function", "custom") and name:
            choice.mode = "named"
            choice.kind = kind
            choice.name = name
        elif kind == "allowed_tools":
            choice.mode = str(value.get("mode") or "auto")
        elif kind in ("auto", "none", "required"):
            choice.mode = kind
    return choice


def parse_request(request: Dict[str, Any], report: ConversionReport) -> AgentRequest:
    agent = AgentRequest(
        source_format=RESPONSES,
        model=str(request.get("model") or ""),
        stream=bool(request.get("stream", False)),
        tools=_parse_tools(request.get("tools")),
        tool_choice=_parse_tool_choice(request.get("tool_choice"), request.get("parallel_tool_calls")),
        raw=dict(request),
    )
    instructions = request.get("instructions")
    if instructions:
        if isinstance(instructions, list):
            agent.system.extend(_message_content(instructions, role="system"))
        else:
            agent.system.append(text_block(instructions, source_format=RESPONSES))
    _parse_input(agent, request.get("input", ""))
    if request.get("max_output_tokens") is not None:
        agent.max_output_tokens = request.get("max_output_tokens")
    if request.get("stop") is not None:
        agent.stop_sequences = normalize_stop(request.get("stop"))
    if "temperature" in request:
        agent.temperature = request.get("temperature")
    if "top_p" in request:
        agent.top_p = request.get("top_p")
    for key in ("presence_penalty", "frequency_penalty", "seed", "top_logprobs"):
        if key in request:
            agent.parameters[key] = request.get(key)
    if isinstance(request.get("reasoning"), dict):
        agent.reasoning = dict(request["reasoning"])
    elif request.get("reasoning") is not None:
        agent.reasoning = {"effort": request.get("reasoning")}
    text_config = request.get("text")
    if isinstance(text_config, dict) and isinstance(text_config.get("format"), dict):
        agent.structured_output = dict(text_config["format"])
    for key in ("previous_response_id", "conversation", "context_management"):
        if request.get(key) is not None:
            agent.state[key] = request.get(key)
    for key in ("store", "include", "prompt_cache_key", "truncation", "background", "prompt", "service_tier"):
        if key in request:
            agent.hints[key] = request.get(key)
    if isinstance(request.get("metadata"), dict):
        agent.metadata = dict(request["metadata"])
    if request.get("user") is not None:
        agent.metadata["user"] = request.get("user")
    return agent


def _tool_to_responses(tool: AgentTool) -> Dict[str, Any]:
    if tool.kind == "function":
        out: Dict[str, Any] = {
            "type": "function",
            "name": tool.name,
            "description": tool.description,
            "parameters": normalize_tool_schema(tool.input_schema),
        }
        if tool.strict is not None:
            out["strict"] = bool(tool.strict)
        if tool.allowed_callers:
            out["allowed_callers"] = list(tool.allowed_callers)
        return out
    if tool.kind == "custom":
        out = {"type": "custom", "name": tool.name}
        if tool.description:
            out["description"] = tool.description
        if tool.format:
            out["format"] = dict(tool.format)
        if tool.allowed_callers:
            out["allowed_callers"] = list(tool.allowed_callers)
        return out
    return dict(tool.raw) if tool.raw else {"type": tool.kind, "name": tool.name}


def _input_content(blocks: List[ContentBlock], *, assistant: bool) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for block in blocks:
        if block.kind == "text":
            out.append({"type": "output_text" if assistant else "input_text", "text": block.text})
        elif block.kind == "image":
            image: Dict[str, Any] = {"type": "input_image"}
            if block.url:
                image["image_url"] = block.url
            if block.file_id:
                image["file_id"] = block.file_id
            if block.detail:
                image["detail"] = block.detail
            out.append(image)
        elif block.kind == "file":
            file_item: Dict[str, Any] = {"type": "input_file"}
            for key, value in (("file_id", block.file_id), ("file_url", block.file_url), ("file_data", block.data), ("filename", block.filename)):
                if value:
                    file_item[key] = value
            out.append(file_item)
        elif block.kind == "refusal" and assistant:
            out.append({"type": "refusal", "refusal": block.text})
    return out


def render_request(request: AgentRequest, *, resolve_model, context: ConversionContext, report: ConversionReport) -> Dict[str, Any]:
    input_items: List[Dict[str, Any]] = []
    context.custom_tool_names.update(tool.name for tool in request.tools if tool.kind == "custom")
    for turn in request.turns:
        message_blocks: List[ContentBlock] = []

        def flush_message() -> None:
            if not message_blocks:
                return
            content = _input_content(message_blocks, assistant=turn.role == "assistant")
            if content:
                input_items.append({"role": turn.role, "content": content})
            message_blocks.clear()

        for block in turn.content:
            if block.kind in ("text", "image", "file", "refusal"):
                message_blocks.append(block)
                continue
            flush_message()
            if block.kind == "reasoning":
                item: Dict[str, Any] = {"type": "reasoning", "summary": []}
                if block.text:
                    item["summary"] = [{"type": "summary_text", "text": block.text}]
                if block.encrypted_content:
                    item["encrypted_content"] = block.encrypted_content
                input_items.append(item)
            elif block.kind in ("tool_call", "custom_tool_call"):
                custom = block.kind == "custom_tool_call" or block.name in context.custom_tool_names
                if custom:
                    input_items.append(
                        {
                            "type": "custom_tool_call",
                            "call_id": block.call_id or new_id("call"),
                            "name": block.name,
                            "input": block.input if block.input is not None else unwrap_custom_tool_arguments(block.arguments),
                        }
                    )
                else:
                    input_items.append(
                        {
                            "type": "function_call",
                            "call_id": block.call_id or new_id("call"),
                            "name": block.name,
                            "arguments": block.arguments or json_dumps(block.input or {}),
                        }
                    )
            elif block.kind == "tool_result":
                custom = bool(block.raw.get("_custom"))
                input_items.append(
                    {
                        "type": "custom_tool_call_output" if custom else "function_call_output",
                        "call_id": block.call_id,
                        "output": block.output,
                    }
                )
            elif block.kind == "opaque":
                input_items.append(dict(block.raw))
        flush_message()

    payload: Dict[str, Any] = {
        "model": resolve_model(request.model),
        "input": input_items,
        "stream": request.stream,
    }
    system_text = "\n".join(block.text for block in request.system if block.kind == "text" and block.text)
    if system_text:
        payload["instructions"] = system_text
    if request.max_output_tokens is not None:
        payload["max_output_tokens"] = request.max_output_tokens
    if request.stop_sequences:
        payload["stop"] = request.stop_sequences[0] if len(request.stop_sequences) == 1 else list(request.stop_sequences)
    if request.temperature is not None:
        payload["temperature"] = request.temperature
    if request.top_p is not None:
        payload["top_p"] = request.top_p
    payload.update(request.parameters)
    if request.reasoning:
        reasoning = dict(request.reasoning)
        if reasoning.get("type") in ("enabled", "adaptive"):
            effort = str(reasoning.get("effort") or "").lower()
            if not effort:
                try:
                    budget = int(reasoning.get("budget_tokens") or 0)
                except (TypeError, ValueError):
                    budget = 0
                effort = "low" if budget and budget <= 2048 else "high" if budget and budget > 8192 else "medium"
            reasoning = {"effort": effort}
        elif reasoning.get("type") == "disabled":
            reasoning = {}
        if reasoning:
            payload["reasoning"] = reasoning
    if request.structured_output:
        payload["text"] = {"format": dict(request.structured_output)}
    if request.tools:
        payload["tools"] = [_tool_to_responses(tool) for tool in request.tools]
    choice = request.tool_choice
    if choice.mode == "named":
        payload["tool_choice"] = {"type": choice.kind, "name": choice.name}
    elif choice.mode in ("auto", "none", "required") and (request.tools or choice.mode != "auto"):
        payload["tool_choice"] = choice.mode
    if choice.parallel is not None:
        payload["parallel_tool_calls"] = choice.parallel
    payload.update(request.state)
    if request.source_format == RESPONSES:
        for key, value in request.hints.items():
            if key in ("store", "include", "prompt_cache_key", "truncation", "background", "prompt", "service_tier"):
                payload[key] = value
    if request.metadata:
        metadata = {key: value for key, value in request.metadata.items() if key != "user"}
        if metadata:
            payload["metadata"] = metadata
        if request.metadata.get("user") is not None:
            payload["user"] = request.metadata["user"]
    return {key: value for key, value in payload.items() if value is not None}


def parse_response(response: Dict[str, Any], context: ConversionContext | None = None) -> AgentResponse:
    items: List[ContentBlock] = []
    custom_names = context.custom_tool_names if context else set()
    for item in response.get("output") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "")
        if kind == "message":
            items.extend(_message_content(item.get("content"), role="assistant"))
        elif kind == "reasoning":
            items.append(
                ContentBlock(
                    kind="reasoning",
                    text=reasoning_text(item),
                    encrypted_content=str(item.get("encrypted_content") or ""),
                    status=str(item.get("status") or ""),
                    source_format=RESPONSES,
                    raw=dict(item),
                )
            )
        elif kind in ("function_call", "custom_tool_call"):
            name = str(item.get("name") or "")
            custom = kind == "custom_tool_call" or name in custom_names
            arguments = str(item.get("arguments") or "")
            raw_input = item.get("input") if custom else None
            if custom and not arguments:
                arguments = json_dumps({"content": str(raw_input or "")})
            items.append(
                ContentBlock(
                    kind="custom_tool_call" if custom else "tool_call",
                    call_id=str(item.get("call_id") or item.get("id") or new_id("call")),
                    name=name,
                    arguments=arguments,
                    input=raw_input,
                    status=str(item.get("status") or ""),
                    source_format=RESPONSES,
                    raw=dict(item),
                )
            )
        elif kind in ("refusal",):
            items.append(ContentBlock(kind="refusal", text=content_text(item), source_format=RESPONSES, raw=dict(item)))
        else:
            items.append(ContentBlock(kind="opaque", source_format=RESPONSES, raw=dict(item)))
    if not any(item.kind == "text" for item in items) and response.get("output_text"):
        items.append(ContentBlock(kind="text", text=str(response.get("output_text")), source_format=RESPONSES))
    usage = response.get("usage") or {}
    input_tokens = int(usage.get("input_tokens", usage.get("prompt_tokens", 0)) or 0)
    output_tokens = int(usage.get("output_tokens", usage.get("completion_tokens", 0)) or 0)
    status = str(response.get("status") or "completed")
    has_tool = any(item.kind in ("tool_call", "custom_tool_call") for item in items)
    stop = "tool_calls" if has_tool else ("length" if status == "incomplete" else "stop")
    return AgentResponse(
        source_format=RESPONSES,
        response_id=str(response.get("id") or new_id("resp")),
        model=str(response.get("model") or "unknown"),
        items=items,
        status=status,
        stop_reason=stop,
        usage=Usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=int(usage.get("total_tokens", input_tokens + output_tokens) or 0),
            input_details=dict(usage.get("input_tokens_details") or {}),
            output_details=dict(usage.get("output_tokens_details") or {}),
        ),
        created_at=response.get("created_at"),
        error=response.get("error") if isinstance(response.get("error"), dict) else None,
        raw=dict(response),
    )


def render_response(
    response: AgentResponse,
    *,
    original_model: str | None = None,
    context: ConversionContext | None = None,
    report: ConversionReport | None = None,
) -> Dict[str, Any]:
    output: List[Dict[str, Any]] = []
    output_text_parts: List[str] = []
    custom_names = context.custom_tool_names if context else set()
    for item in response.items:
        if item.kind == "reasoning":
            reasoning: Dict[str, Any] = {"id": new_id("rs"), "type": "reasoning", "status": "completed", "summary": []}
            if item.text:
                reasoning["summary"] = [{"type": "summary_text", "text": item.text}]
            if item.encrypted_content:
                reasoning["encrypted_content"] = item.encrypted_content
            output.append(reasoning)
        elif item.kind == "text":
            output_text_parts.append(item.text)
            output.append(
                {
                    "id": new_id("msg"),
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": item.text, "annotations": []}],
                }
            )
        elif item.kind == "refusal":
            output.append(
                {
                    "id": new_id("msg"),
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": [{"type": "refusal", "refusal": item.text}],
                }
            )
        elif item.kind in ("tool_call", "custom_tool_call"):
            custom = item.kind == "custom_tool_call" or item.name in custom_names
            call_id = item.call_id or new_id("call")
            if custom:
                output.append(
                    {
                        "id": new_id("ctc"),
                        "type": "custom_tool_call",
                        "status": "completed",
                        "call_id": call_id,
                        "name": item.name,
                        "input": item.input if item.input is not None else unwrap_custom_tool_arguments(item.arguments),
                    }
                )
            else:
                output.append(
                    {
                        "id": new_id("fc"),
                        "type": "function_call",
                        "status": "completed",
                        "call_id": call_id,
                        "name": item.name,
                        "arguments": item.arguments or json_dumps(item.input or {}),
                    }
                )
        elif item.kind == "opaque" and item.source_format == RESPONSES:
            output.append(dict(item.raw))
    status = response.status
    if response.stop_reason in ("length", "max_tokens"):
        status = "incomplete"
    return {
        "id": response.response_id if response.response_id.startswith("resp_") else new_id("resp"),
        "object": "response",
        "created_at": response.created_at or int(time.time()),
        "status": status or "completed",
        "error": response.error,
        "incomplete_details": {"reason": "max_output_tokens"} if status == "incomplete" else None,
        "model": original_model or response.model,
        "output": output,
        "output_text": "\n".join(part for part in output_text_parts if part),
        "parallel_tool_calls": True,
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.total_tokens or response.usage.input_tokens + response.usage.output_tokens,
            **({"input_tokens_details": response.usage.input_details} if response.usage.input_details else {}),
            **({"output_tokens_details": response.usage.output_details} if response.usage.output_details else {}),
        },
    }
