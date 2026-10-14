"""Handler-level E2E for the google_generate upstream format.

Drives the real sse2json proxy handlers against fake Google generateContent
upstreams (three client entry points x non-streaming/streaming) and asserts the
wire contracts the codec unit tests cannot see: generateContent bodies without
model/stream keys, x-goog-api-key-only headers, SSE dispatch to the google->X
adapters, and the thought-signature fidelity chain across agent tool-loop
turns (provider_specific_fields passthrough, bounded store recovery, dummy
fallback, 2.5->3.x model swap) per the research report's acceptance list.
"""

import json
import os
import tempfile
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import sse2json
import thought_signature_store
from conversion_core.codecs import google as google_codec
from router import Attempt

DUMMY = google_codec.DUMMY_THOUGHT_SIGNATURE
GOOGLE_25_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
GOOGLE_3_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"


class FakeRouter:
    def __init__(self, attempts):
        self.attempts = attempts
        self.successes = []

    def iter_attempts(self, canonical_model, is_stream, request_id, client_headers=None, **kwargs):
        yield from self.attempts

    def report_success(self, attempt):
        self.successes.append(attempt)

    def report_failure(self, attempt, **kwargs):
        pass

    def masked_key(self, key):
        return "masked"


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": json.loads(json.dumps(payload))})
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
        self.calls.append({"url": url, "headers": headers, "payload": json.loads(json.dumps(payload))})
        return FakeStream(self.lines)


class OpenClientKeys:
    """Local runtime_config.json may enable client keys (401 for keyless tests)."""

    enabled = False

    def has_any_keys(self):
        return False


def google_sse_lines(payloads):
    out = []
    for payload in payloads:
        out.append(f"data: {json.dumps(payload)}\n".encode("utf-8"))
        out.append(b"\n")
    return out


def google_text_response(text="Hello there", finish="STOP", signature=None):
    part = {"text": text}
    if signature:
        part["thoughtSignature"] = signature
    return {
        "candidates": [{"content": {"role": "model", "parts": [part]}, "finishReason": finish}],
        "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 5, "totalTokenCount": 12},
    }


def google_fc_response(calls, finish="STOP"):
    """calls: list of (id, name, args, signature-or-None)."""
    parts = []
    for call_id, name, args, signature in calls:
        fc = {"id": call_id, "name": name, "args": args}
        part = {"functionCall": fc}
        if signature:
            part["thoughtSignature"] = signature
        parts.append(part)
    return {
        "candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": finish}],
        "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 6, "totalTokenCount": 10},
    }


class GoogleProxyBase(unittest.TestCase):
    def setUp(self):
        # Deterministic codec state regardless of test order in the full suite.
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})

    def tearDown(self):
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})

    def enable_store(self):
        tmpdir = tempfile.mkdtemp(prefix="gts-proxy-")
        store = thought_signature_store.configure({
            "observability": {"google_thought_signatures": {"enabled": True, "path": os.path.join(tmpdir, "s.sqlite3")}},
        })
        self.addCleanup(store.close)
        return store

    def attempt(self, url=GOOGLE_25_URL, provider_model="gemini-2.5-flash"):
        return Attempt(
            request_id="req-google",
            attempt_no=1,
            provider="google",
            key_index=0,
            key="secret",
            url=url,
            headers={"x-goog-api-key": "secret"},
            provider_model=provider_model,
            upstream_format="google_generate",
        )

    def post(self, path, payload, attempts, client):
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
            with patch.object(sse2json, "ROUTER", FakeRouter(attempts)), patch.object(
                sse2json, "UPSTREAM_CLIENT", client
            ), patch.object(sse2json, "DISABLE_MAP", True), patch.object(
                sse2json, "CLIENT_KEYS", OpenClientKeys()
            ):
                try:
                    with urlopen(req, timeout=10) as resp:
                        return resp.status, json.loads(resp.read())
                except HTTPError as e:
                    body = e.read().decode("utf-8")
                    try:
                        return e.code, json.loads(body)
                    except json.JSONDecodeError:
                        return e.code, body
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def post_raw(self, path, payload, attempts, client):
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
            with patch.object(sse2json, "ROUTER", FakeRouter(attempts)), patch.object(
                sse2json, "UPSTREAM_CLIENT", client
            ), patch.object(sse2json, "DISABLE_MAP", True), patch.object(
                sse2json, "CLIENT_KEYS", OpenClientKeys()
            ):
                try:
                    with urlopen(req, timeout=10) as resp:
                        return resp.status, resp.headers.get("Content-Type"), resp.read().decode("utf-8")
                except HTTPError as e:
                    return e.code, e.headers.get("Content-Type"), e.read().decode("utf-8")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    @staticmethod
    def model_parts(body):
        return [p for c in body["contents"] if c["role"] == "model" for p in c["parts"]]


