import errno
import json
import os
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

    def test_conflicting_output_token_aliases_return_400(self):
        status, body = self.post_json(
            "/v1/chat/completions",
            {"model": "m", "messages": [], "max_tokens": 10, "max_completion_tokens": 20},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "invalid_output_token_limit")

    def test_invalid_output_token_alias_returns_400(self):
        status, body = self.post_json(
            "/v1/responses",
            {"model": "m", "input": "hello", "max_token": 0},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "invalid_output_token_limit")
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


class ClientDisconnectDetectionTests(unittest.TestCase):
    """Unit tests for is_client_disconnect_error classification."""

    def test_explicit_disconnect_exception_classes_are_detected(self):
        for exc in (
            BrokenPipeError("broken pipe"),
            ConnectionResetError("reset"),
            ConnectionAbortedError("aborted"),
            ConnectionRefusedError("refused"),
        ):
            self.assertTrue(sse2json.is_client_disconnect_error(exc), msg=f"{type(exc).__name__} should count as client disconnect")

    def test_oserror_with_disconnect_errno_is_detected(self):
        for code in (errno.EPIPE, errno.ECONNRESET, errno.ESHUTDOWN):
            exc = OSError(code, os.strerror(code))
            self.assertTrue(sse2json.is_client_disconnect_error(exc), msg=f"errno {code} should count as client disconnect")

    def test_oserror_with_windows_disconnect_winerror_is_detected(self):
        for winerr in (10053, 10054, 10058):
            exc = OSError("x")
            exc.winerror = winerr
            self.assertTrue(sse2json.is_client_disconnect_error(exc), msg=f"winerror {winerr} should count as client disconnect")

    def test_urlerror_wrapping_disconnect_is_detected(self):
        from urllib.error import URLError
        # URLError whose .reason is a disconnect OSError.
        wrapped = URLError(OSError(errno.ECONNRESET, "reset by peer"))
        self.assertTrue(sse2json.is_client_disconnect_error(wrapped))

    def test_non_disconnect_errors_are_not_detected(self):
        from urllib.error import URLError
        import socket
        # Timeout is NOT a client disconnect.
        self.assertFalse(sse2json.is_client_disconnect_error(socket.timeout("read timeout")))
        # Generic URLError wrapping a timeout is not a client disconnect.
        self.assertFalse(sse2json.is_client_disconnect_error(URLError("getaddrinfo failed")))
        # Generic OSError without disconnect errno/winerror is not.
        self.assertFalse(sse2json.is_client_disconnect_error(OSError("some other failure")))
        # Plain ValueError is not.
        self.assertFalse(sse2json.is_client_disconnect_error(ValueError("nope")))


if __name__ == "__main__":
    unittest.main()
