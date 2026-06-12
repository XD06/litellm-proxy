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
        response = self.responses[len(self.calls) - 1]
        if isinstance(response, Exception):
            raise response
        return response


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


class AnthropicProxyTests(unittest.TestCase):
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
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
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

    def test_anthropic_native_upstream_is_passthrough(self):
        upstream_response = {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "provider-model",
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 2, "output_tokens": 3},
        }
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeClient(upstream_response)

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/anthropic/v1/messages",
                {"model": "client-model", "max_tokens": 20, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body, upstream_response)
        self.assertEqual(fake_client.calls[0]["url"], "https://provider.example/anthropic_messages")
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_client.calls[0]["payload"]["messages"], [{"role": "user", "content": "hello"}])
        self.assertEqual(fake_router.iter_calls[0]["client_format"], "anthropic_messages")
        self.assertEqual(
            fake_router.iter_calls[0]["allowed_upstream_formats"],
            ["anthropic_messages", "chat_completions", "responses"],
        )
        self.assertEqual(fake_router.successes[0].upstream_format, "anthropic_messages")

    def test_anthropic_union_request_uses_saved_models_without_upstream_fetch(self):
        cfg = {
            "models": {
                "models_source": "union",
                "provider_model_capabilities": {
                    "provider": {
                        "status": "ok",
                        "models": ["provider-model"],
                        "canonical_map": {"client-model": "provider-model"},
                        "formats": ["anthropic_messages"],
                    }
                },
            },
            "providers": {"provider": {"base_url": "https://provider.example", "keys": ["secret"], "enabled": True}},
        }
        upstream_response = {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "provider-model",
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 2, "output_tokens": 3},
        }
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeClient(upstream_response)
        sse2json.model_registry.clear_cache()

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "fetch_upstream_models", side_effect=AssertionError("client request must not fetch models")):
            status, body = self.run_server_post(
                "/anthropic/v1/messages",
                {"model": "client-model", "max_tokens": 20, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body, upstream_response)
        self.assertEqual(fake_router.iter_calls[0]["canonical_model"], "client-model")

    def test_anthropic_native_tool_request_is_passthrough(self):
        upstream_response = {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "provider-model",
            "content": [{"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {"q": "x"}}],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 2, "output_tokens": 3},
        }
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeClient(upstream_response)
        payload = {
            "model": "client-model",
            "max_tokens": 20,
            "messages": [{"role": "user", "content": "lookup"}],
            "tools": [
                {
                    "name": "lookup",
                    "description": "Lookup a value",
                    "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}},
                }
            ],
            "tool_choice": {"type": "tool", "name": "lookup"},
        }

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post("/anthropic/v1/messages", payload)

        self.assertEqual(status, 200)
        self.assertEqual(body, upstream_response)
        sent = fake_client.calls[0]["payload"]
        self.assertEqual(sent["tools"], payload["tools"])
        self.assertEqual(sent["tool_choice"], payload["tool_choice"])
        self.assertEqual(sent["model"], "provider-model")

    def test_anthropic_native_stream_records_usage(self):
        lines = [
            b"event: message_start\n",
            b'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"provider-model","usage":{"input_tokens":7,"output_tokens":0}}}\n',
            b"\n",
            b"event: content_block_delta\n",
            b'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n',
            b"\n",
            b"event: message_delta\n",
            b'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":11}}\n',
            b"\n",
            b"event: message_stop\n",
            b'data: {"type":"message_stop"}\n',
            b"\n",
        ]
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = FakeStreamingClient(lines)
        obs = sse2json.ProxyObservability({"observability": {"recent_requests_limit": 10}})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, content_type, body = self.run_server_post_raw(
                "/anthropic/v1/messages",
                {"model": "client-model", "stream": True, "max_tokens": 20, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertEqual(body, b"".join(lines).decode("utf-8"))
        self.assertEqual(fake_client.calls[0]["payload"]["stream"], True)
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["anthropic_messages", "chat_completions", "responses"])

        snap = obs.snapshot()
        self.assertEqual(snap["counters"]["usage"]["total_tokens"], 18)
        request = snap["recent_requests"][0]
        self.assertEqual(request["usage"], {"input_tokens": 7, "output_tokens": 11, "total_tokens": 18})
        self.assertEqual(request["attempts"][0]["usage"], {"input_tokens": 7, "output_tokens": 11, "total_tokens": 18})

    def test_anthropic_streaming_requires_supported_stream_upstream(self):
        fake_router = FakeRouter([])
        fake_client = FakeClient({})

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, _content_type, raw_body = self.run_server_post_raw(
                "/anthropic/v1/messages",
                {
                    "model": "client-model",
                    "stream": True,
                    "max_tokens": 20,
                    "messages": [{"role": "user", "content": "hello"}],
                },
            )

        body = json.loads(raw_body)
        self.assertEqual(status, 501)
        self.assertIn("requires a native Anthropic Messages, Chat Completions, or Responses upstream", body["error"]["message"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["anthropic_messages", "chat_completions", "responses"])

    def test_anthropic_streaming_allows_responses_fallback(self):
        fake_router = FakeRouter([self.attempt("responses")])
        fake_client = FakeStreamingClient(
            [
                b"event: response.created\n",
                b'data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}\n',
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
                "/anthropic/v1/messages",
                {"model": "client-model", "stream": True, "max_tokens": 20, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "text/event-stream")
        self.assertIn("event: message_start", body)
        self.assertIn('"type": "text_delta"', body)
        self.assertIn('"text": "hi"', body)
        self.assertIn("event: message_stop", body)
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertTrue(fake_client.calls[0]["payload"]["stream"])
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["anthropic_messages", "chat_completions", "responses"])

    def test_anthropic_forced_tool_choice_downgrades_to_auto_on_thinking_mode_error(self):
        upstream_response = {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "provider-model",
            "content": [{"type": "text", "text": "answer"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 2, "output_tokens": 3},
        }
        fake_router = FakeRouter([self.attempt("anthropic_messages")])
        fake_client = RetryToolChoiceClient(upstream_response)

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/anthropic/v1/messages",
                {
                    "model": "client-model",
                    "max_tokens": 20,
                    "messages": [{"role": "user", "content": "lookup"}],
                    "tools": [{"name": "lookup", "input_schema": {"type": "object"}}],
                    "tool_choice": {"type": "tool", "name": "lookup"},
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["content"][0]["text"], "answer")
        self.assertEqual(fake_client.calls[0]["payload"]["tool_choice"], {"type": "tool", "name": "lookup"})
        self.assertEqual(fake_client.calls[1]["payload"]["tool_choice"], {"type": "auto"})
        self.assertEqual(len(fake_client.calls), 2)

    def test_anthropic_request_can_fallback_to_chat_completions_upstream(self):
        fake_router = FakeRouter([self.attempt("chat_completions")])
        fake_client = FakeClient(
            {
                "id": "chatcmpl_1",
                "model": "provider-model",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "answer"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/anthropic/v1/messages",
                {"model": "client-model", "max_tokens": 20, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["type"], "message")
        self.assertEqual(body["model"], "client-model")
        self.assertEqual(body["content"], [{"type": "text", "text": "answer"}])
        self.assertEqual(fake_client.calls[0]["payload"]["model"], "provider-model")
        self.assertEqual(fake_client.calls[0]["payload"]["messages"], [{"role": "user", "content": "hello"}])
        self.assertEqual(fake_client.calls[0]["payload"]["max_tokens"], 20)

    def test_anthropic_tool_request_fallback_to_chat_completions_upstream(self):
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
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                                }
                            ],
                        },
                    }
                ],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5},
            }
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/anthropic/v1/messages",
                {
                    "model": "client-model",
                    "max_tokens": 20,
                    "messages": [{"role": "user", "content": "lookup"}],
                    "tools": [{"name": "lookup", "input_schema": {"type": "object"}}],
                    "tool_choice": {"type": "tool", "name": "lookup"},
                },
            )

        sent = fake_client.calls[0]["payload"]
        self.assertEqual(status, 200)
        self.assertEqual(sent["tools"][0]["function"]["name"], "lookup")
        self.assertEqual(sent["tool_choice"], {"type": "function", "function": {"name": "lookup"}})
        self.assertEqual(body["stop_reason"], "tool_use")
        self.assertEqual(body["content"][0]["type"], "tool_use")

    def test_anthropic_request_can_fallback_to_responses_upstream(self):
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
                "/anthropic/v1/messages",
                {
                    "model": "client-model",
                    "max_tokens": 20,
                    "messages": [{"role": "user", "content": "lookup"}],
                    "tools": [{"name": "lookup", "input_schema": {"type": "object"}}],
                },
            )

        sent = fake_client.calls[0]["payload"]
        self.assertEqual(status, 200)
        self.assertEqual(sent["input"][0], {"role": "user", "content": [{"type": "input_text", "text": "lookup"}]})
        self.assertEqual(sent["tools"][0]["name"], "lookup")
        self.assertEqual(body["type"], "message")
        self.assertEqual(body["content"][0]["type"], "tool_use")
        self.assertEqual(body["content"][0]["id"], "call_2")
        self.assertEqual(fake_router.iter_calls[0]["allowed_upstream_formats"], ["anthropic_messages", "chat_completions", "responses"])

    def test_anthropic_retries_next_provider_when_visible_output_is_empty_after_length_cutoff(self):
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
                "/anthropic/v1/messages",
                {"model": "client-model", "max_tokens": 1024, "messages": [{"role": "user", "content": "answer in detail"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["content"][0]["text"], "visible answer")
        self.assertEqual([call["url"] for call in fake_client.calls], [first.url, second.url])
        self.assertEqual(fake_router.failures[0][0].provider, "opencode")
        self.assertEqual(fake_router.failures[0][1]["error_type"], "empty_visible_output")
        self.assertEqual(fake_router.failures[0][1]["http_status"], 200)
        self.assertEqual(fake_router.successes[0].provider, "deepseek")

    def test_anthropic_continues_after_key_invalid_attempt(self):
        first = self.named_attempt("modelscope", "chat_completions", 1)
        second = self.named_attempt("sensen", "chat_completions", 2)
        fake_router = FakeRouter([first, second])
        fake_client = SequenceFakeClient(
            [
                HTTPError(
                    first.url,
                    401,
                    "Unauthorized",
                    {},
                    io.BytesIO(
                        b'{"error":{"message":"Authentication failed, please make sure that a valid token is supplied."}}'
                    ),
                ),
                {
                    "id": "chatcmpl_1",
                    "model": "provider-model",
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"role": "assistant", "content": "fallback answer"},
                        }
                    ],
                    "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
                },
            ]
        )

        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.run_server_post(
                "/anthropic/v1/messages",
                {"model": "client-model", "max_tokens": 128, "messages": [{"role": "user", "content": "hello"}]},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["content"][0]["text"], "fallback answer")
        self.assertEqual([call["url"] for call in fake_client.calls], [first.url, second.url])
        self.assertEqual(fake_router.failures[0][0].provider, "modelscope")
        self.assertEqual(fake_router.failures[0][1]["error_type"], "key_invalid")
        self.assertEqual(fake_router.failures[0][1]["http_status"], 401)
        self.assertEqual(fake_router.successes[0].provider, "sensen")


if __name__ == "__main__":
    unittest.main()
