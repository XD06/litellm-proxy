#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import queue
import socket
import threading
import time
import uuid
from typing import Any, Dict, Iterable, Optional

from usage_accounting import empty_usage, has_usage, normalize_usage
from upstream_client import set_response_read_timeout


_PREFETCH_POOL = None
_PREFETCH_POOL_LOCK = threading.Lock()

def _get_prefetch_pool():
    global _PREFETCH_POOL
    if _PREFETCH_POOL is None:
        with _PREFETCH_POOL_LOCK:
            if _PREFETCH_POOL is None:
                import concurrent.futures
                _PREFETCH_POOL = concurrent.futures.ThreadPoolExecutor(
                    max_workers=50,
                    thread_name_prefix="prefetch"
                )
    return _PREFETCH_POOL


class BufferedSSEWriter:
    def __init__(self, wfile, flush_interval_ms=0, flush_bytes=0):
        self._wfile = wfile
        self._flush_interval_s = max(0, flush_interval_ms) / 1000.0 if flush_interval_ms else 0
        self._flush_bytes = max(0, flush_bytes) if flush_bytes else 0
        self._buf_len = 0
        self._last_flush_time = time.time()
        self._batch_mode = (self._flush_interval_s > 0 or self._flush_bytes > 0)

    def write(self, data: bytes):
        self._wfile.write(data)
        if self._batch_mode:
            self._buf_len += len(data)

    def flush(self):
        if not self._batch_mode:
            self._wfile.flush()
            return

        should_flush = False
        if self._flush_bytes > 0 and self._buf_len >= self._flush_bytes:
            should_flush = True
        elif self._flush_interval_s > 0:
            now = time.time()
            if now - self._last_flush_time >= self._flush_interval_s:
                should_flush = True

        if should_flush:
            self.force_flush()

    def force_flush(self):
        if not self._batch_mode or self._buf_len > 0:
            self._wfile.flush()
            self._buf_len = 0
            self._last_flush_time = time.time()


def sse_data_payload(line: str) -> Optional[str]:
    """Return the payload of an SSE `data:` line, or None if not a data line.

    Tolerant per the SSE spec: accepts both `data: x` and `data:x` (the single
    optional leading space after the colon is stripped). Returns the raw payload
    without surrounding whitespace. Callers decide what to do with `[DONE]`."""
    if not line.startswith("data:"):
        return None
    payload = line[5:]
    if payload.startswith(" "):
        payload = payload[1:]
    return payload.strip()


def _parse_tool_arguments(buffer: str) -> Dict[str, Any]:
    """Parse a buffered tool-call arguments string into a dict.

    When the final buffer is valid JSON, returns the parsed dict.
    When parsing fails, returns ``{"_raw": buffer}`` so the original
    content is preserved instead of being silently discarded as ``{}``.
    An empty or whitespace-only buffer returns ``{}`` (matching the
    previous behaviour for truly empty arguments).
    """
    if not buffer or not buffer.strip():
        return {}
    try:
        parsed = json.loads(buffer)
        if isinstance(parsed, dict):
            return parsed
        # Non-dict JSON (e.g. a bare string or list) — wrap it.
        return {"_raw": buffer}
    except (json.JSONDecodeError, TypeError):
        return {"_raw": buffer}


def sse_event_name(line: str) -> Optional[str]:
    """Return the name of an SSE `event:` line, or None if not an event line."""
    if not line.startswith("event:"):
        return None
    name = line[6:]
    if name.startswith(" "):
        name = name[1:]
    return name.strip()


def is_sse_done(payload: Optional[str]) -> bool:
    """Whether an SSE data payload marks end of stream (`[DONE]`)."""
    return payload == "[DONE]"


def prefetch_first_stream_line(upstream, timeout_s):
    """Return the first upstream SSE data line, or raise timeout before client headers are sent."""
    lines = prefetch_initial_stream_lines(upstream, timeout_s, preserve_skipped=False)
    return lines[0] if lines else None


def prefetch_initial_stream_lines(upstream, timeout_s, preserve_skipped=True, *, max_skipped_lines=None, max_skipped_bytes=None):
    """Return lines read up to the first SSE data line for native pass-through.

    When ``preserve_skipped`` is True, comment/empty/non-data lines before the
    first data line are buffered so they can be replayed to the client. To
    prevent a pathological upstream (infinite comments/keepalives, no data
    event) from consuming unbounded memory and a prefetch thread, the buffered
    prelude is bounded by ``max_skipped_lines`` and ``max_skipped_bytes``. If
    either bound is hit before a data line arrives, the upstream is closed and
    a socket.timeout is raised so the caller fails before client headers are
    sent. ``None``/non-positive bounds disable that limit (backwards compatible).
    """
    if not timeout_s or timeout_s <= 0:
        return []

    q = queue.Queue(maxsize=1)

    def read_first_line():
        try:
            initial = []
            skipped_count = 0
            skipped_bytes = 0
            while True:
                raw = upstream.readline()
                if not raw:
                    q.put(socket.timeout("upstream closed before first stream event"))
                    return
                line = raw.decode("utf-8", errors="replace").strip()
                if not line or line.startswith(":") or sse_data_payload(line) is None:
                    if preserve_skipped:
                        initial.append(raw)
                        skipped_count += 1
                        skipped_bytes += len(raw)
                        if max_skipped_lines is not None and max_skipped_lines > 0 and skipped_count > max_skipped_lines:
                            q.put(socket.timeout(
                                f"stream prefetch exceeded max_skipped_lines={max_skipped_lines} before first data event"
                            ))
                            return
                        if max_skipped_bytes is not None and max_skipped_bytes > 0 and skipped_bytes > max_skipped_bytes:
                            q.put(socket.timeout(
                                f"stream prefetch exceeded max_skipped_bytes={max_skipped_bytes} before first data event"
                            ))
                            return
                    continue
                initial.append(raw)
                q.put(initial if preserve_skipped else [raw])
                return
        except Exception as e:
            q.put(e)

    _get_prefetch_pool().submit(read_first_line)
    try:
        item = q.get(timeout=float(timeout_s))
    except queue.Empty:
        try:
            upstream.close()
        except Exception:
            pass
        raise socket.timeout(f"first stream event timeout after {timeout_s}s")

    if isinstance(item, Exception):
        raise item
    return item


def relay_sse_stream(
    upstream,
    wfile,
    initial_lines: Optional[Iterable[bytes]] = None,
    *,
    collect_usage: bool = True,
    read_timeout_s: Optional[int] = None,
    client_format: str = "chat_completions",
) -> Optional[Dict[str, int]]:
    """Pass-through raw SSE bytes from upstream to client.

    On upstream interruption *after* bytes have been written to the client,
    sends a format-appropriate error/close event and returns ``None`` so the
    caller can record the interruption.  Returns the accumulated usage dict
    on success.
    """
    usage = empty_usage()
    timeout_switched = False
    first_byte_received = False
    try:
        for raw in initial_lines or []:
            if not timeout_switched and read_timeout_s:
                set_response_read_timeout(upstream, read_timeout_s)
                timeout_switched = True
            wfile.write(raw)
            wfile.flush()
            first_byte_received = True
            if collect_usage:
                usage = _merge_usage(usage, _usage_from_sse_line(raw))
        for raw in upstream:
            if not timeout_switched and read_timeout_s:
                set_response_read_timeout(upstream, read_timeout_s)
                timeout_switched = True
            wfile.write(raw)
            wfile.flush()
            first_byte_received = True
            if collect_usage:
                usage = _merge_usage(usage, _usage_from_sse_line(raw))
    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        # Best-effort graceful close — send a format-appropriate terminal
        # event so the client sees a clean end-of-stream instead of a hang.
        try:
            if client_format == "anthropic_messages":
                wfile.write(b'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}\n\n')
                wfile.write(b'event: message_stop\ndata: {"type":"message_stop"}\n\n')
            elif client_format == "responses":
                wfile.write(b'event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed","error":{"message":"[Stream interrupted]"}}}\n\n')
            else:
                # Chat Completions (default)
                wfile.write(b'data: [DONE]\n\n')
            wfile.flush()
        except Exception:
            pass
        return None
    return usage


def _usage_from_sse_line(raw: bytes) -> Dict[str, int]:
    if b'"usage"' not in raw:
        return empty_usage()
    try:
        line = raw.decode("utf-8", errors="replace").strip()
    except Exception:
        return empty_usage()
    data = sse_data_payload(line)
    if data is None:
        return empty_usage()
    if not data or is_sse_done(data):
        return empty_usage()
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return empty_usage()
    return _usage_from_sse_payload(payload)


