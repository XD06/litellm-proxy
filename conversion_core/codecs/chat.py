from __future__ import annotations

import time
from typing import Any, Dict, List

from ..common import (
    content_text,
    custom_tool_description,
    json_dumps,
    new_id,
    normalize_stop,
    normalize_tool_schema,
    sanitize_tool_name,
    text_block,
    wrap_custom_tool_input,
)
from ..model import (
    CHAT,
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


def _image_block(block: Dict[str, Any]) -> ContentBlock | None:
    image_url = block.get("image_url")
    detail = ""
    if isinstance(image_url, dict):
        url = str(image_url.get("url") or "")
        detail = str(image_url.get("detail") or "")
    else:
        url = str(image_url or "")
    if not url:
        return None
    return ContentBlock(kind="image", url=url, detail=detail, source_format=CHAT, raw=dict(block))


def _content_blocks(value: Any, *, role: str) -> List[ContentBlock]:
    if isinstance(value, str):
        return [text_block(value, source_format=CHAT)] if value else []
    if value is None:
        return []
    if not isinstance(value, list):
        return [text_block(value, source_format=CHAT)]
    out: List[ContentBlock] = []
    for block in value:
        if isinstance(block, str):
            out.append(text_block(block, source_format=CHAT))
            continue
        if not isinstance(block, dict):
            continue
        kind = str(block.get("type") or "")
        if kind in ("text", "input_text", "output_text"):
            out.append(text_block(block.get("text"), source_format=CHAT))
        elif kind == "image_url":
            image = _image_block(block)
            if image:
                out.append(image)
        elif kind == "tool_use":
            out.append(
                ContentBlock(
                    kind="tool_call",
                    call_id=str(block.get("id") or ""),
                    name=str(block.get("name") or ""),
                    input=block.get("input") if isinstance(block.get("input"), dict) else {},
                    arguments=json_dumps(block.get("input") if isinstance(block.get("input"), dict) else {}),
                    source_format=CHAT,
                    raw=dict(block),
                )
            )
        elif kind == "tool_result":
            out.append(
                ContentBlock(
                    kind="tool_result",
                    call_id=str(block.get("tool_use_id") or ""),
                    output=block.get("content", ""),
                    is_error=bool(block.get("is_error")),
                    source_format=CHAT,
                    raw=dict(block),
                )
            )
        elif kind == "refusal":
            out.append(ContentBlock(kind="refusal", text=str(block.get("refusal") or block.get("text") or ""), source_format=CHAT, raw=dict(block)))
        else:
            out.append(ContentBlock(kind="opaque", source_format=CHAT, raw=dict(block)))
    return out


def _parse_tools(raw_tools: Any) -> List[AgentTool]:
    tools: List[AgentTool] = []
    for tool in raw_tools or []:
        if not isinstance(tool, dict):
            continue
        kind = str(tool.get("type") or "function")
        fn = tool.get("function") if isinstance(tool.get("function"), dict) else tool
        name = str(fn.get("name") or tool.get("name") or "")
        tools.append(
            AgentTool(
                kind=kind,
                name=name,
                description=str(fn.get("description") or tool.get("description") or ""),
                input_schema=normalize_tool_schema(fn.get("parameters") or tool.get("parameters") or {}),
                strict=fn.get("strict") if "strict" in fn else tool.get("strict"),
                format=dict(tool.get("format") or {}) if isinstance(tool.get("format"), dict) else {},
                allowed_callers=list(tool.get("allowed_callers") or []),
                raw=dict(tool),
            )
        )
    return tools


def _parse_tool_choice(value: Any, parallel: Any) -> AgentToolChoice:
    choice = AgentToolChoice(parallel=parallel if isinstance(parallel, bool) else None)
    if isinstance(value, str):
        choice.mode = {"any": "required"}.get(value, value)
    elif isinstance(value, dict):
        kind = str(value.get("type") or "")
        fn = value.get("function") if isinstance(value.get("function"), dict) else {}
        name = str(fn.get("name") or value.get("name") or "")
        if kind in ("function", "custom") and name:
            choice.mode = "named"
            choice.kind = kind
            choice.name = name
        elif kind in ("required", "any"):
            choice.mode = "required"
        elif kind in ("auto", "none"):
            choice.mode = kind
    return choice


def parse_request(request: Dict[str, Any], report: ConversionReport) -> AgentRequest:
    agent = AgentRequest(
        source_format=CHAT,
        model=str(request.get("model") or ""),
        stream=bool(request.get("stream", False)),
        tools=_parse_tools(request.get("tools")),
        tool_choice=_parse_tool_choice(request.get("tool_choice"), request.get("parallel_tool_calls")),
        raw=dict(request),
    )
    if request.get("max_completion_tokens") is not None:
        agent.max_output_tokens = request.get("max_completion_tokens")
    elif request.get("max_tokens") is not None:
        agent.max_output_tokens = request.get("max_tokens")
    if request.get("stop") is not None:
        agent.stop_sequences = normalize_stop(request.get("stop"))
    if "temperature" in request:
        agent.temperature = request.get("temperature")
    if "top_p" in request:
        agent.top_p = request.get("top_p")
    for key in ("presence_penalty", "frequency_penalty", "seed", "n", "logit_bias", "logprobs", "top_logprobs"):
        if key in request:
            agent.parameters[key] = request.get(key)
    if request.get("reasoning_effort") is not None:
        agent.reasoning = {"effort": request.get("reasoning_effort")}
    if isinstance(request.get("response_format"), dict):
        rf = dict(request.get("response_format") or {})
        if rf.get("type") == "json_schema" and isinstance(rf.get("json_schema"), dict):
            agent.structured_output = dict(rf["json_schema"])
            agent.structured_output.setdefault("type", "json_schema")
        else:
            agent.structured_output = rf
    if isinstance(request.get("metadata"), dict):
        agent.metadata = dict(request["metadata"])
    if request.get("user") is not None:
        agent.metadata["user"] = request.get("user")
    if request.get("stream_options") is not None:
        agent.hints["stream_options"] = request.get("stream_options")

    for index, message in enumerate(request.get("messages") or []):
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "")
        if role in ("system", "developer"):
            agent.system.extend(_content_blocks(message.get("content"), role=role))
            continue
        if role in ("tool", "function"):
            result = ContentBlock(
                kind="tool_result",
                call_id=str(message.get("tool_call_id") or message.get("name") or ""),
                name=str(message.get("name") or ""),
                output=message.get("content", ""),
                source_format=CHAT,
                raw=dict(message),
            )
            if agent.turns and agent.turns[-1].role == "user" and all(block.kind == "tool_result" for block in agent.turns[-1].content):
                agent.turns[-1].content.append(result)
            else:
                agent.turns.append(AgentTurn(role="user", content=[result]))
            continue
        blocks = _content_blocks(message.get("content"), role=role)
        if role == "assistant" and message.get("reasoning_content") not in (None, ""):
            blocks.insert(0, ContentBlock(kind="reasoning", text=str(message.get("reasoning_content")), source_format=CHAT))
        if role == "assistant":
            for tool_index, call in enumerate(message.get("tool_calls") or []):
                if not isinstance(call, dict):
                    continue
                fn = call.get("function") if isinstance(call.get("function"), dict) else {}
                blocks.append(
                    ContentBlock(
                        kind="tool_call",
                        call_id=str(call.get("id") or new_id("call")),
                        name=str(fn.get("name") or ""),
                        arguments=str(fn.get("arguments") or ""),
                        source_format=CHAT,
                        raw={**dict(call), "_field": f"messages[{index}].tool_calls[{tool_index}].function.arguments"},
                    )
                )
        agent.turns.append(AgentTurn(role=role or "user", content=blocks, name=str(message.get("name") or "")))
    return agent