class GoogleProxyNonStreamingTests(GoogleProxyBase):
    def test_chat_entry_renders_generatecontent_body_and_translates(self):
        client = FakeClient(google_text_response())
        status, body = self.post(
            "/v1/chat/completions",
            {"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "hi"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        message = body["choices"][0]["message"]
        self.assertEqual(message["content"], "Hello there")
        self.assertEqual(body["choices"][0]["finish_reason"], "stop")
        self.assertEqual(body["usage"], {"prompt_tokens": 7, "completion_tokens": 5, "total_tokens": 12})

        call = client.calls[0]
        # Google carries the model in the URL; a model/stream key would fail proto-JSON validation.
        self.assertNotIn("model", call["payload"])
        self.assertNotIn("stream", call["payload"])
        self.assertEqual(call["payload"]["contents"], [{"role": "user", "parts": [{"text": "hi"}]}])
        self.assertEqual(call["url"], GOOGLE_25_URL)
        self.assertEqual(call["headers"].get("x-goog-api-key"), "secret")
        self.assertNotIn("Authorization", call["headers"])

    def test_chat_system_and_generation_config(self):
        client = FakeClient(google_text_response())
        status, _body = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "system", "content": "be terse"},
                    {"role": "user", "content": "hi"},
                ],
                "max_tokens": 64,
                "temperature": 0.5,
                "stop": ["END"],
            },
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        payload = client.calls[0]["payload"]
        self.assertEqual(payload["systemInstruction"], {"parts": [{"text": "be terse"}]})
        gen = payload["generationConfig"]
        self.assertEqual(gen["maxOutputTokens"], 64)
        self.assertEqual(gen["temperature"], 0.5)
        self.assertEqual(gen["stopSequences"], ["END"])

    def test_responses_entry_converts_google_response(self):
        client = FakeClient(google_text_response())
        status, body = self.post(
            "/v1/responses",
            {"model": "gemini-2.5-flash", "input": [{"role": "user", "content": "hi"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "completed")
        self.assertEqual(body["output"][0]["type"], "message")
        self.assertEqual(body["output"][0]["content"][0]["text"], "Hello there")
        self.assertEqual(client.calls[0]["payload"]["contents"], [{"role": "user", "parts": [{"text": "hi"}]}])

    def test_anthropic_entry_exposes_thinking_and_text_blocks(self):
        response = {
            "candidates": [{
                "content": {"role": "model", "parts": [
                    {"text": "pondering", "thought": True},
                    {"text": "answer"},
                ]},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 4, "totalTokenCount": 7},
        }
        client = FakeClient(response)
        status, body = self.post(
            "/anthropic/v1/messages",
            {"model": "gemini-2.5-flash", "max_tokens": 32, "messages": [{"role": "user", "content": "hi"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        self.assertEqual([block["type"] for block in body["content"]], ["thinking", "text"])
        self.assertEqual(body["content"][0]["thinking"], "pondering")
        self.assertEqual(body["content"][1]["text"], "answer")
        self.assertEqual(body["stop_reason"], "end_turn")

    def test_max_tokens_finish_maps_across_entries(self):
        cases = [
            ("/v1/chat/completions", {"model": "m", "messages": [{"role": "user", "content": "hi"}]}, lambda b: b["choices"][0]["finish_reason"], "length"),
            ("/v1/responses", {"model": "m", "input": "hi"}, lambda b: (b["status"], b.get("incomplete_details", {}).get("reason")), ("incomplete", "max_output_tokens")),
            ("/anthropic/v1/messages", {"model": "m", "max_tokens": 16, "messages": [{"role": "user", "content": "hi"}]}, lambda b: b["stop_reason"], "max_tokens"),
        ]
        for path, payload, read, expected in cases:
            client = FakeClient(google_text_response(text="cut", finish="MAX_TOKENS"))
            status, body = self.post(path, payload, [self.attempt()], client)
            self.assertEqual(status, 200, path)
            self.assertEqual(read(body), expected, path)

    def test_empty_visible_output_falls_back_to_200(self):
        empty = {"candidates": [{"content": {"role": "model", "parts": []}, "finishReason": "STOP"}]}
        client = FakeClient(empty)
        status, body = self.post(
            "/v1/chat/completions",
            {"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "hi"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        self.assertIn(body["choices"][0]["message"]["content"], ("", None))

    def test_orphan_tool_history_returns_400_without_upstream_call(self):
        client = FakeClient(google_text_response())
        status, body = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "user", "content": "weather?"},
                    {"role": "assistant", "content": None, "tool_calls": [
                        {"id": "real_call", "type": "function", "function": {"name": "get_weather", "arguments": "{}"}},
                    ]},
                    {"role": "tool", "tool_call_id": "ghost", "content": "sunny"},
                ],
            },
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 400)
        self.assertEqual(client.calls, [])
        self.assertIn("tool result", str(body.get("error", {}).get("message", "")))

    def test_tool_loop_psf_roundtrip_second_turn(self):
        client = FakeClient(google_fc_response([("call_1", "get_weather", {"city": "SF"}, "SIG-LOOP")]))
        status, body = self.post(
            "/v1/chat/completions",
            {"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "weather?"}], "tools": [
                {"type": "function", "function": {"name": "get_weather", "parameters": {"type": "object"}}},
            ]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        call = body["choices"][0]["message"]["tool_calls"][0]
        self.assertEqual(call["provider_specific_fields"]["thought_signature"], "SIG-LOOP")

        # Client replays the assistant history verbatim (psf kept) -> real signature, no dummy.
        second = FakeClient(google_text_response(text="It is sunny"))
        status2, _body2 = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "user", "content": "weather?"},
                    {"role": "assistant", "content": None, "tool_calls": [{
                        "id": "call_1", "type": "function",
                        "function": {"name": "get_weather", "arguments": json.dumps({"city": "SF"})},
                        "provider_specific_fields": {"thought_signature": "SIG-LOOP"},
                    }]},
                    {"role": "tool", "tool_call_id": "call_1", "content": "sunny"},
                ],
            },
            [self.attempt()],
            second,
        )
        self.assertEqual(status2, 200)
        part = self.model_parts(second.calls[0]["payload"])[0]
        fc = part["functionCall"]
        self.assertEqual(fc["id"], "call_1")
        # thoughtSignature is Part-level; inside functionCall Google 400s.
        self.assertEqual(part["thoughtSignature"], "SIG-LOOP")
        self.assertNotIn("thoughtSignature", fc)
        self.assertEqual(fc["args"], {"city": "SF"})

    def test_tool_loop_signature_recovered_from_store(self):
        self.enable_store()
        client = FakeClient(google_fc_response([("call_store", "get_weather", {"city": "SF"}, "SIG-STORE")]))
        status, _body = self.post(
            "/v1/chat/completions",
            {"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "weather?"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)

        # History without provider_specific_fields (client strips unknown keys):
        # the bounded store must still replay the real signature.
        second = FakeClient(google_text_response(text="done"))
        status2, _body2 = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "user", "content": "weather?"},
                    {"role": "assistant", "content": None, "tool_calls": [{
                        "id": "call_store", "type": "function",
                        "function": {"name": "get_weather", "arguments": "{}"},
                    }]},
                    {"role": "tool", "tool_call_id": "call_store", "content": "sunny"},
                ],
            },
            [self.attempt()],
            second,
        )
        self.assertEqual(status2, 200)
        part = self.model_parts(second.calls[0]["payload"])[0]
        self.assertEqual(part["thoughtSignature"], "SIG-STORE")
        self.assertNotIn("thoughtSignature", part["functionCall"])

    def test_parallel_calls_first_signed_second_dummy(self):
        client = FakeClient(google_fc_response([
            ("call_a", "tool_a", {}, "SIG-A"),
            ("call_b", "tool_b", {}, None),
        ]))
        status, body = self.post(
            "/v1/chat/completions",
            {"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "both"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        calls = body["choices"][0]["message"]["tool_calls"]
        self.assertEqual(calls[0]["provider_specific_fields"]["thought_signature"], "SIG-A")
        self.assertNotIn("provider_specific_fields", calls[1])

        second = FakeClient(google_text_response(text="done"))
        status2, _body2 = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "user", "content": "both"},
                    {"role": "assistant", "content": None, "tool_calls": [
                        {"id": "call_a", "type": "function", "function": {"name": "tool_a", "arguments": "{}"},
                         "provider_specific_fields": {"thought_signature": "SIG-A"}},
                        {"id": "call_b", "type": "function", "function": {"name": "tool_b", "arguments": "{}"}},
                    ]},
                    {"role": "tool", "tool_call_id": "call_a", "content": "ra"},
                    {"role": "tool", "tool_call_id": "call_b", "content": "rb"},
                ],
            },
            [self.attempt()],
            second,
        )
        self.assertEqual(status2, 200)
        parts = self.model_parts(second.calls[0]["payload"])
        self.assertEqual(len(parts), 2)
        self.assertEqual(parts[0]["thoughtSignature"], "SIG-A")
        # Store is disabled here: the unsigned parallel call falls back to the dummy.
        self.assertEqual(parts[1]["thoughtSignature"], DUMMY)
        self.assertNotIn("thoughtSignature", parts[0]["functionCall"])
        self.assertNotIn("thoughtSignature", parts[1]["functionCall"])
        # Both results land in one user turn (merged functionResponse parts).
        user_turns = [c for c in second.calls[0]["payload"]["contents"] if c["role"] == "user"]
        self.assertEqual(len(user_turns[-1]["parts"]), 2)

    def test_model_swap_2_5_to_3_replays_stored_signature_and_level(self):
        store = self.enable_store()
        client = FakeClient(google_fc_response([("call_swap", "get_weather", {}, "SIG-SWAP")]))
        status, _body = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [{"role": "user", "content": "weather?"}],
                "reasoning_effort": "high",
            },
            [self.attempt(GOOGLE_25_URL, "gemini-2.5-flash")],
            client,
        )
        self.assertEqual(status, 200)
        thinking = client.calls[0]["payload"]["generationConfig"]["thinkingConfig"]
        self.assertEqual(thinking, {"includeThoughts": True, "thinkingBudget": 24576})

        # Same conversation, new model: signature replay survives the swap and
        # 3.x renders thinkingLevel instead of thinkingBudget.
        second = FakeClient(google_text_response(text="sunny"))
        status2, _body2 = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-3-pro-preview",
                "messages": [
                    {"role": "user", "content": "weather?"},
                    {"role": "assistant", "content": None, "tool_calls": [{
                        "id": "call_swap", "type": "function",
                        "function": {"name": "get_weather", "arguments": "{}"},
                    }]},
                    {"role": "tool", "tool_call_id": "call_swap", "content": "ok"},
                ],
                "reasoning_effort": "high",
            },
            [self.attempt(GOOGLE_3_URL, "gemini-3-pro-preview")],
            second,
        )
        self.assertEqual(status2, 200)
        payload2 = second.calls[0]["payload"]
        part = self.model_parts(payload2)[0]
        self.assertEqual(part["thoughtSignature"], "SIG-SWAP")
        self.assertNotIn("thoughtSignature", part["functionCall"])
        gen = payload2["generationConfig"]
        self.assertEqual(gen["thinkingConfig"], {"includeThoughts": True, "thinkingLevel": "high"})
        self.assertNotIn("thinkingBudget", gen["thinkingConfig"])
        self.assertEqual(second.calls[0]["url"], GOOGLE_3_URL)
        self.assertEqual(store.get("call_swap"), "SIG-SWAP")


