from __future__ import annotations

from typing import Any, Dict, List

from ..common import (
    content_text,
    json_dumps,
    new_id,
    normalize_stop,
    normalize_tool_schema,
    parse_json_object,
    sanitize_tool_name,
    text_block,
    unwrap_custom_tool_arguments,
)
from ..model import (
    ANTHROPIC,
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


def _source_to_block(block: Dict[str, Any]) -> ContentBlock | None:
    source = block.get("source") if isinstance(block.get("source"), dict) else {}
    source_type = str(source.get("type") or "")
    if block.get("type") == "image":
        if source_type == "base64":
            return ContentBlock(kind="image", data=str(source.get("data") or ""), media_type=str(source.get("media_type") or "image/png"), source_format=ANTHROPIC, raw=dict(block))
        if source_type == "url":
            return ContentBlock(kind="image", url=str(source.get("url") or ""), source_format=ANTHROPIC, raw=dict(block))
        if source_type == "file":
            return ContentBlock(kind="image", file_id=str(source.get("file_id") or ""), source_format=ANTHROPIC, raw=dict(block))
    if block.get("type") == "document":
        return ContentBlock(
            kind="file",
            data=str(source.get("data") or ""),
            media_type=str(source.get("media_type") or ""),
            file_id=str(source.get("file_id") or ""),
            url=str(source.get("url") or ""),
            source_format=ANTHROPIC,
            raw=dict(block),
        )
    return None


def _content_blocks(value: Any) -> List[ContentBlock]:
    if isinstance(value, str):
        return [text_block(value, source_format=ANTHROPIC)] if value else []
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        return []
    out: List[ContentBlock] = []
    for block in value:
        if isinstance(block, str):
            out.append(text_block(block, source_format=ANTHROPIC))
            continue
        if not isinstance(block, dict):
            continue
        kind = str(block.get("type") or "")
        if kind == "text":
            text = text_block(block.get("text"), source_format=ANTHROPIC)
            text.raw = dict(block)
            out.append(text)
        elif kind in ("image", "document"):
            converted = _source_to_block(block)
            if converted:
                out.append(converted)
        elif kind == "tool_use":
            input_value = block.get("input") if isinstance(block.get("input"), dict) else {}
            out.append(
                ContentBlock(
                    kind="tool_call",
                    call_id=str(block.get("id") or new_id("toolu")),
                    name=str(block.get("name") or ""),
                    input=input_value,
                    arguments=json_dumps(input_value),
                    source_format=ANTHROPIC,
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
                    source_format=ANTHROPIC,
                    raw=dict(block),
                )
            )
        elif kind == "thinking":
            out.append(
                ContentBlock(
                    kind="reasoning",
                    text=str(block.get("thinking") or ""),
                    signature=str(block.get("signature") or ""),
                    source_format=ANTHROPIC,
                    raw=dict(block),
                )
            )
        elif kind == "redacted_thinking":
            out.append(
                ContentBlock(
                    kind="reasoning",
                    encrypted_content=str(block.get("data") or ""),
                    source_format=ANTHROPIC,
                    raw=dict(block),
                )
            )
        elif kind == "refusal":
            out.append(ContentBlock(kind="refusal", text=str(block.get("text") or block.get("refusal") or ""), source_format=ANTHROPIC, raw=dict(block)))
        else:
            out.append(ContentBlock(kind="opaque", source_format=ANTHROPIC, raw=dict(block)))
    return out


def _parse_tools(value: Any) -> List[AgentTool]:
    tools: List[AgentTool] = []
    for tool in value or []:
        if not isinstance(tool, dict):
            continue
        kind = str(tool.get("type") or "custom")
        if kind == "custom" or not tool.get("type"):
            kind = "function"
        tools.append(
            AgentTool(
                kind=kind,
                name=str(tool.get("name") or ""),
                description=str(tool.get("description") or ""),
                input_schema=normalize_tool_schema(tool.get("input_schema") or {}),
                strict=tool.get("strict"),
                allowed_callers=list(tool.get("allowed_callers") or []),
                raw=dict(tool),
            )
        )
    return tools


def _parse_tool_choice(value: Any) -> AgentToolChoice:
    choice = AgentToolChoice()
    if not isinstance(value, dict):
        return choice
    kind = str(value.get("type") or "auto")
    if kind == "any":
        choice.mode = "required"
    elif kind == "tool":
        choice.mode = "named"
        choice.name = str(value.get("name") or "")
    else:
        choice.mode = kind
    if isinstance(value.get("disable_parallel_tool_use"), bool):
        choice.parallel = not value["disable_parallel_tool_use"]
    return choice


def parse_request(request: Dict[str, Any], report: ConversionReport) -> AgentRequest:
    agent = AgentRequest(
        source_format=ANTHROPIC,
        model=str(request.get("model") or ""),
        stream=bool(request.get("stream", False)),
        tools=_parse_tools(request.get("tools")),
        tool_choice=_parse_tool_choice(request.get("tool_choice")),
        raw=dict(request),
    )
    agent.system.extend(_content_blocks(request.get("system", "")))
    for message in request.get("messages") or []:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user")
        agent.turns.append(AgentTurn(role=role, content=_content_blocks(message.get("content", ""))))
    if request.get("max_tokens") is not None:
        agent.max_output_tokens = request.get("max_tokens")
    if request.get("stop_sequences") is not None:
        agent.stop_sequences = normalize_stop(request.get("stop_sequences"))
    if "temperature" in request:
        agent.temperature = request.get("temperature")
    if "top_p" in request:
        agent.top_p = request.get("top_p")
    if "top_k" in request:
        agent.parameters["top_k"] = request.get("top_k")
    thinking = request.get("thinking")
    if isinstance(thinking, dict):
        agent.reasoning = dict(thinking)
        if isinstance(request.get("output_config"), dict) and request["output_config"].get("effort"):
            agent.reasoning["effort"] = request["output_config"]["effort"]
    output_config = request.get("output_config")
    if isinstance(output_config, dict) and isinstance(output_config.get("format"), dict):
        agent.structured_output = dict(output_config["format"])
    if isinstance(request.get("context_management"), dict):
        agent.state["context_management"] = dict(request["context_management"])
    for key in ("cache_control", "container", "service_tier", "mcp_servers", "inference_geo"):
        if key in request:
            agent.hints[key] = request.get(key)
    if isinstance(request.get("metadata"), dict):
        agent.metadata = dict(request["metadata"])
    return agent


def _reasoning_to_anthropic(request: AgentRequest, report: ConversionReport) -> tuple[Dict[str, Any] | None, str]:
    if not request.reasoning:
        return None, ""
    if request.reasoning.get("type") in ("enabled", "adaptive", "disabled"):
        return dict(request.reasoning), str(request.reasoning.get("effort") or "")
    effort = str(request.reasoning.get("effort") or "medium").lower()
    budget = {"minimal": 1024, "low": 2048, "medium": 4096, "high": 8192, "xhigh": 16384}.get(effort, 4096)
    max_tokens = int(request.max_output_tokens or 8192)
    if max_tokens <= 1024:
        report.add("reasoning", "safe_drop", detail="max_tokens is too small for Anthropic thinking")
        return None, ""
    budget = min(budget, max_tokens - 1)
    return {"type": "enabled", "budget_tokens": budget}, effort


def _tool_to_anthropic(tool: AgentTool, wire_name: str) -> Dict[str, Any]:
    if tool.kind == "custom":
        return {
            "type": "custom",
            "name": wire_name,
            "description": tool.description,
            "input_schema": {
                "type": "object",
                "properties": {"content": {"type": "string", "description": f"The {tool.name} content"}},
                "required": ["content"],
            },
        }
    out: Dict[str, Any] = {
        "name": wire_name,
        "description": tool.description,
        "input_schema": normalize_tool_schema(tool.input_schema),
    }
    if tool.strict is not None:
        out["strict"] = bool(tool.strict)
    if tool.allowed_callers:
        out["allowed_callers"] = list(tool.allowed_callers)
    if tool.kind not in ("function", "custom"):
        out["type"] = tool.kind
    return out


def _media_block(block: ContentBlock) -> Dict[str, Any] | None:
    if block.kind == "image":
        if block.url:
            if block.url.startswith("data:"):
                header, _, data = block.url.partition(",")
                media_type = "image/png"
                if header.startswith("data:") and ";" in header:
                    media_type = header[5:].split(";", 1)[0] or media_type
                return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}
            return {"type": "image", "source": {"type": "url", "url": block.url}}
        if block.data:
            return {"type": "image", "source": {"type": "base64", "media_type": block.media_type or "image/png", "data": block.data}}
        if block.file_id:
            return {"type": "image", "source": {"type": "file", "file_id": block.file_id}}
    if block.kind == "file":
        if block.file_id:
            return {"type": "document", "source": {"type": "file", "file_id": block.file_id}}
        if block.url or block.file_url:
            return {"type": "document", "source": {"type": "url", "url": block.url or block.file_url}}
        if block.data:
            return {"type": "document", "source": {"type": "base64", "media_type": block.media_type or "application/pdf", "data": block.data}}
    return None


