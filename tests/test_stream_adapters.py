import io
import json
import socket
import unittest

from stream_adapters import (
    is_sse_done,
    prefetch_first_stream_line,
    prefetch_initial_stream_lines,
    relay_sse_stream,
    sse_data_payload,
    sse_event_name,
    stream_anthropic_sse_to_responses,
    stream_openai_sse_to_anthropic,
    stream_openai_sse_to_responses,
    stream_anthropic_sse_to_openai_chat,
    stream_responses_sse_to_openai_chat,
    stream_responses_sse_to_anthropic,
)


def sse_data(payload):
    return f"data: {json.dumps(payload)}\n".encode("utf-8")


class StreamAdapterTests(unittest.TestCase):
    def test_prefetch_skips_empty_and_comment_lines(self):
        upstream = io.BytesIO(b"\n: keepalive\n\ndata: {\"ok\": true}\n")

        first = prefetch_first_stream_line(upstream, 1)

        self.assertEqual(first, b'data: {"ok": true}\n')

    def test_prefetch_initial_stream_lines_preserves_native_prelude(self):
        upstream = io.BytesIO(b"event: message_start\n: keepalive\n\ndata: {\"ok\": true}\n")

        initial = prefetch_initial_stream_lines(upstream, 1)

        self.assertEqual(
            initial,
            [
                b"event: message_start\n",
                b": keepalive\n",
                b"\n",
                b'data: {"ok": true}\n',
            ],
        )

    def test_prefetch_initial_stream_lines_bounds_excessive_skipped_lines(self):
        # An upstream that only emits comment keepalives (no data event) must
        # not be buffered unbounded. The line bound aborts the prefetch.
        junk = b": keepalive\n" * 50
        upstream = io.BytesIO(junk)
        with self.assertRaises(socket.timeout) as ctx:
            prefetch_initial_stream_lines(upstream, 2, preserve_skipped=True, max_skipped_lines=8, max_skipped_bytes=1 << 20)
        self.assertIn("max_skipped_lines", str(ctx.exception))

    def test_prefetch_initial_stream_lines_bounds_excessive_skipped_bytes(self):
        junk = b": keepalive\n" * 50
        upstream = io.BytesIO(junk)
        with self.assertRaises(socket.timeout) as ctx:
            prefetch_initial_stream_lines(upstream, 2, preserve_skipped=True, max_skipped_lines=1 << 20, max_skipped_bytes=32)
        self.assertIn("max_skipped_bytes", str(ctx.exception))

    def test_prefetch_initial_stream_lines_allows_normal_prelude_under_bounds(self):
        # A normal native prelude well within bounds is preserved unchanged.
        upstream = io.BytesIO(b"event: message_start\n: keepalive\n\ndata: {\"ok\": true}\n")
        initial = prefetch_initial_stream_lines(upstream, 1, preserve_skipped=True, max_skipped_lines=128, max_skipped_bytes=65536)
        self.assertEqual(initial[-1], b'data: {"ok": true}\n')

    def test_prefetch_initial_stream_lines_zero_bound_disables_limit(self):
        # A non-positive bound disables that limit (backwards compatible).
        junk = b": keepalive\n" * 200
        upstream = io.BytesIO(junk + b'data: {"ok": true}\n')
        initial = prefetch_initial_stream_lines(upstream, 2, preserve_skipped=True, max_skipped_lines=0, max_skipped_bytes=0)
        # Reached the data line despite 200 skipped lines because bounds off.
        self.assertEqual(initial[-1], b'data: {"ok": true}\n')

    def test_stream_openai_sse_to_anthropic_emits_thinking_text_and_usage(self):
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"reasoning_content": "think"}}]}),
            sse_data({"choices": [{"delta": {"content": "answer"}}]}),
            sse_data(
                {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 3},
                }
            ),
        ]

        result = stream_openai_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["model"], "client-model")
        self.assertEqual(result["stop_reason"], "end_turn")
        self.assertEqual(result["usage"], {"input_tokens": 2, "output_tokens": 3})
        self.assertEqual([block["type"] for block in result["content"]], ["thinking", "text"])
        self.assertEqual(result["content"][0]["thinking"], "think")
        self.assertEqual(result["content"][1]["text"], "answer")

        body = output.getvalue().decode("utf-8")
        self.assertIn("event: message_start", body)
        self.assertIn('"type": "thinking_delta"', body)
        self.assertIn('"type": "text_delta"', body)
        self.assertIn("event: message_stop", body)

    def _anthropic_content_block_indices(self, body):
        """Return list of (block_type, index) for every content_block_start event."""
        starts = []
        for chunk in body.split("\n\n"):
            event_name = None
            data_line = None
            for line in chunk.split("\n"):
                if line.startswith("event: "):
                    event_name = line[len("event: "):]
                elif line.startswith("data: "):
                    data_line = line[len("data: "):]
            if event_name == "content_block_start" and data_line:
                payload = json.loads(data_line)
                block = payload.get("content_block") or {}
                starts.append((block.get("type"), payload.get("index")))
        return starts

    def test_stream_openai_sse_to_anthropic_does_not_reopen_thinking_after_text(self):
        # Upstream sends reasoning AFTER text has already started. The adapter
        # must not reopen a thinking block (which would violate Anthropic block
        # ordering) and must never reuse a content_block index. Late reasoning
        # is still accumulated into the final content log.
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"content": "answer"}}]}),
            sse_data({"choices": [{"delta": {"reasoning_content": "late-think"}}]}),
            sse_data({"choices": [{"delta": {"content": " more"}}]}),
            sse_data({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
        ]

        result = stream_openai_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        body = output.getvalue().decode("utf-8")
        starts = self._anthropic_content_block_indices(body)
        # Only ONE thinking block (in fact zero here, since reasoning arrived late),
        # and exactly one text block with index 0. No index reuse.
        types = [t for t, _ in starts]
        self.assertNotIn("thinking", types)  # late reasoning must not reopen thinking
        text_indices = [idx for t, idx in starts if t == "text"]
        self.assertEqual(text_indices, [0])
        # All block indices unique and monotonic.
        all_indices = [idx for _, idx in starts]
        self.assertEqual(all_indices, sorted(set(all_indices)))
        # Late reasoning is still preserved in the final content log.
        self.assertEqual([block["type"] for block in result["content"]], ["text"])
        self.assertIn("answer", result["content"][0]["text"])
        self.assertIn("more", result["content"][0]["text"])


        output = io.BytesIO()
        upstream = [b"data: second\n", b"data: third\n"]

        result = relay_sse_stream(upstream, output, initial_lines=[b"data: first\n"])

        self.assertEqual(output.getvalue(), b"data: first\ndata: second\ndata: third\n")
        self.assertEqual(result, {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0})

    def test_relay_sse_stream_extracts_chat_usage_without_changing_output(self):
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"content": "hi"}}]}),
            sse_data(
                {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
                }
            ),
            b"data: [DONE]\n",
        ]

        result = relay_sse_stream([], output, initial_lines=lines)

        self.assertEqual(output.getvalue(), b"".join(lines))
        self.assertEqual(result, {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5})

    def test_relay_sse_stream_can_skip_usage_scan(self):
        output = io.BytesIO()
        lines = [
            sse_data(
                {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
                }
            ),
            b"data: [DONE]\n",
        ]

        result = relay_sse_stream([], output, initial_lines=lines, collect_usage=False)

        self.assertEqual(output.getvalue(), b"".join(lines))
        self.assertEqual(result, {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0})

    def test_sse_data_payload_tolerates_missing_space(self):
        self.assertEqual(sse_data_payload("data:hello"), "hello")
        self.assertEqual(sse_data_payload("data: hello"), "hello")
        self.assertEqual(sse_data_payload("data:  hello"), "hello")
        self.assertIsNone(sse_data_payload("event: ping"))
        self.assertIsNone(sse_data_payload(": comment"))

    def test_sse_event_name_tolerates_missing_space(self):
        self.assertEqual(sse_event_name("event:ping"), "ping")
        self.assertEqual(sse_event_name("event: ping"), "ping")
        self.assertIsNone(sse_event_name("data: x"))

    def test_is_sse_done(self):
        self.assertTrue(is_sse_done("[DONE]"))
        self.assertFalse(is_sse_done("not done"))
        self.assertFalse(is_sse_done(None))

    def test_relay_sse_stream_usage_with_nospace_data(self):
        output = io.BytesIO()
        lines = [
            b'data:{"choices": [{"delta": {"content": "hi"}}]}\n',
            b'data:{"choices": [{"delta": {}, "finish_reason": "stop"}], '
            b'"usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5}}\n',
            b"data:[DONE]\n",
        ]

        result = relay_sse_stream([], output, initial_lines=lines)

        self.assertEqual(output.getvalue(), b"".join(lines))
        self.assertEqual(result, {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5})

        output = io.BytesIO()
        lines = [
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10}
                    },
                }
            ),
        ]

        result = relay_sse_stream([], output, initial_lines=lines)

        self.assertEqual(output.getvalue(), b"".join(lines))
        self.assertEqual(result, {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})

    def test_relay_sse_stream_combines_anthropic_message_usage(self):
        output = io.BytesIO()
        lines = [
            b"event: message_start\n",
            sse_data({"type": "message_start", "message": {"usage": {"input_tokens": 7, "output_tokens": 0}}}),
            b"event: message_delta\n",
            sse_data({"type": "message_delta", "usage": {"output_tokens": 11}}),
        ]

        result = relay_sse_stream([], output, initial_lines=lines)

        self.assertEqual(output.getvalue(), b"".join(lines))
        self.assertEqual(result, {"input_tokens": 7, "output_tokens": 11, "total_tokens": 18})

    def test_stream_openai_sse_to_responses_emits_text_usage_and_completion(self):
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"content": "hel"}}]}),
            sse_data({"choices": [{"delta": {"content": "lo"}}]}),
            sse_data(
                {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
                }
            ),
            b"data: [DONE]\n",
        ]

        result = stream_openai_sse_to_responses([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["model"], "client-model")
        self.assertEqual(result["output_text"], "hello")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["usage"], {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5})

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        event_names = [event for event, _data in events]
        self.assertIn("response.created", event_names)
        self.assertIn("response.output_item.added", event_names)
        self.assertIn("response.output_text.delta", event_names)
        self.assertIn("response.output_text.done", event_names)
        self.assertIn("response.completed", event_names)
        deltas = [data["delta"] for event, data in events if event == "response.output_text.delta"]
        self.assertEqual("".join(deltas), "hello")

    def test_stream_openai_sse_to_responses_ignores_whitespace_only_reasoning(self):
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"content": "answer"}}]}),
            sse_data({"choices": [{"delta": {"reasoning_content": "\n\n "}}]}),
            sse_data({"choices": [{"delta": {"thinking": "  "}}]}),
            sse_data({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
        ]

        result = stream_openai_sse_to_responses([], output, "client-model", initial_lines=lines)

        self.assertEqual([item["type"] for item in result["output"]], ["message"])
        self.assertEqual(result["output_text"], "answer")
        events = parse_sse_events(output.getvalue().decode("utf-8"))
        self.assertNotIn("response.reasoning_summary_text.delta", [event for event, _data in events])
        self.assertNotIn("reasoning", [data["item"]["type"] for event, data in events if event == "response.output_item.added"])

    def test_stream_openai_sse_to_responses_emits_function_call_arguments(self):
        output = io.BytesIO()
        lines = [
            sse_data(
                {
                    "choices": [
                        {
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {"name": "lookup", "arguments": "{\"q\""},
                                    }
                                ]
                            }
                        }
                    ]
                }
            ),
            sse_data({"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": ":\"x\"}"}}]}}]}),
            sse_data({"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}),
        ]

        result = stream_openai_sse_to_responses([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["output"][0]["type"], "function_call")
        self.assertEqual(result["output"][0]["call_id"], "call_1")
        self.assertEqual(result["output"][0]["name"], "lookup")
        self.assertEqual(result["output"][0]["arguments"], "{\"q\":\"x\"}")

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        argument_deltas = [data["delta"] for event, data in events if event == "response.function_call_arguments.delta"]
        self.assertEqual(argument_deltas, ['{"q"', ':"x"}'])
        self.assertIn("response.function_call_arguments.done", [event for event, _data in events])

    def test_stream_openai_sse_to_responses_preserves_reasoning_and_output_order(self):
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"reasoning_content": "plan"}}]}),
            sse_data({"choices": [{"delta": {"content": "answer"}}]}),
            sse_data(
                {
                    "choices": [
                        {
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {"name": "lookup", "arguments": "{\"q\""},
                                    }
                                ]
                            }
                        }
                    ]
                }
            ),
            sse_data({"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": ":\"x\"}"}}]}}]}),
            sse_data(
                {
                    "choices": [{"delta": {}, "finish_reason": "tool_calls"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 5, "total_tokens": 7},
                }
            ),
        ]

        result = stream_openai_sse_to_responses([], output, "client-model", initial_lines=lines)

        self.assertEqual([item["type"] for item in result["output"]], ["reasoning", "message", "function_call"])
        self.assertEqual(result["output"][0]["summary"][0]["text"], "plan")
        self.assertEqual(result["output"][1]["content"][0]["text"], "answer")
        self.assertEqual(result["output"][2]["call_id"], "call_1")
        self.assertEqual(result["output"][2]["arguments"], "{\"q\":\"x\"}")
        self.assertEqual(result["finish_reason"], "tool_calls")
        self.assertEqual(result["usage"], {"input_tokens": 2, "output_tokens": 5, "total_tokens": 7})

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        added = [
            (data["output_index"], data["item"]["type"])
            for event, data in events
            if event == "response.output_item.added"
        ]
        self.assertEqual(added, [(0, "reasoning"), (1, "message"), (2, "function_call")])
        reasoning_deltas = [
            data["delta"]
            for event, data in events
            if event == "response.reasoning_summary_text.delta"
        ]
        self.assertEqual(reasoning_deltas, ["plan"])
        reasoning_done = [
            data["text"]
            for event, data in events
            if event == "response.reasoning_summary_text.done"
        ]
        self.assertEqual(reasoning_done, ["plan"])
        tool_events = [
            data["output_index"]
            for event, data in events
            if event in ("response.function_call_arguments.delta", "response.function_call_arguments.done")
        ]
        self.assertEqual(tool_events, [2, 2, 2])

    def test_stream_anthropic_sse_to_responses_emits_text_reasoning_tool_and_usage(self):
        output = io.BytesIO()
        lines = [
            b"event: message_start\n",
            sse_data(
                {
                    "type": "message_start",
                    "message": {
                        "id": "msg_1",
                        "type": "message",
                        "role": "assistant",
                        "model": "provider-model",
                        "content": [],
                        "usage": {"input_tokens": 4, "output_tokens": 0},
                    },
                }
            ),
            b"event: content_block_start\n",
            sse_data({"type": "content_block_start", "index": 0, "content_block": {"type": "thinking"}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "plan"}}),
            b"event: content_block_stop\n",
            sse_data({"type": "content_block_stop", "index": 0}),
            b"event: content_block_start\n",
            sse_data({"type": "content_block_start", "index": 1, "content_block": {"type": "text", "text": ""}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "hel"}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "lo"}}),
            b"event: content_block_stop\n",
            sse_data({"type": "content_block_stop", "index": 1}),
            b"event: content_block_start\n",
            sse_data(
                {
                    "type": "content_block_start",
                    "index": 2,
                    "content_block": {"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {}},
                }
            ),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 2, "delta": {"type": "input_json_delta", "partial_json": "{\"q\""}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 2, "delta": {"type": "input_json_delta", "partial_json": ":\"x\"}"}}),
            b"event: content_block_stop\n",
            sse_data({"type": "content_block_stop", "index": 2}),
            b"event: message_delta\n",
            sse_data({"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 6}}),
            b"event: message_stop\n",
            sse_data({"type": "message_stop"}),
        ]

        result = stream_anthropic_sse_to_responses([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["model"], "client-model")
        self.assertEqual(result["output_text"], "hello")
        self.assertEqual(result["finish_reason"], "tool_calls")
        self.assertEqual(result["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual([item["type"] for item in result["output"]], ["reasoning", "message", "function_call"])
        self.assertEqual(result["output"][0]["summary"][0]["text"], "plan")
        self.assertEqual(result["output"][2]["call_id"], "toolu_1")
        self.assertEqual(result["output"][2]["arguments"], "{\"q\":\"x\"}")

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        event_names = [event for event, _data in events]
        self.assertIn("response.created", event_names)
        self.assertIn("response.output_text.delta", event_names)
        self.assertIn("response.function_call_arguments.delta", event_names)
        self.assertIn("response.completed", event_names)
        reasoning_deltas = [
            data["delta"]
            for event, data in events
            if event == "response.reasoning_summary_text.delta"
        ]
        self.assertEqual(reasoning_deltas, ["plan"])
        reasoning_done = [
            data["text"]
            for event, data in events
            if event == "response.reasoning_summary_text.done"
        ]
        self.assertEqual(reasoning_done, ["plan"])
        deltas = [data["delta"] for event, data in events if event == "response.output_text.delta"]
        self.assertEqual("".join(deltas), "hello")
        argument_deltas = [data["delta"] for event, data in events if event == "response.function_call_arguments.delta"]
        self.assertEqual(argument_deltas, ['{"q"', ':"x"}'])

    def test_stream_responses_sse_to_anthropic_emits_text_reasoning_tool_and_usage(self):
        output = io.BytesIO()
        lines = [
            b"event: response.created\n",
            sse_data({"type": "response.created", "response": {"id": "resp_1", "status": "in_progress"}}),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"id": "rs_1", "type": "reasoning", "summary": []},
                }
            ),
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 0,
                    "item": {
                        "id": "rs_1",
                        "type": "reasoning",
                        "status": "completed",
                        "summary": [{"type": "summary_text", "text": "plan"}],
                    },
                }
            ),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 1,
                    "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": []},
                }
            ),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "hel"}),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "lo"}),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 2,
                    "item": {
                        "id": "fc_1",
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "lookup",
                        "arguments": "",
                    },
                }
            ),
            b"event: response.function_call_arguments.delta\n",
            sse_data({"type": "response.function_call_arguments.delta", "item_id": "fc_1", "output_index": 2, "delta": "{\"q\""}),
            b"event: response.function_call_arguments.delta\n",
            sse_data({"type": "response.function_call_arguments.delta", "item_id": "fc_1", "output_index": 2, "delta": ":\"x\"}"}),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["model"], "client-model")
        self.assertEqual(result["stop_reason"], "tool_use")
        self.assertEqual(result["usage"], {"input_tokens": 4, "output_tokens": 6})
        self.assertEqual([block["type"] for block in result["content"]], ["thinking", "text", "tool_use"])
        self.assertEqual(result["content"][0]["thinking"], "plan")
        self.assertEqual(result["content"][1]["text"], "hello")
        self.assertEqual(result["content"][2]["id"], "call_1")
        self.assertEqual(result["content"][2]["input"], {"q": "x"})

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        event_names = [event for event, _data in events]
        self.assertIn("message_start", event_names)
        self.assertIn("content_block_start", event_names)
        self.assertIn("content_block_delta", event_names)
        self.assertIn("message_stop", event_names)
        thinking_deltas = [
            data["delta"]["thinking"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "thinking_delta"
        ]
        self.assertEqual(thinking_deltas, ["plan"])
        text_deltas = [
            data["delta"]["text"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "text_delta"
        ]
        self.assertEqual("".join(text_deltas), "hello")
        argument_deltas = [
            data["delta"]["partial_json"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "input_json_delta"
        ]
        self.assertEqual(argument_deltas, ['{"q"', ':"x"}'])

    def test_stream_responses_sse_to_anthropic_does_not_reopen_thinking_after_text(self):
        # Reasoning delta arrives AFTER text has already streamed. The adapter
        # must not reopen a thinking block; block indices stay monotonic and
        # unique. Late reasoning is retained on the item but not emitted as a
        # thinking block in the stream.
        output = io.BytesIO()
        lines = [
            b"event: response.created\n",
            sse_data({"type": "response.created", "response": {"id": "resp_1", "status": "in_progress"}}),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": []},
                }
            ),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 0, "delta": "answer"}),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 1,
                    "item": {"id": "rs_1", "type": "reasoning", "summary": []},
                }
            ),
            b"event: response.reasoning_summary_text.delta\n",
            sse_data({"type": "response.reasoning_summary_text.delta", "item_id": "rs_1", "output_index": 1, "delta": "late"}),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {"id": "resp_1", "status": "completed", "usage": {"input_tokens": 1, "output_tokens": 2}},
                }
            ),
        ]

        result = stream_responses_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        body = output.getvalue().decode("utf-8")
        events = parse_sse_events(body)
        # No thinking_delta emitted at all (text started first).
        thinking_deltas = [
            data["delta"]["thinking"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "thinking_delta"
        ]
        self.assertEqual(thinking_deltas, [])
        # content log is text-only; late reasoning is not surfaced as a block.
        self.assertEqual([block["type"] for block in result["content"]], ["text"])
        self.assertIn("answer", result["content"][0]["text"])
        # All content_block_start indices unique and monotonic.
        starts = [
            (data["content_block"]["type"], data["index"])
            for event, data in events
            if event == "content_block_start"
        ]
        all_indices = [idx for _, idx in starts]
        self.assertEqual(all_indices, sorted(set(all_indices)))
        self.assertNotIn("thinking", [t for t, _ in starts])

    def test_stream_responses_sse_to_anthropic_emits_reasoning_summary_text_delta(self):
        output = io.BytesIO()
        lines = [
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"id": "rs_1", "type": "reasoning", "summary": []},
                }
            ),
            b"event: response.reasoning_summary_text.delta\n",
            sse_data(
                {
                    "type": "response.reasoning_summary_text.delta",
                    "item_id": "rs_1",
                    "output_index": 0,
                    "summary_index": 0,
                    "delta": "plan",
                }
            ),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["content"][0]["type"], "thinking")
        self.assertEqual(result["content"][0]["thinking"], "plan")
        events = parse_sse_events(output.getvalue().decode("utf-8"))
        thinking_deltas = [
            data["delta"]["thinking"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "thinking_delta"
        ]
        self.assertEqual(thinking_deltas, ["plan"])

    def test_stream_responses_sse_to_anthropic_no_duplicate_when_item_id_mismatch(self):
        """Delta events streamed text, then output_item.done arrives with a
        different item id.  The adapter must NOT re-emit the full text as a
        duplicate content_block_delta."""
        output = io.BytesIO()
        lines = [
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"id": "rs_1", "type": "reasoning", "summary": []},
                }
            ),
            b"event: response.reasoning_summary_text.delta\n",
            sse_data(
                {
                    "type": "response.reasoning_summary_text.delta",
                    "item_id": "rs_1",
                    "output_index": 0,
                    "summary_index": 0,
                    "delta": "thinking",
                }
            ),
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 0,
                    # Different id than the delta's item_id="rs_1"
                    "item": {
                        "id": "rs_DIFFERENT",
                        "type": "reasoning",
                        "summary": [{"type": "summary_text", "text": "thinking"}],
                    },
                }
            ),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 1,
                    "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": []},
                }
            ),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "hel"}),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "lo"}),
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 1,
                    # Different id than the delta's item_id="msg_1"
                    "item": {
                        "id": "msg_DIFFERENT",
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "hello"}],
                    },
                }
            ),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        # Verify final assembled content
        content_types = [c["type"] for c in result["content"]]
        self.assertIn("thinking", content_types)
        self.assertIn("text", content_types)
        thinking_block = [c for c in result["content"] if c["type"] == "thinking"][0]
        text_block = [c for c in result["content"] if c["type"] == "text"][0]
        self.assertEqual(thinking_block["thinking"], "thinking")
        self.assertEqual(text_block["text"], "hello")

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        # Collect all thinking_delta and text_delta events
        thinking_deltas = [
            data["delta"]["thinking"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "thinking_delta"
        ]
        text_deltas = [
            data["delta"]["text"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "text_delta"
        ]

        # Reasoning should only appear once (from delta), not duplicated
        self.assertEqual(thinking_deltas, ["thinking"])
        # Text should only appear as deltas, not re-emitted as full "hello"
        self.assertEqual(text_deltas, ["hel", "lo"])

    def test_stream_responses_sse_to_openai_chat_emits_text_reasoning_tool_and_usage(self):
        output = io.BytesIO()
        lines = [
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 0,
                    "item": {
                        "id": "rs_1",
                        "type": "reasoning",
                        "status": "completed",
                        "summary": [{"type": "summary_text", "text": "plan"}],
                    },
                }
            ),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 1,
                    "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": []},
                }
            ),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "hi"}),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 2,
                    "item": {"id": "fc_1", "type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": ""},
                }
            ),
            b"event: response.function_call_arguments.delta\n",
            sse_data({"type": "response.function_call_arguments.delta", "item_id": "fc_1", "output_index": 2, "delta": "{\"q\""}),
            b"event: response.function_call_arguments.delta\n",
            sse_data({"type": "response.function_call_arguments.delta", "item_id": "fc_1", "output_index": 2, "delta": ":\"x\"}"}),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_openai_chat([], output, "client-model", initial_lines=lines)

        message = result["choices"][0]["message"]
        self.assertEqual(message["reasoning_content"], "plan")
        self.assertEqual(message["content"], "hi")
        self.assertEqual(message["tool_calls"][0]["id"], "call_1")
        self.assertEqual(message["tool_calls"][0]["function"]["arguments"], "{\"q\":\"x\"}")
        self.assertEqual(result["choices"][0]["finish_reason"], "tool_calls")
        self.assertEqual(result["usage"], {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10})

        chunks = parse_chat_sse_chunks(output.getvalue().decode("utf-8"))
        self.assertIn("plan", [c["choices"][0]["delta"].get("reasoning_content") for c in chunks if c.get("choices")])
        self.assertIn("hi", [c["choices"][0]["delta"].get("content") for c in chunks if c.get("choices")])
        argument_deltas = [
            c["choices"][0]["delta"]["tool_calls"][0]["function"].get("arguments")
            for c in chunks
            if c.get("choices") and c["choices"][0]["delta"].get("tool_calls")
        ]
        self.assertEqual([part for part in argument_deltas if part], ['{"q"', ':"x"}'])

    def test_stream_responses_sse_to_openai_chat_emits_reasoning_summary_text_delta(self):
        output = io.BytesIO()
        lines = [
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"id": "rs_1", "type": "reasoning", "summary": []},
                }
            ),
            b"event: response.reasoning_summary_text.delta\n",
            sse_data(
                {
                    "type": "response.reasoning_summary_text.delta",
                    "item_id": "rs_1",
                    "output_index": 0,
                    "summary_index": 0,
                    "delta": "plan",
                }
            ),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_openai_chat([], output, "client-model", initial_lines=lines)

        message = result["choices"][0]["message"]
        self.assertEqual(message["reasoning_content"], "plan")
        chunks = parse_chat_sse_chunks(output.getvalue().decode("utf-8"))
        self.assertIn("plan", [c["choices"][0]["delta"].get("reasoning_content") for c in chunks if c.get("choices")])

    def test_stream_responses_sse_to_openai_chat_no_duplicate_when_item_id_mismatch(self):
        """Delta events streamed text, then output_item.done arrives with a
        different item id.  The adapter must NOT re-emit the full text as a
        duplicate delta."""
        output = io.BytesIO()
        lines = [
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"id": "rs_1", "type": "reasoning", "summary": []},
                }
            ),
            b"event: response.reasoning_summary_text.delta\n",
            sse_data(
                {
                    "type": "response.reasoning_summary_text.delta",
                    "item_id": "rs_1",
                    "output_index": 0,
                    "summary_index": 0,
                    "delta": "thinking",
                }
            ),
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 0,
                    # Different id than the delta's item_id="rs_1"
                    "item": {
                        "id": "rs_DIFFERENT",
                        "type": "reasoning",
                        "summary": [{"type": "summary_text", "text": "thinking"}],
                    },
                }
            ),
            b"event: response.output_item.added\n",
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 1,
                    "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": []},
                }
            ),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "hel"}),
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 1, "delta": "lo"}),
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 1,
                    # Different id than the delta's item_id="msg_1"
                    "item": {
                        "id": "msg_DIFFERENT",
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "hello"}],
                    },
                }
            ),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_openai_chat([], output, "client-model", initial_lines=lines)

        message = result["choices"][0]["message"]
        self.assertEqual(message["reasoning_content"], "thinking")
        self.assertEqual(message["content"], "hello")

        chunks = parse_chat_sse_chunks(output.getvalue().decode("utf-8"))
        # Collect all reasoning_content and content deltas
        reasoning_deltas = [c["choices"][0]["delta"].get("reasoning_content") for c in chunks if c.get("choices")]
        content_deltas = [c["choices"][0]["delta"].get("content") for c in chunks if c.get("choices")]
        reasoning_deltas = [d for d in reasoning_deltas if d]
        content_deltas = [d for d in content_deltas if d]

        # Reasoning should only appear once (from deltas), not duplicated
        self.assertEqual(reasoning_deltas, ["thinking"])
        # Text should only appear as deltas, not re-emitted as full "hello"
        self.assertEqual(content_deltas, ["hel", "lo"])

    def test_stream_responses_sse_to_openai_chat_no_duplicate_without_output_item_added(self):
        """Provider sends deltas without output_item.added, then sends
        output_item.done.  Even without the added event, the adapter should
        not duplicate content."""
        output = io.BytesIO()
        lines = [
            # No output_item.added event — deltas come first
            b"event: response.output_text.delta\n",
            sse_data({"type": "response.output_text.delta", "output_index": 0, "delta": "hi"}),
            b"event: response.output_item.done\n",
            sse_data(
                {
                    "type": "response.output_item.done",
                    "output_index": 0,
                    "item": {
                        "id": "msg_1",
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "hi"}],
                    },
                }
            ),
            b"event: response.completed\n",
            sse_data(
                {
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "status": "completed",
                        "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
                    },
                }
            ),
        ]

        result = stream_responses_sse_to_openai_chat([], output, "client-model", initial_lines=lines)

        message = result["choices"][0]["message"]
        self.assertEqual(message["content"], "hi")

        chunks = parse_chat_sse_chunks(output.getvalue().decode("utf-8"))
        content_deltas = [c["choices"][0]["delta"].get("content") for c in chunks if c.get("choices")]
        content_deltas = [d for d in content_deltas if d]
        # Should only have the delta, not a duplicate full text
        self.assertEqual(content_deltas, ["hi"])

    def test_stream_anthropic_sse_to_openai_chat_emits_text_reasoning_tool_and_usage(self):
        output = io.BytesIO()
        lines = [
            b"event: message_start\n",
            sse_data({"type": "message_start", "message": {"usage": {"input_tokens": 4, "output_tokens": 0}}}),
            b"event: content_block_start\n",
            sse_data({"type": "content_block_start", "index": 0, "content_block": {"type": "thinking"}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "plan"}}),
            b"event: content_block_start\n",
            sse_data({"type": "content_block_start", "index": 1, "content_block": {"type": "text", "text": ""}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "hi"}}),
            b"event: content_block_start\n",
            sse_data(
                {
                    "type": "content_block_start",
                    "index": 2,
                    "content_block": {"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {}},
                }
            ),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 2, "delta": {"type": "input_json_delta", "partial_json": "{\"q\""}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 2, "delta": {"type": "input_json_delta", "partial_json": ":\"x\"}"}}),
            b"event: message_delta\n",
            sse_data({"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 6}}),
            b"event: message_stop\n",
            sse_data({"type": "message_stop"}),
        ]

        result = stream_anthropic_sse_to_openai_chat([], output, "client-model", initial_lines=lines)

        message = result["choices"][0]["message"]
        self.assertEqual(message["reasoning_content"], "plan")
        self.assertEqual(message["content"], "hi")
        self.assertEqual(message["tool_calls"][0]["id"], "toolu_1")
        self.assertEqual(message["tool_calls"][0]["function"]["arguments"], "{\"q\":\"x\"}")
        self.assertEqual(result["choices"][0]["finish_reason"], "tool_calls")
        self.assertEqual(result["usage"], {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10})

        chunks = parse_chat_sse_chunks(output.getvalue().decode("utf-8"))
        self.assertIn("plan", [c["choices"][0]["delta"].get("reasoning_content") for c in chunks if c.get("choices")])
        self.assertIn("hi", [c["choices"][0]["delta"].get("content") for c in chunks if c.get("choices")])
        argument_deltas = [
            c["choices"][0]["delta"]["tool_calls"][0]["function"].get("arguments")
            for c in chunks
            if c.get("choices") and c["choices"][0]["delta"].get("tool_calls")
        ]
        self.assertEqual([part for part in argument_deltas if part], ['{"q"', ':"x"}'])

    def test_stream_openai_sse_to_anthropic_emits_tool_use_arguments(self):
        output = io.BytesIO()
        lines = [
            sse_data(
                {
                    "choices": [
                        {
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {"name": "lookup", "arguments": "{\"q\""},
                                    }
                                ]
                            }
                        }
                    ]
                }
            ),
            sse_data({"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": ":\"x\"}"}}]}}]}),
            sse_data(
                {
                    "choices": [{"delta": {}, "finish_reason": "tool_calls"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 3},
                }
            ),
        ]

        result = stream_openai_sse_to_anthropic([], output, "client-model", initial_lines=lines)

        self.assertEqual(result["stop_reason"], "tool_use")
        self.assertEqual(result["usage"], {"input_tokens": 2, "output_tokens": 3})
        self.assertEqual(result["content"][0]["type"], "tool_use")
        self.assertEqual(result["content"][0]["id"], "call_1")
        self.assertEqual(result["content"][0]["name"], "lookup")
        self.assertEqual(result["content"][0]["input"], {"q": "x"})

        events = parse_sse_events(output.getvalue().decode("utf-8"))
        tool_starts = [
            data["content_block"]
            for event, data in events
            if event == "content_block_start" and data["content_block"]["type"] == "tool_use"
        ]
        self.assertEqual(tool_starts[0]["id"], "call_1")
        self.assertEqual(tool_starts[0]["name"], "lookup")
        argument_deltas = [
            data["delta"]["partial_json"]
            for event, data in events
            if event == "content_block_delta" and data["delta"]["type"] == "input_json_delta"
        ]
        self.assertEqual(argument_deltas, ['{"q"', ':"x"}'])
        stop_reasons = [
            data["delta"]["stop_reason"]
            for event, data in events
            if event == "message_delta"
        ]
        self.assertEqual(stop_reasons[-1], "tool_use")


