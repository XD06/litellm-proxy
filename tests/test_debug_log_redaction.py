#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression tests for NC2: debug request-log header redaction."""
import os
import tempfile
import unittest

import sse2json


class DebugLogRedactionTests(unittest.TestCase):
    def test_redact_headers_masks_authorization_and_admin_key(self):
        redacted = sse2json._redact_headers_for_log(
            {
                "Authorization": "Bearer sk-secret-key-1234567890",
                "X-Admin-Key": "admin-super-secret-value",
                "Content-Type": "application/json",
                "User-Agent": "curl/8.0",
            }
        )
        # Sensitive values are masked, not echoed verbatim.
        self.assertNotIn("sk-secret-key-1234567890", redacted["Authorization"])
        self.assertNotIn("admin-super-secret-value", redacted["X-Admin-Key"])
        # Non-sensitive headers are preserved.
        self.assertEqual(redacted["Content-Type"], "application/json")
        self.assertEqual(redacted["User-Agent"], "curl/8.0")

    def test_redact_headers_masks_cookie_and_api_key(self):
        redacted = sse2json._redact_headers_for_log(
            {"Cookie": "session=abcdef1234567890", "x-api-key": "ant-key-0987654321"}
        )
        self.assertNotIn("abcdef1234567890", redacted["Cookie"])
        self.assertNotIn("ant-key-0987654321", redacted["x-api-key"])

    def test_redact_headers_handles_none_and_empty(self):
        self.assertEqual(sse2json._redact_headers_for_log(None), {})
        self.assertEqual(sse2json._redact_headers_for_log({}), {})

    def test_log_request_detail_writes_redacted_headers(self):
        """End-to-end: log_request_detail must not write raw secrets to disk."""
        with tempfile.TemporaryDirectory() as d:
            old_log_dir = sse2json.LOG_DIR
            old_debug = sse2json.DEBUG_LOG
            sse2json.LOG_DIR = d
            sse2json.DEBUG_LOG = True
            try:
                # Build a minimal handler-like object with the method bound.
                class _Stub:
                    log_request_detail = sse2json.Handler.log_request_detail

                _Stub().log_request_detail(
                    "POST",
                    "/v1/chat/completions",
                    {"Authorization": "Bearer sk-leak-me-1234567890", "Content-Type": "application/json"},
                )
                files = os.listdir(d)
                self.assertEqual(len(files), 1)
                with open(os.path.join(d, files[0]), "r", encoding="utf-8") as f:
                    contents = f.read()
                self.assertNotIn("sk-leak-me-1234567890", contents)
                self.assertIn("Authorization", contents)  # header name kept
            finally:
                sse2json.LOG_DIR = old_log_dir
                sse2json.DEBUG_LOG = old_debug


if __name__ == "__main__":
    unittest.main()