def _tool_result_content(value: Any) -> Any:
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return content_text(value)
    out: List[Dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            out.append({"type": "text", "text": item})
        elif isinstance(item, dict):
            kind = item.get("type")
            if kind in ("text", "input_text", "output_text"):
                out.append({"type": "text", "text": str(item.get("text") or "")})
            elif kind in ("image", "input_image", "output_image"):
                raw_url = item.get("image_url")
                url = str(raw_url.get("url") if isinstance(raw_url, dict) else raw_url or item.get("url") or "")
                media = _media_block(
                    ContentBlock(
                        kind="image",
                        url=url,
                        data=str(item.get("data") or ""),
                        media_type=str(item.get("media_type") or ""),
                        file_id=str(item.get("file_id") or ""),
                    )
                )
                if media:
                    out.append(media)
            elif kind in ("document", "input_file", "output_file"):
                media = _media_block(
                    ContentBlock(
                        kind="file",
                        data=str(item.get("file_data") or item.get("data") or ""),
                        media_type=str(item.get("media_type") or ""),
                        file_id=str(item.get("file_id") or ""),
                        file_url=str(item.get("file_url") or ""),
                        filename=str(item.get("filename") or ""),
                    )
                )
                if media:
                    out.append(media)
    return out if out else ""


def render_request(request: AgentRequest, *, resolve_model, context: ConversionContext, report: ConversionReport) -> Dict[str, Any]:
    used_names: set[str] = set()
    wire_tools: List[Dict[str, Any]] = []
    for tool in request.tools:
        wire_name = sanitize_tool_name(tool.name, used_names)
        context.original_tool_to_wire[tool.name] = wire_name
        context.tool_name_to_original[wire_name] = tool.name
        if tool.kind == "custom":
            context.custom_tool_names.add(tool.name)
            context.custom_tool_names.add(wire_name)
        wire_tools.append(_tool_to_anthropic(tool, wire_name))
        if wire_name != tool.name:
            report.add(f"tools.{tool.name}", "map", target=wire_name, detail="sanitize Anthropic tool name")

    messages: List[Dict[str, Any]] = []
    for turn_index, turn in enumerate(request.turns):
        content: List[Dict[str, Any]] = []
        if turn.role == "assistant":
            for block in turn.content:
                if block.kind == "reasoning":
                    if block.source_format == ANTHROPIC and block.signature:
                        content.append({"type": "thinking", "thinking": block.text, "signature": block.signature})
                    elif block.text or block.encrypted_content:
                        report.add(f"messages[{turn_index}].reasoning", "safe_drop", detail="cannot forge Anthropic thinking signature")
                elif block.kind == "text" and block.text:
                    content.append({"type": "text", "text": block.text})
                elif block.kind in ("tool_call", "custom_tool_call"):
                    name = context.original_tool_to_wire.get(block.name, block.name)
                    if block.kind == "custom_tool_call" or block.name in context.custom_tool_names:
                        input_value = {"content": block.input if block.input is not None else unwrap_custom_tool_arguments(block.arguments)}
                    elif block.input is not None:
                        input_value = block.input
                    else:
                        field = str(block.raw.get("_field") or f"messages[{turn_index}].tool_calls.function.arguments")
                        input_value = parse_json_object(block.arguments, field=field)
                    content.append({"type": "tool_use", "id": block.call_id or new_id("toolu"), "name": name, "input": input_value})
                elif block.kind in ("image", "file"):
                    media = _media_block(block)
                    if media:
                        content.append(media)
        else:
            # Anthropic requires tool results before ordinary user content.
            for block in turn.content:
                if block.kind == "tool_result":
                    result: Dict[str, Any] = {
                        "type": "tool_result",
                        "tool_use_id": block.call_id,
                        "content": _tool_result_content(block.output),
                    }
                    if block.is_error:
                        result["is_error"] = True
                    content.append(result)
            for block in turn.content:
                if block.kind == "text" and block.text:
                    content.append({"type": "text", "text": block.text})
                elif block.kind in ("image", "file"):
                    media = _media_block(block)
                    if media:
                        content.append(media)
        if not content:
            content = [{"type": "text", "text": "."}]
            report.add(f"messages[{turn_index}].content", "map", detail="replace empty Anthropic content")
        rendered_content: Any = content
        if len(content) == 1 and content[0].get("type") == "text" and set(content[0]) == {"type", "text"}:
            rendered_content = content[0]["text"]
        messages.append({"role": "assistant" if turn.role == "assistant" else "user", "content": rendered_content})

    max_tokens = int(request.max_output_tokens or 8192)
    payload: Dict[str, Any] = {
        "model": resolve_model(request.model),
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": request.stream,
    }
    system_blocks = [block for block in request.system if block.kind == "text" and block.text]
    if system_blocks:
        if all(not block.raw for block in system_blocks):
            payload["system"] = "\n".join(block.text for block in system_blocks)
        else:
            payload["system"] = [{"type": "text", "text": block.text, **({"cache_control": block.raw["cache_control"]} if block.raw.get("cache_control") else {})} for block in system_blocks]
    if request.stop_sequences:
        payload["stop_sequences"] = list(request.stop_sequences)
    if request.temperature is not None:
        payload["temperature"] = request.temperature
    if request.top_p is not None:
        payload["top_p"] = request.top_p
    if request.parameters.get("top_k") is not None:
        payload["top_k"] = request.parameters["top_k"]
    if wire_tools:
        payload["tools"] = wire_tools
    choice = request.tool_choice
    tool_choice: Dict[str, Any] | None = None
    if choice.mode == "named":
        tool_choice = {"type": "tool", "name": context.original_tool_to_wire.get(choice.name, choice.name)}
    elif choice.mode == "required":
        tool_choice = {"type": "any"}
    elif choice.mode in ("auto", "none") and (wire_tools or choice.mode == "none"):
        tool_choice = {"type": choice.mode}
    if choice.parallel is not None:
        tool_choice = tool_choice or {"type": "auto"}
        tool_choice["disable_parallel_tool_use"] = not choice.parallel
    if tool_choice:
        payload["tool_choice"] = tool_choice
    thinking, effort = _reasoning_to_anthropic(request, report)
    if thinking:
        payload["thinking"] = thinking
    output_config: Dict[str, Any] = {}
    if effort:
        output_config["effort"] = effort
    if request.structured_output:
        output_config["format"] = dict(request.structured_output)
    if output_config:
        payload["output_config"] = output_config
    if request.metadata:
        payload["metadata"] = dict(request.metadata)
    if request.state.get("context_management"):
        payload["context_management"] = request.state["context_management"]
    return {key: value for key, value in payload.items() if value is not None}


def parse_response(response: Dict[str, Any], context: ConversionContext | None = None) -> AgentResponse:
    items = _content_blocks(response.get("content") or [])
    if context:
        for item in items:
            if item.kind == "tool_call":
                original = context.tool_name_to_original.get(item.name)
                if original:
                    item.name = original
                if item.name in context.custom_tool_names:
                    item.kind = "custom_tool_call"
                    if isinstance(item.input, dict) and "content" in item.input:
                        item.input = str(item.input.get("content") or "")
    usage = response.get("usage") or {}
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    stop = str(response.get("stop_reason") or "end_turn")
    return AgentResponse(
        source_format=ANTHROPIC,
        response_id=str(response.get("id") or new_id("msg")),
        model=str(response.get("model") or "unknown"),
        items=items,
        status="incomplete" if stop == "max_tokens" else "completed",
        stop_reason=stop,
        stop_sequence=response.get("stop_sequence"),
        usage=Usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            input_details={
                key: usage[key]
                for key in ("cache_creation_input_tokens", "cache_read_input_tokens")
                if usage.get(key) is not None
            },
        ),
        raw=dict(response),
    )


