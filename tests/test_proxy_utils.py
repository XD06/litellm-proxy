#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for proxy URL normalization and SOCKS support."""
import unittest
from unittest.mock import patch, MagicMock

from proxy_utils import (
    normalize_proxy_url,
    normalize_proxy_config,
    resolve_proxy_url,
    is_socks_proxy,
)


class TestNormalizeProxyUrl(unittest.TestCase):
    def test_bare_ip_port_gets_http_scheme(self):
        self.assertEqual(normalize_proxy_url("127.0.0.1:10808"), "http://127.0.0.1:10808")

    def test_bare_host_port_gets_http_scheme(self):
        self.assertEqual(normalize_proxy_url("proxy.example.com:7890"), "http://proxy.example.com:7890")

    def test_http_scheme_preserved(self):
        self.assertEqual(normalize_proxy_url("http://127.0.0.1:7890"), "http://127.0.0.1:7890")

    def test_https_scheme_preserved(self):
        self.assertEqual(normalize_proxy_url("https://127.0.0.1:7890"), "https://127.0.0.1:7890")

    def test_socks5_scheme_preserved(self):
        self.assertEqual(normalize_proxy_url("socks5://127.0.0.1:10808"), "socks5://127.0.0.1:10808")

    def test_socks4_scheme_preserved(self):
        self.assertEqual(normalize_proxy_url("socks4://127.0.0.1:10808"), "socks4://127.0.0.1:10808")

    def test_socks5h_scheme_preserved(self):
        self.assertEqual(normalize_proxy_url("socks5h://127.0.0.1:10808"), "socks5h://127.0.0.1:10808")

    def test_http_with_auth_preserved(self):
        self.assertEqual(
            normalize_proxy_url("http://user:pass@127.0.0.1:7890"),
            "http://user:pass@127.0.0.1:7890",
        )

    def test_bare_with_auth_gets_http_scheme(self):
        self.assertEqual(
            normalize_proxy_url("user:pass@127.0.0.1:7890"),
            "http://user:pass@127.0.0.1:7890",
        )

    def test_socks5_with_auth_preserved(self):
        self.assertEqual(
            normalize_proxy_url("socks5://user:pass@127.0.0.1:10808"),
            "socks5://user:pass@127.0.0.1:10808",
        )

    def test_uppercase_scheme_normalized(self):
        # Scheme is case-insensitive, should be accepted as-is
        result = normalize_proxy_url("HTTP://127.0.0.1:7890")
        self.assertEqual(result, "HTTP://127.0.0.1:7890")

    def test_empty_string_returns_empty(self):
        self.assertEqual(normalize_proxy_url(""), "")

    def test_none_returns_empty(self):
        self.assertEqual(normalize_proxy_url(None), "")

    def test_whitespace_stripped(self):
        self.assertEqual(normalize_proxy_url("  127.0.0.1:7890  "), "http://127.0.0.1:7890")

    def test_unknown_scheme_passed_through(self):
        # Unknown schemes are passed through to let the caller produce a clear error
        self.assertEqual(normalize_proxy_url("ftp://127.0.0.1:7890"), "ftp://127.0.0.1:7890")


class TestIsSocksProxy(unittest.TestCase):
    def test_socks5_detected(self):
        self.assertTrue(is_socks_proxy("socks5://127.0.0.1:10808"))

    def test_socks4_detected(self):
        self.assertTrue(is_socks_proxy("socks4://127.0.0.1:10808"))

    def test_socks5h_detected(self):
        self.assertTrue(is_socks_proxy("socks5h://127.0.0.1:10808"))

    def test_http_not_socks(self):
        self.assertFalse(is_socks_proxy("http://127.0.0.1:7890"))

    def test_bare_not_socks(self):
        self.assertFalse(is_socks_proxy("127.0.0.1:7890"))

    def test_empty_not_socks(self):
        self.assertFalse(is_socks_proxy(""))


class TestNormalizeProxyConfig(unittest.TestCase):
    def test_string_bare_ip_port_normalized(self):
        result = normalize_proxy_config("127.0.0.1:10808")
        self.assertEqual(result, {"http": "http://127.0.0.1:10808", "https": "http://127.0.0.1:10808"})

    def test_string_socks5_preserved(self):
        result = normalize_proxy_config("socks5://127.0.0.1:10808")
        self.assertEqual(result, {"http": "socks5://127.0.0.1:10808", "https": "socks5://127.0.0.1:10808"})

    def test_dict_with_bare_ip_port(self):
        result = normalize_proxy_config({"http": "127.0.0.1:7890", "https": "127.0.0.1:7890"})
        self.assertEqual(result, {"http": "http://127.0.0.1:7890", "https": "http://127.0.0.1:7890"})

    def test_none_returns_empty(self):
        self.assertEqual(normalize_proxy_config(None), {})

    def test_empty_string_returns_empty(self):
        self.assertEqual(normalize_proxy_config(""), {})


