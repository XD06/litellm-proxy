import os
import tempfile
import unittest

from observability import ProxyObservability
from router import Attempt


def make_attempt(
    request_id,
    *,
    provider="alpha",
    key_index=0,
    provider_model="alpha-model",
    upstream_format="chat_completions",
):
    return Attempt(
        request_id=request_id,
        attempt_no=1,
        provider=provider,
        key_index=key_index,
        key="secret-key",
        url="https://alpha.example/v1/chat/completions",
        headers={"Authorization": "Bearer secret-key"},
        provider_model=provider_model,
        upstream_format=upstream_format,
    )


class ObservabilityTests(unittest.TestCase):
    def test_records_request_attempt_and_recent_snapshot(self):
        obs = ProxyObservability(
            {
                "observability": {"recent_requests_limit": 2},
                "providers": {"alpha": {"pricing": {"input_per_million": 1.0, "output_per_million": 2.0}}},
            }
        )
        attempt = Attempt(
            request_id="req-1",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="secret-key",
            url="https://alpha.example/v1/chat/completions",
            headers={"Authorization": "Bearer secret-key"},
            provider_model="alpha-model",
            upstream_format="chat_completions",
        )

        obs.record_request_start(
            "req-1",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="client-model",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_first_byte("req-1", 123)
        obs.record_attempt("req-1", attempt, outcome="success", usage={"prompt_tokens": 4, "completion_tokens": 6})
        obs.record_request_end("req-1", status_code=200)

        snap = obs.snapshot()

        self.assertEqual(snap["counters"]["requests_total"], 1)
        self.assertEqual(snap["counters"]["requests_success"], 1)
        self.assertEqual(snap["counters"]["attempts_success"], 1)
        self.assertEqual(snap["counters"]["by_provider"]["alpha"]["success"], 1)
        self.assertEqual(snap["counters"]["usage"]["input_tokens"], 4)
        self.assertEqual(snap["counters"]["usage"]["output_tokens"], 6)
        self.assertEqual(snap["counters"]["usage"]["total_tokens"], 10)
        self.assertAlmostEqual(snap["counters"]["usage"]["cost_usd"], 0.000016)
        self.assertEqual(snap["counters"]["by_provider"]["alpha"]["usage"]["total_tokens"], 10)
        self.assertEqual(snap["counters"]["by_model_usage"]["client-model"]["output_tokens"], 6)
        self.assertEqual(snap["recent_requests"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(snap["recent_requests"][0]["first_byte_ms"], 123)
        self.assertAlmostEqual(snap["recent_requests"][0]["cost_usd"], 0.000016)
        self.assertEqual(snap["recent_requests"][0]["attempts"][0]["provider"], "alpha")
        self.assertEqual(snap["recent_requests"][0]["attempts"][0]["provider_model"], "alpha-model")
        self.assertEqual(snap["recent_requests"][0]["attempts"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(snap["recent_requests"][0]["attempts"][0]["key_masked"], "se**ey")
        self.assertEqual(len(snap["recent_requests"][0]["attempts"][0]["key_id"]), 10)
        self.assertNotIn("secret-key", str(snap))

    def test_sqlite_history_restores_recent_requests_on_restart(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            cfg = {
                "observability": {
                    "recent_requests_limit": 5,
                    "history": {"enabled": True, "path": os.path.join(tmp, "history.sqlite3")},
                },
            }
            obs = ProxyObservability(cfg)
            obs.record_request_start(
                "req-restore",
                client_format="chat_completions",
                endpoint="chat_completions",
                model="client-model",
                stream=False,
                path="/v1/chat/completions",
            )
            obs.record_first_byte("req-restore", 77)
            obs.record_attempt("req-restore", make_attempt("req-restore", provider="alpha"), outcome="success")
            obs.record_request_end("req-restore", status_code=200)

            restored = ProxyObservability(cfg)
            snap = restored.snapshot()

            self.assertEqual(snap["counters"]["requests_total"], 1)
            self.assertEqual([item["request_id"] for item in snap["recent_requests"]], ["req-restore"])
            self.assertEqual(snap["recent_requests"][0]["first_byte_ms"], 77)
            self.assertEqual(snap["recent_requests"][0]["attempts"][0]["provider"], "alpha")

    def test_records_failure_reason_breakdowns(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 2}})
        attempt = Attempt(
            request_id="req-1",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="secret-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="alpha-model",
            upstream_format="chat_completions",
        )

        obs.record_request_start(
            "req-1",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="client-model",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_attempt(
            "req-1",
            attempt,
            outcome="failed",
            error_type="server_error",
            reason="provider_mismatch",
            http_status=400,
            diagnostic_stage="upstream_http_error",
            upstream_error_summary="The content thinking block must be passed back.",
            upstream_error_type="invalid_request_error",
            upstream_error_code="invalid_request_error",
            upstream_error_param="content[].thinking",
        )
        obs.record_request_end("req-1", status_code=502)

        snap = obs.snapshot()
        failed_attempt = snap["recent_requests"][0]["attempts"][0]

        self.assertEqual(snap["counters"]["by_error_type"]["server_error"], 1)
        self.assertEqual(snap["counters"]["by_failure_reason"]["provider_mismatch"], 1)
        self.assertEqual(snap["counters"]["by_attempt_http_status"]["400"], 1)
        self.assertEqual(snap["counters"]["request_failure_rate"], 1.0)
        self.assertEqual(snap["counters"]["attempt_failure_rate"], 1.0)
        self.assertEqual(snap["counters"]["by_provider"]["alpha"]["failure_rate"], 1.0)
        self.assertEqual(snap["failure_summary"]["failed_requests"], 1)
        self.assertEqual(snap["failure_summary"]["requests_with_failed_attempts"], 1)
        self.assertEqual(snap["failure_summary"]["failed_attempts"], 1)
        self.assertEqual(snap["failure_summary"]["by_provider"]["alpha"], 1)
        self.assertEqual(snap["failure_summary"]["by_upstream_format"]["chat_completions"], 1)
        self.assertEqual(snap["failure_summary"]["by_http_status"]["400"], 1)
        self.assertEqual(failed_attempt["reason"], "provider_mismatch")
        self.assertEqual(failed_attempt["diagnostic_stage"], "upstream_http_error")
        self.assertEqual(failed_attempt["upstream_error_summary"], "The content thinking block must be passed back.")
        self.assertEqual(failed_attempt["upstream_error_type"], "invalid_request_error")
        self.assertEqual(failed_attempt["upstream_error_code"], "invalid_request_error")
        self.assertEqual(failed_attempt["upstream_error_param"], "content[].thinking")

    def test_recent_requests_limit_is_enforced(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 1}})
        for i in range(2):
            rid = f"req-{i}"
            obs.record_request_start(
                rid,
                client_format="responses",
                endpoint="responses",
                model=f"model-{i}",
                stream=False,
                path="/openai/v1/responses",
            )
            obs.record_request_end(rid, status_code=502, error="failed")

        snap = obs.snapshot()

        self.assertEqual(len(snap["recent_requests"]), 1)
        self.assertEqual(snap["recent_requests"][0]["request_id"], "req-1")
        self.assertEqual(snap["counters"]["requests_failed"], 2)

    def test_list_requests_filters_and_summarizes_recent_requests(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})

        obs.record_request_start(
            "req-ok",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="model-ok",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_attempt("req-ok", make_attempt("req-ok", provider="alpha"), outcome="success")
        obs.record_request_end("req-ok", status_code=200)

        obs.record_request_start(
            "req-fail",
            client_format="responses",
            endpoint="responses",
            model="model-fail",
            stream=False,
            path="/openai/v1/responses",
        )
        obs.record_attempt(
            "req-fail",
            make_attempt("req-fail", provider="beta", upstream_format="responses"),
            outcome="failed",
            error_type="server_error",
            reason="provider_mismatch",
            http_status=500,
        )
        obs.record_request_end("req-fail", status_code=502, error="upstream failed")

        listed = obs.list_requests(filters={"provider": "beta", "status": "failed"})

        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["filters"], {"provider": "beta", "status": "failed"})
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")
        self.assertEqual(listed["items"][0]["providers"], ["beta"])
        self.assertEqual(listed["items"][0]["attempts_count"], 1)
        self.assertEqual(listed["items"][0]["error_types"], ["server_error"])
        self.assertEqual(listed["items"][0]["failure_reasons"], ["provider_mismatch"])
        self.assertEqual(listed["items"][0]["attempt_http_statuses"], ["500"])
        self.assertEqual(listed["items"][0]["attempt_outcomes"], ["failed"])
        self.assertEqual(listed["items"][0]["routing_summary"]["outcome"], "failed")
        self.assertIn("final reason", listed["items"][0]["routing_summary"]["headline"])
        self.assertEqual(
            obs.list_requests(filters={"upstream_format": "responses", "failure_reason": "provider_mismatch"})["total"],
            1,
        )
        self.assertEqual(obs.list_requests(filters={"http_status": "500"})["total"], 1)
        self.assertEqual(obs.list_requests(filters={"status_code": "502"})["total"], 1)
        self.assertEqual(obs.list_requests(filters={"upstream_format": "anthropic_messages"})["total"], 0)
        self.assertNotIn("secret-key", str(listed))

    def test_clear_history_resets_memory_counters_and_recent_requests(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})
        obs.record_request_start(
            "req-ok",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="model-ok",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_attempt("req-ok", make_attempt("req-ok", provider="alpha"), outcome="success")
        obs.record_request_end("req-ok", status_code=200)

        result = obs.clear_history()
        snap = obs.snapshot()

        self.assertTrue(result["memory"]["recent_requests_cleared"])
        self.assertTrue(result["memory"]["counters_reset"])
        self.assertEqual(snap["recent_requests"], [])
        self.assertEqual(snap["counters"]["requests_total"], 0)
        self.assertEqual(obs.list_requests()["total"], 0)

    def test_delete_requests_removes_selected_recent_requests(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})
        for rid in ("req-ok", "req-fail"):
            obs.record_request_start(
                rid,
                client_format="chat_completions",
                endpoint="chat_completions",
                model=rid,
                stream=False,
                path="/v1/chat/completions",
            )
            obs.record_attempt(rid, make_attempt(rid), outcome="success")
            obs.record_request_end(rid, status_code=200)

        result = obs.delete_requests(["req-ok"])
        snap = obs.snapshot()

        self.assertEqual(result["memory"]["recent_requests_deleted"], 1)
        self.assertEqual([item["request_id"] for item in snap["recent_requests"]], ["req-fail"])
        self.assertEqual(obs.list_requests()["total"], 1)

    def test_delete_matching_requests_removes_recent_without_resetting_counters(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})
        for rid, provider, status_code in (
            ("req-ok", "alpha", 200),
            ("req-fail", "beta", 502),
            ("req-other", "beta", 200),
        ):
            obs.record_request_start(
                rid,
                client_format="chat_completions",
                endpoint="chat_completions",
                model=rid,
                stream=False,
                path="/v1/chat/completions",
            )
            obs.record_attempt(
                rid,
                make_attempt(rid, provider=provider),
                outcome="success" if status_code < 400 else "failed",
                error_type="" if status_code < 400 else "server_error",
                http_status=None if status_code < 400 else 502,
            )
            obs.record_request_end(rid, status_code=status_code)
        before = obs.snapshot()["counters"].copy()

        result = obs.delete_matching_requests({"provider": "beta", "status": "failed"})
        snap = obs.snapshot()

        self.assertEqual(result["memory"]["recent_requests_deleted"], 1)
        self.assertEqual([item["request_id"] for item in snap["recent_requests"]], ["req-other", "req-ok"])
        self.assertEqual(snap["counters"]["requests_total"], before["requests_total"])
        self.assertEqual(snap["counters"]["requests_failed"], before["requests_failed"])
        self.assertEqual(snap["counters"]["attempts_failed"], before["attempts_failed"])

    def test_get_request_finds_recent_and_active_requests(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})

        obs.record_request_start(
            "req-active",
            client_format="anthropic_messages",
            endpoint="messages",
            model="model-active",
            stream=True,
            path="/anthropic/v1/messages",
        )
        active = obs.get_request("req-active")
        self.assertEqual(active["state"], "active")
        self.assertEqual(active["request_id"], "req-active")

        obs.record_attempt("req-active", make_attempt("req-active"), outcome="success")
        obs.record_request_end("req-active", status_code=200)
        finished = obs.get_request("req-active")

        self.assertEqual(finished["state"], "finished")
        self.assertEqual(finished["status_code"], 200)
        self.assertEqual(finished["attempts"][0]["provider"], "alpha")
        self.assertEqual(finished["routing_summary"]["outcome"], "direct_success")
        self.assertIn("routing_explanation", finished["attempts"][0])
        self.assertIn("First eligible candidate", finished["attempts"][0]["routing_explanation"]["selected"])
        self.assertIsNone(obs.get_request("missing"))

    def test_routing_summary_explains_recovered_request(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})
        obs.record_request_start(
            "req-recovered",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="client-model",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_attempt(
            "req-recovered",
            make_attempt("req-recovered", provider="opencode"),
            outcome="failed",
            error_type="empty_visible_output",
            reason="empty_visible_output_retry",
            http_status=200,
        )
        obs.record_attempt(
            "req-recovered",
            make_attempt("req-recovered", provider="deepseek", upstream_format="anthropic_messages"),
            outcome="success",
        )
        obs.record_request_end("req-recovered", status_code=200)

        detail = obs.get_request("req-recovered")

        self.assertEqual(detail["routing_summary"]["outcome"], "recovered")
        self.assertEqual(detail["routing_summary"]["failed_attempts"], 1)
        self.assertIn("Recovered on attempt", detail["routing_summary"]["headline"])
        self.assertIn("switched to the next distinct", detail["attempts"][0]["routing_explanation"]["next_step"])
        self.assertEqual(detail["attempts"][1]["routing_explanation"]["tone"], "success")
        self.assertNotIn("secret-key", str(detail))

    def test_timeseries_groups_recent_requests_for_charts(self):
        obs = ProxyObservability({"observability": {"recent_requests_limit": 10}})
        for rid, status in (("req-ok", 200), ("req-fail", 502)):
            obs.record_request_start(
                rid,
                client_format="chat_completions",
                endpoint="chat_completions",
                model="chart-model",
                stream=False,
                path="/v1/chat/completions",
            )
            outcome = "success" if status < 400 else "failed"
            obs.record_first_byte(rid, 100 if status < 400 else 250)
            obs.record_attempt(
                rid,
                make_attempt(rid, provider="alpha"),
                outcome=outcome,
                usage={"input_tokens": 2, "output_tokens": 3} if status < 400 else None,
            )
            obs.record_request_end(rid, status_code=status)

        series = obs.timeseries(bucket_s=60, buckets=1)

        self.assertEqual(series["source"], "memory")
        self.assertEqual(len(series["buckets"]), 1)
        self.assertEqual(series["buckets"][0]["requests"], 2)
        self.assertEqual(series["buckets"][0]["success"], 1)
        self.assertEqual(series["buckets"][0]["failed"], 1)
        self.assertEqual(series["buckets"][0]["by_client_format"]["chat_completions"], 2)
        self.assertEqual(series["buckets"][0]["by_provider_attempts"]["alpha"], 2)
        self.assertEqual(series["buckets"][0]["by_status"]["200"], 1)
        self.assertEqual(series["buckets"][0]["by_status"]["502"], 1)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["attempts"], 2)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["success"], 1)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["failed"], 1)
        self.assertEqual(series["buckets"][0]["usage"]["input_tokens"], 2)
        self.assertEqual(series["buckets"][0]["usage"]["output_tokens"], 3)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["usage"]["total_tokens"], 5)
        self.assertEqual(series["buckets"][0]["by_model_usage"]["chart-model"]["total_tokens"], 5)
        self.assertEqual(series["buckets"][0]["duration_ms_count"], 2)
        self.assertGreaterEqual(series["buckets"][0]["duration_ms_total"], 0)
        self.assertGreaterEqual(series["buckets"][0]["duration_ms_avg"], 0)
        self.assertGreaterEqual(series["buckets"][0]["duration_ms_max"], 0)
        self.assertGreaterEqual(series["buckets"][0]["duration_ms_min"], 0)
        self.assertEqual(series["buckets"][0]["first_byte_ms_count"], 2)
        self.assertEqual(series["buckets"][0]["first_byte_ms_total"], 350)
        self.assertEqual(series["buckets"][0]["first_byte_ms_avg"], 175)
        self.assertEqual(series["buckets"][0]["first_byte_ms_max"], 250)
        self.assertEqual(series["buckets"][0]["first_byte_ms_min"], 100)


if __name__ == "__main__":
    unittest.main()
