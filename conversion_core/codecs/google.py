"""Google Gemini native format (generateContent / streamGenerateContent) codec.

This project speaks Google's native wire protocol in exactly one direction:
as an UPSTREAM provider format.  Clients keep talking Chat Completions,
Responses, or Anthropic Messages; only requests rendered toward a Google
provider and responses parsed back from one go through this codec.

- ``render_request``: IR AgentRequest -> generateContent body.
- ``parse_response``: GenerateContentResponse -> IR AgentResponse.
- ``parse_request`` / ``render_response``: refused on purpose (one-way contract;
  there is no /v1beta client entry).

Gemini 3 thought signatures are carried on ``ContentBlock.signature`` for both
thought parts and functionCall parts, so tool-call history can be sent back to
Google with the exact signature the model produced (or the documented dummy
signature when no client format could round-trip one).
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from ..common import (
    content_text,
    json_dumps,
    new_id,
    normalize_tool_schema,
    parse_json_object,
)
from ..errors import ConversionError
from ..model import (
    GOOGLE,
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

# Bypass token Google accepts when a real thought signature is unavailable
# (base64 of "skip_thought_signature_validator").
DUMMY_THOUGHT_SIGNATURE = base64.b64encode(b"skip_thought_signature_validator").decode("ascii")

# reasoning effort -> thinkingBudget for Gemini 2.5-family models.
_EFFORT_TO_BUDGET = {
    "minimal": 1024,
    "low": 1024,
    "medium": 8192,
    "high": 24576,
    "xhigh": 32768,
}
_THINKING_LEVELS = ("minimal", "low", "medium", "high")

# Google REST enums -> IR stop tokens (values the other renderers already map).
_FINISH_TO_STOP = {
    "STOP": "stop",
    "MAX_TOKENS": "max_tokens",
    "SAFETY": "content_filter",
    "RECITATION": "content_filter",
    "BLOCKLIST": "content_filter",
    "PROHIBITED_CONTENT": "content_filter",
    "SPII": "content_filter",
    "MODEL_STACKING": "content_filter",
    "OTHER": "stop",
}

# Google function name charset is stricter than Chat's (no hyphens, <=63 chars).
_GOOGLE_NAME_RE = re.compile(r"^[a-zA-Z0-9_]{1,63}$")
_GOOGLE_BAD_CHARS = re.compile(r"[^a-zA-Z0-9_]")

# Signature side-channel hooks wired by the proxy layer (a bounded store keeps
# signatures for client formats without a signature slot, e.g. Anthropic
# tool_use history).  The codec itself stays storage-free so conversion_core
# remains standalone-importable.
_SIGNATURE_LOOKUP: Optional[Callable[[str], Optional[str]]] = None
_SIGNATURE_PERSIST: Optional[Callable[[Dict[str, str]], None]] = None


def set_signature_hooks(lookup=None, persist=None) -> None:
    """Install store hooks: lookup(call_id)->signature|None, persist(dict)->None.
    Passing None for both disables the store path (dummy fallback only)."""
    global _SIGNATURE_LOOKUP, _SIGNATURE_PERSIST
    _SIGNATURE_LOOKUP = lookup if callable(lookup) else None
    _SIGNATURE_PERSIST = persist if callable(persist) else None


def persist_signatures(signatures: Dict[str, str]) -> None:
    if _SIGNATURE_PERSIST is None or not signatures:
        return
    try:
        _SIGNATURE_PERSIST(dict(signatures))
    except Exception:
        pass


def _lookup_signature(call_id: str) -> str:
    if not call_id or _SIGNATURE_LOOKUP is None:
        return ""
    try:
        return str(_SIGNATURE_LOOKUP(call_id) or "")
    except Exception:
        return ""


def collect_response_signatures(response: AgentResponse) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for block in response.items:
        if block.kind == "tool_call" and block.signature and block.call_id:
            out[block.call_id] = block.signature
    return out


def _google_tool_name(name: str, used: Optional[set] = None) -> str:
    raw = str(name or "")
    if _GOOGLE_NAME_RE.fullmatch(raw) and (used is None or raw not in used):
        if used is not None:
            used.add(raw)
        return raw
    base = _GOOGLE_BAD_CHARS.sub("_", raw).strip("_") or "tool"
    if base[0].isdigit():
        base = "_" + base
    base = base[:63]
    candidate = base
    if used is not None and candidate in used:
        suffix = "_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]
        candidate = (base[: 54] + suffix)[:63]
    if used is not None:
        used.add(candidate)
    return candidate


def _is_gemini_3(model: str) -> bool:
    match = re.search(r"gemini[-/]?(\d+)(?:\.|-|$)", str(model or "").lower())
    if not match:
        return False
    try:
        return int(match.group(1)) >= 3
    except ValueError:
        return False


def _data_url_to_inline(url: str) -> Optional[Dict[str, Any]]:
    if not url.startswith("data:") or ";base64," not in url:
        return None
    header, _, data = url.partition(",")
    media_type = header[5:].split(";", 1)[0] or "application/octet-stream"
    return {"inlineData": {"mimeType": media_type, "data": data}}


def _media_part(block: ContentBlock) -> Optional[Dict[str, Any]]:
    if block.data:
        return {"inlineData": {"mimeType": block.media_type or "application/octet-stream", "data": block.data}}
    if block.url:
        inline = _data_url_to_inline(block.url)
        if inline:
            return inline
    return None


def _response_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    text = content_text(value)
    if not text:
        return {"result": ""}
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"result": text}
    if isinstance(parsed, dict):
        return parsed
    return {"result": parsed}


def _call_arguments(block: ContentBlock, field: str) -> Dict[str, Any]:
    if block.input is not None and not isinstance(block.input, str):
        return dict(block.input) if isinstance(block.input, dict) else {"value": block.input}
    try:
        return parse_json_object(block.arguments or "{}", field=field)
    except ConversionError:
        # An assistant history call with malformed arguments must not sink the
        # whole request; Google only needs a JSON object to continue the loop.
        return {"raw": block.arguments or ""}


def _candidate_count(request: AgentRequest) -> Optional[int]:
    params = request.parameters if isinstance(request.parameters, dict) else {}
    explicit = params.get("candidateCount") or params.get("google_candidate_count")
    if isinstance(explicit, int) and explicit > 1:
        return explicit
    n_value = params.get("n")
    if isinstance(n_value, int) and n_value > 1:
        return min(n_value, 8)
    return None


def _parse_thinking_config(
    request: AgentRequest,
    gen_model: str,
    report: ConversionReport,
) -> Optional[Dict[str, Any]]:
    """Derive thinkingConfig from IR reasoning."""
    reasoning = request.reasoning or {}
    effort = str(reasoning.get("effort") or "").strip().lower()
    disabled = reasoning.get("type") == "disabled" or effort in ("off", "none", "disable")
    budget: Optional[int] = None
    raw_budget = reasoning.get("budget_tokens") or reasoning.get("thinking_budget")
    if isinstance(raw_budget, (int, float)) and int(raw_budget) >= 0 and not disabled:
        budget = int(raw_budget)
    level = None
    raw_level = str(reasoning.get("thinking_level") or reasoning.get("level") or "").strip().lower()
    if raw_level in _THINKING_LEVELS:
        level = raw_level

    config: Dict[str, Any] = {}
    if _is_gemini_3(gen_model):
        if disabled:
            config["thinkingLevel"] = "minimal"
            config["includeThoughts"] = False
            report.add("reasoning", "map", target="thinkingLevel=minimal", detail="Gemini 3 cannot fully disable thinking")
        else:
            if level:
                config["thinkingLevel"] = level
            elif effort:
                config["thinkingLevel"] = effort if effort in _THINKING_LEVELS else "medium"
            elif budget is not None:
                mapped = "high" if budget > 16384 else "medium" if budget > 4096 else "low" if budget > 1024 else "minimal"
                config["thinkingLevel"] = mapped
                report.add("reasoning.budget_tokens", "map", target=f"thinkingLevel={mapped}", detail="Gemini 3 uses thinkingLevel, not budgets")
            else:
                # No explicit request: keep Google's native adaptive default.
                config["includeThoughts"] = True
                return config
            config["includeThoughts"] = True
        return config

    if disabled:
        config["includeThoughts"] = False
        config["thinkingBudget"] = 0
        return config
    explicit_budget = budget if budget is not None else _EFFORT_TO_BUDGET.get(effort)
    config["includeThoughts"] = True
    if explicit_budget is not None:
        config["thinkingBudget"] = explicit_budget
    elif effort and effort not in _EFFORT_TO_BUDGET:
        report.add("reasoning.effort", "safe_drop", detail=f"unrecognized reasoning effort {effort!r}; keeping model default thinking budget")
    return config


def thinking_override_for_effort(effort: str, model: str) -> Optional[Dict[str, Any]]:
    """Map one proxy reasoning-effort value to a generationConfig.thinkingConfig
    override for a Google request body.  Returns None when the value is unknown
    (leave the codec-produced thinkingConfig untouched)."""
    value = str(effort or "").strip().lower()
    if not value:
        return None
    three = _is_gemini_3(model)
    if value == "off":
        if three:
            return {"includeThoughts": False, "thinkingLevel": "minimal"}
        return {"includeThoughts": False, "thinkingBudget": 0}
    if three:
        return {"includeThoughts": True, "thinkingLevel": value if value in _THINKING_LEVELS else "medium"}
    budget = _EFFORT_TO_BUDGET.get(value)
    if budget is None:
        return None
    return {"includeThoughts": True, "thinkingBudget": budget}


def parse_request(request: Dict[str, Any], report: ConversionReport) -> AgentRequest:
    raise ConversionError(
        "Google native requests are not accepted by this proxy; clients should use Chat Completions, Responses, or Anthropic Messages",
        code="unsupported_format",
        field="format",
        source_format=GOOGLE,
    )


def parse_response(response: Dict[str, Any], context: Optional[ConversionContext] = None) -> AgentResponse:
    candidates = [candidate for candidate in (response.get("candidates") or []) if isinstance(candidate, dict)]
    items: List[ContentBlock] = []
    finish = ""
    stop_sequence: Optional[str] = None
    if candidates:
        # The conversion IR carries a single assistant answer; extra
        # candidateCount results are dropped when collapsing into one response.
        candidate = candidates[0]
        finish = str(candidate.get("finishReason") or "")
        parts = (candidate.get("content") or {}).get("parts") or []
        for part in parts:
            if not isinstance(part, dict):
                continue
            # Google attaches thoughtSignature on the part (sibling of
            # functionCall); tolerate the nested placement seen in some
            # captured payloads.
            function_call = part.get("functionCall") if isinstance(part.get("functionCall"), dict) else None
            signature = str(part.get("thoughtSignature") or (function_call or {}).get("thoughtSignature") or "")
            if function_call:
                wire_name = str(function_call.get("name") or "")
                name = context.tool_name_to_original.get(wire_name, wire_name) if context else wire_name
                args = function_call.get("args") if isinstance(function_call.get("args"), dict) else {}
                items.append(
                    ContentBlock(
                        kind="tool_call",
                        call_id=str(function_call.get("id") or new_id("call")),
                        name=name,
                        input=dict(args),
                        arguments=json_dumps(args),
                        signature=signature,
                        source_format=GOOGLE,
                        raw=dict(part),
                    )
                )
            elif part.get("thought") and str(part.get("text") or "").strip():
                items.append(
                    ContentBlock(
                        kind="reasoning",
                        text=str(part.get("text") or ""),
                        signature=signature,
                        source_format=GOOGLE,
                        raw=dict(part),
                    )
                )
            elif part.get("text"):
                items.append(ContentBlock(kind="text", text=str(part.get("text")), source_format=GOOGLE, raw=dict(part)))
    if not candidates:
        block_reason = str(((response.get("promptFeedback") or {}).get("blockReason")) or "")
        if block_reason:
            finish = "SAFETY"

    stop = _FINISH_TO_STOP.get(finish, "stop" if finish else "stop")
    status = "incomplete" if finish == "MAX_TOKENS" else "completed"

    usage_raw = response.get("usageMetadata") or {}
    input_tokens = int(usage_raw.get("promptTokenCount", 0) or 0)
    output_tokens = int(usage_raw.get("candidatesTokenCount", 0) or 0)
    thoughts_tokens = int(usage_raw.get("thoughtsTokenCount", 0) or 0)
    total_tokens = int(usage_raw.get("totalTokenCount", input_tokens + output_tokens + thoughts_tokens) or 0)
    input_details: Dict[str, Any] = {}
    cached = int(usage_raw.get("cachedContentTokenCount", 0) or 0)
    if cached:
        input_details["cached_tokens"] = cached
    output_details: Dict[str, Any] = {}
    if thoughts_tokens:
        output_details["reasoning_tokens"] = thoughts_tokens

    return AgentResponse(
        source_format=GOOGLE,
        response_id=str(response.get("responseId") or new_id("gen")),
        model=str(response.get("modelVersion") or "unknown"),
        items=items,
        status=status,
        stop_reason=stop,
        stop_sequence=stop_sequence,
        usage=Usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            input_details=input_details,
            output_details=output_details,
        ),
        raw=dict(response),
    )


def render_response(response: AgentResponse, *, original_model: Optional[str] = None, context: Optional[ConversionContext] = None, report: Optional[ConversionReport] = None) -> Dict[str, Any]:
    raise ConversionError(
        "Google native responses are not rendered to clients by this proxy; there is no Gemini-native client entry",
        code="unsupported_format",
        field="format",
        target_format=GOOGLE,
    )


def _turn_parts(
    request: AgentRequest,
    turn: AgentTurn,
    context: ConversionContext,
    report: ConversionReport,
    turn_index: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (model-role parts, user-role functionResponse parts) for one turn."""
    parts: List[Dict[str, Any]] = []
    responses: List[Dict[str, Any]] = []
    text_pieces: List[str] = []

    def flush_text() -> None:
        if text_pieces:
            parts.append({"text": "\n".join(piece for piece in text_pieces if piece)})
            text_pieces.clear()

    for block_index, block in enumerate(turn.content):
        field = f"contents[{turn_index}].parts[{block_index}]"
        if block.kind == "reasoning":
            # Thought summaries are not replayed to Google: the signature that
            # matters lives on the functionCall part, and thought text in
            # history is optional there.  (Fidelity requirement from the
            # Gemini docs: resend function calls with their thoughtSignature.)
            report.add(field, "safe_drop", detail="thought summaries are optional in Gemini history")
            continue
        if block.kind == "text" and block.text:
            text_pieces.append(block.text)
            continue
        if block.kind == "refusal":
            text_pieces.append(block.text)
            continue
        if block.kind in ("image", "file"):
            media = _media_part(block)
            if media:
                flush_text()
                parts.append(media)
            else:
                report.add(
                    field,
                    "block",
                    detail="remote media URL/file_id cannot be converted to inlineData; Google needs inline bytes or a Files API URI",
                )
            continue
        if block.kind in ("tool_call", "custom_tool_call"):
            flush_text()
            wire_name = context.original_tool_to_wire.get(block.name, block.name)
            signature = block.signature or _lookup_signature(block.call_id)
            if not signature:
                signature = DUMMY_THOUGHT_SIGNATURE
                report.add(field, "map", target="thoughtSignature=dummy", detail="no round-trippable signature; using skip_thought_signature_validator")
            elif not block.signature:
                report.add(field, "map", target="thoughtSignature=stored", detail="thought signature restored from the proxy-side store")
            call: Dict[str, Any] = {
                "name": wire_name,
                "args": _call_arguments(block, f"{field}.arguments"),
            }
            if block.call_id:
                call["id"] = block.call_id
            # thoughtSignature is a Part-level field (sibling of functionCall);
            # the FunctionCall proto only carries name/args/id.
            parts.append({"functionCall": call, "thoughtSignature": signature})
            continue
        if block.kind == "tool_result":
            flush_text()
            wire_name = context.original_tool_to_wire.get(block.name, block.name)
            if not wire_name:
                for call_turn in request.turns:
                    for call_block in call_turn.content:
                        if call_block.kind in ("tool_call", "custom_tool_call") and call_block.call_id == block.call_id:
                            wire_name = context.original_tool_to_wire.get(call_block.name, call_block.name)
                            break
                    if wire_name:
                        break
            response_part: Dict[str, Any] = {
                "name": wire_name,
                "response": _response_object({"error": content_text(block.output)} if block.is_error else block.output),
            }
            if block.call_id:
                response_part["id"] = block.call_id
            responses.append({"functionResponse": response_part})
            continue
        if block.kind == "opaque":
            report.add(field, "safe_drop", detail=f"unsupported {block.source_format or 'foreign'} content item for Google upstream")
    flush_text()
    return parts, responses


