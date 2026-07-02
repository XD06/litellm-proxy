"""Tests for CLI parameter application, thread-local runtime cleanup,
and deferred upstream client cleanup on hot-reload."""

import json
import os
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch, MagicMock

# Ensure project root is importable
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

import config_loader
import sse2json


class CliHostPortConfigTests(unittest.TestCase):
    """P0: CLI --host / --port / --config must actually take effect."""

    def setUp(self):
        self._saved_env = {}
        for key in ("PROXY_HOST", "PROXY_PORT", "PROXY_CONFIG_PATH", "PROXY_RUNTIME_CONFIG_PATH"):
            self._saved_env[key] = os.environ.pop(key, None)

    def tearDown(self):
        for key, val in self._saved_env.items():
            if val is not None:
                os.environ[key] = val
            else:
                os.environ.pop(key, None)

    def test_proxy_host_applied_via_env_overlay(self):
        """_apply_env_overlays should pick up PROXY_HOST."""
        os.environ["PROXY_HOST"] = "127.0.0.9"
        try:
            cfg = config_loader._default_config()
            result = config_loader.apply_env_overlays(dict(cfg))
            self.assertEqual(result["server"]["host"], "127.0.0.9")
        finally:
            del os.environ["PROXY_HOST"]

    def test_proxy_port_applied_via_env_overlay(self):
        """_apply_env_overlays should pick up PROXY_PORT."""
        os.environ["PROXY_PORT"] = "4999"
        try:
            cfg = config_loader._default_config()
            result = config_loader.apply_env_overlays(dict(cfg))
            self.assertEqual(result["server"]["port"], 4999)
        finally:
            del os.environ["PROXY_PORT"]

    def test_default_config_has_host_field(self):
        """_default_config must include an explicit 'host' key in server."""
        cfg = config_loader._default_config()
        self.assertIn("host", cfg["server"])
        self.assertEqual(cfg["server"]["host"], "0.0.0.0")

    def test_config_path_override_loads_different_config(self):
        """--config should load a config from a different path."""
        fd, tmp_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        runtime_fd, runtime_path = tempfile.mkstemp(suffix=".json")
        os.close(runtime_fd)
        os.unlink(runtime_path)  # use non-existent path
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump({
                    "server": {"port": 7777, "admin_key": "test-key-from-file"},
                    "providers": {
                        "default": {
                            "base_url": "https://example.com",
                            "keys": ["test-key"],
                        }
                    }
                }, f)
            os.environ["PROXY_CONFIG_PATH"] = tmp_path
            os.environ["PROXY_RUNTIME_CONFIG_PATH"] = runtime_path
            cfg = config_loader.load_base_config(apply_env=False)
            self.assertEqual(cfg["server"]["port"], 7777)
            self.assertEqual(cfg["server"]["admin_key"], "test-key-from-file")
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


