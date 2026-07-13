import io
import json
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import sse2json
from router import Attempt


class FakeRouter:
    def __init__(self, attempts):
        self.attempts = attempts
        self.iter_calls = []
        self.successes = []
        self.failures = []

    def iter_attempts(self, canonical_model, is_stream, request_id, client_headers=None, **kwargs):
        self.iter_calls.append(
            {
                "canonical_model": canonical_model,
                "is_stream": is_stream,
                "request_id": request_id,
                "client_headers": client_headers,
                **kwargs,
            }
        )
        yield from self.attempts

    def report_success(self, attempt):
        self.successes.append(attempt)

    def report_failure(self, attempt, **kwargs):
        self.failures.append((attempt, kwargs))

    def masked_key(self, key):
        return "masked"


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
                "proxy_url": proxy_url,
                "remaining_timeout_s": remaining_timeout_s,
            }
        )
        return self.response


class SequenceFakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
                "proxy_url": proxy_url,
                "remaining_timeout_s": remaining_timeout_s,
            }
        )
        return self.responses[len(self.calls) - 1]


class RetryToolChoiceClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append(
            {
                "url": url,
                "headers": headers,
                "payload": json.loads(json.dumps(payload)),
                "proxy_url": proxy_url,
                "remaining_timeout_s": remaining_timeout_s,
            }
        )
        if len(self.calls) == 1:
            raise HTTPError(
                url,
                400,
                "Bad Request",
                {},
                io.BytesIO(b'{"error":{"message":"Thinking mode does not support this tool_choice"}}'),
            )
        return self.response


class FakeStream:
    def __init__(self, lines):
        self.lines = list(lines)
        self.index = 0

    def readline(self):
        if self.index >= len(self.lines):
            return b""
        line = self.lines[self.index]
        self.index += 1
        return line

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line

    def close(self):
        pass


class FakeStreamingClient:
    def __init__(self, lines):
        self.lines = lines
        self.calls = []

    def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
        self.calls.append(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
                "proxy_url": proxy_url,
                "remaining_timeout_s": remaining_timeout_s,
                "first_byte_timeout_s": first_byte_timeout_s,
            }
        )
        return FakeStream(self.lines)


