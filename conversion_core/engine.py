from __future__ import annotations

from typing import Any, Dict, Optional

from .codecs import anthropic, chat, responses
from .compatibility import analyze_request
from .errors import ConversionError
from .model import (
    ANTHROPIC,
    CHAT,
    RESPONSES,
    AgentRequest,
    ConversionContext,
    ConversionReport,
    ModelResolver,
    PreparedRequest,
)
from .validation import analyze_ir_compatibility, validate_response_tool_calls, validate_tool_history


_CODECS = {
    CHAT: chat,
    RESPONSES: responses,
    ANTHROPIC: anthropic,
}


def _codec(name: str):
    try:
        return _CODECS[name]
    except KeyError as exc:
        raise ConversionError(f"unsupported format: {name}", code="unsupported_format", field="format") from exc


def _context_from_request(
    request: AgentRequest,
    source_format: str,
    target_format: str,
    report: ConversionReport,
    *,
    session_store=None,
    session_request: Optional[Dict[str, Any]] = None,
    session_expanded_from: str = "",
) -> ConversionContext:
    context = ConversionContext(
        source_format=source_format,
        target_format=target_format,
        report=report,
        session_store=session_store,
        session_request=dict(session_request or {}),
        session_expanded_from=session_expanded_from,
    )
    context.custom_tool_names.update(tool.name for tool in request.tools if tool.kind == "custom")
    return context


def prepare_request(
    source_format: str,
    target_format: str,
    request: Dict[str, Any],
    *,
    resolve_model: ModelResolver,
    mode: str = "safe",
    session_store=None,
) -> PreparedRequest:
    original_request = dict(request)
    working_request = request
    session_expanded_from = ""
    if source_format == RESPONSES and target_format != RESPONSES and request.get("previous_response_id"):
        session_expanded_from = str(request.get("previous_response_id") or "")
        if session_store is None:
            raise ConversionError(
                "previous_response_id requires the local Responses session store for cross-format routing",
                code="session_missing",
                field="previous_response_id",
                source_format=source_format,
                target_format=target_format,
                details={"response_id": session_expanded_from},
            )
        working_request = session_store.expand_request(request)
    report = analyze_request(source_format, target_format, working_request, mode=mode)
    if session_expanded_from:
        report.add(
            "previous_response_id",
            "stateful",
            target="input",
            detail=f"expanded local response chain from {session_expanded_from}",
        )
    if not report.allowed:
        raise ConversionError(
            f"cannot convert {source_format} to {target_format}: {', '.join(report.blockers)}",
            code="conversion_blocked",
            field=report.blockers[0] if report.blockers else "",
            source_format=source_format,
            target_format=target_format,
            details=report.as_dict(),
        )
    source = _codec(source_format)
    agent_request = source.parse_request(working_request, report)
    if source_format != target_format:
        validate_tool_history(agent_request)
        analyze_ir_compatibility(agent_request, target_format, report)
        if not report.allowed:
            raise ConversionError(
                f"cannot convert {source_format} to {target_format}: {', '.join(report.blockers)}",
                code="conversion_blocked",
                field=report.blockers[0],
                source_format=source_format,
                target_format=target_format,
                details=report.as_dict(),
            )
    context = _context_from_request(
        agent_request,
        source_format,
        target_format,
        report,
        session_store=session_store,
        session_request=original_request,
        session_expanded_from=session_expanded_from,
    )
    if source_format == target_format:
        payload = request
    else:
        try:
            payload = _codec(target_format).render_request(
                agent_request,
                resolve_model=resolve_model,
                context=context,
                report=report,
            )
        except ConversionError as exc:
            if not exc.source_format:
                exc.source_format = source_format
            if not exc.target_format:
                exc.target_format = target_format
            raise
    return PreparedRequest(payload=payload, context=context, report=report, request=agent_request)


def translate_response(
    source_format: str,
    target_format: str,
    response: Dict[str, Any],
    *,
    original_model: Optional[str] = None,
    context: Optional[ConversionContext] = None,
) -> Dict[str, Any]:
    if source_format == target_format:
        persist_response_session(context, response)
        return response
    report = context.report if context and context.report else ConversionReport(source_format, target_format)
    agent_response = _codec(source_format).parse_response(response, context=context)
    validate_response_tool_calls(agent_response)
    converted = _codec(target_format).render_response(
        agent_response,
        original_model=original_model,
        context=context,
        report=report,
    )
    persist_response_session(context, converted)
    return converted


def persist_response_session(context: Optional[ConversionContext], response: Dict[str, Any]) -> bool:
    if (
        context is None
        or context.source_format != RESPONSES
        or context.session_store is None
        or not context.session_request
    ):
        return False
    return bool(context.session_store.save(context.session_request, response))