class GoogleProxyStreamingTests(GoogleProxyBase):
    def test_chat_stream_tool_call_and_store_replay(self):
        self.enable_store()
        lines = google_sse_lines([
            {"candidates": [{"content": {"role": "model", "parts": [{"text": "Let me check"}]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"id": "call_s1", "name": "get_weather", "args": {"city": "S"}}},
            ]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"args": {"city": "F"}}},
            ]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"id": "call_s1", "thoughtSignature": "SIG-STREAM"}},
            ]}, "finishReason": "STOP"}],
             "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 4, "totalTokenCount": 7}},
        ])
        client = FakeStreamingClient(lines)
        status, content_type, body = self.post_raw(
            "/v1/chat/completions",
            {"model": "gemini-2.5-flash", "stream": True, "messages": [{"role": "user", "content": "weather?"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        self.assertIn("text/event-stream", content_type or "")
        self.assertNotIn("model", client.calls[0]["payload"])
        self.assertNotIn("stream", client.calls[0]["payload"])
        self.assertIn('"content": "Let me check"', body)
        self.assertIn("get_weather", body)
        self.assertIn('{\\"city\\": \\"SF\\"}', body)
        self.assertIn('"finish_reason": "tool_calls"', body)
        self.assertIn("data: [DONE]", body)

        # Streaming turn persisted the signature (id-bearing slot) into the store;
        # the next turn recovers it even though chat SSE carries no psf deltas.
        second = FakeClient(google_text_response(text="sunny"))
        status2, _body2 = self.post(
            "/v1/chat/completions",
            {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "user", "content": "weather?"},
                    {"role": "assistant", "content": None, "tool_calls": [{
                        "id": "call_s1", "type": "function",
                        "function": {"name": "get_weather", "arguments": json.dumps({"city": "SF"})},
                    }]},
                    {"role": "tool", "tool_call_id": "call_s1", "content": "sunny"},
                ],
            },
            [self.attempt()],
            second,
        )
        self.assertEqual(status2, 200)
        part = self.model_parts(second.calls[0]["payload"])[0]
        self.assertEqual(part["thoughtSignature"], "SIG-STREAM")
        self.assertNotIn("thoughtSignature", part["functionCall"])

    def test_responses_stream_lifecycle(self):
        lines = google_sse_lines([
            {"candidates": [{"content": {"role": "model", "parts": [{"text": "Hello"}]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [{"text": " world"}]}, "finishReason": "STOP"}],
             "usageMetadata": {"promptTokenCount": 2, "candidatesTokenCount": 3, "totalTokenCount": 5}},
        ])
        client = FakeStreamingClient(lines)
        status, content_type, body = self.post_raw(
            "/v1/responses",
            {"model": "gemini-2.5-flash", "stream": True, "input": [{"role": "user", "content": "hi"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        self.assertIn("event: response.created", body)
        self.assertIn("Hello", body)
        self.assertIn("world", body)
        self.assertIn("event: response.completed", body)
        self.assertIn('"status": "completed"', body)

    def test_anthropic_stream_thinking_signature(self):
        lines = google_sse_lines([
            {"candidates": [{"content": {"role": "model", "parts": [
                {"text": "pondering", "thought": True, "thoughtSignature": "SIG-TH"},
            ]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [{"text": "answer"}]}, "finishReason": "STOP"}],
             "usageMetadata": {"promptTokenCount": 2, "candidatesTokenCount": 3, "totalTokenCount": 5}},
        ])
        client = FakeStreamingClient(lines)
        status, _content_type, body = self.post_raw(
            "/anthropic/v1/messages",
            {"model": "gemini-2.5-flash", "max_tokens": 32, "stream": True, "messages": [{"role": "user", "content": "hi"}]},
            [self.attempt()],
            client,
        )
        self.assertEqual(status, 200)
        self.assertIn('"type": "thinking"', body)
        self.assertIn("pondering", body)
        self.assertIn('"type": "signature_delta"', body)
        self.assertIn("SIG-TH", body)
        self.assertIn("answer", body)
        self.assertIn("message_stop", body)


if __name__ == "__main__":
    unittest.main()