def _usage_from_sse_payload(payload: Any) -> Dict[str, int]:
    if not isinstance(payload, dict):
        return empty_usage()
    candidates = [
        payload.get("usage"),
        (payload.get("response") or {}).get("usage") if isinstance(payload.get("response"), dict) else None,
        (payload.get("message") or {}).get("usage") if isinstance(payload.get("message"), dict) else None,
    ]
    usage = empty_usage()
    for candidate in candidates:
        usage = _merge_usage(usage, candidate)
    return usage


def _merge_usage(current: Dict[str, int], candidate: Any) -> Dict[str, int]:
    candidate_usage = normalize_usage(candidate)
    if not has_usage(candidate_usage):
        return current
    merged = {
        "input_tokens": max(int((current or {}).get("input_tokens") or 0), candidate_usage["input_tokens"]),
        "output_tokens": max(int((current or {}).get("output_tokens") or 0), candidate_usage["output_tokens"]),
        "total_tokens": max(int((current or {}).get("total_tokens") or 0), candidate_usage["total_tokens"]),
    }
    merged["total_tokens"] = max(merged["total_tokens"], merged["input_tokens"] + merged["output_tokens"])
    return merged


def stream_openai_sse_to_anthropic(
    upstream,
    wfile,
    original_model,
    first_byte_timeout_s: Optional[int] = None,
    read_timeout_s: Optional[int] = None,
    initial_lines: Optional[Iterable[bytes]] = None,
):
    """Read upstream OpenAI SSE and write Anthropic SSE events chunk by chunk."""
    msg_id = f"msg_{uuid.uuid4().hex[:24]}"
    reasoning_buf = ""
    content_buf = ""
    tool_calls_buf = {}
    tool_block_idx = {}
    finish_reason = None
    usage = {}
    block_idx = 0
    thinking_open = False
    thinking_emitted = False
    thinking_sig = None
    text_open = False
    first_byte_received = False
    stream_start_time = time.time()

    def sse(event, data):
        wfile.write(f"event: {event}\n".encode())
        wfile.write(f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode())

    sse(
        "message_start",
        {
            "type": "message_start",
            "message": {
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": original_model,
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        },
    )
    wfile.flush()

    def close_block(bidx):
        sse("content_block_stop", {"type": "content_block_stop", "index": bidx})

    def close_all_blocks():
        nonlocal block_idx
        if thinking_open:
            close_block(block_idx)
            block_idx += 1
        if text_open:
            close_block(block_idx)
            block_idx += 1
        for idx in sorted(tool_calls_buf):
            if idx in tool_block_idx:
                close_block(tool_block_idx[idx])

    try:
        def upstream_lines():
            for raw0 in initial_lines or []:
                yield raw0
            for raw0 in upstream:
                yield raw0

        for raw in upstream_lines():
            if first_byte_timeout_s and not first_byte_received:
                elapsed = time.time() - stream_start_time
                if elapsed > first_byte_timeout_s:
                    raise socket.timeout(f"First byte timeout: {elapsed:.1f}s > {first_byte_timeout_s}s")

            line = raw.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                continue
            data = sse_data_payload(line)
            if data is None or is_sse_done(data):
                continue

            if not first_byte_received:
                first_byte_received = True
                if read_timeout_s:
                    set_response_read_timeout(upstream, read_timeout_s)

            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue

            choices = chunk.get("choices", [])
            if not choices:
                if chunk.get("usage"):
                    usage = chunk["usage"]
                continue

            delta = choices[0].get("delta", {})
            finish = choices[0].get("finish_reason")
            if chunk.get("usage"):
                usage = chunk["usage"]

            r = delta.get("reasoning_content", "")
            if r:
                # Anthropic block ordering requires thinking blocks to come
                # before text/tool. If text or any tool block has already
                # started, we must NOT reopen a thinking block (that would
                # violate ordering and reuse a content_block index). Late
                # reasoning is still accumulated for the final content log so
                # non-streaming consumers do not lose it.
                reasoning_started = thinking_open
                if not text_open and not tool_block_idx and not thinking_open:
                    thinking_sig = uuid.uuid4().hex
                    sse(
                        "content_block_start",
                        {
                            "type": "content_block_start",
                            "index": block_idx,
                            "content_block": {"type": "thinking", "thinking": "", "signature": ""},
                        },
                    )
                    thinking_open = True
                    thinking_emitted = True
                    reasoning_started = True
                if reasoning_started:
                    sse(
                        "content_block_delta",
                        {
                            "type": "content_block_delta",
                            "index": block_idx,
                            "delta": {"type": "thinking_delta", "thinking": r},
                        },
                    )
                    wfile.flush()
                # Always retain reasoning text so the final assembled message
                # still surfaces it for history/non-stream consumers.
                reasoning_buf += r

            c = delta.get("content", "")
            if c:
                if thinking_open:
                    close_block(block_idx)
                    block_idx += 1
                    thinking_open = False
                if not text_open:
                    sse(
                        "content_block_start",
                        {
                            "type": "content_block_start",
                            "index": block_idx,
                            "content_block": {"type": "text", "text": ""},
                        },
                    )
                    text_open = True
                content_buf += c
                sse(
                    "content_block_delta",
                    {
                        "type": "content_block_delta",
                        "index": block_idx,
                        "delta": {"type": "text_delta", "text": c},
                    },
                )
                wfile.flush()

            tcs = delta.get("tool_calls", [])
            if tcs:
                if thinking_open:
                    close_block(block_idx)
                    block_idx += 1
                    thinking_open = False
                if text_open:
                    close_block(block_idx)
                    block_idx += 1
                    text_open = False

                for tc in tcs:
                    idx = tc.get("index", 0)
                    if idx not in tool_calls_buf:
                        tool_calls_buf[idx] = {
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        }
                    entry = tool_calls_buf[idx]
                    if tc.get("id"):
                        entry["id"] = tc["id"]
                    if tc.get("type"):
                        entry["type"] = tc["type"]
                    fn = tc.get("function", {})
                    if fn.get("name"):
                        entry["function"]["name"] = fn["name"]
                    if fn.get("arguments"):
                        entry["function"]["arguments"] += fn["arguments"]

                    if idx not in tool_block_idx:
                        tool_block_idx[idx] = block_idx
                        sse(
                            "content_block_start",
                            {
                                "type": "content_block_start",
                                "index": block_idx,
                                "content_block": {
                                    "type": "tool_use",
                                    "id": entry["id"] or f"call_{uuid.uuid4().hex[:24]}",
                                    "name": entry["function"]["name"] or "unknown",
                                },
                            },
                        )
                        block_idx += 1

                    args_chunk = fn.get("arguments", "")
                    if args_chunk:
                        sse(
                            "content_block_delta",
                            {
                                "type": "content_block_delta",
                                "index": tool_block_idx[idx],
                                "delta": {"type": "input_json_delta", "partial_json": args_chunk},
                            },
                        )
                        wfile.flush()

            if finish:
                finish_reason = finish

    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        close_all_blocks()
        sse("content_block_start", {"type": "content_block_start", "index": block_idx, "content_block": {"type": "text", "text": ""}})
        sse(
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": block_idx,
                "delta": {"type": "text_delta", "text": err_text},
            },
        )
        close_block(block_idx)
        block_idx += 1
        sse(
            "message_delta",
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )
        sse("message_stop", {"type": "message_stop"})
        wfile.flush()
        return None

    close_all_blocks()

    reason_map = {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens"}
    anth_stop = reason_map.get(finish_reason, finish_reason) if finish_reason else "end_turn"
    sse(
        "message_delta",
        {
            "type": "message_delta",
            "delta": {"stop_reason": anth_stop, "stop_sequence": None},
            "usage": {
                "input_tokens": usage.get("prompt_tokens", 0),
                "output_tokens": usage.get("completion_tokens", 0),
            },
        },
    )
    sse("message_stop", {"type": "message_stop"})
    wfile.flush()

    content_log = []
    if reasoning_buf and thinking_emitted:
        content_log.append({"type": "thinking", "thinking": reasoning_buf, "signature": thinking_sig or uuid.uuid4().hex})
    if content_buf:
        content_log.append({"type": "text", "text": content_buf})
    for idx in sorted(tool_calls_buf):
        tc = tool_calls_buf[idx]
        args = _parse_tool_arguments(tc["function"]["arguments"])
        content_log.append(
            {
                "type": "tool_use",
                "id": tc["id"] or f"call_{uuid.uuid4().hex[:24]}",
                "name": tc["function"]["name"] or "unknown",
                "input": args,
            }
        )
    return {
        "id": msg_id,
        "type": "message",
        "role": "assistant",
        "content": content_log,
        "model": original_model,
        "stop_reason": anth_stop,
        "stop_sequence": None,
        "usage": {"input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0)},
    }


def stream_openai_sse_to_responses(
    upstream,
    wfile,
    original_model,
    first_byte_timeout_s: Optional[int] = None,
    read_timeout_s: Optional[int] = None,
    initial_lines: Optional[Iterable[bytes]] = None,
):
    """Read upstream Chat Completions SSE and write OpenAI Responses-style SSE events."""
    response_id = f"resp_{uuid.uuid4().hex}"
    message_item_id = f"msg_{uuid.uuid4().hex[:24]}"
    reasoning_item_id = f"rs_{uuid.uuid4().hex[:24]}"
    content_buf = ""
    reasoning_buf = ""
    tool_calls_buf = {}
    tool_item_ids = {}
    tool_output_indices = {}
    output_order = []
    usage = {}
    finish_reason = None
    text_output_index = None
    reasoning_output_index = None
    text_started = False
    text_done = False
    reasoning_done = False
    first_byte_received = False
    stream_start_time = time.time()
    sequence_number = 0

    def sse(event, data):
        nonlocal sequence_number
        sequence_number += 1
        # OpenAI Responses streaming events carry a monotonic sequence_number so
        # strict clients can order events and detect gaps. Inject it without
        # mutating the caller's dict.
        if isinstance(data, dict) and "sequence_number" not in data:
            payload = dict(data)
            payload["sequence_number"] = sequence_number
        else:
            payload = data
        wfile.write(f"event: {event}\n".encode())
        wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode())

    def response_obj(status="in_progress", output=None):
        out = {
            "id": response_id,
            "object": "response",
            "created_at": int(time.time()),
            "status": status,
            "model": original_model,
            "output": output or [],
            "parallel_tool_calls": True,
        }
        if status == "completed":
            out["usage"] = _responses_usage(usage)
        return out

    def next_output_index(kind, ref=None):
        output_order.append((kind, ref))
        return len(output_order) - 1

    sse("response.created", {"type": "response.created", "response": response_obj()})
    wfile.flush()

    def ensure_reasoning_started():
        nonlocal reasoning_output_index
        if reasoning_output_index is not None:
            return reasoning_output_index
        reasoning_output_index = next_output_index("reasoning")
        sse(
            "response.output_item.added",
            {
                "type": "response.output_item.added",
                "output_index": reasoning_output_index,
                "item": {"id": reasoning_item_id, "type": "reasoning", "summary": [], "status": "in_progress"},
            },
        )
        return reasoning_output_index

    def emit_reasoning_delta(text):
        output_index = ensure_reasoning_started()
        sse(
            "response.reasoning_summary_text.delta",
            {
                "type": "response.reasoning_summary_text.delta",
                "item_id": reasoning_item_id,
                "output_index": output_index,
                "summary_index": 0,
                "delta": text,
            },
        )
        wfile.flush()

    def finish_reasoning_if_needed():
        nonlocal reasoning_done
        if reasoning_output_index is None or reasoning_done:
            return
        reasoning_done = True
        sse(
            "response.reasoning_summary_text.done",
            {
                "type": "response.reasoning_summary_text.done",
                "item_id": reasoning_item_id,
                "output_index": reasoning_output_index,
                "summary_index": 0,
                "text": reasoning_buf,
            },
        )
        sse(
            "response.output_item.done",
            {
                "type": "response.output_item.done",
                "output_index": reasoning_output_index,
                "item": {
                    "id": reasoning_item_id,
                    "type": "reasoning",
                    "status": "completed",
                    "summary": [{"type": "summary_text", "text": reasoning_buf}],
                },
            },
        )

    def ensure_text_started():
        nonlocal text_started, text_output_index
        if text_started:
            return text_output_index
        text_started = True
        text_output_index = next_output_index("message")
        sse(
            "response.output_item.added",
            {
                "type": "response.output_item.added",
                "output_index": text_output_index,
                "item": {"id": message_item_id, "type": "message", "role": "assistant", "content": []},
            },
        )
        sse(
            "response.content_part.added",
            {
                "type": "response.content_part.added",
                "item_id": message_item_id,
                "output_index": text_output_index,
                "content_index": 0,
                "part": {"type": "output_text", "text": ""},
            },
        )
        return text_output_index

    def finish_text_if_needed():
        nonlocal text_done
        if not text_started or text_done:
            return
        text_done = True
        sse(
            "response.output_text.done",
            {
                "type": "response.output_text.done",
                "item_id": message_item_id,
                "output_index": text_output_index,
                "content_index": 0,
                "text": content_buf,
            },
        )
        sse(
            "response.content_part.done",
            {
                "type": "response.content_part.done",
                "item_id": message_item_id,
                "output_index": text_output_index,
                "content_index": 0,
                "part": {"type": "output_text", "text": content_buf},
            },
        )
        sse(
            "response.output_item.done",
            {
                "type": "response.output_item.done",
                "output_index": text_output_index,
                "item": {
                    "id": message_item_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": content_buf}],
                    "status": "completed",
                },
            },
        )

    def ensure_tool_started(idx, entry):
        if idx in tool_item_ids:
            return tool_item_ids[idx]
        item_id = entry.get("id") or f"call_{uuid.uuid4().hex[:24]}"
        tool_item_ids[idx] = item_id
        output_index = next_output_index("tool", idx)
        tool_output_indices[idx] = output_index
        sse(
            "response.output_item.added",
            {
                "type": "response.output_item.added",
                "output_index": output_index,
                "item": {
                    "id": item_id,
                    "type": "function_call",
                    "call_id": item_id,
                    "name": entry["function"].get("name") or "unknown",
                    "arguments": "",
                    "status": "in_progress",
                },
            },
        )
        return item_id

    def finish_tools():
        for idx in sorted(tool_calls_buf):
            entry = tool_calls_buf[idx]
            item_id = tool_item_ids.get(idx) or ensure_tool_started(idx, entry)
            output_index = tool_output_indices.get(idx, idx)
            args = entry["function"].get("arguments") or ""
            sse(
                "response.function_call_arguments.done",
                {
                    "type": "response.function_call_arguments.done",
                    "item_id": item_id,
                    "output_index": output_index,
                    "arguments": args,
                },
            )
            sse(
                "response.output_item.done",
                {
                    "type": "response.output_item.done",
                    "output_index": output_index,
                    "item": {
                        "id": item_id,
                        "type": "function_call",
                        "call_id": item_id,
                        "name": entry["function"].get("name") or "unknown",
                        "arguments": args,
                        "status": "completed",
                    },
                },
            )

    try:
        def upstream_lines():
            for raw0 in initial_lines or []:
                yield raw0
            for raw0 in upstream:
                yield raw0

        for raw in upstream_lines():
            if first_byte_timeout_s and not first_byte_received:
                elapsed = time.time() - stream_start_time
                if elapsed > first_byte_timeout_s:
                    raise socket.timeout(f"First byte timeout: {elapsed:.1f}s > {first_byte_timeout_s}s")

            line = raw.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                continue
            data = sse_data_payload(line)
            if data is None or is_sse_done(data):
                continue

            if not first_byte_received:
                first_byte_received = True
                if read_timeout_s:
                    set_response_read_timeout(upstream, read_timeout_s)

            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue

            choices = chunk.get("choices") or []
            if chunk.get("usage"):
                usage = chunk["usage"]
            if not choices:
                continue

            choice = choices[0]
            delta = choice.get("delta") or {}
            finish = choice.get("finish_reason")
            if finish:
                finish_reason = finish

            reasoning = _chat_delta_reasoning_text(delta)
            if reasoning and (reasoning.strip() or reasoning_buf):
                reasoning_buf += reasoning
                emit_reasoning_delta(reasoning)

            content = delta.get("content") or ""
            if content:
                output_index = ensure_text_started()
                content_buf += content
                sse(
                    "response.output_text.delta",
                    {
                        "type": "response.output_text.delta",
                        "item_id": message_item_id,
                        "output_index": output_index,
                        "content_index": 0,
                        "delta": content,
                    },
                )
                wfile.flush()

            for tc in delta.get("tool_calls") or []:
                idx = int(tc.get("index", 0) or 0)
                if idx not in tool_calls_buf:
                    tool_calls_buf[idx] = {"id": "", "type": "function", "function": {"name": "", "arguments": ""}}
                entry = tool_calls_buf[idx]
                if tc.get("id"):
                    entry["id"] = tc["id"]
                if tc.get("type"):
                    entry["type"] = tc["type"]
                fn = tc.get("function") or {}
                if fn.get("name"):
                    entry["function"]["name"] = fn["name"]
                item_id = ensure_tool_started(idx, entry)
                args_chunk = fn.get("arguments") or ""
                if args_chunk:
                    entry["function"]["arguments"] += args_chunk
                    sse(
                        "response.function_call_arguments.delta",
                        {
                            "type": "response.function_call_arguments.delta",
                            "item_id": item_id,
                            "output_index": tool_output_indices.get(idx, idx),
                            "delta": args_chunk,
                        },
                    )
                    wfile.flush()

    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        sse(
            "response.failed",
            {
                "type": "response.failed",
                "response": {
                    "id": response_id,
                    "object": "response",
                    "status": "failed",
                    "model": original_model,
                    "error": {"message": err_text},
                },
            },
        )
        wfile.flush()
        return None

    finish_reasoning_if_needed()
    finish_text_if_needed()
    finish_tools()
    output = []
    for kind, ref in output_order:
        if kind == "reasoning":
            output.append(
                {
                    "id": reasoning_item_id,
                    "type": "reasoning",
                    "status": "completed",
                    "summary": [{"type": "summary_text", "text": reasoning_buf}],
                }
            )
        elif kind == "message":
            output.append(
                {
                    "id": message_item_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": content_buf}],
                    "status": "completed",
                }
            )
        elif kind == "tool":
            entry = tool_calls_buf.get(ref) or {"function": {}}
            item_id = tool_item_ids.get(ref) or entry.get("id") or f"call_{uuid.uuid4().hex[:24]}"
            output.append(
                {
                    "id": item_id,
                    "type": "function_call",
                    "call_id": item_id,
                    "name": entry["function"].get("name") or "unknown",
                    "arguments": entry["function"].get("arguments") or "",
                    "status": "completed",
                }
            )
    completed = response_obj(status="completed", output=output)
    completed["output_text"] = content_buf
    completed["finish_reason"] = finish_reason or "stop"
    sse("response.completed", {"type": "response.completed", "response": completed})
    wfile.flush()
    return completed


def stream_anthropic_sse_to_responses(
    upstream,
    wfile,
    original_model,
    first_byte_timeout_s: Optional[int] = None,
    read_timeout_s: Optional[int] = None,
    initial_lines: Optional[Iterable[bytes]] = None,
):
    """Read upstream Anthropic Messages SSE and write OpenAI Responses-style SSE events."""
    response_id = f"resp_{uuid.uuid4().hex}"
    message_item_id = f"msg_{uuid.uuid4().hex[:24]}"
    reasoning_item_id = f"rs_{uuid.uuid4().hex[:24]}"
    content_buf = ""
    reasoning_buf = ""
    blocks = {}
    tool_item_ids = {}
    tool_output_indices = {}
    tool_done = set()
    output_order = []
    usage = empty_usage()
    finish_reason = None
    text_output_index = None
    text_started = False
    text_done = False
    reasoning_output_index = None
    reasoning_done = False
    current_event = None
    first_byte_received = False
    stream_start_time = time.time()
    sequence_number = 0

    def sse(event, data):
        nonlocal sequence_number
        sequence_number += 1
        if isinstance(data, dict) and "sequence_number" not in data:
            payload = dict(data)
            payload["sequence_number"] = sequence_number
        else:
            payload = data
        wfile.write(f"event: {event}\n".encode())
        wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode())

    def next_output_index(kind, ref=None):
        output_order.append((kind, ref))
        return len(output_order) - 1

    def response_obj(status="in_progress", output=None):
        out = {
            "id": response_id,
            "object": "response",
            "created_at": int(time.time()),
            "status": status,
            "model": original_model,
            "output": output or [],
            "parallel_tool_calls": True,
        }
        if status in ("completed", "incomplete"):
            out["usage"] = _responses_usage(usage)
        return out

    def merge_usage(candidate):
        nonlocal usage
        usage = _merge_usage(usage, candidate)

    def ensure_reasoning_started():
        nonlocal reasoning_output_index
        if reasoning_output_index is not None:
            return reasoning_output_index
        reasoning_output_index = next_output_index("reasoning")
        sse(
            "response.output_item.added",
            {
                "type": "response.output_item.added",
                "output_index": reasoning_output_index,
                "item": {"id": reasoning_item_id, "type": "reasoning", "summary": [], "status": "in_progress"},
            },
        )
        return reasoning_output_index

    def emit_reasoning_delta(text):
        output_index = ensure_reasoning_started()
        sse(
            "response.reasoning_summary_text.delta",
            {
                "type": "response.reasoning_summary_text.delta",
                "item_id": reasoning_item_id,
                "output_index": output_index,
                "summary_index": 0,
                "delta": text,
            },
        )
        wfile.flush()

    def finish_reasoning_if_needed():
        nonlocal reasoning_done
        if reasoning_output_index is None or reasoning_done:
            return
        reasoning_done = True
        sse(
            "response.reasoning_summary_text.done",
            {
                "type": "response.reasoning_summary_text.done",
                "item_id": reasoning_item_id,
                "output_index": reasoning_output_index,
                "summary_index": 0,
                "text": reasoning_buf,
            },
        )
        sse(
            "response.output_item.done",
            {
                "type": "response.output_item.done",
                "output_index": reasoning_output_index,
                "item": {
                    "id": reasoning_item_id,
                    "type": "reasoning",
                    "status": "completed",
                    "summary": [{"type": "summary_text", "text": reasoning_buf}],
                },
            },
        )

    def ensure_text_started():
        nonlocal text_started, text_output_index
        if text_started:
            return text_output_index
        text_started = True
        text_output_index = next_output_index("message")
        sse(
            "response.output_item.added",
            {
                "type": "response.output_item.added",
                "output_index": text_output_index,
                "item": {"id": message_item_id, "type": "message", "role": "assistant", "content": []},
            },
        )
        sse(
            "response.content_part.added",
            {
                "type": "response.content_part.added",
                "item_id": message_item_id,
                "output_index": text_output_index,
                "content_index": 0,
                "part": {"type": "output_text", "text": ""},
            },
        )
        return text_output_index

    def finish_text_if_needed():
        nonlocal text_done
        if not text_started or text_done:
            return
        text_done = True
        sse(
            "response.output_text.done",
            {
                "type": "response.output_text.done",
                "item_id": message_item_id,
                "output_index": text_output_index,
                "content_index": 0,
                "text": content_buf,
            },
        )
        sse(
            "response.content_part.done",
            {
                "type": "response.content_part.done",
                "item_id": message_item_id,
                "output_index": text_output_index,
                "content_index": 0,
                "part": {"type": "output_text", "text": content_buf},
            },
        )
        sse(
            "response.output_item.done",
            {
                "type": "response.output_item.done",
                "output_index": text_output_index,
                "item": {
                    "id": message_item_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": content_buf}],
                    "status": "completed",
                },
            },
        )

    def ensure_tool_started(index, block):
        if index in tool_item_ids:
            return tool_item_ids[index]
        item_id = block.get("id") or f"call_{uuid.uuid4().hex[:24]}"
        tool_item_ids[index] = item_id
        output_index = next_output_index("tool", index)
        tool_output_indices[index] = output_index
        sse(
            "response.output_item.added",
            {
                "type": "response.output_item.added",
                "output_index": output_index,
                "item": {
                    "id": item_id,
                    "type": "function_call",
                    "call_id": item_id,
                    "name": block.get("name") or "unknown",
                    "arguments": "",
                    "status": "in_progress",
                },
            },
        )
        return item_id

    def finish_tool_if_needed(index):
        if index in tool_done:
            return
        block = blocks.get(index) or {"type": "tool_use", "arguments": ""}
        if block.get("type") != "tool_use":
            return
        item_id = tool_item_ids.get(index) or ensure_tool_started(index, block)
        output_index = tool_output_indices.get(index, index)
        args = block.get("arguments") or ""
        tool_done.add(index)
        sse(
            "response.function_call_arguments.done",
            {
                "type": "response.function_call_arguments.done",
                "item_id": item_id,
                "output_index": output_index,
                "arguments": args,
            },
        )
        sse(
            "response.output_item.done",
            {
                "type": "response.output_item.done",
                "output_index": output_index,
                "item": {
                    "id": item_id,
                    "type": "function_call",
                    "call_id": item_id,
                    "name": block.get("name") or "unknown",
                    "arguments": args,
                    "status": "completed",
                },
            },
        )

    def finish_all_open_items():
        finish_reasoning_if_needed()
        finish_text_if_needed()
        for idx in sorted(blocks):
            finish_tool_if_needed(idx)

    def handle_payload(payload):
        nonlocal content_buf, reasoning_buf, finish_reason
        if not isinstance(payload, dict):
            return
        event_type = payload.get("type") or current_event
        if event_type == "message_start":
            message = payload.get("message") or {}
            merge_usage(message.get("usage"))
            return
        if event_type == "message_delta":
            merge_usage(payload.get("usage"))
            delta = payload.get("delta") or {}
            if delta.get("stop_reason"):
                finish_reason = _anthropic_stop_to_chat_finish(delta.get("stop_reason"))
            return
        if event_type == "error":
            err = payload.get("error") or {}
            raise RuntimeError(str(err.get("message") or "upstream Anthropic stream error"))
        if event_type == "content_block_start":
            idx = int(payload.get("index", 0) or 0)
            content_block = payload.get("content_block") or {}
            block = dict(content_block)
            block["arguments"] = ""
            if block.get("type") == "tool_use":
                initial_input = block.get("input")
                if initial_input:
                    block["arguments"] = json.dumps(initial_input, ensure_ascii=False)
                ensure_tool_started(idx, block)
            blocks[idx] = block
            return
        if event_type == "content_block_delta":
            idx = int(payload.get("index", 0) or 0)
            block = blocks.setdefault(idx, {})
            delta = payload.get("delta") or {}
            delta_type = delta.get("type")
            if delta_type == "text_delta":
                text = str(delta.get("text") or "")
                if text:
                    output_index = ensure_text_started()
                    content_buf += text
                    sse(
                        "response.output_text.delta",
                        {
                            "type": "response.output_text.delta",
                            "item_id": message_item_id,
                            "output_index": output_index,
                            "content_index": 0,
                            "delta": text,
                        },
                    )
                    wfile.flush()
            elif delta_type == "thinking_delta":
                text = str(delta.get("thinking") or "")
                if text:
                    reasoning_buf += text
                    emit_reasoning_delta(text)
            elif delta_type == "input_json_delta":
                chunk = str(delta.get("partial_json") or "")
                if chunk:
                    block.setdefault("type", "tool_use")
                    block.setdefault("arguments", "")
                    block["arguments"] += chunk
                    item_id = ensure_tool_started(idx, block)
                    sse(
                        "response.function_call_arguments.delta",
                        {
                            "type": "response.function_call_arguments.delta",
                            "item_id": item_id,
                            "output_index": tool_output_indices.get(idx, idx),
                            "delta": chunk,
                        },
                    )
                    wfile.flush()
            return
        if event_type == "content_block_stop":
            idx = int(payload.get("index", 0) or 0)
            block_type = (blocks.get(idx) or {}).get("type")
            if block_type == "text":
                finish_text_if_needed()
            elif block_type == "thinking":
                finish_reasoning_if_needed()
            elif block_type == "tool_use":
                finish_tool_if_needed(idx)

    sse("response.created", {"type": "response.created", "response": response_obj()})
    wfile.flush()

    try:
        def upstream_lines():
            for raw0 in initial_lines or []:
                yield raw0
            for raw0 in upstream:
                yield raw0

        for raw in upstream_lines():
            if first_byte_timeout_s and not first_byte_received:
                elapsed = time.time() - stream_start_time
                if elapsed > first_byte_timeout_s:
                    raise socket.timeout(f"First byte timeout: {elapsed:.1f}s > {first_byte_timeout_s}s")

            line = raw.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                if not line:
                    current_event = None
                continue

            if not first_byte_received:
                first_byte_received = True
                if read_timeout_s:
                    set_response_read_timeout(upstream, read_timeout_s)

            event_name = sse_event_name(line)
            if event_name is not None:
                current_event = event_name
                continue
            data = sse_data_payload(line)
            if data is None:
                continue
            if not data or is_sse_done(data):
                continue
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            handle_payload(payload)

    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        sse(
            "response.failed",
            {
                "type": "response.failed",
                "response": {
                    "id": response_id,
                    "object": "response",
                    "status": "failed",
                    "model": original_model,
                    "error": {"message": err_text},
                },
            },
        )
        wfile.flush()
        return None

    finish_all_open_items()
    output = []
    for kind, ref in output_order:
        if kind == "reasoning":
            output.append(
                {
                    "id": reasoning_item_id,
                    "type": "reasoning",
                    "status": "completed",
                    "summary": [{"type": "summary_text", "text": reasoning_buf}],
                }
            )
        elif kind == "message":
            output.append(
                {
                    "id": message_item_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": content_buf}],
                    "status": "completed",
                }
            )
        elif kind == "tool":
            block = blocks.get(ref) or {}
            item_id = tool_item_ids.get(ref) or block.get("id") or f"call_{uuid.uuid4().hex[:24]}"
            output.append(
                {
                    "id": item_id,
                    "type": "function_call",
                    "call_id": item_id,
                    "name": block.get("name") or "unknown",
                    "arguments": block.get("arguments") or "",
                    "status": "completed",
                }
            )

    status = "incomplete" if finish_reason == "length" else "completed"
    completed = response_obj(status=status, output=output)
    completed["output_text"] = content_buf
    completed["finish_reason"] = finish_reason or "stop"
    sse("response.completed", {"type": "response.completed", "response": completed})
    wfile.flush()
    return completed


