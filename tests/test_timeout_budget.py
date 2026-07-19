import socket
import unittest
from unittest.mock import patch

import sse2json
from upstream_client import OpenAIUpstreamClient


class _FakeSock:
    def __init__(self):
        self.timeouts = []

    def settimeout(self, value):
        self.timeouts.append(value)


class _FakeRaw:
    def __init__(self, sock):
        self._sock = sock


class _FakeFp:
    def __init__(self, sock):
        self.raw = _FakeRaw(sock)


class _FakeResponse:
    def __init__(self, sock):
        self.fp = _FakeFp(sock)


class _FakeOpener:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def open(self, req, timeout=None):
        self.calls.append({"req": req, "timeout": timeout})
        return self.response


class TimeoutBudgetTests(unittest.TestCase):
    class Stats:
        def __init__(self, count, p95_ms):
            self.count = count
            self.p95_ms = p95_ms

        def first_event_latency_stats(self, provider, model, profile, *, min_samples=20):
            return {"count": self.count, "p95_ms": self.p95_ms}

    def test_first_event_timeout_uses_remaining_budget(self):
        with patch.object(sse2json.time, "time", return_value=112.5):
            remaining = sse2json._remaining_first_event_timeout(100.0, 30)
        self.assertAlmostEqual(remaining, 17.5)

    def test_first_event_timeout_raises_when_budget_exhausted(self):
        with patch.object(sse2json.time, "time", return_value=131.0):
            with self.assertRaises(socket.timeout):
                sse2json._remaining_first_event_timeout(100.0, 30)

    def test_stream_open_uses_smaller_of_connect_and_first_event_budget(self):
        sock = _FakeSock()
        opener = _FakeOpener(_FakeResponse(sock))
        client = OpenAIUpstreamClient({"routing": {"transport": "urllib", "connect_timeout_s": 15, "read_timeout_s": 120}})
        client._default_opener = opener

        client.open_stream("https://example.test/v1/responses", {}, {"model": "m"}, first_byte_timeout_s=30)
        self.assertEqual(opener.calls[-1]["timeout"], 15)
        self.assertEqual(sock.timeouts[-1], 120)

        client.open_stream("https://example.test/v1/responses", {}, {"model": "m"}, first_byte_timeout_s=7.5)
        self.assertEqual(opener.calls[-1]["timeout"], 7.5)

    def test_adaptive_first_event_budget_uses_p95_after_twenty_samples(self):
        normal = sse2json._adaptive_first_event_budget(
            {}, "plain", "alpha", "model-a", self.Stats(20, 12000), 15
        )
        slow_normal = sse2json._adaptive_first_event_budget(
            {}, "plain", "alpha", "model-a", self.Stats(20, 40000), 15
        )
        agent = sse2json._adaptive_first_event_budget(
            {}, "tools+reasoning", "alpha", "model-a", self.Stats(20, 25000), 30
        )

        self.assertEqual(normal, 18.0)
        self.assertEqual(slow_normal, 30.0)
        self.assertEqual(agent, 37.5)

    def test_adaptive_first_event_budget_keeps_configured_fallback_for_small_samples(self):
        budget = sse2json._adaptive_first_event_budget(
            {}, "plain", "alpha", "model-a", self.Stats(19, 30000), 22
        )

        self.assertEqual(budget, 22.0)


if __name__ == "__main__":
    unittest.main()