def render_request(
    request: AgentRequest,
    *,
    resolve_model,
    context: ConversionContext,
    report: ConversionReport,
) -> Dict[str, Any]:
    used_names: set = set()
    declarations: List[Dict[str, Any]] = []
    for tool in request.tools:
        if tool.kind != "function":
            report.add(
                f"tools[{tool.name}]",
                "block",
                detail=f"tool kind {tool.kind!r} has no Google generateContent equivalent",
            )
            continue
        wire_name = _google_tool_name(tool.name, used_names)
        context.original_tool_to_wire[tool.name] = wire_name
        context.tool_name_to_original[wire_name] = tool.name
        if wire_name != tool.name:
            report.add(f"tools.{tool.name}", "map", target=wire_name, detail="sanitize Google function name")
        declaration: Dict[str, Any] = {"name": wire_name}
        if tool.description:
            declaration["description"] = tool.description
        declaration["parametersJsonSchema"] = normalize_tool_schema(tool.input_schema)
        declarations.append(declaration)

    gen_model = str(resolve_model(request.model) or request.model or "")

    contents: List[Dict[str, Any]] = []
    for turn_index, turn in enumerate(request.turns):
        parts, response_parts = _turn_parts(request, turn, context, report, turn_index)
        if not report.allowed:
            break
        if turn.role == "assistant":
            if parts:
                contents.append({"role": "model", "parts": parts})
            elif response_parts:
                contents.append({"role": "user", "parts": response_parts})
            continue
        merged = response_parts + parts
        if not merged:
            merged = [{"text": "."}]
            report.add(f"contents[{turn_index}]", "map", detail="replace empty user turn")
        contents.append({"role": "user", "parts": merged})

    if not report.allowed:
        raise ConversionError(
            f"cannot convert {request.source_format} to {GOOGLE}: {', '.join(report.blockers)}",
            code="conversion_blocked",
            field=report.blockers[0],
            source_format=request.source_format,
            target_format=GOOGLE,
            details=report.as_dict(),
        )

    generation_config: Dict[str, Any] = {}
    if request.temperature is not None:
        generation_config["temperature"] = request.temperature
    if request.top_p is not None:
        generation_config["topP"] = request.top_p
    if request.max_output_tokens is not None:
        generation_config["maxOutputTokens"] = int(request.max_output_tokens)
    if request.stop_sequences:
        generation_config["stopSequences"] = list(request.stop_sequences)
    for key, value in (request.parameters or {}).items():
        if key == "top_k" and isinstance(value, (int, float)):
            generation_config["topK"] = value
            continue
        if key in ("candidateCount", "google_candidate_count"):
            continue
        if key == "n" and isinstance(value, int) and value > 1:
            report.add("n", "map", target="generationConfig.candidateCount", detail="Google exposes candidate count in generationConfig")
            continue
        report.add(key, "safe_drop", detail="request parameter has no generateContent equivalent")

    structured = request.structured_output or {}
    stype = str(structured.get("type") or "")
    schema = structured.get("schema") if isinstance(structured.get("schema"), dict) else None
    if stype == "json_schema" and schema is not None:
        generation_config["responseMimeType"] = "application/json"
        generation_config["responseSchema"] = schema
    elif stype == "json_schema":
        generation_config["responseMimeType"] = "application/json"
        generation_config["responseSchema"] = {k: v for k, v in structured.items() if k not in ("type", "name", "description", "strict")}
    elif stype == "json_object":
        generation_config["responseMimeType"] = "application/json"
    elif structured:
        report.add("structured_output", "safe_drop", detail=f"response format {stype!r} has no generateContent equivalent")

    thinking_config = _parse_thinking_config(request, gen_model, report)
    if thinking_config:
        generation_config["thinkingConfig"] = thinking_config
    cc = _candidate_count(request)
    if cc:
        generation_config["candidateCount"] = cc

    payload: Dict[str, Any] = {"contents": contents}
    system_text = "\n".join(block.text for block in request.system if block.kind == "text" and block.text)
    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}
    if declarations:
        payload["tools"] = [{"functionDeclarations": declarations}]
    choice = request.tool_choice
    if declarations:
        if choice.mode == "named":
            payload["toolConfig"] = {
                "functionCallingConfig": {
                    "mode": "ANY",
                    "allowedFunctionNames": [context.original_tool_to_wire.get(choice.name, choice.name)],
                }
            }
        elif choice.mode in ("required", "auto", "none"):
            payload["toolConfig"] = {"functionCallingConfig": {"mode": {"required": "ANY"}.get(choice.mode, choice.mode.upper())}}
        if choice.parallel is False:
            report.add("parallel_tool_calls", "safe_drop", detail="generateContent has no parallel-tool-call switch")
    if generation_config:
        payload["generationConfig"] = generation_config
    return payload