def stream_responses_sse_to_anthropic(
    upstream,
    wfile,
    original_model,
    first_byte_timeout_s: Optional[int] = None,
    read_timeout_s: Optional[int] = None,
    initial_lines: Optional[Iterable[bytes]] = None,
):
    """Read upstream OpenAI Responses SSE and write Anthropic Messages-style SSE events."""
    msg_id = f"msg_{uuid.uuid4().hex[:24]}"
    items = {}
    item_order = []
    usage = empty_usage()
    response_status = "completed"
    finish_reason = None
    current_event = None
    block_idx = 0
    open_block = None
    text_or_tool_seen = False
    first_byte_received = False
    stream_start_time = time.time()
    # Global accumulators for all text/reasoning emitted via deltas across all
    # items.  Used by the duplicate-guard in finalize_item / output_text.done to
    # detect when content was already streamed (e.g. when upstream item IDs are
    # inconsistent between delta and done events).
    _anthropic_text_buf = ""
    _anthropic_reasoning_buf = ""

    def sse(event, data):
        wfile.write(f"event: {event}\n".encode())
        wfile.write(f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode())

    def merge_usage(candidate):
        nonlocal usage
        usage = _merge_usage(usage, candidate)

    def remember_item(item):
        if not isinstance(item, dict):
            return None
        item_id = item.get("id") or item.get("item_id") or item.get("call_id") or f"item_{uuid.uuid4().hex[:24]}"
        existing = items.setdefault(item_id, {"id": item_id, "type": item.get("type") or "message"})
        existing.update({k: v for k, v in item.items() if v is not None})
        if item_id not in item_order:
            item_order.append(item_id)
        return existing

    def item_by_payload(payload):
        item_id = payload.get("item_id")
        if item_id and item_id in items:
            return items[item_id]
        output_index = payload.get("output_index")
        if isinstance(output_index, int) and 0 <= output_index < len(item_order):
            return items.get(item_order[output_index])
        return None

    def close_open_block():
        nonlocal block_idx, open_block
        if open_block is None:
            return
        sse("content_block_stop", {"type": "content_block_stop", "index": block_idx})
        block_idx += 1
        open_block = None

    def ensure_block(kind, item):
        nonlocal open_block
        item_id = item.get("id") or item.get("call_id") or ""
        wanted = (kind, item_id)
        if open_block == wanted:
            return block_idx
        close_open_block()
        if kind == "thinking":
            content_block = {"type": "thinking", "thinking": "", "signature": ""}
        elif kind == "text":
            content_block = {"type": "text", "text": ""}
        else:
            content_block = {
                "type": "tool_use",
                "id": item.get("call_id") or item_id or f"call_{uuid.uuid4().hex[:24]}",
                "name": item.get("name") or "unknown",
            }
        sse("content_block_start", {"type": "content_block_start", "index": block_idx, "content_block": content_block})
        open_block = wanted
        return block_idx

    def text_from_response_content(item):
        parts = []
        for part in item.get("content") or []:
            if isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)

    def reasoning_from_item(item):
        parts = []
        for summary in item.get("summary") or []:
            if isinstance(summary, dict):
                text = summary.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join([part for part in parts if part])

    def emit_reasoning(text, item):
        nonlocal _anthropic_reasoning_buf
        if not text:
            return
        # Anthropic block ordering requires thinking before text/tool. If text
        # or a tool block has already been emitted, do NOT reopen a thinking
        # block; only retain the text on the item so non-streaming/history
        # consumers still see it.
        item["thinking"] = (item.get("thinking") or "") + text
        _anthropic_reasoning_buf += text
        if text_or_tool_seen:
            return
        idx = ensure_block("thinking", item)
        item["_thinking_emitted"] = True
        sse(
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": idx,
                "delta": {"type": "thinking_delta", "thinking": text},
            },
        )
        wfile.flush()

    def emit_text(text, item):
        nonlocal text_or_tool_seen, _anthropic_text_buf
        if not text:
            return
        text_or_tool_seen = True
        _anthropic_text_buf += text
        idx = ensure_block("text", item)
        item["text"] = (item.get("text") or "") + text
        sse(
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": idx,
                "delta": {"type": "text_delta", "text": text},
            },
        )
        wfile.flush()

    def emit_tool_args(chunk, item):
        nonlocal text_or_tool_seen
        if not chunk:
            return
        text_or_tool_seen = True
        idx = ensure_block("tool", item)
        item["arguments"] = (item.get("arguments") or "") + chunk
        sse(
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": idx,
                "delta": {"type": "input_json_delta", "partial_json": chunk},
            },
        )
        wfile.flush()

    def finalize_item(item, output_index=None):
        if not isinstance(item, dict):
            return
        # Try to find the existing item by output_index first.  Some providers
        # send delta events with an item_id / output_index that does not match
        # the ``id`` field on the ``output_item.done`` payload.  When that
        # happens, ``remember_item`` would create a brand-new entry (without the
        # streamed text/reasoning) and we would re-emit the full content as a
        # duplicate delta.  Matching by output_index is more reliable because
        # the index is positional and stable across the item lifecycle.
        existing = None
        if isinstance(output_index, int) and 0 <= output_index < len(item_order):
            existing = items.get(item_order[output_index])
        if existing is not None:
            existing.update({k: v for k, v in item.items() if v is not None})
        else:
            existing = remember_item(item) or item

        item_type = existing.get("type")
        if item_type == "reasoning":
            if not existing.get("thinking"):
                reasoning_text = reasoning_from_item(existing)
                if reasoning_text and not _already_streamed(_anthropic_reasoning_buf, reasoning_text):
                    emit_reasoning(reasoning_text, existing)
            close_open_block()
        elif item_type == "message":
            if not existing.get("text"):
                text = text_from_response_content(existing)
                if text and not _already_streamed(_anthropic_text_buf, text):
                    emit_text(text, existing)
            close_open_block()
        elif item_type == "function_call":
            args = existing.get("arguments") or ""
            if args and not existing.get("_arguments_streamed"):
                emit_tool_args(args, existing)
            close_open_block()

    def handle_payload(payload):
        nonlocal response_status, finish_reason
        if not isinstance(payload, dict):
            return
        event_type = payload.get("type") or current_event
        if event_type == "response.completed":
            response = payload.get("response") or {}
            response_status = response.get("status") or response_status
            finish_reason = response.get("finish_reason") or finish_reason
            merge_usage(response.get("usage"))
            return
        if event_type == "response.failed":
            response = payload.get("response") or {}
            err = response.get("error") or {}
            raise RuntimeError(str(err.get("message") or "upstream Responses stream failed"))
        if event_type == "response.output_item.added":
            remember_item(payload.get("item") or {})
            return
        if event_type == "response.output_item.done":
            finalize_item(payload.get("item") or {}, output_index=payload.get("output_index"))
            return
        if event_type == "response.output_text.delta":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "message"}) or {}
            emit_text(str(payload.get("delta") or ""), item)
            return
        if event_type == "response.output_text.done":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "message"}) or {}
            if not item.get("text"):
                text = str(payload.get("text") or "")
                if text and not _already_streamed(_anthropic_text_buf, text):
                    emit_text(text, item)
            close_open_block()
            return
        if event_type in (
            "response.reasoning_summary_text.delta",
            "response.reasoning_summary.delta",
            "response.reasoning_text.delta",
        ):
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "reasoning"}) or {}
            emit_reasoning(_responses_reasoning_text_from_payload(payload), item)
            return
        if event_type in (
            "response.reasoning_summary_text.done",
            "response.reasoning_summary.done",
            "response.reasoning_text.done",
        ):
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "reasoning"}) or {}
            if not item.get("thinking"):
                reasoning_text = _responses_reasoning_text_from_payload(payload)
                if reasoning_text and not _already_streamed(_anthropic_reasoning_buf, reasoning_text):
                    emit_reasoning(reasoning_text, item)
            close_open_block()
            return
        if event_type == "response.function_call_arguments.delta":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "function_call"}) or {}
            item["_arguments_streamed"] = True
            emit_tool_args(str(payload.get("delta") or ""), item)
            return
        if event_type == "response.function_call_arguments.done":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "function_call"}) or {}
            if not item.get("arguments"):
                emit_tool_args(str(payload.get("arguments") or ""), item)
            close_open_block()

    sse(
        "message_start",
        {
            "type": "message_start",
            "message": {
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": original_model,
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        },
    )
    wfile.flush()

    try:
        def upstream_lines():
            for raw0 in initial_lines or []:
                yield raw0
            for raw0 in upstream:
                yield raw0

        for raw in upstream_lines():
            if first_byte_timeout_s and not first_byte_received:
                elapsed = time.time() - stream_start_time
                if elapsed > first_byte_timeout_s:
                    raise socket.timeout(f"First byte timeout: {elapsed:.1f}s > {first_byte_timeout_s}s")

            line = raw.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                if not line:
                    current_event = None
                continue

            if not first_byte_received:
                first_byte_received = True
                if read_timeout_s:
                    set_response_read_timeout(upstream, read_timeout_s)

            event_name = sse_event_name(line)
            if event_name is not None:
                current_event = event_name
                continue
            data = sse_data_payload(line)
            if data is None:
                continue
            if not data or is_sse_done(data):
                continue
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            handle_payload(payload)

    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        close_open_block()
        idx = ensure_block("text", {"id": "stream_error"})
        sse(
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": idx,
                "delta": {"type": "text_delta", "text": err_text},
            },
        )
        close_open_block()
        sse(
            "message_delta",
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )
        sse("message_stop", {"type": "message_stop"})
        wfile.flush()
        return None

    close_open_block()
    stop_reason = _responses_finish_to_anthropic_stop(finish_reason, response_status, any((items.get(i) or {}).get("type") == "function_call" for i in item_order))
    usage_out = _responses_usage(usage)
    sse(
        "message_delta",
        {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": {"input_tokens": usage_out["input_tokens"], "output_tokens": usage_out["output_tokens"]},
        },
    )
    sse("message_stop", {"type": "message_stop"})
    wfile.flush()

    content_log = []
    for item_id in item_order:
        item = items.get(item_id) or {}
        item_type = item.get("type")
        if item_type == "reasoning" and item.get("thinking") and item.get("_thinking_emitted"):
            content_log.append({"type": "thinking", "thinking": item.get("thinking") or "", "signature": uuid.uuid4().hex})
        elif item_type == "message" and item.get("text"):
            content_log.append({"type": "text", "text": item.get("text") or ""})
        elif item_type == "function_call":
            tool_input = _parse_tool_arguments(item.get("arguments") or "")
            content_log.append(
                {
                    "type": "tool_use",
                    "id": item.get("call_id") or item.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                    "name": item.get("name") or "unknown",
                    "input": tool_input,
                }
            )
    return {
        "id": msg_id,
        "type": "message",
        "role": "assistant",
        "content": content_log,
        "model": original_model,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": usage_out["input_tokens"], "output_tokens": usage_out["output_tokens"]},
    }


