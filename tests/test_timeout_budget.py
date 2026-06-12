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
        client = OpenAIUpstreamClient({"routing": {"connect_timeout_s": 15, "read_timeout_s": 120}})
        client._default_opener = opener

        client.open_stream("https://example.test/v1/responses", {}, {"model": "m"}, first_byte_timeout_s=30)
        self.assertEqual(opener.calls[-1]["timeout"], 15)
        self.assertEqual(sock.timeouts[-1], 120)

        client.open_stream("https://example.test/v1/responses", {}, {"model": "m"}, first_byte_timeout_s=7.5)
        self.assertEqual(opener.calls[-1]["timeout"], 7.5)


if __name__ == "__main__":
    unittest.main()
