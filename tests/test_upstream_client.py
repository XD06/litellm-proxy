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

    def test_lru_evicts_oldest_when_limit_exceeded(self):
        # Temporarily lower the limit so the test is fast.
        original_limit = OpenAIUpstreamClient._MAX_POOL_MANAGERS
        OpenAIUpstreamClient._MAX_POOL_MANAGERS = 4
        try:
            client = OpenAIUpstreamClient({"routing": {}})
            created = []
            for port in range(9000, 9000 + 6):
                m = client._pool_manager_for(f"http://127.0.0.1:{port}")
                created.append((port, m))
            # Only 4 managers should remain.
            self.assertEqual(len(client._pool_managers), 4)
            # The first two should have been evicted.
            self.assertNotIn("http://127.0.0.1:9000", client._pool_managers)
            self.assertNotIn("http://127.0.0.1:9001", client._pool_managers)
            # The last four should still be present.
            self.assertIn("http://127.0.0.1:9002", client._pool_managers)
            self.assertIn("http://127.0.0.1:9005", client._pool_managers)
        finally:
            OpenAIUpstreamClient._MAX_POOL_MANAGERS = original_limit

    def test_lru_access_keeps_entry_alive(self):
        original_limit = OpenAIUpstreamClient._MAX_POOL_MANAGERS
        OpenAIUpstreamClient._MAX_POOL_MANAGERS = 3
        try:
            client = OpenAIUpstreamClient({"routing": {}})
            first = client._pool_manager_for("http://127.0.0.1:9001")
            client._pool_manager_for("http://127.0.0.1:9002")
            # Touch the first one to make it most-recently-used.
            client._pool_manager_for("http://127.0.0.1:9001")
            client._pool_manager_for("http://127.0.0.1:9003")
            client._pool_manager_for("http://127.0.0.1:9004")  # triggers eviction
            self.assertEqual(len(client._pool_managers), 3)
            # 9001 was touched, so 9002 (the actual oldest) should be evicted.
            self.assertIn("http://127.0.0.1:9001", client._pool_managers)
            self.assertNotIn("http://127.0.0.1:9002", client._pool_managers)
        finally:
            OpenAIUpstreamClient._MAX_POOL_MANAGERS = original_limit


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


class HTTPResponseLineWrapperTests(unittest.TestCase):
    """Tests for HTTPResponseLineWrapper exception handling.

    The wrapper must NOT swallow network errors (ConnectionResetError,
    socket.timeout, etc.) because callers like relay_sse_stream rely on
    exceptions to detect stream interruption, send a graceful close event
    to the client, and report the provider failure. Only ValueError
    (closed-response) should be swallowed, as it indicates an intentional
    close by another thread.
    """
    def _make_wrapper(self, *, closed=False, readline_side_effect=None, read_side_effect=None):
        from upstream_client import HTTPResponseLineWrapper
        resp = Mock()
        resp.closed = closed
        if readline_side_effect is not None:
            resp.readline.side_effect = readline_side_effect
        if read_side_effect is not None:
            resp.read.side_effect = read_side_effect
        return HTTPResponseLineWrapper(resp)

    def test_readline_returns_empty_when_closed(self):
        wrapper = self._make_wrapper(closed=True)
        self.assertEqual(wrapper.readline(), b"")

    def test_readline_swallows_value_error_for_closed_response(self):
        # ValueError is raised when the response is closed by another thread
        # mid-read. This should be treated as clean EOF.
        wrapper = self._make_wrapper(readline_side_effect=ValueError("I/O on closed file"))
        self.assertEqual(wrapper.readline(), b"")

    def test_readline_propagates_connection_reset(self):
        wrapper = self._make_wrapper(readline_side_effect=ConnectionResetError("reset"))
        with self.assertRaises(ConnectionResetError):
            wrapper.readline()

    def test_readline_propagates_socket_timeout(self):
        wrapper = self._make_wrapper(readline_side_effect=socket.timeout("timed out"))
        with self.assertRaises(socket.timeout):
            wrapper.readline()

    def test_readline_propagates_os_error(self):
        wrapper = self._make_wrapper(readline_side_effect=OSError("broken pipe"))
        with self.assertRaises(OSError):
            wrapper.readline()

    def test_read_swallows_value_error(self):
        wrapper = self._make_wrapper(read_side_effect=ValueError("closed"))
        self.assertEqual(wrapper.read(), b"")

    def test_read_propagates_connection_reset(self):
        wrapper = self._make_wrapper(read_side_effect=ConnectionResetError("reset"))
        with self.assertRaises(ConnectionResetError):
            wrapper.read()

    def test_iteration_ends_on_clean_eof(self):
        # Normal EOF: readline returns b"" then StopIteration
        wrapper = self._make_wrapper(readline_side_effect=[b"data: hello\n", b""])
        lines = list(wrapper)
        self.assertEqual(lines, [b"data: hello\n"])

    def test_iteration_propagates_network_error(self):
        wrapper = self._make_wrapper(
            readline_side_effect=[b"data: hello\n", ConnectionResetError("reset")]
        )
        with self.assertRaises(ConnectionResetError):
            list(wrapper)


if __name__ == "__main__":
    unittest.main()