def stream_responses_sse_to_openai_chat(
    upstream,
    wfile,
    original_model,
    first_byte_timeout_s: Optional[int] = None,
    read_timeout_s: Optional[int] = None,
    initial_lines: Optional[Iterable[bytes]] = None,
):
    """Read upstream OpenAI Responses SSE and write Chat Completions SSE chunks."""
    completion_id = f"chatcmpl_{uuid.uuid4().hex[:24]}"
    created = int(time.time())
    items = {}
    item_order = []
    content_buf = ""
    reasoning_buf = ""
    usage = empty_usage()
    response_status = "completed"
    finish_reason = None
    current_event = None
    first_byte_received = False
    stream_start_time = time.time()

    def write_chunk(delta, finish=None):
        chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": original_model,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
        }
        wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode())
        wfile.flush()

    def remember_item(item):
        if not isinstance(item, dict):
            return None
        item_id = item.get("id") or item.get("item_id") or item.get("call_id") or f"item_{uuid.uuid4().hex[:24]}"
        existing = items.setdefault(item_id, {"id": item_id, "type": item.get("type") or "message"})
        existing.update({k: v for k, v in item.items() if v is not None})
        if item_id not in item_order:
            item_order.append(item_id)
        return existing

    def item_by_payload(payload):
        item_id = payload.get("item_id")
        if item_id and item_id in items:
            return items[item_id]
        output_index = payload.get("output_index")
        if isinstance(output_index, int) and 0 <= output_index < len(item_order):
            return items.get(item_order[output_index])
        return None

    def merge_usage(candidate):
        nonlocal usage
        usage = _merge_usage(usage, candidate)

    def emit_reasoning(text, item):
        nonlocal reasoning_buf
        if not text:
            return
        reasoning_buf += text
        item["reasoning_content"] = (item.get("reasoning_content") or "") + text
        write_chunk({"reasoning_content": text})

    def emit_text(text, item):
        nonlocal content_buf
        if not text:
            return
        content_buf += text
        item["text"] = (item.get("text") or "") + text
        write_chunk({"content": text})

    def ensure_tool_started(item):
        if item.get("_tool_started"):
            return
        item["_tool_started"] = True
        index = len([i for i in item_order if (items.get(i) or {}).get("type") == "function_call"]) - 1
        if index < 0:
            index = 0
        item["_tool_index"] = index
        write_chunk(
            {
                "tool_calls": [
                    {
                        "index": index,
                        "id": item.get("call_id") or item.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                        "type": "function",
                        "function": {"name": item.get("name") or "unknown", "arguments": ""},
                    }
                ]
            }
        )

    def emit_tool_args(chunk, item):
        if not chunk:
            return
        ensure_tool_started(item)
        item["arguments"] = (item.get("arguments") or "") + chunk
        write_chunk(
            {
                "tool_calls": [
                    {
                        "index": item.get("_tool_index", 0),
                        "function": {"arguments": chunk},
                    }
                ]
            }
        )

    def text_from_response_content(item):
        parts = []
        for part in item.get("content") or []:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "".join(parts)

    def reasoning_from_item(item):
        parts = []
        for summary in item.get("summary") or []:
            if isinstance(summary, dict) and isinstance(summary.get("text"), str):
                parts.append(summary["text"])
        return "\n".join([part for part in parts if part])

    def finalize_item(item, output_index=None):
        # Try to find the existing item by output_index first.  Some providers
        # send delta events with an item_id / output_index that does not match
        # the ``id`` field on the ``output_item.done`` payload.  When that
        # happens, ``remember_item`` would create a brand-new entry (without the
        # streamed text/reasoning) and we would re-emit the full content as a
        # duplicate delta.  Matching by output_index is more reliable because
        # the index is positional and stable across the item lifecycle.
        existing = None
        if isinstance(output_index, int) and 0 <= output_index < len(item_order):
            existing = items.get(item_order[output_index])
        if existing is not None:
            # Merge the done item's fields (content, summary, etc.) into the
            # already-tracked item without creating a new dict entry.
            existing.update({k: v for k, v in item.items() if v is not None})
        else:
            existing = remember_item(item) or item

        item_type = existing.get("type")
        if item_type == "reasoning" and not existing.get("reasoning_content"):
            reasoning_text = reasoning_from_item(existing)
            # Guard: skip if this reasoning was already streamed via deltas
            # (happens when item tracking failed due to id mismatch).
            if reasoning_text and not _already_streamed(reasoning_buf, reasoning_text):
                emit_reasoning(reasoning_text, existing)
        elif item_type == "message" and not existing.get("text"):
            text = text_from_response_content(existing)
            # Guard: skip if this text was already streamed via deltas.
            if text and not _already_streamed(content_buf, text):
                emit_text(text, existing)
        elif item_type == "function_call":
            ensure_tool_started(existing)
            if existing.get("arguments") and not existing.get("_arguments_streamed"):
                emit_tool_args(existing.get("arguments") or "", existing)

    def handle_payload(payload):
        nonlocal response_status, finish_reason
        if not isinstance(payload, dict):
            return
        event_type = payload.get("type") or current_event
        if event_type == "response.completed":
            response = payload.get("response") or {}
            response_status = response.get("status") or response_status
            finish_reason = response.get("finish_reason") or finish_reason
            merge_usage(response.get("usage"))
            return
        if event_type == "response.failed":
            response = payload.get("response") or {}
            err = response.get("error") or {}
            raise RuntimeError(str(err.get("message") or "upstream Responses stream failed"))
        if event_type == "response.output_item.added":
            item = remember_item(payload.get("item") or {})
            if item and item.get("type") == "function_call":
                ensure_tool_started(item)
            return
        if event_type == "response.output_item.done":
            finalize_item(payload.get("item") or {}, output_index=payload.get("output_index"))
            return
        if event_type == "response.output_text.delta":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "message"}) or {}
            emit_text(str(payload.get("delta") or ""), item)
            return
        if event_type == "response.output_text.done":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "message"}) or {}
            if not item.get("text"):
                text = str(payload.get("text") or "")
                if text and not _already_streamed(content_buf, text):
                    emit_text(text, item)
            return
        if event_type in (
            "response.reasoning_summary_text.delta",
            "response.reasoning_summary.delta",
            "response.reasoning_text.delta",
        ):
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "reasoning"}) or {}
            emit_reasoning(_responses_reasoning_text_from_payload(payload), item)
            return
        if event_type in (
            "response.reasoning_summary_text.done",
            "response.reasoning_summary.done",
            "response.reasoning_text.done",
        ):
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "reasoning"}) or {}
            if not item.get("reasoning_content"):
                reasoning_text = _responses_reasoning_text_from_payload(payload)
                if reasoning_text and not _already_streamed(reasoning_buf, reasoning_text):
                    emit_reasoning(reasoning_text, item)
            return
        if event_type == "response.function_call_arguments.delta":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "function_call"}) or {}
            item["_arguments_streamed"] = True
            emit_tool_args(str(payload.get("delta") or ""), item)
            return
        if event_type == "response.function_call_arguments.done":
            item = item_by_payload(payload) or remember_item({"id": payload.get("item_id"), "type": "function_call"}) or {}
            if not item.get("arguments"):
                emit_tool_args(str(payload.get("arguments") or ""), item)

    try:
        def upstream_lines():
            for raw0 in initial_lines or []:
                yield raw0
            for raw0 in upstream:
                yield raw0

        for raw in upstream_lines():
            if first_byte_timeout_s and not first_byte_received:
                elapsed = time.time() - stream_start_time
                if elapsed > first_byte_timeout_s:
                    raise socket.timeout(f"First byte timeout: {elapsed:.1f}s > {first_byte_timeout_s}s")
            line = raw.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                if not line:
                    current_event = None
                continue
            if not first_byte_received:
                first_byte_received = True
                if read_timeout_s:
                    set_response_read_timeout(upstream, read_timeout_s)
            event_name = sse_event_name(line)
            if event_name is not None:
                current_event = event_name
                continue
            data = sse_data_payload(line)
            if data is None:
                continue
            if not data or is_sse_done(data):
                continue
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            handle_payload(payload)
    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        write_chunk({"content": err_text}, finish="stop")
        wfile.write(b"data: [DONE]\n\n")
        wfile.flush()
        return None

    has_tool = any((items.get(i) or {}).get("type") == "function_call" for i in item_order)
    final_finish = _responses_finish_to_chat_finish(finish_reason, response_status, has_tool)
    write_chunk({}, finish=final_finish)
    wfile.write(b"data: [DONE]\n\n")
    wfile.flush()

    usage_out = _chat_usage(usage)
    tool_calls = []
    for item_id in item_order:
        item = items.get(item_id) or {}
        if item.get("type") != "function_call":
            continue
        tool_calls.append(
            {
                "id": item.get("call_id") or item.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                "type": "function",
                "function": {"name": item.get("name") or "unknown", "arguments": item.get("arguments") or ""},
            }
        )
    message = {"role": "assistant", "content": content_buf}
    if reasoning_buf:
        message["reasoning_content"] = reasoning_buf
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": original_model,
        "choices": [{"index": 0, "message": message, "finish_reason": final_finish}],
        "usage": usage_out,
    }


