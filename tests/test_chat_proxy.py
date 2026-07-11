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
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        return self.response


class RawFakeClient:
    def __init__(self, raw_response):
        self.raw_response = raw_response
        self.calls = []

    def request_raw_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        return self.raw_response, 7


class SequenceFakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        return self.responses[len(self.calls) - 1]


class RetryToolChoiceClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": json.loads(json.dumps(payload))})
        if len(self.calls) == 1:
            raise HTTPError(
                url,
                400,
                "Bad Request",
                {},
                io.BytesIO(b'{"error":{"message":"Thinking mode does not support this tool_choice"}}'),
            )
        return self.response


class TransientHTTPThenSuccessClient:
    def __init__(self, status, response):
        self.status = int(status)
        self.response = response
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": json.loads(json.dumps(payload))})
        if len(self.calls) == 1:
            raise HTTPError(
                url,
                self.status,
                "Upstream Error",
                {},
                io.BytesIO(b'{"error":{"message":"temporary upstream failure"}}'),
            )
        return self.response


class KeyFatalThenSuccessClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": json.loads(json.dumps(payload))})
        if len(self.calls) == 1:
            raise HTTPError(
                url,
                401,
                "Unauthorized",
                {},
                io.BytesIO(b'{"error":{"message":"invalid api key"}}'),
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


class ChatProxyTests(unittest.TestCase):
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

    def config_with(self, **sections):
        cfg = dict(sse2json.CONFIG)
        for name, values in sections.items():
            cfg[name] = {**(cfg.get(name) or {}), **values}
        return cfg

    def test_chat_request_can_fallback_to_responses_upstream(self):
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeClient(
            {
                "id": "resp_1",
                "object": "response",
                "model": "provider-model",
                "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "answer"}]}],
                "usage": {"input_tokens": 3, "output_tokens": 5, "total_tokens": 8},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["object"], "chat.completion")
        self.assertEqual(body["choices"][0]["message"]["content"], "answer")
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_client.calls[0]["payload"]["input"][0]["role"], "user")
        self.assertEqual(fake_router.iter_calls[0]["client_format"], "chat_completions")
        self.assertEqual(
            fake_router.iter_calls[0]["allowed_upstream_formats"],
            ["chat_completions", "responses", "anthropic_messages"],
        )

    def test_chat_tool_history_can_fallback_to_responses_upstream(self):
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeClient(
            {
                "id": "resp_1",
                "object": "response",
                "model": "provider-model",
                "output": [{"type": "function_call", "call_id": "call_2", "name": "lookup", "arguments": "{\"q\":\"next\"}"}],
                "usage": {"input_tokens": 3, "output_tokens": 5, "total_tokens": 8},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/v1/chat/completions",
                {
                    "model": "client-model",
                    "messages": [
                        {"role": "user", "content": "lookup"},
                        {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                                }
                            ],
                        },
                        {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
                    ],
                    "tools": [
                        {
                            "type": "function",
                            "function": {"name": "lookup", "parameters": {"type": "object"}},
                        }
                    ],
                },
            )

        sent = fake_client.calls[0]["payload"]
        self.assertEqual(status, 200)
        self.assertEqual(sent["input"][1]["type"], "function_call")
        self.assertEqual(sent["input"][1]["call_id"], "call_1")
        self.assertEqual(sent["input"][2], {"type": "function_call_output", "call_id": "call_1", "output": "ok"})
        self.assertEqual(sent["tools"][0]["name"], "lookup")
        self.assertEqual(body["choices"][0]["message"]["tool_calls"][0]["id"], "call_2")

    def test_chat_forced_tool_choice_downgrades_to_auto_on_thinking_mode_error(self):
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
                "/v1/chat/completions",
                {
                    "model": "client-model",
                    "messages": [{"role": "user", "content": "lookup"}],
                    "tools": [{"type": "function", "function": {"name": "lookup", "parameters": {"type": "object"}}}],
                    "tool_choice": {"type": "function", "function": {"name": "lookup"}},
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["choices"][0]["message"]["content"], "answer")
        self.assertEqual(fake_client.calls[0]["payload"]["tool_choice"], {"type": "function", "function": {"name": "lookup"}})
        self.assertEqual(fake_client.calls[1]["payload"]["tool_choice"], "auto")
        self.assertEqual(len(fake_client.calls), 2)

    def test_chat_retries_same_key_once_for_transient_http_error(self):
        attempt = self.attempt("chat_completions")
        fake_router = FakeRouter([attempt])
        fake_client = TransientHTTPThenSuccessClient(
            502,
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "answer"}}],
            },
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["choices"][0]["message"]["content"], "answer")
        self.assertEqual([call["url"] for call in fake_client.calls], [attempt.url, attempt.url])
        self.assertEqual(fake_router.failures, [])
        self.assertEqual(fake_router.successes, [attempt])

    def test_chat_does_not_same_key_retry_key_fatal_status(self):
        first = self.named_attempt("badkey", "chat_completions", 1)
        second = self.named_attempt("backup", "chat_completions", 2)
        fake_router = FakeRouter([first, second])
        fake_client = KeyFatalThenSuccessClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "backup"}}],
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["choices"][0]["message"]["content"], "backup")
        self.assertEqual([call["url"] for call in fake_client.calls], [first.url, second.url])
        self.assertEqual(fake_router.failures[0][0], first)
        self.assertEqual(fake_router.failures[0][1]["error_type"], "key_invalid")
        self.assertEqual(fake_router.successes, [second])

    def test_chat_request_can_fallback_to_anthropic_upstream(self):
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
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
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["object"], "chat.completion")
        self.assertEqual(body["choices"][0]["message"]["content"], "answer")
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_client.calls[0]["payload"]["messages"][0], {"role": "user", "content": "hello"})

    def test_chat_retries_next_provider_when_visible_output_is_empty_after_length_cutoff(self):
        first = self.named_attempt("opencode", "chat_completions", 1)
        second = self.named_attempt("deepseek", "anthropic_messages", 2)
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
                    "id": "msg_1",
                    "type": "message",
                    "role": "assistant",
                    "model": "provider-model",
                    "content": [{"type": "text", "text": "visible answer"}],
                    "stop_reason": "end_turn",
                },
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "answer in detail"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["choices"][0]["message"]["content"], "visible answer")
        self.assertEqual([call["url"] for call in fake_client.calls], [first.url, second.url])
        self.assertEqual(fake_router.failures[0][0].provider, "opencode")
        self.assertEqual(fake_router.failures[0][1]["error_type"], "empty_visible_output")
        self.assertEqual(fake_router.failures[0][1]["http_status"], 200)
        self.assertEqual(fake_router.successes[0].provider, "deepseek")

    def test_chat_multiple_tool_results_can_fallback_to_anthropic_upstream(self):
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
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
                "/v1/chat/completions",
                {
                    "model": "client-model",
                    "messages": [
                        {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                                },
                                {
                                    "id": "call_2",
                                    "type": "function",
                                    "function": {"name": "search", "arguments": "{\"q\":\"y\"}"},
                                },
                            ],
                        },
                        {"role": "tool", "tool_call_id": "call_1", "content": "one"},
                        {"role": "tool", "tool_call_id": "call_2", "content": "two"},
                    ],
                },
            )

        sent_messages = fake_client.calls[0]["payload"]["messages"]
        self.assertEqual(status, 200)
        self.assertEqual([b["id"] for b in sent_messages[0]["content"]], ["call_1", "call_2"])
        self.assertEqual([b["type"] for b in sent_messages[1]["content"]], ["tool_result", "tool_result"])
        self.assertEqual(body["choices"][0]["message"]["content"], "answer")

    def test_chat_native_validated_nonstream_returns_raw_upstream_json(self):
        raw = (
            b'{"id":"chatcmpl_1","choices":[{"message":{"role":"assistant","content":"ok"},'
            b'"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}'
        )
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = RawFakeClient(raw)
        obs = sse2json.ProxyObservability({"observability": {"recent_requests_limit": 10}})
        cfg = self.config_with(routing={"native_nonstream_mode": "validated"})

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/v1/chat/completions",
                {"model": "client-model", "stream": False, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "application/json")
        self.assertEqual(body, raw.decode("utf-8"))
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_router.successes[0].upstream_format, "chat_completions")
        snap = obs.snapshot()
        self.assertEqual(snap["counters"]["usage"]["total_tokens"], 5)

    def test_chat_native_stream_records_usage(self):
        lines = [
            b'data: {"choices":[{"delta":{"content":"hel"}}]}\n',
            b'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
            b'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n',
            b"data: [DONE]\n",
        ]
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeStreamingClient(lines)
        obs = sse2json.ProxyObservability({"observability": {"recent_requests_limit": 10}})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/v1/chat/completions",
                {"model": "client-model", "stream": True, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertEqual(body, b"".join(lines).decode("utf-8"))
        self.assertEqual(fake_client.calls[0]["payload"]["stream"], True)
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["chat_completions", "responses", "anthropic_messages"])

        snap = obs.snapshot()
        self.assertEqual(snap["counters"]["usage"]["total_tokens"], 5)
        request = snap["recent_requests"][0]
        self.assertEqual(request["usage"], {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5})
        self.assertEqual(request["attempts"][0]["usage"], {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5})

    def test_chat_native_guarded_stream_skips_first_event_prefetch(self):
        lines = [
            b'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
            b"data: [DONE]\n",
        ]
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeStreamingClient(lines)
        cfg = self.config_with(routing={"native_stream_mode": "guarded"})

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True), patch.object(
            sse2json, "_prefetch_initial_stream_lines", side_effect=AssertionError("prefetch should be skipped")
        ):
            status, content_type, body = self.run_server_post_raw(
                "/v1/chat/completions",
                {"model": "client-model", "stream": True, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertEqual(body, b"".join(lines).decode("utf-8"))

    def test_chat_native_stream_usage_off_preserves_bytes_without_usage_stats(self):
        lines = [
            b'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n',
            b"data: [DONE]\n",
        ]
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeStreamingClient(lines)
        obs = sse2json.ProxyObservability({"observability": {"recent_requests_limit": 10}})
        cfg = self.config_with(observability={"native_stream_usage": "off"})

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/v1/chat/completions",
                {"model": "client-model", "stream": True, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertEqual(body, b"".join(lines).decode("utf-8"))
        snap = obs.snapshot()
        self.assertEqual(snap["counters"]["usage"]["total_tokens"], 0)
        self.assertNotIn("usage", snap["recent_requests"][0]["attempts"][0])

    def test_chat_streaming_allows_responses_fallback(self):
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeStreamingClient(
            [
                b"event: response.output_item.added\n",
                b'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n',
                b"event: response.output_text.delta\n",
                b'data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"delta":"hi"}\n',
                b"event: response.completed\n",
                b'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}}\n',
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/v1/chat/completions",
                {"model": "client-model", "stream": True, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertIn('"object": "chat.completion.chunk"', body)
        self.assertIn('"content": "hi"', body)
        self.assertIn('"finish_reason": "stop"', body)
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertTrue(fake_client.calls[0]["payload"]["stream"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["chat_completions", "responses", "anthropic_messages"])

    def test_chat_streaming_allows_anthropic_messages_fallback(self):
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeStreamingClient(
            [
                b"event: message_start\n",
                b'data: {"type":"message_start","message":{"usage":{"input_tokens":2,"output_tokens":0}}}\n',
                b"event: content_block_start\n",
                b'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
                b"event: content_block_delta\n",
                b'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n',
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
                "/v1/chat/completions",
                {"model": "client-model", "stream": True, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertIn('"object": "chat.completion.chunk"', body)
        self.assertIn('"content": "hi"', body)
        self.assertIn('"finish_reason": "stop"', body)
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertTrue(fake_client.calls[0]["payload"]["stream"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["chat_completions", "responses", "anthropic_messages"])

    def test_native_only_parameters_disable_cross_format_fallback(self):
        fake_router = FakeRouter([])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(sse2json, "DISABLE_MAP", True):
            self.run_server_post("/v1/chat/completions", {"model": "client-model", "messages": [{"role": "user", "content": "hi"}], "response_format": {"type": "json_object"}})
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ['chat_completions'])

    def test_transport_only_stream_options_do_not_disable_cross_format_fallback(self):
        fake_router = FakeRouter([])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(sse2json, "DISABLE_MAP", True):
            self.run_server_post(
                "/v1/chat/completions",
                {
                    "model": "client-model",
                    "messages": [{"role": "user", "content": "hi"}],
                    "stream": True,
                    "stream_options": {"include_usage": True},
                    "parallel_tool_calls": True,
                },
            )
        self.assertEqual(
            fake_router.iter_calls[0]["allowed_upstream_formats"],
            ["chat_completions", "responses", "anthropic_messages"],
        )
    def test_chat_streaming_requires_native_chat_upstream(self):
        fake_router = FakeRouter([])
        fake_client = FakeClient({})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/v1/chat/completions",
                {"model": "client-model", "stream": True, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 501)
        self.assertIn("requires a native Chat Completions, Responses, or Anthropic Messages upstream", body["error"]["message"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["chat_completions", "responses", "anthropic_messages"])


if __name__ == "__main__":
    unittest.main()
