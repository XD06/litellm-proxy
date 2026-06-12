import unittest
from unittest.mock import patch, Mock
from urllib.error import HTTPError
import socket

from upstream_client import OpenAIUpstreamClient


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


if __name__ == "__main__":
    unittest.main()