def stream_anthropic_sse_to_openai_chat(
    upstream,
    wfile,
    original_model,
    first_byte_timeout_s: Optional[int] = None,
    read_timeout_s: Optional[int] = None,
    initial_lines: Optional[Iterable[bytes]] = None,
):
    """Read upstream Anthropic Messages SSE and write Chat Completions SSE chunks."""
    completion_id = f"chatcmpl_{uuid.uuid4().hex[:24]}"
    created = int(time.time())
    blocks = {}
    content_buf = ""
    reasoning_buf = ""
    usage = empty_usage()
    finish_reason = None
    current_event = None
    first_byte_received = False
    stream_start_time = time.time()

    def write_chunk(delta, finish=None):
        chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": original_model,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
        }
        wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode())
        wfile.flush()

    def merge_usage(candidate):
        nonlocal usage
        usage = _merge_usage(usage, candidate)

    def emit_reasoning(text):
        nonlocal reasoning_buf
        if not text:
            return
        reasoning_buf += text
        write_chunk({"reasoning_content": text})

    def emit_text(text):
        nonlocal content_buf
        if not text:
            return
        content_buf += text
        write_chunk({"content": text})

    def ensure_tool_started(idx, block):
        if block.get("_tool_started"):
            return
        block["_tool_started"] = True
        block["_tool_index"] = len([b for b in blocks.values() if b.get("type") == "tool_use" and b.get("_tool_started")]) - 1
        if block["_tool_index"] < 0:
            block["_tool_index"] = 0
        write_chunk(
            {
                "tool_calls": [
                    {
                        "index": block["_tool_index"],
                        "id": block.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                        "type": "function",
                        "function": {"name": block.get("name") or "unknown", "arguments": ""},
                    }
                ]
            }
        )

    def emit_tool_args(idx, chunk):
        if not chunk:
            return
        block = blocks.setdefault(idx, {"type": "tool_use", "arguments": ""})
        ensure_tool_started(idx, block)
        block["arguments"] = (block.get("arguments") or "") + chunk
        write_chunk(
            {
                "tool_calls": [
                    {
                        "index": block.get("_tool_index", 0),
                        "function": {"arguments": chunk},
                    }
                ]
            }
        )

    def handle_payload(payload):
        nonlocal finish_reason
        if not isinstance(payload, dict):
            return
        event_type = payload.get("type") or current_event
        if event_type == "message_start":
            merge_usage((payload.get("message") or {}).get("usage"))
            return
        if event_type == "message_delta":
            merge_usage(payload.get("usage"))
            stop = (payload.get("delta") or {}).get("stop_reason")
            if stop:
                finish_reason = _anthropic_stop_to_chat_finish(stop)
            return
        if event_type == "error":
            err = payload.get("error") or {}
            raise RuntimeError(str(err.get("message") or "upstream Anthropic stream error"))
        if event_type == "content_block_start":
            idx = int(payload.get("index", 0) or 0)
            block = dict(payload.get("content_block") or {})
            block.setdefault("arguments", "")
            blocks[idx] = block
            if block.get("type") == "tool_use":
                ensure_tool_started(idx, block)
            return
        if event_type == "content_block_delta":
            idx = int(payload.get("index", 0) or 0)
            delta = payload.get("delta") or {}
            delta_type = delta.get("type")
            if delta_type == "thinking_delta":
                emit_reasoning(str(delta.get("thinking") or ""))
            elif delta_type == "text_delta":
                emit_text(str(delta.get("text") or ""))
            elif delta_type == "input_json_delta":
                emit_tool_args(idx, str(delta.get("partial_json") or ""))

    try:
        def upstream_lines():
            for raw0 in initial_lines or []:
                yield raw0
            for raw0 in upstream:
                yield raw0

        for raw in upstream_lines():
            if first_byte_timeout_s and not first_byte_received:
                elapsed = time.time() - stream_start_time
                if elapsed > first_byte_timeout_s:
                    raise socket.timeout(f"First byte timeout: {elapsed:.1f}s > {first_byte_timeout_s}s")
            line = raw.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                if not line:
                    current_event = None
                continue
            if not first_byte_received:
                first_byte_received = True
                if read_timeout_s:
                    set_response_read_timeout(upstream, read_timeout_s)
            event_name = sse_event_name(line)
            if event_name is not None:
                current_event = event_name
                continue
            data = sse_data_payload(line)
            if data is None:
                continue
            if not data or is_sse_done(data):
                continue
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            handle_payload(payload)
    except Exception as e:
        err_text = f"[Stream interrupted: {type(e).__name__}]"
        print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
        write_chunk({"content": err_text}, finish="stop")
        wfile.write(b"data: [DONE]\n\n")
        wfile.flush()
        return None

    final_finish = finish_reason or ("tool_calls" if any(b.get("type") == "tool_use" for b in blocks.values()) else "stop")
    write_chunk({}, finish=final_finish)
    wfile.write(b"data: [DONE]\n\n")
    wfile.flush()

    usage_out = _chat_usage(usage)
    tool_calls = []
    for idx in sorted(blocks):
        block = blocks[idx]
        if block.get("type") != "tool_use":
            continue
        tool_calls.append(
            {
                "id": block.get("id") or f"call_{uuid.uuid4().hex[:24]}",
                "type": "function",
                "function": {"name": block.get("name") or "unknown", "arguments": block.get("arguments") or ""},
            }
        )
    message = {"role": "assistant", "content": content_buf}
    if reasoning_buf:
        message["reasoning_content"] = reasoning_buf
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": original_model,
        "choices": [{"index": 0, "message": message, "finish_reason": final_finish}],
        "usage": usage_out,
    }


