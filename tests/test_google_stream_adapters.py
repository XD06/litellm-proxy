"""Google generateContent SSE -> client-format stream converter tests."""

import io
import json
import unittest

from format_adapters import CHAT, GOOGLE, RESPONSES, prepare_request_conversion
from stream_adapters import (
    stream_google_sse_to_anthropic,
    stream_google_sse_to_openai_chat,
    stream_google_sse_to_responses,
)


def same_model(name):
    return name


def sse_lines(payloads):
    out = []
    for payload in payloads:
        out.append(f"data: {json.dumps(payload)}\n\n".encode("utf-8"))
    return out


def parse_sse_events(raw: bytes):
    """Return [(event_name_or_None, parsed_data_or_None)] from SSE bytes."""
    events = []
    current_event = None
    for block in raw.decode("utf-8").split("\n\n"):
        event_name = None
        data = None
        for line in block.splitlines():
            if line.startswith("event: "):
                event_name = line[len("event: "):]
            elif line.startswith("data: "):
                data = line[len("data: "):]
        if data is None and event_name is None:
            continue
        parsed = None
        if data is not None:
            parsed = data if data == "[DONE]" else json.loads(data)
        events.append((event_name, parsed))
    return events


def _chat_context():
    return prepare_request_conversion(
        CHAT,
        GOOGLE,
        {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "tools": [
                {"type": "function", "function": {"name": "get-weather", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}}}
            ],
        },
        resolve_model=same_model,
    ).context


class GoogleToChatTests(unittest.TestCase):
    def run_converter(self, payloads, context=None):
        wfile = io.BytesIO()
        result = stream_google_sse_to_openai_chat(
            io.BytesIO(b"".join(sse_lines(payloads))),
            wfile,
            "gemini-2.5-flash",
            conversion_context=context,
        )
        return result, wfile.getvalue()

    def test_text_and_thought_stream_as_content_and_reasoning(self):
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [{"text": "think one", "thought": True}]}}]},
            {"candidates": [{"content": {"parts": [{"text": "Hello "}]}}]},
            {"candidates": [{"content": {"parts": [{"text": "world"}]}, "finishReason": "STOP"}]},
            {"usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 4, "thoughtsTokenCount": 3, "totalTokenCount": 12}},
        ])
        chunks = [data for _, data in parse_sse_events(raw) if isinstance(data, dict)]
        self.assertEqual(chunks[0]["choices"][0]["delta"].get("reasoning_content"), "think one")
        self.assertEqual(chunks[1]["choices"][0]["delta"].get("content"), "Hello ")
        self.assertEqual(chunks[-2]["choices"][0]["delta"].get("content"), "world")
        self.assertEqual(chunks[-1]["choices"][0]["finish_reason"], "stop")
        self.assertEqual(raw.decode("utf-8").strip().splitlines()[-1], "data: [DONE]")
        message = result["choices"][0]["message"]
        self.assertEqual(message["content"], "Hello world")
        self.assertEqual(message["reasoning_content"], "think one")
        self.assertEqual(result["usage"]["prompt_tokens"], 5)
        self.assertEqual(result["usage"]["completion_tokens_details"]["reasoning_tokens"], 3)

    def test_function_call_fragments_merge_and_signature_attaches(self):
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [
                {"functionCall": {"id": "call_7", "name": "get-weather", "args": {"city": "San"}}},
            ]}}]},
            {"candidates": [{"content": {"parts": [
                {"functionCall": {"id": "call_7", "args": {"city": "Francisco"}}, "thoughtSignature": "SIG=="},
            ]}, "finishReason": "STOP"}]},
        ])
        chunks = [data for _, data in parse_sse_events(raw) if isinstance(data, dict)]
        tool_delta = chunks[-2]["choices"][0]["delta"]["tool_calls"][0]
        self.assertEqual(tool_delta["function"]["name"], "get-weather")
        self.assertEqual(json.loads(tool_delta["function"]["arguments"]), {"city": "SanFrancisco"})
        self.assertEqual(chunks[-1]["choices"][0]["finish_reason"], "tool_calls")
        call = result["choices"][0]["message"]["tool_calls"][0]
        self.assertEqual(call["id"], "call_7")
        self.assertEqual(call["provider_specific_fields"]["thought_signature"], "SIG==")
        self.assertEqual(result["choices"][0]["message"]["content"], "")

    def test_parallel_calls_first_signed_only(self):
        result, _raw = self.run_converter([
            {"candidates": [{"content": {"parts": [
                {"functionCall": {"name": "get-weather", "args": {"city": "A"}, "thoughtSignature": "S1"}},
                {"functionCall": {"name": "get-weather", "args": {"city": "B"}, "id": "second"}},
            ]}, "finishReason": "STOP"}]},
        ])
        calls = result["choices"][0]["message"]["tool_calls"]
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["provider_specific_fields"]["thought_signature"], "S1")
        self.assertNotIn("provider_specific_fields", calls[1])

    def test_signatures_flushed_to_conversion_context(self):
        context = _chat_context()
        self.run_converter([
            {"candidates": [{"content": {"parts": [
                {"functionCall": {"id": "call_5", "name": "get-weather", "args": {"city": "SF"}, "thoughtSignature": "CTXSIG"}},
            ]}, "finishReason": "STOP"}]},
        ], context=context)
        self.assertEqual(context.google_state["signatures"], {"call_5": "CTXSIG"})

    def test_safety_and_length_finish_mapping(self):
        for finish, expected in (("SAFETY", "content_filter"), ("MAX_TOKENS", "length")):
            result, raw = self.run_converter([
                {"candidates": [{"content": {"parts": [{"text": "t"}]}, "finishReason": finish}]},
            ])
            self.assertEqual(result["choices"][0]["finish_reason"], expected)
            self.assertEqual(raw.decode("utf-8").strip().splitlines()[-1], "data: [DONE]")

    def test_midstream_interruption_ends_cleanly_and_returns_none(self):
        def dying_stream():
            yield from sse_lines([{"candidates": [{"content": {"parts": [{"text": "partial"}]}}]}])
            raise ConnectionResetError("peer closed connection")

        wfile = io.BytesIO()
        result = stream_google_sse_to_openai_chat(dying_stream(), wfile, "gemini-2.5-flash")
        self.assertIsNone(result)
        text = wfile.getvalue().decode("utf-8")
        self.assertIn("[Stream interrupted", text)
        self.assertTrue(text.strip().endswith("data: [DONE]"))

    def test_error_chunk_is_reported_as_interruption(self):
        wfile = io.BytesIO()
        result = stream_google_sse_to_openai_chat(
            io.BytesIO(b"".join(sse_lines([{"error": {"message": "quota exhausted"}}]))),
            wfile,
            "gemini-2.5-flash",
        )
        self.assertIsNone(result)
        self.assertIn("[Stream interrupted", wfile.getvalue().decode("utf-8"))