def _tool_to_chat(tool: AgentTool) -> Dict[str, Any]:
    if tool.kind == "custom":
        description = custom_tool_description(tool.name, tool.description, tool.format)
        return {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": {"content": {"type": "string", "description": f"The {tool.name} content following the specified format"}},
                    "required": ["content"],
                },
            },
        }
    function: Dict[str, Any] = {
        "name": tool.name,
        "description": tool.description,
        "parameters": normalize_tool_schema(tool.input_schema),
    }
    if tool.strict is not None:
        function["strict"] = bool(tool.strict)
    return {"type": "function", "function": function}


def _chat_content(blocks: List[ContentBlock]) -> Any:
    visible = [block for block in blocks if block.kind in ("text", "image", "refusal")]
    if not visible:
        return ""
    if all(block.kind in ("text", "refusal") for block in visible):
        return "\n".join(block.text for block in visible if block.text)
    out: List[Dict[str, Any]] = []
    for block in visible:
        if block.kind in ("text", "refusal"):
            out.append({"type": "text", "text": block.text})
        elif block.kind == "image":
            url = block.url
            if not url and block.data:
                url = f"data:{block.media_type or 'image/png'};base64,{block.data}"
            image_url: Dict[str, Any] = {"url": url}
            if block.detail:
                image_url["detail"] = block.detail
            out.append({"type": "image_url", "image_url": image_url})
    return out


