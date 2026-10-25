"""Hardening regression for the artificial_analysis_api FastAPI service."""
import unittest

from fastapi import HTTPException

from artificial_analysis_api import router as aa_router


class ValidatedProxyTests(unittest.TestCase):
    def test_http_proxy_passes_through(self):
        self.assertEqual(aa_router._validated_proxy("http://127.0.0.1:8014"), "http://127.0.0.1:8014")
        self.assertEqual(aa_router._validated_proxy(" https://proxy.example "), "https://proxy.example")

    def test_none_and_empty_pass_through(self):
        self.assertIsNone(aa_router._validated_proxy(None))
        self.assertIsNone(aa_router._validated_proxy(""))

    def test_non_http_schemes_rejected(self):
        for bad in ("socks5://x", "ftp://x", "file:///etc/passwd", "javascript:alert(1)"):
            with self.assertRaises(HTTPException) as ctx:
                aa_router._validated_proxy(bad)
            self.assertEqual(ctx.exception.status_code, 400)


class ApiKeyGuardTests(unittest.TestCase):
    def test_no_key_configured_allows_all(self):
        original = aa_router._API_KEY
        aa_router._API_KEY = ""
        try:
            self.assertIsNone(aa_router._require_api_key(None))
        finally:
            aa_router._API_KEY = original

    def test_missing_or_wrong_key_rejected(self):
        original = aa_router._API_KEY
        aa_router._API_KEY = "secret-value"
        try:
            with self.assertRaises(HTTPException) as ctx:
                aa_router._require_api_key(None)
            self.assertEqual(ctx.exception.status_code, 401)
            with self.assertRaises(HTTPException):
                aa_router._require_api_key("wrong")
        finally:
            aa_router._API_KEY = original

    def test_correct_key_passes(self):
        original = aa_router._API_KEY
        aa_router._API_KEY = "secret-value"
        try:
            self.assertIsNone(aa_router._require_api_key("secret-value"))
        finally:
            aa_router._API_KEY = original


if __name__ == "__main__":
    unittest.main()
