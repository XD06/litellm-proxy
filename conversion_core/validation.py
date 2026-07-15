from __future__ import annotations

from typing import Dict

from .errors import ConversionError
from .common import parse_json_object
from .model import ANTHROPIC, RESPONSES, AgentRequest, AgentResponse, ConversionReport


def validate_tool_history(request: AgentRequest) -> None:
    """Validate the cross-protocol tool lifecycle without inventing results."""
    outstanding: Dict[str, str] = {}
    resolved: set[str] = set()
    for turn_index, turn in enumerate(request.turns):
        calls = [block for block in turn.content if block.kind in ("tool_call", "custom_tool_call")]
        results = [block for block in turn.content if block.kind == "tool_result"]
        if calls:
            if outstanding:
                missing = next(iter(outstanding))
                raise ConversionError(
                    f"tool call {missing} has no result before the next assistant tool call",
                    code="missing_tool_result",
                    field=outstanding[missing],
                )
            for call_index, block in enumerate(calls):
                call_id = str(block.call_id or "")
                field = f"turns[{turn_index}].tool_calls[{call_index}]"
                if not call_id:
                    raise ConversionError("tool call id is required", code="missing_tool_call_id", field=field)
                if call_id in outstanding:
                    raise ConversionError(f"duplicate tool call id: {call_id}", code="duplicate_tool_call", field=field)
                outstanding[call_id] = field
                resolved.discard(call_id)
        if results:
            seen_in_turn: set[str] = set()
            for result_index, block in enumerate(results):
                call_id = str(block.call_id or "")
                field = f"turns[{turn_index}].tool_results[{result_index}]"
                if not call_id or call_id not in outstanding:
                    code = "duplicate_tool_result" if call_id in resolved or call_id in seen_in_turn else "orphan_tool_result"
                    raise ConversionError(f"tool result does not match an outstanding call: {call_id or '<missing>'}", code=code, field=field)
                if call_id in seen_in_turn:
                    raise ConversionError(f"duplicate tool result: {call_id}", code="duplicate_tool_result", field=field)
                seen_in_turn.add(call_id)
                outstanding.pop(call_id, None)
                resolved.add(call_id)
        if outstanding and turn.role == "user" and not results:
            missing = next(iter(outstanding))
            raise ConversionError(
                f"tool call {missing} has no result before the next user turn",
                code="missing_tool_result",
                field=outstanding[missing],
            )
    if outstanding:
        missing = next(iter(outstanding))
        raise ConversionError(
            f"tool call {missing} has no result",
            code="missing_tool_result",
            field=outstanding[missing],
        )


def analyze_ir_compatibility(request: AgentRequest, target_format: str, report: ConversionReport) -> None:
    """Find semantic blocks that raw top-level field analysis cannot see."""
    if request.source_format == target_format:
        return
    system_text_present = any(block.kind == "text" and block.text for block in request.system)
    for block_index, block in enumerate(request.system):
        if block.kind == "text":
            continue
        field = f"system[{block_index}]"
        if block.kind in ("image", "file"):
            report.add(
                field,
                "safe_drop" if system_text_present else "block",
                detail=f"{target_format} cannot preserve non-text system content",
            )
        elif block.kind == "opaque":
            report.add(
                field,
                "block",
                detail=f"unsupported {request.source_format} system content item: {block.raw.get('type') or 'unknown'}",
            )
    for turn_index, turn in enumerate(request.turns):
        meaningful = [block for block in turn.content if block.kind in ("text", "tool_call", "custom_tool_call", "tool_result", "image", "file")]
        for block_index, block in enumerate(turn.content):
            field = f"turns[{turn_index}].content[{block_index}]"
            if block.kind == "reasoning" and (block.encrypted_content or (request.source_format == ANTHROPIC and not block.text)):
                if target_format == RESPONSES and block.encrypted_content:
                    report.add(field, "preserve", target="reasoning.encrypted_content")
                elif meaningful:
                    report.add(field, "safe_drop", detail="opaque reasoning omitted while visible turn semantics remain")
                else:
                    report.add(field, "block", detail="opaque reasoning is the only content in this assistant turn")
            elif block.kind == "opaque":
                block_type = str(block.raw.get("type") or "unknown")
                report.add(field, "block", detail=f"unsupported {request.source_format} content item: {block_type}")
            elif block.kind == "tool_result" and target_format == "chat_completions" and isinstance(block.output, list):
                has_media = any(
                    isinstance(item, dict)
                    and str(item.get("type") or "") in ("image", "input_image", "output_image", "document", "input_file", "output_file")
                    for item in block.output
                )
                if has_media:
                    has_text = any(
                        isinstance(item, str)
                        or (
                            isinstance(item, dict)
                            and str(item.get("type") or "") in ("text", "input_text", "output_text")
                            and bool(item.get("text"))
                        )
                        for item in block.output
                    )
                    report.add(
                        field,
                        "safe_drop" if has_text else "block",
                        detail="Chat Completions tool messages cannot preserve non-text tool-result media",
                    )


def validate_response_tool_calls(response: AgentResponse) -> None:
    for index, item in enumerate(response.items):
        if item.kind != "tool_call":
            continue
        parse_json_object(item.arguments if item.arguments != "" else item.input, field=f"response.output[{index}].arguments")