class ResponsesProxyTests(unittest.TestCase):
    def run_server_post(self, path, payload):
        server = HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            req = Request(
                f"http://127.0.0.1:{server.server_address[1]}{path}",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlopen(req, timeout=5) as resp:
                    return resp.status, json.loads(resp.read())
            except HTTPError as e:
                try:
                    return e.code, json.loads(e.read())
                finally:
                    e.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def run_server_post_raw(self, path, payload):
        server = HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            req = Request(
                f"http://127.0.0.1:{server.server_address[1]}{path}",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlopen(req, timeout=5) as resp:
                    return resp.status, resp.headers.get("Content-Type"), resp.read().decode("utf-8")
            except HTTPError as e:
                try:
                    return e.code, e.headers.get("Content-Type"), e.read().decode("utf-8")
                finally:
                    e.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def attempt(self, upstream_format):
        return Attempt(
            request_id="req-test",
            attempt_no=1,
            provider="provider",
            key_index=0,
            key="secret",
            url=f"https://provider.example/{upstream_format}",
            headers={"Authorization": "Bearer secret"},
            provider_model="provider-model",
            upstream_format=upstream_format,
        )

    def named_attempt(self, provider, upstream_format, attempt_no):
        return Attempt(
            request_id="req-test",
            attempt_no=attempt_no,
            provider=provider,
            key_index=0,
            key=f"{provider}-secret",
            url=f"https://{provider}.example/{upstream_format}",
            headers={"Authorization": f"Bearer {provider}-secret"},
            provider_model="provider-model",
            upstream_format=upstream_format,
        )

    def test_responses_native_upstream_is_passthrough(self):
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeClient({"id": "resp_1", "object": "response", "model": "provider-model", "output_text": "ok"})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "stream": False},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["id"], "resp_1")
        self.assertEqual(fake_client.calls[0]["url"], "https://provider.example/responses")
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_client.calls[0]["payload"]["input"], "hello")
        self.assertEqual(fake_router.iter_calls[0]["client_format"], "responses")
        self.assertEqual(
            fake_router.iter_calls[0]["allowed_upstream_formats"],
            ["responses", "chat_completions", "anthropic_messages"],
        )
        self.assertEqual(fake_router.successes[0].upstream_format, "responses")

    def test_responses_native_tool_request_is_passthrough(self):
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeClient(
            {
                "id": "resp_1",
                "object": "response",
                "model": "provider-model",
                "output": [{"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": "{\"q\":\"x\"}"}],
            }
        )
        payload = {
            "model": "client-model",
            "input": "lookup",
            "tools": [
                {
                    "type": "function",
                    "name": "lookup",
                    "description": "Lookup a value",
                    "parameters": {"type": "object", "properties": {"q": {"type": "string"}}},
                }
            ],
            "tool_choice": {"type": "function", "name": "lookup"},
        }

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post("/openai/v1/responses", payload)

        self.assertEqual(status, 200)
        self.assertEqual(body["object"], "response")
        sent = fake_client.calls[0]["payload"]
        self.assertEqual(sent["tools"], payload["tools"])
        self.assertEqual(sent["tool_choice"], payload["tool_choice"])
        self.assertEqual(sent["model"], "provider-model")

    def test_responses_native_stream_records_usage(self):
        lines = [
            b"event: response.output_text.delta\n",
            b'data: {"type":"response.output_text.delta","delta":"hel"}\n',
            b"\n",
            b"event: response.output_text.delta\n",
            b'data: {"type":"response.output_text.delta","delta":"lo"}\n',
            b"\n",
            b"event: response.completed\n",
            b'data: {"type":"response.completed","response":{"id":"resp_1","object":"response","status":"completed","usage":{"input_tokens":4,"output_tokens":6,"total_tokens":10}}}\n',
            b"\n",
            b"data: [DONE]\n",
        ]
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeStreamingClient(lines)
        obs = sse2json.ProxyObservability({"observability": {"recent_requests_limit": 10}})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "stream": True},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertEqual(body, b"".join(lines).decode("utf-8"))
        self.assertEqual(fake_client.calls[0]["payload"]["stream"], True)
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["responses", "chat_completions", "anthropic_messages"])

        snap = obs.snapshot()
        self.assertEqual(snap["counters"]["usage"]["total_tokens"], 10)
        request = snap["recent_requests"][0]
        self.assertEqual(request["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(request["attempts"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})

    def test_responses_request_can_fallback_to_chat_completions_upstream(self):
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "answer"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "max_output_tokens": 20},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["object"], "response")
        self.assertEqual(body["model"], "client-model")
        self.assertEqual(body["output_text"], "answer")
        self.assertEqual(body["usage"], {"input_tokens": 3, "output_tokens": 5, "total_tokens": 8})
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_client.calls[0]["payload"]["messages"], [{"role": "user", "content": "hello"}])
        self.assertEqual(fake_client.calls[0]["payload"]["max_tokens"], 20)

    def test_responses_to_opencode_chat_upstream_fills_missing_reasoning_content(self):
        fake_router = FakeRouter([self.named_attempt("opencode", "chat_completions", 1)])
        fake_client = FakeClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "answer"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {
                    "model": "client-model",
                    "input": [
                        {"role": "user", "content": [{"type": "input_text", "text": "hello"}]},
                        {"role": "assistant", "content": [{"type": "output_text", "text": "previous"}]},
                        {"role": "user", "content": [{"type": "input_text", "text": "continue"}]},
                    ],
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["output_text"], "answer")
        messages = fake_client.calls[0]["payload"]["messages"]
        self.assertEqual(messages[1]["role"], "assistant")
        self.assertEqual(messages[1]["content"], "previous")
        self.assertEqual(messages[1]["reasoning_content"], ".")

    def test_responses_to_deepseek_chat_upstream_fills_missing_reasoning_content(self):
        fake_router = FakeRouter([self.named_attempt("deepseek", "chat_completions", 1)])
        fake_client = FakeClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "answer"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {
                    "model": "client-model",
                    "input": [
                        {"role": "user", "content": [{"type": "input_text", "text": "hello"}]},
                        {"role": "assistant", "content": [{"type": "output_text", "text": "previous"}]},
                        {"role": "user", "content": [{"type": "input_text", "text": "continue"}]},
                    ],
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["output_text"], "answer")
        messages = fake_client.calls[0]["payload"]["messages"]
        self.assertEqual(messages[1]["role"], "assistant")
        self.assertEqual(messages[1]["content"], "previous")
        self.assertEqual(messages[1]["reasoning_content"], ".")

    def test_responses_tool_history_fallback_to_chat_completions_upstream(self):
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [
                    {
                        "finish_reason": "tool_calls",
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_2",
                                    "type": "function",
                                    "function": {"name": "lookup", "arguments": "{\"q\":\"next\"}"},
                                }
                            ],
                        },
                    }
                ],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {
                    "model": "client-model",
                    "input": [
                        {"role": "user", "content": [{"type": "input_text", "text": "lookup"}]},
                        {
                            "type": "function_call",
                            "call_id": "call_1",
                            "name": "lookup",
                            "arguments": "{\"q\":\"x\"}",
                        },
                        {"type": "function_call_output", "call_id": "call_1", "output": "ok"},
                    ],
                    "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object"}}],
                },
            )

        sent = fake_client.calls[0]["payload"]
        self.assertEqual(status, 200)
        self.assertEqual(sent["messages"][1]["tool_calls"][0]["id"], "call_1")
        self.assertEqual(sent["messages"][2], {"role": "tool", "tool_call_id": "call_1", "content": "ok"})
        self.assertEqual(sent["tools"][0]["function"]["name"], "lookup")
        self.assertEqual(body["output"][0]["type"], "function_call")
        self.assertEqual(body["output"][0]["call_id"], "call_2")

    def test_responses_forced_tool_choice_downgrades_to_auto_on_thinking_mode_error(self):
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = RetryToolChoiceClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "answer"}}],
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {
                    "model": "client-model",
                    "input": "lookup",
                    "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object"}}],
                    "tool_choice": {"type": "function", "name": "lookup"},
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["output_text"], "answer")
        self.assertEqual(fake_client.calls[0]["payload"]["tool_choice"], {"type": "function", "function": {"name": "lookup"}})
        self.assertEqual(fake_client.calls[1]["payload"]["tool_choice"], "auto")
        self.assertEqual(len(fake_client.calls), 2)

    def test_responses_request_can_fallback_to_anthropic_upstream(self):
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeClient(
            {
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "provider-model",
                "content": [{"type": "tool_use", "id": "toolu_2", "name": "lookup", "input": {"q": "next"}}],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 3, "output_tokens": 5},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {
                    "model": "client-model",
                    "input": "lookup",
                    "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object"}}],
                },
            )

        sent = fake_client.calls[0]["payload"]
        self.assertEqual(status, 200)
        self.assertEqual(sent["messages"][0], {"role": "user", "content": "lookup"})
        self.assertEqual(sent["tools"][0]["name"], "lookup")
        self.assertEqual(body["object"], "response")
        self.assertEqual(body["output"][0]["type"], "function_call")
        self.assertEqual(body["output"][0]["call_id"], "toolu_2")
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["responses", "chat_completions", "anthropic_messages"])

    def test_responses_to_deepseek_anthropic_upstream_fills_missing_thinking_block(self):
        fake_router = FakeRouter([self.named_attempt("deepseek", "anthropic_messages", 1)])
        fake_client = FakeClient(
            {
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "provider-model",
                "content": [{"type": "text", "text": "answer"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 3, "output_tokens": 5},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {
                    "model": "client-model",
                    "input": [
                        {"role": "user", "content": [{"type": "input_text", "text": "hello"}]},
                        {"role": "assistant", "content": [{"type": "output_text", "text": "previous"}]},
                        {"role": "user", "content": [{"type": "input_text", "text": "continue"}]},
                    ],
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["output_text"], "answer")
        messages = fake_client.calls[0]["payload"]["messages"]
        self.assertEqual(messages[1]["role"], "assistant")
        self.assertEqual([block["type"] for block in messages[1]["content"]], ["thinking", "text"])
        self.assertEqual(messages[1]["content"][0]["thinking"], ".")
        self.assertEqual(messages[1]["content"][1]["text"], "previous")

    def test_responses_retries_next_provider_when_visible_output_is_empty_after_length_cutoff(self):
        first = self.named_attempt("opencode", "chat_completions", 1)
        second = self.named_attempt("rawchat", "responses", 2)
        fake_router = FakeRouter([first, second])
        fake_client = SequenceFakeClient(
            [
                {
                    "id": "chatcmpl_empty",
                    "model": "provider-model",
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {
                                "role": "assistant",
                                "content": "",
                                "reasoning_content": "long hidden reasoning",
                            },
                        }
                    ],
                },
                {
                    "id": "resp_1",
                    "object": "response",
                    "model": "provider-model",
                    "status": "completed",
                    "output": [
                        {
                            "type": "message",
                            "role": "assistant",
                            "content": [{"type": "output_text", "text": "visible answer"}],
                        }
                    ],
                    "output_text": "visible answer",
                },
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {"model": "client-model", "input": "answer in detail", "max_output_tokens": 1024},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["output_text"], "visible answer")
        self.assertEqual([call["url"] for call in fake_client.calls], [first.url, second.url])
        self.assertEqual(fake_router.failures[0][0].provider, "opencode")
        self.assertEqual(fake_router.failures[0][1]["error_type"], "empty_visible_output")
        self.assertEqual(fake_router.failures[0][1]["http_status"], 200)
        self.assertEqual(fake_router.successes[0].provider, "rawchat")

    def test_responses_streaming_allows_chat_completions_fallback(self):
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeStreamingClient(
            [
                b'data: {"choices":[{"delta":{"content":"hel"}}]}\n',
                b'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
                b'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n',
                b"data: [DONE]\n",
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "stream": True},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertIn("event: response.created", body)
        self.assertIn("event: response.output_text.delta", body)
        self.assertIn('"delta": "hel"', body)
        self.assertIn('"delta": "lo"', body)
        self.assertIn("event: response.completed", body)
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertTrue(fake_client.calls[0]["payload"]["stream"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["responses", "chat_completions", "anthropic_messages"])

    def test_responses_streaming_chat_fallback_ignores_blank_reasoning(self):
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeStreamingClient(
            [
                b'data: {"choices":[{"delta":{"content":"answer"}}]}\n',
                b'data: {"choices":[{"delta":{"reasoning_content":"\\n  "}}]}\n',
                b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
                b"data: [DONE]\n",
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "stream": True},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertIn("event: response.output_text.delta", body)
        self.assertIn('"delta": "answer"', body)
        self.assertNotIn("response.reasoning_summary_text.delta", body)
        self.assertNotIn('"type": "reasoning"', body)

    def test_responses_streaming_allows_anthropic_messages_fallback(self):
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeStreamingClient(
            [
                b"event: message_start\n",
                b'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"usage":{"input_tokens":2,"output_tokens":0}}}\n',
                b"event: content_block_start\n",
                b'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
                b"event: content_block_delta\n",
                b'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n',
                b"event: content_block_stop\n",
                b'data: {"type":"content_block_stop","index":0}\n',
                b"event: message_delta\n",
                b'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n',
                b"event: message_stop\n",
                b'data: {"type":"message_stop"}\n',
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "stream": True},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertIn("event: response.created", body)
        self.assertIn("event: response.output_text.delta", body)
        self.assertIn('"delta": "hi"', body)
        self.assertIn("event: response.completed", body)
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertTrue(fake_client.calls[0]["payload"]["stream"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["responses", "chat_completions", "anthropic_messages"])

    def test_native_only_parameters_disable_cross_format_fallback(self):
        fake_router = FakeRouter([])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(sse2json, "DISABLE_MAP", True):
            self.run_server_post("/v1/responses", {"model": "client-model", "input": "hi", "previous_response_id": "resp_old"})
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ['responses'])

    def test_store_false_and_parallel_tools_keep_chat_fallback_enabled(self):
        fake_router = FakeRouter([])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(sse2json, "DISABLE_MAP", True):
            self.run_server_post(
                "/v1/responses",
                {
                    "model": "client-model",
                    "input": "hi",
                    "store": False,
                    "parallel_tool_calls": True,
                },
            )
        call = fake_router.iter_calls[0]
        self.assertEqual(call["allowed_upstream_formats"], ["responses", "chat_completions"])
        self.assertEqual(call["compatibility_profile"], "plain")

    def test_responses_streaming_requires_supported_stream_upstream(self):
        fake_router = FakeRouter([])
        fake_client = FakeClient({})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/openai/v1/responses",
                {"model": "client-model", "input": "hello", "stream": True},
            )

        self.assertEqual(status, 503)
        self.assertEqual(body["error"]["code"], "no_eligible_candidate")
        self.assertEqual(body["error"]["owner"], "proxy_routing")
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["responses", "chat_completions", "anthropic_messages"])


if __name__ == "__main__":
    unittest.main()