class ThreadLocalRuntimeCleanupTests(unittest.TestCase):
    """P1: _clear_request_rt() must be called after every request finishes."""

    def setUp(self):
        self._original_audit = sse2json.AUDIT
        sse2json.AUDIT = sse2json.AdminAuditStore({"observability": {"audit": {"enabled": False}}})
        sse2json.OBSERVABILITY.reset()
        self.server = __import__("http.server").server.HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        sse2json.OBSERVABILITY.reset()
        sse2json.AUDIT = self._original_audit

    def test_get_clears_request_rt(self):
        """After a GET request, _request_rt.ctx should be None on that thread."""
        from urllib.request import urlopen, Request
        from urllib.error import HTTPError

        # We need to check the thread-local on the handler thread, but since
        # we can't inject code there, we verify indirectly: a GET to /health
        # should succeed and the _clear_request_rt function should exist and
        # be callable. The real test is that do_GET wraps in try/finally.
        req = Request(self.base_url + "/health")
        with urlopen(req, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read())
            self.assertEqual(data["status"], "ok")

        # Verify _clear_request_rt is defined and callable
        self.assertTrue(callable(sse2json._clear_request_rt))

        # Verify it actually clears the thread-local
        sse2json._set_request_rt(sse2json.RUNTIME)
        self.assertIsNotNone(getattr(sse2json._request_rt, "ctx", None))
        sse2json._clear_request_rt()
        self.assertIsNone(getattr(sse2json._request_rt, "ctx", None))

    def test_post_clears_request_rt(self):
        """After a POST request, _request_rt.ctx should be cleared."""
        from urllib.request import urlopen, Request
        from urllib.error import HTTPError

        # POST to an unknown endpoint to trigger do_POST path
        req = Request(
            self.base_url + "/v1/chat/completions",
            data=json.dumps({"model": "test", "messages": []}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=5) as resp:
                pass
        except HTTPError:
            pass  # Expected - no real upstream configured

        # The thread-local should have been cleared by the finally block.
        # Since the server thread pool reuses threads, we can't directly
        # assert on the worker thread, but we can verify the function exists
        # and the do_POST method has the try/finally wrapper.
        import inspect
        source = inspect.getsource(sse2json.Handler.do_POST)
        self.assertIn("_clear_request_rt", source)
        self.assertIn("finally", source)

    def test_get_has_finally_wrapper(self):
        """do_GET should have a try/finally calling _clear_request_rt."""
        import inspect
        source = inspect.getsource(sse2json.Handler.do_GET)
        self.assertIn("_clear_request_rt", source)
        self.assertIn("finally", source)

    def test_patch_has_finally_wrapper(self):
        """do_PATCH should have a try/finally calling _clear_request_rt."""
        import inspect
        source = inspect.getsource(sse2json.Handler.do_PATCH)
        self.assertIn("_clear_request_rt", source)
        self.assertIn("finally", source)


class DeferredClientCleanupTests(unittest.TestCase):
    """P1: _apply_runtime_config should defer-close old upstream client."""

    def test_old_client_close_is_deferred(self):
        """_apply_runtime_config should schedule a Timer for old client.close(),
        not call it synchronously."""
        # Create a fake client with a close method we can track
        fake_client = MagicMock()
        fake_client.close = MagicMock()

        # Save and restore global state
        original_client = sse2json.UPSTREAM_CLIENT
        original_config = sse2json.CONFIG
        try:
            sse2json.UPSTREAM_CLIENT = fake_client
            # Build a minimal config that won't break _apply_runtime_config
            base_cfg = config_loader._default_config()
            # Call _apply_runtime_config — it should swap in a new client
            # and schedule a Timer to close the old one
            with patch("sse2json.OpenAIUpstreamClient") as mock_client_cls, \
                 patch("sse2json.UpstreamRouter") as mock_router_cls, \
                 patch("sse2json.ProxyObservability") as mock_obs_cls, \
                 patch("sse2json.AdminAuditStore") as mock_audit_cls, \
                 patch("sse2json.model_registry"), \
                 patch("sse2json._save_router_state"), \
                 patch("sse2json._refresh_model_mapping_globals"), \
                 patch("sse2json.apply_env_overlays", side_effect=lambda c: c):
                mock_router_cls.return_value = MagicMock()
                mock_obs_cls.return_value = MagicMock()
                mock_audit_cls.return_value = MagicMock()
                new_client = MagicMock()
                mock_client_cls.return_value = new_client

                sse2json._apply_runtime_config(dict(base_cfg))

                # Old client close should NOT have been called synchronously
                fake_client.close.assert_not_called()

                # The new client should now be the global UPSTREAM_CLIENT
                self.assertIs(sse2json.UPSTREAM_CLIENT, new_client)
        finally:
            sse2json.UPSTREAM_CLIENT = original_client
            sse2json.CONFIG = original_config

    def test_old_client_without_close_does_not_crash(self):
        """If old client has no close method (e.g. test mocks), should not crash."""
        fake_client = MagicMock(spec=[])  # No attributes at all

        original_client = sse2json.UPSTREAM_CLIENT
        original_config = sse2json.CONFIG
        try:
            sse2json.UPSTREAM_CLIENT = fake_client
            base_cfg = config_loader._default_config()
            with patch("sse2json.OpenAIUpstreamClient") as mock_client_cls, \
                 patch("sse2json.UpstreamRouter") as mock_router_cls, \
                 patch("sse2json.ProxyObservability") as mock_obs_cls, \
                 patch("sse2json.AdminAuditStore") as mock_audit_cls, \
                 patch("sse2json.model_registry"), \
                 patch("sse2json._save_router_state"), \
                 patch("sse2json._refresh_model_mapping_globals"), \
                 patch("sse2json.apply_env_overlays", side_effect=lambda c: c):
                mock_router_cls.return_value = MagicMock()
                mock_obs_cls.return_value = MagicMock()
                mock_audit_cls.return_value = MagicMock()
                mock_client_cls.return_value = MagicMock()

                # Should not raise AttributeError
                sse2json._apply_runtime_config(dict(base_cfg))
        finally:
            sse2json.UPSTREAM_CLIENT = original_client
            sse2json.CONFIG = original_config


if __name__ == "__main__":
    unittest.main()