def _anthropic_stop_to_chat_finish(stop_reason: Optional[str]) -> Optional[str]:
    stop_map = {"end_turn": "stop", "tool_use": "tool_calls", "max_tokens": "length", "stop_sequence": "stop"}
    return stop_map.get(stop_reason, stop_reason)


def _responses_finish_to_chat_finish(finish_reason: Optional[str], status: Optional[str], has_tool: bool) -> str:
    if has_tool or finish_reason in ("tool_calls", "tool_use"):
        return "tool_calls"
    if status == "incomplete" or finish_reason in ("length", "max_tokens"):
        return "length"
    if finish_reason in ("stop", "end_turn", None, ""):
        return "stop"
    return str(finish_reason)


def _responses_finish_to_anthropic_stop(finish_reason: Optional[str], status: Optional[str], has_tool: bool) -> str:
    if has_tool or finish_reason in ("tool_calls", "tool_use"):
        return "tool_use"
    if status == "incomplete" or finish_reason in ("length", "max_tokens"):
        return "max_tokens"
    if finish_reason in ("stop", "end_turn", None, ""):
        return "end_turn"
    return str(finish_reason)


def _already_streamed(buffer: str, text: str) -> bool:
    """Check whether *text* was already emitted as streaming deltas.

    Used by ``response.output_item.done`` / ``response.output_text.done``
    handlers to avoid re-emitting the full content as a duplicate delta when
    the upstream provider's item tracking is inconsistent (e.g. delta events
    carry a different ``item_id`` than the ``output_item.done`` payload).
    """
    if not buffer or not text:
        return False
    return buffer.endswith(text)


