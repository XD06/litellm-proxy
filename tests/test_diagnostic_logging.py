import json
import os
import tempfile
import unittest
from unittest.mock import patch

import sse2json
from router import Attempt, UpstreamRouter


class DiagnosticLoggingTests(unittest.TestCase):
    def temp_path(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.close(fd)
        os.unlink(path)

        def cleanup():
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except PermissionError:
                pass

        self.addCleanup(cleanup)
        return path

    def test_diagnostic_log_writes_structured_masked_attempt(self):
        raw_key = "sk-test-raw-secret-1234567890"
        path = self.temp_path()
        cfg = {
            "observability": {
                "log_key_mask": {"prefix": 6, "suffix": 4},
                "diagnostics": {"enabled": True, "path": path},
            }
        }
        attempt = Attempt(
            request_id="req-diagnostic",
            attempt_no=1,
            provider="deepseek",
            key_index=0,
            key=raw_key,
            url="https://upstream.example/v1/messages",
            headers={"Authorization": f"Bearer {raw_key}"},
            provider_model="deepseek-v4-flash",
            upstream_format="anthropic_messages",
        )

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", UpstreamRouter(cfg)):
            sse2json._write_attempt_diagnostic_log(
                "req-diagnostic",
                attempt,
                outcome="failed",
                error_type="provider_compat",
                reason="thinking_content_required",
                http_status=400,
                diagnostics={
                    "diagnostic_stage": "upstream_http_error",
                    "upstream_error_summary": f"Authorization: Bearer {raw_key} must be passed back",
                    "upstream_error_type": "invalid_request_error",
                    "upstream_error_code": "invalid_request_error",
                    "upstream_error_param": "content[].thinking",
                },
            )

        with open(path, "r", encoding="utf-8") as f:
            line = f.read().strip()
        record = json.loads(line)

        self.assertEqual(record["request_id"], "req-diagnostic")
        self.assertEqual(record["provider"], "deepseek")
        self.assertEqual(record["key_masked"], "sk-tes**7890")
        self.assertEqual(record["diagnostic_stage"], "upstream_http_error")
        self.assertEqual(record["upstream_error_code"], "invalid_request_error")
        self.assertNotIn(raw_key, line)
        self.assertNotIn("Bearer sk-test-raw-secret", line)

    def test_upstream_error_diagnostics_extracts_openai_style_error(self):
        raw_key = "sk-test-raw-secret-1234567890"
        body = json.dumps(
            {
                "error": {
                    "message": f"The content[].thinking must be passed back. api_key={raw_key}",
                    "type": "invalid_request_error",
                    "code": "invalid_request_error",
                    "param": "content[].thinking",
                }
            }
        )

        diag = sse2json._upstream_error_diagnostics("upstream_http_error", body)

        self.assertEqual(diag["diagnostic_stage"], "upstream_http_error")
        self.assertEqual(diag["upstream_error_type"], "invalid_request_error")
        self.assertEqual(diag["upstream_error_code"], "invalid_request_error")
        self.assertEqual(diag["upstream_error_param"], "content[].thinking")
        self.assertNotIn(raw_key, str(diag))


if __name__ == "__main__":
    unittest.main()
