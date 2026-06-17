import unittest
from unittest.mock import patch, Mock
from urllib.error import HTTPError
import socket

from upstream_client import OpenAIUpstreamClient, set_response_read_timeout


class PoolManagerCacheTests(unittest.TestCase):
    def setUp(self):
        self.client = OpenAIUpstreamClient({"routing": {}})

    def test_direct_requests_use_shared_default_manager(self):
        a = self.client._pool_manager_for(None)
        b = self.client._pool_manager_for("")
        c = self.client._pool_manager_for("   ")
        direct_manager = self.client._pool_managers.get("direct")
        self.assertIsNotNone(direct_manager)
        self.assertIs(a, direct_manager)
        self.assertIs(b, direct_manager)
        self.assertIs(c, direct_manager)

    def test_same_proxy_url_reuses_one_manager(self):
        first = self.client._pool_manager_for("http://127.0.0.1:8888")
        second = self.client._pool_manager_for("http://127.0.0.1:8888")
        self.assertIs(first, second)
        self.assertIsNot(first, self.client._pool_managers.get("direct"))

    def test_proxy_url_whitespace_is_normalized(self):
        a = self.client._pool_manager_for("http://127.0.0.1:8888")
        b = self.client._pool_manager_for("  http://127.0.0.1:8888  ")
        self.assertIs(a, b)

    def test_different_proxy_urls_get_different_managers(self):
        a = self.client._pool_manager_for("http://127.0.0.1:8888")
        b = self.client._pool_manager_for("http://127.0.0.1:9999")
        self.assertIsNot(a, b)


class Urllib3RequestTests(unittest.TestCase):
    def setUp(self):
        # Force urllib3 transport
        self.client = OpenAIUpstreamClient({
            "routing": {
                "transport": "urllib3",
                "connect_timeout_s": 15,
                "read_timeout_s": 120
            }
        })

    @patch("urllib3.PoolManager.request")
    def test_request_json_success(self, mock_request):
        mock_resp = Mock()
        mock_resp.status = 200
        mock_resp.data = b'{"success": true}'
        mock_request.return_value = mock_resp

        res = self.client.request_json("https://example.com/api", {}, {"ping": "pong"})
        self.assertEqual(res, {"success": True})
        mock_request.assert_called_once()

    @patch("urllib3.PoolManager.request")
    def test_request_json_error(self, mock_request):
        mock_resp = Mock()
        mock_resp.status = 401
        mock_resp.data = b'{"error": "Unauthorized"}'
        mock_resp.reason = "Unauthorized"
        mock_resp.headers = {"Content-Type": "application/json"}
        mock_request.return_value = mock_resp

        with self.assertRaises(HTTPError) as ctx:
            self.client.request_json("https://example.com/api", {}, {"ping": "pong"})
        self.assertEqual(ctx.exception.code, 401)
        self.assertEqual(ctx.exception.read(), b'{"error": "Unauthorized"}')


class SetResponseReadTimeoutTests(unittest.TestCase):
    def _resp_with_sock(self, sock):
        raw = Mock()
        raw._sock = sock
        fp = Mock()
        fp.raw = raw
        resp = Mock()
        resp.fp = fp
        return resp

    def test_updates_socket_timeout_when_sock_present(self):
        sock = Mock()
        sock.settimeout = Mock()
        resp = self._resp_with_sock(sock)
        self.assertTrue(set_response_read_timeout(resp, 42))
        sock.settimeout.assert_called_once_with(42)

    def test_returns_false_when_no_sock(self):
        # resp without fp.raw._sock must not raise and must return False.
        resp = Mock()
        resp.fp = None
        self.assertFalse(set_response_read_timeout(resp, 10))

    def test_returns_false_for_object_without_fp(self):
        resp = object()
        self.assertFalse(set_response_read_timeout(resp, 10))

    def test_tolerates_settimeout_missing(self):
        sock = Mock(spec=[])  # no settimeout attribute
        resp = self._resp_with_sock(sock)
        # Should not raise; returns False because settimeout is unavailable.
        self.assertFalse(set_response_read_timeout(resp, 10))


if __name__ == "__main__":
    unittest.main()