class GoogleToResponsesTests(unittest.TestCase):
    def run_converter(self, payloads, context=None):
        wfile = io.BytesIO()
        result = stream_google_sse_to_responses(
            io.BytesIO(b"".join(sse_lines(payloads))),
            wfile,
            "gemini-2.5-flash",
            conversion_context=context,
        )
        return result, wfile.getvalue()

    def test_event_sequence_text_and_reasoning(self):
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [{"text": "ponder", "thought": True}]}}]},
            {"candidates": [{"content": {"parts": [{"text": "answer"}]}, "finishReason": "STOP"}]},
            {"usageMetadata": {"promptTokenCount": 2, "candidatesTokenCount": 3, "totalTokenCount": 5}},
        ])
        names = [name for name, _ in parse_sse_events(raw)]
        self.assertEqual(names[0], "response.created")
        self.assertIn("response.output_item.added", names)
        self.assertIn("response.reasoning_summary_text.delta", names)
        self.assertIn("response.output_text.delta", names)
        self.assertIn("response.reasoning_summary_text.done", names)
        self.assertIn("response.output_text.done", names)
        self.assertEqual(names[-1], "response.completed")
        output = result["output"]
        kinds = [item["type"] for item in output]
        self.assertIn("reasoning", kinds)
        self.assertIn("message", kinds)
        message = [item for item in output if item["type"] == "message"][0]
        self.assertEqual(message["content"][0]["text"], "answer")
        reasoning = [item for item in output if item["type"] == "reasoning"][0]
        self.assertEqual(reasoning["summary"][0]["text"], "ponder")

    def test_function_call_item_stream_with_signature(self):
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [
                {"functionCall": {"id": "call_3", "name": "get-weather", "args": {"city": "SF"}, "thoughtSignature": "FS"}},
            ]}, "finishReason": "STOP"}]},
        ])
        names = [name for name, _ in parse_sse_events(raw)]
        self.assertIn("response.function_call_arguments.delta", names)
        self.assertIn("response.function_call_arguments.done", names)
        item = [o for o in result["output"] if o["type"] == "function_call"][0]
        self.assertEqual(item["call_id"], "call_3")
        self.assertEqual(item["arguments"], "{\"city\": \"SF\"}")
        self.assertEqual(item["provider_specific_fields"]["thought_signature"], "FS")

    def test_max_tokens_marks_incomplete(self):
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [{"text": "cut"}],}, "finishReason": "MAX_TOKENS"}]},
        ])
        self.assertEqual(result["status"], "incomplete")
        self.assertEqual(result["incomplete_details"], {"reason": "max_output_tokens"})
        self.assertEqual(parse_sse_events(raw)[-1][0], "response.completed")

    def test_interruption_emits_response_failed(self):
        def dying_stream():
            yield from sse_lines([{"candidates": [{"content": {"parts": [{"text": "a"}]}}]}])
            raise ConnectionResetError("peer closed connection")

        wfile = io.BytesIO()
        result = stream_google_sse_to_responses(dying_stream(), wfile, "gemini-2.5-flash")
        self.assertIsNone(result)
        names = [name for name, _ in parse_sse_events(wfile.getvalue())]
        self.assertEqual(names[-1], "response.failed")