def _responses_reasoning_text_from_payload(payload: Dict[str, Any]) -> str:
    for key in ("delta", "text", "summary"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            for nested_key in ("text", "content", "summary"):
                nested = value.get(nested_key)
                if isinstance(nested, str):
                    return nested
        if isinstance(value, list):
            parts = []
            for item in value:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif isinstance(item, str):
                    parts.append(item)
            if parts:
                return "".join(parts)
    return ""


def _chat_delta_reasoning_text(delta: Dict[str, Any]) -> str:
    for key in ("reasoning_content", "reasoning", "thinking"):
        if key not in delta:
            continue
        value = delta.get(key)
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            parts = []
            for nested_key in ("text", "content", "summary", "thinking"):
                nested = value.get(nested_key)
                if isinstance(nested, str):
                    parts.append(nested)
                elif isinstance(nested, list):
                    parts.extend(_text_parts_from_reasoning_list(nested))
            return "".join(parts)
        if isinstance(value, list):
            return "".join(_text_parts_from_reasoning_list(value))
    return ""


def _text_parts_from_reasoning_list(items: Iterable[Any]) -> list:
    parts = []
    for item in items or []:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            for key in ("text", "content", "summary", "thinking"):
                value = item.get(key)
                if isinstance(value, str):
                    parts.append(value)
                    break
    return parts


def _responses_usage(usage: dict) -> dict:
    normalized = normalize_usage(usage)
    return {
        "input_tokens": normalized["input_tokens"],
        "output_tokens": normalized["output_tokens"],
        "total_tokens": normalized["total_tokens"],
    }


def _chat_usage(usage: dict) -> dict:
    normalized = normalize_usage(usage)
    return {
        "prompt_tokens": normalized["input_tokens"],
        "completion_tokens": normalized["output_tokens"],
        "total_tokens": normalized["total_tokens"],
    }
