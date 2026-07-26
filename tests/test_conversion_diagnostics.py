import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from conversion_diagnostics import ConversionDiagnosticStore
from conversion_core import ConversionError
from router import Attempt
import sse2json


class ConversionDiagnosticStoreTests(unittest.TestCase):
    def config(self, root, **overrides):
        diagnostic = {
            "enabled": True,
            "path": "conversion_errors.jsonl",
            "queue_size": 8,
            "max_file_bytes": 4096,
            "retained_files": 2,
            "max_context_bytes": 4096,
        }
        diagnostic.update(overrides)
        return {
            "server": {"log_dir": root},
            "observability": {"conversion_diagnostics": diagnostic},
        }

    def test_record_redacts_secrets_and_exports_jsonl(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversionDiagnosticStore(self.config(root))
            try:
                self.assertTrue(store.record(
                    request_id="req-1",
                    stage="request",
                    source_format="responses",
                    target_format="chat_completions",
                    provider="alpha",
                    provider_model="alpha-model",
                    error=ValueError("bad Authorization: Bearer raw-secret"),
                    context={
                        "Authorization": "Bearer raw-secret",
                        "api_key": "sk-super-secret",
                        "proxy": "http://user:pass@127.0.0.1:8080",
                        "input": [{"type": "message", "content": "hello"}],
                    },
                ))
                self.assertTrue(store.flush(timeout=2))
                exported = store.export_bytes().decode("utf-8")
                record = json.loads(exported.strip())
            finally:
                store.close()

            self.assertNotIn("raw-secret", exported)
            self.assertNotIn("sk-super-secret", exported)
            self.assertNotIn("user:pass", exported)
            self.assertEqual(record["request_id"], "req-1")
            self.assertEqual(record["stage"], "request")
            self.assertEqual(record["source_format"], "responses")
            self.assertEqual(record["target_format"], "chat_completions")
            self.assertEqual(record["context"]["Authorization"], "[REDACTED]")
            self.assertEqual(record["context"]["api_key"], "[REDACTED]")

    def test_rotation_is_bounded_and_clear_removes_all_files(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversionDiagnosticStore(self.config(
                root,
                max_file_bytes=300,
                retained_files=2,
                max_context_bytes=256,
            ))
            try:
                for index in range(12):
                    store.record(
                        request_id=f"req-{index}",
                        stage="response",
                        source_format="chat_completions",
                        target_format="responses",
                        error=ValueError("x" * 120),
                        context={"payload": "y" * 120},
                    )
                self.assertTrue(store.flush(timeout=2))
                status = store.status()
                self.assertLessEqual(status["files"], 2)
                self.assertGreater(status["records"], 0)
                result = store.clear()
                self.assertGreaterEqual(result["files_removed"], 1)
                self.assertEqual(store.status()["bytes"], 0)
            finally:
                store.close()

    def test_disabled_store_does_not_create_file(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversionDiagnosticStore(self.config(root, enabled=False))
            try:
                self.assertFalse(store.record(request_id="req", error=ValueError("bad")))
                self.assertEqual(store.export_bytes(), b"")
                self.assertEqual(os.listdir(root), [])
            finally:
                store.close()

    def test_close_without_starting_worker_is_safe(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversionDiagnosticStore(self.config(root))
            self.assertIsNone(store._worker)
            store.close()
            self.assertIsNone(store._worker)
            self.assertFalse(store.record(request_id="closed", error=ValueError("bad")))

    def test_proxy_response_conversion_failure_is_recorded_without_provider_penalty(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversionDiagnosticStore(self.config(root))
            attempt = Attempt(
                request_id="req-response-conversion",
                attempt_no=1,
                provider="alpha",
                key_index=0,
                key="sk-super-secret-value",
                url="https://alpha.example/v1/responses",
                headers={"Authorization": "Bearer sk-super-secret-value"},
                provider_model="alpha-model",
                upstream_format="responses",
            )
            router = SimpleNamespace(failures=[])
            observed_attempts = []

            def report_failure(*args, **kwargs):
                router.failures.append((args, kwargs))
                return {"action": "cooldown"}

            router.report_failure = report_failure
            runtime = SimpleNamespace(
                router=router,
                observability=SimpleNamespace(
                    record_attempt=lambda *args, **kwargs: observed_attempts.append(kwargs),
                ),
            )
            attempt_errors = []
            error = ConversionError(
                "invalid tool arguments: Authorization: Bearer sk-super-secret-value",
                code="invalid_tool_arguments",
                source_format="responses",
                target_format="chat_completions",
                details={"raw": "sk-super-secret-value"},
            )
            try:
                with patch.object(sse2json, "CONVERSION_DIAGNOSTICS", store), patch.object(
                    sse2json, "_current_rt", return_value=runtime
                ), patch.object(sse2json, "_write_attempt_diagnostic_log"):
                    sse2json._record_proxy_exception(
                        "req-response-conversion",
                        attempt,
                        error,
                        attempt_errors,
                        conversion_target="chat_completions",
                        context={"Authorization": "Bearer sk-super-secret-value"},
                    )
                self.assertTrue(store.flush(timeout=2))
                exported = store.export_bytes().decode("utf-8")
            finally:
                store.close()

            self.assertEqual(router.failures, [])
            self.assertIn("invalid_tool_arguments", attempt_errors[0])
            self.assertEqual(observed_attempts[0]["error_type"], "conversion_error")
            self.assertEqual(observed_attempts[0]["failure_owner"], "proxy_conversion")
            self.assertNotIn("sk-super-secret-value", exported)
            record = json.loads(exported.strip())
            self.assertEqual(record["stage"], "response")
            self.assertEqual(record["source_format"], "responses")
            self.assertEqual(record["target_format"], "chat_completions")
            self.assertEqual(record["context"]["Authorization"], "[REDACTED]")

    def test_stream_conversion_failure_is_attributed_to_conversion_not_transport(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversionDiagnosticStore(self.config(root))
            attempt = Attempt(
                request_id="req-stream-conversion",
                attempt_no=2,
                provider="beta",
                key_index=1,
                key="beta-secret",
                url="https://beta.example/v1/responses",
                headers={},
                provider_model="beta-model",
                upstream_format="responses",
            )
            failures = []
            router = SimpleNamespace(report_failure=lambda *args, **kwargs: failures.append((args, kwargs)))
            observed_attempts = []
            runtime = SimpleNamespace(
                router=router,
                observability=SimpleNamespace(
                    record_attempt=lambda *args, **kwargs: observed_attempts.append(kwargs),
                ),
            )
            recorder = SimpleNamespace(
                errors=[ConversionError("broken streamed tool arguments", code="invalid_tool_arguments")],
                target_format="chat_completions",
                context={"chunk": {"arguments": "{"}},
            )
            attempt_errors = []
            try:
                with patch.object(sse2json, "CONVERSION_DIAGNOSTICS", store), patch.object(
                    sse2json, "_current_rt", return_value=runtime
                ), patch.object(sse2json, "_write_attempt_diagnostic_log"):
                    result = sse2json._record_stream_result_failure(
                        "req-stream-conversion",
                        attempt,
                        recorder,
                        attempt_errors,
                    )
                self.assertTrue(store.flush(timeout=2))
                record = json.loads(store.export_bytes().decode("utf-8").strip())
            finally:
                store.close()

            self.assertEqual(result, "conversion_error")
            self.assertEqual(failures, [])
            self.assertEqual(observed_attempts[0]["error_type"], "conversion_error")
            self.assertEqual(record["stage"], "stream")
            self.assertEqual(record["source_format"], "responses")
            self.assertEqual(record["target_format"], "chat_completions")


if __name__ == "__main__":
    unittest.main()
