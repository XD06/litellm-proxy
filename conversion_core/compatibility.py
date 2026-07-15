from __future__ import annotations

from typing import Any, Dict

from .model import ANTHROPIC, CHAT, RESPONSES, ConversionReport


_RESPONSES_SAFE_HINTS = {"prompt_cache_key", "service_tier"}
_RESPONSES_BLOCKED_STATE = {"background", "prompt"}
_HOSTED_RESPONSES_TOOLS = {
    "web_search",
    "web_search_preview",
    "file_search",
    "computer_use_preview",
    "computer",
    "code_interpreter",
    "image_generation",
    "mcp",
    "tool_search",
}


def _contains_key(value: Any, field: str) -> bool:
    if isinstance(value, dict):
        return field in value or any(_contains_key(child, field) for child in value.values())
    if isinstance(value, list):
        return any(_contains_key(child, field) for child in value)
    return False


def _analyze_responses(request: Dict[str, Any], target: str, report: ConversionReport) -> None:
    if request.get("reasoning") is not None:
        report.add("reasoning", "map", target="reasoning_effort" if target == CHAT else "thinking")
    if request.get("text") is not None:
        fmt = request.get("text", {}).get("format") if isinstance(request.get("text"), dict) else None
        if isinstance(fmt, dict) and fmt.get("type") not in (None, "text"):
            report.add("text", "map", target="response_format" if target == CHAT else "output_config.format")
    if request.get("store") is False:
        report.add("store", "safe_drop", detail="false is the stateless default for cross-format upstreams")
    elif request.get("store") is True:
        report.add("store", "stateful", detail="proxy session store owns cross-format persistence")
    if request.get("include") is not None:
        include = request.get("include") or []
        unsupported = [str(item) for item in include if str(item) not in ("reasoning.encrypted_content", "web_search_call.action.sources")]
        if unsupported:
            report.add("include", "block", detail=f"unsupported include item(s): {', '.join(unsupported)}")
        else:
            report.add("include", "safe_drop", detail="target protocol cannot request provider-specific include fields")
    for field in _RESPONSES_SAFE_HINTS:
        if request.get(field) is not None:
            report.add(field, "safe_drop", detail="provider/cache hint does not change prompt semantics")
    for field in _RESPONSES_BLOCKED_STATE:
        if request.get(field) is not None:
            report.add(field, "block", detail="target protocol has no equivalent execution mode")
    if request.get("truncation") not in (None, "disabled"):
        report.add("truncation", "block", detail="automatic server-side truncation cannot be reproduced")
    elif request.get("truncation") == "disabled":
        report.add("truncation", "safe_drop")
    if request.get("previous_response_id"):
        report.add(
            "previous_response_id",
            "stateful",
            target="input",
            detail="requires bounded local Responses session expansion before the upstream call",
        )
    if request.get("conversation"):
        report.add("conversation", "block", detail="conversation must be expanded before cross-format routing")
    if request.get("parallel_tool_calls") is not None:
        report.add(
            "parallel_tool_calls",
            "map" if target == ANTHROPIC else "preserve",
            target="tool_choice.disable_parallel_tool_use" if target == ANTHROPIC else "parallel_tool_calls",
        )
    for index, tool in enumerate(request.get("tools") or []):
        if not isinstance(tool, dict):
            continue
        kind = str(tool.get("type") or "function")
        if kind == "custom":
            report.add(f"tools[{index}]", "map", target="function", detail="wrap custom input in content:string")
        elif kind in _HOSTED_RESPONSES_TOOLS:
            report.add(f"tools[{index}]", "block", detail=f"hosted tool {kind} has no target-protocol equivalent")


def _analyze_chat(request: Dict[str, Any], target: str, report: ConversionReport) -> None:
    if request.get("reasoning_effort") is not None:
        report.add("reasoning_effort", "map", target="reasoning" if target == RESPONSES else "thinking")
    if request.get("response_format") is not None:
        report.add("response_format", "map", target="text.format" if target == RESPONSES else "output_config.format")
    if request.get("parallel_tool_calls") is not None and target == ANTHROPIC:
        report.add("parallel_tool_calls", "map", target="tool_choice.disable_parallel_tool_use")
    for field in ("audio", "modalities", "prediction"):
        if request.get(field) is not None:
            report.add(field, "block", detail="target protocol cannot preserve this output modality")
    for field in ("logprobs", "top_logprobs"):
        if request.get(field) is not None and target == ANTHROPIC:
            report.add(field, "block", detail="Anthropic Messages has no logprobs response contract")


def _analyze_anthropic(request: Dict[str, Any], target: str, report: ConversionReport) -> None:
    if request.get("thinking") is not None:
        report.add("thinking", "map", target="reasoning_effort" if target == CHAT else "reasoning")
    if isinstance(request.get("output_config"), dict):
        if request["output_config"].get("format") is not None:
            report.add("output_config.format", "map", target="response_format" if target == CHAT else "text.format")
        if request["output_config"].get("effort") is not None:
            report.add("output_config.effort", "map", target="reasoning_effort" if target == CHAT else "reasoning.effort")
    for field in ("cache_control", "service_tier", "inference_geo"):
        if request.get(field) is not None or _contains_key(request, field):
            report.add(field, "safe_drop", detail="provider hint does not alter message/tool semantics")
    if request.get("container") is not None:
        report.add("container", "block", detail="target protocol has no equivalent reusable container")
    if request.get("mcp_servers") is not None:
        report.add("mcp_servers", "block", detail="server-managed MCP cannot be converted to client tools")
    if request.get("context_management") is not None:
        if target == RESPONSES:
            report.add("context_management", "map", target="context_management")
        else:
            report.add("context_management", "block", detail="Chat Completions cannot reproduce context compaction")
    tool_choice = request.get("tool_choice")
    if isinstance(tool_choice, dict) and tool_choice.get("disable_parallel_tool_use") is not None:
        report.add("tool_choice.disable_parallel_tool_use", "map", target="parallel_tool_calls")


def analyze_request(source_format: str, target_format: str, request: Dict[str, Any], *, mode: str = "safe") -> ConversionReport:
    report = ConversionReport(source_format=source_format, target_format=target_format)
    if source_format == target_format:
        return report
    if source_format == RESPONSES:
        _analyze_responses(request, target_format, report)
    elif source_format == CHAT:
        _analyze_chat(request, target_format, report)
    elif source_format == ANTHROPIC:
        _analyze_anthropic(request, target_format, report)
    else:
        report.add("format", "block", detail=f"unsupported source format: {source_format}")
    if mode == "strict":
        for action in list(report.actions):
            if action.action in ("safe_drop", "stateful"):
                report.add(action.field, "block", detail=f"strict mode rejects {action.action}")
    return report