class GoogleToAnthropicTests(unittest.TestCase):
    def run_converter(self, payloads, context=None):
        wfile = io.BytesIO()
        result = stream_google_sse_to_anthropic(
            io.BytesIO(b"".join(sse_lines(payloads))),
            wfile,
            "gemini-2.5-flash",
            conversion_context=context,
        )
        return result, wfile.getvalue()

    def test_thinking_and_text_blocks_with_signature(self):
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [
                {"text": "hidden thought", "thought": True, "thoughtSignature": "TSIG"},
                {"text": "visible"},
            ]}, "finishReason": "STOP"}]},
            {"usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 2, "thoughtsTokenCount": 1, "totalTokenCount": 6}},
        ])
        text = raw.decode("utf-8")
        self.assertIn('"type": "thinking_delta"', text)
        self.assertIn('"type": "signature_delta"', text)
        self.assertIn("TSIG", text)
        self.assertIn('"type": "text_delta"', text)
        self.assertIn("message_stop", text)
        blocks = result["content"]
        self.assertEqual(blocks[0], {"type": "thinking", "thinking": "hidden thought", "signature": "TSIG"})
        self.assertEqual(blocks[1], {"type": "text", "text": "visible"})
        self.assertEqual(result["stop_reason"], "end_turn")
        self.assertEqual(result["usage"], {"input_tokens": 3, "output_tokens": 3})

    def test_tool_use_blocks_after_text_blocks_close(self):
        context = _chat_context()
        result, raw = self.run_converter([
            {"candidates": [{"content": {"parts": [
                {"text": "working"},
                {"functionCall": {"name": "get-weather", "args": {"city": "SF"}, "id": "call_8", "thoughtSignature": "S"}},
            ]}, "finishReason": "STOP"}]},
        ], context=context)
        self.assertEqual(result["stop_reason"], "tool_use")
        tool = result["content"][-1]
        self.assertEqual(tool["type"], "tool_use")
        # wire name restored for the Anthropic client
        self.assertEqual(tool["name"], "get-weather")
        self.assertEqual(tool["input"], {"city": "SF"})
        text = raw.decode("utf-8")
        events = [json.loads(line[len("data: "):]) for line in text.splitlines() if line.startswith("data: ") and line.endswith("}")]
        opened = [e for e in events if e.get("type") == "content_block_start"]
        closed = [e for e in events if e.get("type") == "content_block_stop"]
        # text block + tool block opened and closed in order
        self.assertEqual([b["index"] for b in opened], [e["index"] for e in closed])
        self.assertLess(opened[0]["index"], opened[1]["index"])

    def test_safety_finish_maps_to_refusal(self):
        result, _raw = self.run_converter([
            {"candidates": [{"content": {"parts": [{"text": "no"}]}, "finishReason": "SAFETY"}]},
        ])
        self.assertEqual(result["stop_reason"], "refusal")

    def test_interruption_closes_blocks_and_returns_none(self):
        def dying_stream():
            yield from sse_lines([{"candidates": [{"content": {"parts": [{"text": "half"}]}}]}])
            raise ConnectionResetError("peer closed connection")

        wfile = io.BytesIO()
        result = stream_google_sse_to_anthropic(dying_stream(), wfile, "gemini-2.5-flash")
        self.assertIsNone(result)
        text = wfile.getvalue().decode("utf-8")
        self.assertIn("[Stream interrupted", text)
        self.assertIn("message_stop", text)
        self.assertTrue(text.rstrip().endswith('data: {"type": "message_stop"}'))

    def test_part_level_signature_is_the_canonical_wire_shape(self):
        # thoughtSignature lives on the part (sibling of functionCall),
        # matching Google's documented response shape.
        result, _raw = GoogleToChatTests.run_converter(
            self,
            [{
                "candidates": [{
                    "content": {"parts": [{
                        "functionCall": {"id": "call_p", "name": "noop", "args": {}},
                        "thoughtSignature": "PART_LEVEL",
                    }]},
                    "finishReason": "STOP",
                }],
            }],
        )
        call = result["choices"][0]["message"]["tool_calls"][0]
        self.assertEqual(call["provider_specific_fields"]["thought_signature"], "PART_LEVEL")


if __name__ == "__main__":
    unittest.main()