def render_response(response: AgentResponse, *, original_model: str | None = None, context: ConversionContext | None = None, report: ConversionReport | None = None) -> Dict[str, Any]:
    content: List[Dict[str, Any]] = []
    report = report or ConversionReport(response.source_format, ANTHROPIC)
    for index, item in enumerate(response.items):
        if item.kind == "reasoning":
            if item.source_format == ANTHROPIC and item.signature:
                content.append({"type": "thinking", "thinking": item.text, "signature": item.signature})
            else:
                report.add(f"response.output[{index}].reasoning", "safe_drop", detail="cannot forge Anthropic thinking signature")
        elif item.kind == "text":
            content.append({"type": "text", "text": item.text})
        elif item.kind == "refusal":
            content.append({"type": "text", "text": item.text})
            report.add(f"response.output[{index}].refusal", "map", target="text")
        elif item.kind in ("tool_call", "custom_tool_call"):
            name = item.name
            if context:
                name = context.original_tool_to_wire.get(name, name)
            if item.kind == "custom_tool_call" or (context and item.name in context.custom_tool_names):
                input_value = {"content": item.input if item.input is not None else unwrap_custom_tool_arguments(item.arguments)}
            elif item.input is not None:
                input_value = item.input
            else:
                input_value = parse_json_object(item.arguments, field=f"response.output[{index}].arguments")
            content.append({"type": "tool_use", "id": item.call_id or new_id("toolu"), "name": name, "input": input_value})
    if not content:
        content.append({"type": "text", "text": ""})
    has_tool = any(item.get("type") == "tool_use" for item in content)
    stop = response.stop_reason
    if has_tool:
        stop = "tool_use"
    elif stop in ("stop", "content_filter"):
        stop = "end_turn"
    elif stop == "length":
        stop = "max_tokens"
    return {
        "id": response.response_id if response.response_id.startswith("msg_") else new_id("msg"),
        "type": "message",
        "role": "assistant",
        "content": content,
        "model": original_model or response.model,
        "stop_reason": stop or "end_turn",
        "stop_sequence": response.stop_sequence,
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            **response.usage.input_details,
        },
    }