class TestResolveProxyUrl(unittest.TestCase):
    def test_bare_ip_port_resolved(self):
        result = resolve_proxy_url("127.0.0.1:10808")
        self.assertEqual(result, "http://127.0.0.1:10808")

    def test_socks5_resolved(self):
        result = resolve_proxy_url("socks5://127.0.0.1:10808")
        self.assertEqual(result, "socks5://127.0.0.1:10808")

    def test_first_non_empty_wins(self):
        result = resolve_proxy_url(None, "", "127.0.0.1:7890", "socks5://127.0.0.1:10808")
        self.assertEqual(result, "http://127.0.0.1:7890")

    def test_all_empty_returns_none(self):
        self.assertIsNone(resolve_proxy_url(None, "", {}))


class TestProxyTestConnectivity(unittest.TestCase):
    """Test the _test_proxy_connectivity function in admin_routes."""

    def test_bare_ip_port_accepted(self):
        """Bare ip:port should be auto-prefixed with http://."""
        from admin_routes import _test_proxy_connectivity

        fake_response = MagicMock()
        fake_response.status = 204
        fake_manager = MagicMock()
        fake_manager.request.return_value = fake_response

        with patch("urllib3.ProxyManager", return_value=fake_manager) as pm:
            result = _test_proxy_connectivity("127.0.0.1:10808", timeout_s=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], 204)
        self.assertEqual(result["proxy"], "http://127.0.0.1:10808")
        pm.assert_called_once()

    def test_socks5_uses_socks_proxy_manager(self):
        """SOCKS5 proxy should use SOCKSProxyManager, not ProxyManager."""
        from admin_routes import _test_proxy_connectivity

        fake_response = MagicMock()
        fake_response.status = 204
        fake_manager = MagicMock()
        fake_manager.request.return_value = fake_response

        with patch("urllib3.ProxyManager") as pm, \
             patch("urllib3.contrib.socks.SOCKSProxyManager", return_value=fake_manager) as spm:
            result = _test_proxy_connectivity("socks5://127.0.0.1:10808", timeout_s=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["proxy"], "socks5://127.0.0.1:10808")
        pm.assert_not_called()
        spm.assert_called_once()

    def test_socks4_uses_socks_proxy_manager(self):
        """SOCKS4 proxy should also use SOCKSProxyManager."""
        from admin_routes import _test_proxy_connectivity

        fake_response = MagicMock()
        fake_response.status = 200
        fake_manager = MagicMock()
        fake_manager.request.return_value = fake_response

        with patch("urllib3.ProxyManager") as pm, \
             patch("urllib3.contrib.socks.SOCKSProxyManager", return_value=fake_manager) as spm:
            result = _test_proxy_connectivity("socks4://127.0.0.1:1080", timeout_s=2)

        self.assertTrue(result["ok"])
        pm.assert_not_called()
        spm.assert_called_once()

    def test_http_with_auth_works(self):
        """HTTP proxy with username:password should work."""
        from admin_routes import _test_proxy_connectivity

        fake_response = MagicMock()
        fake_response.status = 204
        fake_manager = MagicMock()
        fake_manager.request.return_value = fake_response

        with patch("urllib3.ProxyManager", return_value=fake_manager) as pm:
            result = _test_proxy_connectivity("http://user:pass@127.0.0.1:7890", timeout_s=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["proxy"], "http://user:pass@127.0.0.1:7890")
        pm.assert_called_once()

    def test_empty_proxy_returns_error(self):
        from admin_routes import _test_proxy_connectivity

        result = _test_proxy_connectivity("")
        self.assertFalse(result["ok"])
        self.assertIn("proxy is required", result["error"])

    def test_connection_error_returns_error(self):
        from admin_routes import _test_proxy_connectivity

        with patch("urllib3.ProxyManager", side_effect=Exception("Connection refused")):
            result = _test_proxy_connectivity("http://127.0.0.1:99999", timeout_s=1)

        self.assertFalse(result["ok"])
        self.assertIn("Connection refused", result["error"])


class TestUpstreamClientProxyNormalization(unittest.TestCase):
    """Test that upstream_client normalizes proxy URLs correctly."""

    def test_bare_ip_port_normalized_in_pool_manager(self):
        """Bare ip:port should be normalized when creating pool manager."""
        from upstream_client import OpenAIUpstreamClient

        client = OpenAIUpstreamClient({"routing": {}})
        manager = client._pool_manager_for("127.0.0.1:8888")
        # The key should be normalized to http://127.0.0.1:8888
        self.assertIn("http://127.0.0.1:8888", client._pool_managers)
        self.assertNotIn("127.0.0.1:8888", client._pool_managers)

    def test_socks5_uses_socks_proxy_manager(self):
        """SOCKS5 proxy should create a SOCKSProxyManager, not ProxyManager."""
        from upstream_client import OpenAIUpstreamClient

        client = OpenAIUpstreamClient({"routing": {}})
        manager = client._pool_manager_for("socks5://127.0.0.1:10808")
        self.assertIn("socks5://127.0.0.1:10808", client._pool_managers)

    def test_bare_and_scheme_same_proxy_reuses_manager(self):
        """Bare ip:port and http://ip:port should reuse the same manager."""
        from upstream_client import OpenAIUpstreamClient

        client = OpenAIUpstreamClient({"routing": {}})
        a = client._pool_manager_for("127.0.0.1:8888")
        b = client._pool_manager_for("http://127.0.0.1:8888")
        self.assertIs(a, b)


if __name__ == "__main__":
    unittest.main()