def parse_sse_events(body):
    events = []
    current_event = None
    current_data = None
    for raw in body.splitlines():
        if raw.startswith("event: "):
            current_event = raw[len("event: ") :]
        elif raw.startswith("data: "):
            current_data = json.loads(raw[len("data: ") :])
        elif raw == "" and current_event:
            events.append((current_event, current_data))
            current_event = None
            current_data = None
    return events


def parse_chat_sse_chunks(body):
    chunks = []
    for raw in body.splitlines():
        if not raw.startswith("data: "):
            continue
        data = raw[len("data: ") :]
        if data == "[DONE]":
            continue
        chunks.append(json.loads(data))
    return chunks


def _sequence_numbers(events):
    return [data.get("sequence_number") for _event, data in events if isinstance(data, dict)]


class ResponsesSequenceNumberTests(unittest.TestCase):
    """Verify converted Responses streams emit monotonic sequence_number on
    every event, per the OpenAI Responses streaming contract."""

    def test_chat_to_responses_emits_monotonic_sequence_number(self):
        output = io.BytesIO()
        lines = [
            sse_data({"choices": [{"delta": {"reasoning_content": "plan"}}]}),
            sse_data({"choices": [{"delta": {"content": "answer"}}]}),
            sse_data({"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 1, "completion_tokens": 2}}),
        ]
        stream_openai_sse_to_responses([], output, "client-model", initial_lines=lines)
        events = parse_sse_events(output.getvalue().decode("utf-8"))
        seqs = _sequence_numbers(events)
        # Every event carries a sequence_number.
        self.assertTrue(all(s is not None for s in seqs), f"missing sequence_number in: {seqs}")
        # Strictly monotonic starting at 1.
        self.assertEqual(seqs, list(range(1, len(seqs) + 1)))

    def test_anthropic_to_responses_emits_monotonic_sequence_number(self):
        output = io.BytesIO()
        lines = [
            b"event: message_start\n",
            sse_data({"type": "message_start", "message": {"id": "msg_1", "usage": {"input_tokens": 1, "output_tokens": 0}}}),
            b"event: content_block_start\n",
            sse_data({"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}),
            b"event: content_block_delta\n",
            sse_data({"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "hi"}}),
            b"event: content_block_stop\n",
            sse_data({"type": "content_block_stop", "index": 0}),
            b"event: message_delta\n",
            sse_data({"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"input_tokens": 1, "output_tokens": 2}}),
            b"event: message_stop\n",
            sse_data({"type": "message_stop"}),
        ]
        stream_anthropic_sse_to_responses([], output, "client-model", initial_lines=lines)
        events = parse_sse_events(output.getvalue().decode("utf-8"))
        seqs = _sequence_numbers(events)
        self.assertTrue(all(s is not None for s in seqs), f"missing sequence_number in: {seqs}")
        self.assertEqual(seqs, list(range(1, len(seqs) + 1)))


if __name__ == "__main__":
    unittest.main()
