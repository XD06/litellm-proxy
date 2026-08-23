import io
import json
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import sse2json
from request_routes import classify_post
from router import Attempt


class AuxRouteClassification(unittest.TestCase):
    def test_embeddings_route(self):
        route = classify_post("/v1/embeddings")
        self.assertEqual(route.family, "chat_completions")
        self.assertEqual(route.endpoint, "embeddings")
        self.assertTrue(route.implemented)

    def test_images_generations_route(self):
        route = classify_post("/v1/images/generations")
        self.assertEqual(route.family, "chat_completions")
        self.assertEqual(route.endpoint, "images_generations")
        self.assertTrue(route.implemented)

    def test_images_edits_not_implemented_yet(self):
        route = classify_post("/v1/images/edits")
        self.assertFalse(route.implemented)


class FakeRouter:
    def __init__(self, attempts):
        self.attempts = attempts
        self.successes = []
        self.failures = []

    def iter_attempts(self, canonical_model, is_stream, request_id, client_headers=None, **kwargs):
        self.last_kwargs = kwargs
        yield from self.attempts

    def report_success(self, attempt):
        self.successes.append(attempt)

    def report_failure(self, attempt, **kwargs):
        self.failures.append((attempt, kwargs))
        return {}

    def masked_key(self, key):
        return "masked"


class FakeClient:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        result = self.results[len(self.calls) - 1]
        if isinstance(result, Exception):
            raise result
        return result


def _attempt(provider="mock", attempt_no=1, url="https://mock.test/v1/chat/completions"):
    return Attempt(
        request_id="req-test",
        attempt_no=attempt_no,
        provider=provider,
        key_index=0,
        key="secret",
        url=url,
        headers={"Authorization": "Bearer secret"},
        provider_model="provider-model",
        upstream_format="chat_completions",
    )


class AuxEndpointHandlerTests(unittest.TestCase):
    def run_post(self, path, payload, *, config=None):
        server = HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            req = Request(
                f"http://127.0.0.1:{server.server_address[1]}{path}",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlopen(req, timeout=5) as resp:
                    return resp.status, resp.headers.get("X-Route-Provider"), json.loads(resp.read())
            except HTTPError as e:
                try:
                    return e.code, None, json.loads(e.read())
                finally:
                    e.close()
        finally:
            server.shutdown()
            server.server_close()

    def _config(self):
        return {
            "providers": {"mock": {"base_url": "https://mock.test", "keys": ["sk-1"], "priority": 10}},
            "routing": {"default_provider_pool": ["mock"], "max_attempts": 3},
        }

    def test_embeddings_passthrough(self):
        fake_router = FakeRouter([_attempt()])
        fake_client = FakeClient([
            {"object": "list", "data": [{"embedding": [0.1, 0.2], "index": 0}],
             "model": "provider-model", "usage": {"prompt_tokens": 5, "total_tokens": 5}},
        ])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "CONFIG", self._config()):
            status, provider, body = self.run_post(
                "/v1/embeddings", {"model": "client-model", "input": "hello"},
            )
        self.assertEqual(status, 200)
        self.assertEqual(provider, "mock")
        self.assertEqual(body["data"][0]["embedding"], [0.1, 0.2])
        sent = fake_client.calls[0]
        # URL must be rewritten to the embeddings path on the provider base_url.
        self.assertEqual(sent["url"], "https://mock.test/v1/embeddings")
        # Model must be swapped to the provider model.
        self.assertEqual(sent["payload"]["model"], "provider-model")
        self.assertEqual(fake_router.successes[0].provider, "mock")

    def test_images_generations_passthrough(self):
        fake_router = FakeRouter([_attempt()])
        fake_client = FakeClient([
            {"created": 1700000000, "data": [{"b64_json": "AAAA"}]},
        ])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "CONFIG", self._config()):
            status, _, body = self.run_post(
                "/v1/images/generations",
                {"model": "client-model", "prompt": "a cat", "n": 1, "size": "1024x1024"},
            )
        self.assertEqual(status, 200)
        self.assertEqual(body["data"][0]["b64_json"], "AAAA")
        sent = fake_client.calls[0]
        self.assertEqual(sent["url"], "https://mock.test/v1/images/generations")
        self.assertEqual(sent["payload"]["model"], "provider-model")

    def _http_error(self, status):
        return HTTPError(
            "https://mock.test/v1/embeddings",
            status,
            "err",
            {"Retry-After": "1"},
            io.BytesIO(json.dumps({"error": {"message": "boom"}}).encode()),
        )

    def test_embeddings_failover_on_429(self):
        first = _attempt(attempt_no=1)
        second = _attempt(attempt_no=2)
        fake_router = FakeRouter([first, second])
        fake_client = FakeClient([
            self._http_error(429),
            {"object": "list", "data": [{"embedding": [0.5], "index": 0}], "usage": {"prompt_tokens": 2}},
        ])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "CONFIG", self._config()):
            status, provider, body = self.run_post(
                "/v1/embeddings", {"model": "client-model", "input": "x"},
            )
        self.assertEqual(status, 200)
        self.assertEqual(len(fake_client.calls), 2)
        self.assertEqual(fake_router.failures[0][1]["error_type"], "rate_limited")
        self.assertEqual(fake_router.successes[0].attempt_no, 2)

    def test_no_candidate_returns_503(self):
        fake_router = FakeRouter([])
        fake_client = FakeClient([])
        with patch.object(sse2json, "ROUTER", fake_router), patch.object(
            sse2json, "UPSTREAM_CLIENT", fake_client
        ), patch.object(sse2json, "CONFIG", self._config()):
            status, _, body = self.run_post(
                "/v1/embeddings", {"model": "client-model", "input": "x"},
            )
        self.assertEqual(status, 503)
        self.assertIn("No eligible upstream candidate", body["error"]["message"])


if __name__ == "__main__":
    unittest.main()
