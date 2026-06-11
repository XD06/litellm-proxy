import json
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import sse2json


class HttpRouteDispatchTests(unittest.TestCase):
    def setUp(self):
        self.original_proxy = sse2json.Handler._proxy_openai_chat_completions
        self.original_responses_proxy = getattr(sse2json.Handler, "_proxy_openai_responses", None)

        def fake_proxy(handler, req, request_id, start_ts):
            _ = request_id, start_ts
            return handler._resp_json({"proxied": True, "model": req.get("model")})

        def fake_responses_proxy(handler, req, request_id, start_ts, path="/openai/v1/responses"):
            _ = request_id, start_ts
            return handler._resp_json({"responses_proxied": True, "model": req.get("model")})

        sse2json.Handler._proxy_openai_chat_completions = fake_proxy
        sse2json.Handler._proxy_openai_responses = fake_responses_proxy
        self.server = HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        sse2json.Handler._proxy_openai_chat_completions = self.original_proxy
        if self.original_responses_proxy is None:
            delattr(sse2json.Handler, "_proxy_openai_responses")
        else:
            sse2json.Handler._proxy_openai_responses = self.original_responses_proxy

    def post_json(self, path, payload):
        req = Request(
            self.base_url + path,
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

    def test_v1_chat_completions_dispatches_to_chat_proxy(self):
        status, body = self.post_json("/v1/chat/completions", {"model": "m", "messages": []})

        self.assertEqual(status, 200)
        self.assertEqual(body, {"proxied": True, "model": "m"})

    def test_openai_responses_dispatches_to_responses_proxy(self):
        status, body = self.post_json("/openai/v1/responses", {"model": "m", "input": "hello"})

        self.assertEqual(status, 200)
        self.assertEqual(body, {"responses_proxied": True, "model": "m"})

    def test_v1_responses_dispatches_to_responses_proxy(self):
        status, body = self.post_json("/v1/responses", {"model": "m", "input": "hello"})

        self.assertEqual(status, 200)
        self.assertEqual(body, {"responses_proxied": True, "model": "m"})

    def test_openai_chat_completions_is_not_a_supported_route(self):
        status, body = self.post_json("/openai/v1/chat/completions", {"model": "m", "messages": []})

        self.assertEqual(status, 404)
        self.assertIn("unknown endpoint", body["error"]["message"])

    def test_oversize_body_rejected_with_413(self):
        original = sse2json.CONFIG
        sse2json.CONFIG = {"server": {"max_request_body_bytes": 64}}
        try:
            status, body = self.post_json(
                "/v1/chat/completions", {"model": "m", "messages": [{"role": "user", "content": "x" * 500}]}
            )
        finally:
            sse2json.CONFIG = original

        self.assertEqual(status, 413)
        self.assertIn("too large", body["error"]["message"])

    def test_body_within_limit_passes(self):
        original = sse2json.CONFIG
        sse2json.CONFIG = {"server": {"max_request_body_bytes": 32 * 1024 * 1024}}
        try:
            status, body = self.post_json("/v1/chat/completions", {"model": "m", "messages": []})
        finally:
            sse2json.CONFIG = original

        self.assertEqual(status, 200)
        self.assertEqual(body, {"proxied": True, "model": "m"})


if __name__ == "__main__":
    unittest.main()