def render_request(
    request: AgentRequest,
    *,
    resolve_model,
    context: ConversionContext,
    report: ConversionReport,
) -> Dict[str, Any]:
    messages: List[Dict[str, Any]] = []
    if request.system:
        messages.append({"role": "system", "content": "\n".join(block.text for block in request.system if block.kind == "text" and block.text)})
    custom_names = {tool.name for tool in request.tools if tool.kind == "custom"}
    context.custom_tool_names.update(custom_names)
    used_names: set[str] = set()
    for tool in request.tools:
        wire_name = sanitize_tool_name(tool.name, used_names)
        context.original_tool_to_wire[tool.name] = wire_name
        context.tool_name_to_original[wire_name] = tool.name
        if tool.kind == "custom":
            context.custom_tool_names.add(wire_name)
        if wire_name != tool.name:
            report.add(f"tools.{tool.name}", "map", target=wire_name, detail="sanitize Chat Completions tool name")
    for turn in request.turns:
        tool_results = [block for block in turn.content if block.kind == "tool_result"]
        if turn.role == "user" and tool_results:
            for block in tool_results:
                messages.append({"role": "tool", "tool_call_id": block.call_id, "content": content_text(block.output)})
            remaining = [block for block in turn.content if block.kind != "tool_result"]
            if remaining:
                messages.append({"role": "user", "content": _chat_content(remaining)})
            continue
        message: Dict[str, Any] = {"role": turn.role, "content": _chat_content(turn.content)}
        if turn.name:
            message["name"] = turn.name
        reasoning = "\n".join(block.text for block in turn.content if block.kind == "reasoning" and block.text)
        if reasoning and turn.role == "assistant":
            message["reasoning_content"] = reasoning
        calls = [block for block in turn.content if block.kind in ("tool_call", "custom_tool_call")]
        if calls and turn.role == "assistant":
            message["tool_calls"] = []
            for block in calls:
                arguments = block.arguments
                if block.name in custom_names or block.raw.get("_custom"):
                    arguments = wrap_custom_tool_input(block.input if block.input is not None else block.arguments)
                message["tool_calls"].append(
                    {
                        "id": block.call_id or new_id("call"),
                        "type": "function",
                        "function": {
                            "name": context.original_tool_to_wire.get(block.name, block.name),
                            "arguments": arguments or "{}",
                        },
                    }
                )
        messages.append(message)

    payload: Dict[str, Any] = {
        "model": resolve_model(request.model),
        "messages": messages,
        "stream": request.stream,
    }
    if request.max_output_tokens is not None:
        payload["max_tokens"] = request.max_output_tokens
    if request.stop_sequences:
        payload["stop"] = request.stop_sequences[0] if len(request.stop_sequences) == 1 else list(request.stop_sequences)
    if request.temperature is not None:
        payload["temperature"] = request.temperature
    if request.top_p is not None:
        payload["top_p"] = request.top_p
    payload.update(request.parameters)
    if request.reasoning:
        effort = str(request.reasoning.get("effort") or "").lower()
        if not effort and request.reasoning.get("type") != "disabled":
            try:
                budget = int(request.reasoning.get("budget_tokens") or 0)
            except (TypeError, ValueError):
                budget = 0
            effort = "low" if budget and budget <= 2048 else "high" if budget and budget > 8192 else "medium"
        if effort:
            payload["reasoning_effort"] = effort
    if request.structured_output:
        structured = dict(request.structured_output)
        stype = structured.pop("type", "json_schema")
        if stype == "json_schema":
            payload["response_format"] = {"type": "json_schema", "json_schema": structured}
        else:
            payload["response_format"] = {"type": stype, **structured}
    if request.tools:
        payload["tools"] = []
        for tool in request.tools:
            rendered = _tool_to_chat(tool)
            rendered["function"]["name"] = context.original_tool_to_wire.get(tool.name, tool.name)
            payload["tools"].append(rendered)
    choice = request.tool_choice
    if choice.mode == "named":
        payload["tool_choice"] = {
            "type": "function",
            "function": {"name": context.original_tool_to_wire.get(choice.name, choice.name)},
        }
    elif choice.mode in ("auto", "none", "required") and (request.tools or choice.mode != "auto"):
        payload["tool_choice"] = choice.mode
    if choice.parallel is not None:
        payload["parallel_tool_calls"] = choice.parallel
    if request.metadata.get("user") is not None:
        payload["user"] = request.metadata["user"]
    return {key: value for key, value in payload.items() if value is not None}


