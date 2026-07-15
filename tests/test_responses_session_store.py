import io
import json
import os
import tempfile
import unittest

from conversion_core import ConversionError, ResponsesSessionStore, SessionStoreLimits
from format_adapters import CHAT, RESPONSES, convert_response, prepare_request_conversion
from stream_adapters import relay_sse_stream, stream_openai_sse_to_responses


def sse_data(payload):
    return f"data: {json.dumps(payload)}\n".encode("utf-8")


class ResponsesSessionStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp_dir.name, "responses.sqlite3")
        self.store = ResponsesSessionStore(self.path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_expands_parent_chain_in_request_output_order(self):
        self.store.save(
            {"model": "m", "input": "first"},
            {
                "id": "resp_1",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "one"}],
                    }
                ],
            },
        )
        self.store.save(
            {"model": "m", "previous_response_id": "resp_1", "input": "second"},
            {
                "id": "resp_2",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "two"}],
                    }
                ],
            },
        )

        expanded = self.store.expand_request(
            {"model": "m", "previous_response_id": "resp_2", "input": "third"}
        )

        self.assertNotIn("previous_response_id", expanded)
        self.assertEqual(expanded["input"][0], "first")
        self.assertEqual(expanded["input"][2], "second")
        self.assertEqual(expanded["input"][4], "third")
        self.assertEqual(expanded["input"][1]["content"][0]["text"], "one")
        self.assertEqual(expanded["input"][3]["content"][0]["text"], "two")

    def test_store_false_does_not_create_continuation(self):
        saved = self.store.save(
            {"model": "m", "input": "private", "store": False},
            {"id": "resp_private", "output": []},
        )

        self.assertFalse(saved)
        with self.assertRaises(ConversionError) as caught:
            self.store.expand_request(
                {"model": "m", "previous_response_id": "resp_private", "input": "next"}
            )
        self.assertEqual(caught.exception.code, "session_missing")

    def test_cycle_and_depth_are_rejected(self):
        self.store.save(
            {"model": "m", "previous_response_id": "resp_cycle", "input": "x"},
            {"id": "resp_cycle", "output": []},
        )

        with self.assertRaises(ConversionError) as caught:
            self.store.load_chain("resp_cycle")

        self.assertEqual(caught.exception.code, "session_cycle")

    def test_expired_record_returns_stable_error(self):
        now = [1000]
        store = ResponsesSessionStore(
            self.path,
            limits=SessionStoreLimits(ttl_seconds=5),
            clock=lambda: now[0],
        )
        store.save({"model": "m", "input": "x"}, {"id": "resp_old", "output": []})
        now[0] = 1006

        with self.assertRaises(ConversionError) as caught:
            store.load_chain("resp_old")

        self.assertEqual(caught.exception.code, "session_expired")

    def test_cross_format_prepare_expands_previous_response(self):
        self.store.save(
            {"model": "m", "input": "first"},
            {
                "id": "resp_1",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "answer"}],
                    }
                ],
            },
        )

        prepared = prepare_request_conversion(
            RESPONSES,
            CHAT,
            {"model": "m", "previous_response_id": "resp_1", "input": "follow up"},
            resolve_model=lambda model: model,
            session_store=self.store,
        )

        self.assertNotIn("previous_response_id", prepared.payload)
        self.assertEqual(
            [message["role"] for message in prepared.payload["messages"]],
            ["user", "assistant", "user"],
        )
        self.assertEqual(prepared.report.fidelity, "stateful")
        self.assertEqual(prepared.context.session_expanded_from, "resp_1")

    def test_non_stream_response_is_persisted_through_conversion_context(self):
        prepared = prepare_request_conversion(
            RESPONSES,
            CHAT,
            {"model": "m", "input": "hello"},
            resolve_model=lambda model: model,
            session_store=self.store,
        )

        converted = convert_response(
            CHAT,
            RESPONSES,
            {
                "id": "chatcmpl_1",
                "model": "upstream",
                "choices": [{"message": {"role": "assistant", "content": "world"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
            original_model="m",
            context=prepared.context,
        )

        expanded = self.store.expand_request(
            {"model": "m", "previous_response_id": converted["id"], "input": "again"}
        )
        self.assertEqual(expanded["input"][0], "hello")
        self.assertEqual(expanded["input"][-1], "again")

    def test_stream_response_is_persisted_before_completion_event(self):
        prepared = prepare_request_conversion(
            RESPONSES,
            CHAT,
            {"model": "m", "input": "hello", "stream": True},
            resolve_model=lambda model: model,
            session_store=self.store,
        )
        output = io.BytesIO()
        completed = stream_openai_sse_to_responses(
            [],
            output,
            "m",
            initial_lines=[
                sse_data({"choices": [{"delta": {"content": "world"}}]}),
                sse_data({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
            ],
            conversion_context=prepared.context,
        )

        expanded = self.store.expand_request(
            {"model": "m", "previous_response_id": completed["id"], "input": "again"}
        )
        self.assertEqual(expanded["input"][0], "hello")
        self.assertEqual(expanded["input"][-1], "again")

    def test_native_responses_stream_completion_is_captured_without_rewriting_bytes(self):
        prepared = prepare_request_conversion(
            RESPONSES,
            RESPONSES,
            {"model": "m", "input": "native", "stream": True},
            resolve_model=lambda model: model,
            session_store=self.store,
        )
        completed = {
            "id": "resp_native",
            "model": "m",
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "answer"}],
                }
            ],
        }
        line = b"event: response.completed\n" + sse_data(
            {"type": "response.completed", "response": completed}
        ) + b"\n"
        output = io.BytesIO()

        relay_sse_stream(
            [],
            output,
            initial_lines=line.splitlines(keepends=True),
            client_format="responses",
            conversion_context=prepared.context,
        )

        self.assertEqual(output.getvalue(), line)
        expanded = self.store.expand_request(
            {"model": "m", "previous_response_id": "resp_native", "input": "again"}
        )
        self.assertEqual(expanded["input"][0], "native")


if __name__ == "__main__":
    unittest.main()
