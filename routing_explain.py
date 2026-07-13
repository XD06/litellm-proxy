#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict, List


def enrich_request(item: Dict[str, Any]) -> Dict[str, Any]:
    """Add routing explanation fields without mutating the caller's object."""
    out = _copy_value(item)
    attempts = list(out.get("attempts") or [])
    out["attempts"] = [
        _enrich_attempt(attempt, index, len(attempts))
        for index, attempt in enumerate(attempts)
    ]
    out["routing_summary"] = summarize_request(out)
    return out


def summarize_request(item: Dict[str, Any]) -> Dict[str, Any]:
    attempts = list(item.get("attempts") or [])
    routing_trace = list(item.get("routing_trace") or [])
    status_code = int(item.get("status_code") or 0)
    failed_attempts = [a for a in attempts if str(a.get("outcome") or "") != "success"]
    success_attempt = next((a for a in attempts if str(a.get("outcome") or "") == "success"), None)
    final_attempt = success_attempt or (attempts[-1] if attempts else {})
    providers = _unique(a.get("provider") for a in attempts)
    formats = _unique(a.get("upstream_format") for a in attempts)

    if not attempts:
        blockers = [
            event for event in routing_trace
            if str(event.get("code") or "") == "format_blocked_by_parameter"
        ]
        if blockers:
            labels = _unique(
                f"{event.get('target_format')}: {event.get('field')}"
                for event in blockers
                if event.get("target_format") and event.get("field")
            )
            headline = "No eligible upstream candidate. Format blockers: " + ", ".join(labels) + "."
            next_action = "Use a compatible upstream format or remove the listed stateful request fields."
        else:
            headline = "No upstream attempt was recorded."
            next_action = "Check routing filters, model support, provider enable state, key availability, and active circuits."
        outcome = "no_attempts"
    elif success_attempt:
        provider = success_attempt.get("provider") or "unknown"
        fmt = success_attempt.get("upstream_format") or "unknown"
        if failed_attempts:
            headline = f"Recovered on attempt {success_attempt.get('attempt_no')}: {provider} returned a usable {fmt} response."
            outcome = "recovered"
            next_action = "Inspect earlier failed attempts only if latency or cost is unexpected."
        else:
            headline = f"Routed directly to {provider} using {fmt}; no transparent fallback was needed."
            outcome = "direct_success"
            next_action = "No action needed."
    else:
        reason = final_attempt.get("reason") or final_attempt.get("error_type") or item.get("error") or "unknown"
        headline = f"All recorded attempts failed; final reason: {reason}."
        outcome = "failed"
        if attempts:
            next_action = "Check the failed attempt reasons, provider health, model support, and key state."
        else:
            next_action = "No provider/key candidate was available for this request."

    terminal_trace = next(
        (event for event in reversed(routing_trace) if event.get("code") in ("no_candidate", "attempt_failed", "attempt_succeeded")),
        {},
    )
    return {
        "outcome": outcome,
        "headline": headline,
        "attempts": len(attempts),
        "failed_attempts": len(failed_attempts),
        "providers": providers,
        "upstream_formats": formats,
        "final_provider": final_attempt.get("provider") or "",
        "final_upstream_format": final_attempt.get("upstream_format") or "",
        "status_code": status_code,
        "next_action": next_action,
        "owner": terminal_trace.get("owner") or (final_attempt.get("failure_owner") if final_attempt else "") or "",
    }


def explain_attempt(attempt: Dict[str, Any], index: int = 0, total: int = 1) -> Dict[str, Any]:
    return _attempt_explanation(attempt, index, total)


def _enrich_attempt(attempt: Dict[str, Any], index: int, total: int) -> Dict[str, Any]:
    out = _copy_value(attempt)
    out["routing_explanation"] = _attempt_explanation(out, index, total)
    return out


def _attempt_explanation(attempt: Dict[str, Any], index: int, total: int) -> Dict[str, Any]:
    provider = attempt.get("provider") or "unknown"
    fmt = attempt.get("upstream_format") or "unknown"
    provider_model = attempt.get("provider_model") or "requested model"
    outcome = str(attempt.get("outcome") or "unknown")
    reason = attempt.get("reason") or attempt.get("error_type") or ""
    http_status = attempt.get("http_status")
    is_first = index == 0
    has_next = index + 1 < total

    selected = f"Selected {provider} because it was an available candidate for {provider_model} via {fmt}."
    if is_first:
        selected = f"First eligible candidate: {provider} can serve {provider_model} via {fmt}."

    if outcome == "success":
        result = "Upstream response was accepted after conversion or passthrough."
        next_step = "Routing stopped after this successful attempt."
        tone = "success"
    else:
        status_part = f"HTTP {int(http_status)}" if http_status is not None else "transport or conversion failure"
        result = f"Attempt failed with {status_part}"
        if reason:
            result += f" ({reason})"
        result += "."
        if has_next:
            next_step = "Proxy switched to the next distinct provider/key/format candidate before writing a final client response."
        else:
            next_step = "No later recorded candidate succeeded; this attempt contributed to the final client error."
        tone = _tone_for_reason(reason, http_status)

    return {
        "selected": selected,
        "result": result,
        "next_step": next_step,
        "tone": tone,
    }


def _tone_for_reason(reason: Any, http_status: Any) -> str:
    text = str(reason or "").lower()
    if "rate" in text or str(http_status or "") == "429":
        return "warn"
    if "compat" in text or "tool_choice" in text or "empty_visible" in text:
        return "compat"
    if "network" in text or "timeout" in text:
        return "info"
    return "danger"


def _unique(values: Any) -> List[str]:
    seen = set()
    out: List[str] = []
    for value in values:
        if not value:
            continue
        text = str(value)
        if text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _copy_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _copy_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_copy_value(v) for v in value]
    return value