def parse_response(response: Dict[str, Any], context: ConversionContext | None = None) -> AgentResponse:
    choices = response.get("choices") or []
    choice = choices[0] if choices else {}
    message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
    items: List[ContentBlock] = []
    reasoning = str(message.get("reasoning_content") or "")
    if reasoning.strip():
        items.append(ContentBlock(kind="reasoning", text=reasoning, source_format=CHAT))
    content = message.get("content")
    if isinstance(content, str) and content:
        items.append(ContentBlock(kind="text", text=content, source_format=CHAT))
    elif isinstance(content, list):
        items.extend(_content_blocks(content, role="assistant"))
    if message.get("refusal"):
        items.append(ContentBlock(kind="refusal", text=str(message.get("refusal")), source_format=CHAT))
    custom_names = context.custom_tool_names if context else set()
    for call in message.get("tool_calls") or []:
        if not isinstance(call, dict):
            continue
        fn = call.get("function") if isinstance(call.get("function"), dict) else {}
        wire_name = str(fn.get("name") or "")
        name = context.tool_name_to_original.get(wire_name, wire_name) if context else wire_name
        items.append(
            ContentBlock(
                kind="custom_tool_call" if wire_name in custom_names or name in custom_names else "tool_call",
                call_id=str(call.get("id") or new_id("call")),
                name=name,
                arguments=str(fn.get("arguments") or ""),
                source_format=CHAT,
                raw=dict(call),
            )
        )
    usage = response.get("usage") or {}
    input_tokens = int(usage.get("prompt_tokens", usage.get("input_tokens", 0)) or 0)
    output_tokens = int(usage.get("completion_tokens", usage.get("output_tokens", 0)) or 0)
    finish = str(choice.get("finish_reason") or "stop")
    input_details = dict(usage.get("prompt_tokens_details") or usage.get("input_tokens_details") or {})
    output_details = dict(usage.get("completion_tokens_details") or usage.get("output_tokens_details") or {})
    return AgentResponse(
        source_format=CHAT,
        response_id=str(response.get("id") or new_id("chatcmpl")),
        model=str(response.get("model") or "unknown"),
        items=items,
        status="incomplete" if finish == "length" else "completed",
        stop_reason=finish,
        usage=Usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=int(usage.get("total_tokens", input_tokens + output_tokens) or 0),
            input_details=input_details,
            output_details=output_details,
        ),
        created_at=response.get("created"),
        raw=dict(response),
    )


def render_response(
    response: AgentResponse,
    *,
    original_model: str | None = None,
    context: ConversionContext | None = None,
    report: ConversionReport | None = None,
) -> Dict[str, Any]:
    text = "\n".join(item.text for item in response.items if item.kind == "text" and item.text)
    reasoning = "\n".join(item.text for item in response.items if item.kind == "reasoning" and item.text)
    message: Dict[str, Any] = {"role": "assistant", "content": text}
    if reasoning:
        message["reasoning_content"] = reasoning
    calls = [item for item in response.items if item.kind in ("tool_call", "custom_tool_call")]
    if calls:
        message["tool_calls"] = [
            {
                "id": item.call_id or new_id("call"),
                "type": "function",
                "function": {"name": item.name, "arguments": item.arguments or "{}"},
            }
            for item in calls
        ]
    refusal = "\n".join(item.text for item in response.items if item.kind == "refusal" and item.text)
    if refusal:
        message["refusal"] = refusal
    stop = response.stop_reason
    if calls:
        stop = "tool_calls"
    elif stop in ("end_turn", "stop_sequence"):
        stop = "stop"
    elif stop == "max_tokens":
        stop = "length"
    return {
        "id": response.response_id if response.response_id.startswith("chatcmpl_") else new_id("chatcmpl"),
        "object": "chat.completion",
        "created": response.created_at or int(time.time()),
        "model": original_model or response.model,
        "choices": [{"index": 0, "message": message, "finish_reason": stop or "stop"}],
        "usage": {
            "prompt_tokens": response.usage.input_tokens,
            "completion_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.total_tokens or response.usage.input_tokens + response.usage.output_tokens,
            **({"prompt_tokens_details": response.usage.input_details} if response.usage.input_details else {}),
            **({"completion_tokens_details": response.usage.output_details} if response.usage.output_details else {}),
        },
    }
