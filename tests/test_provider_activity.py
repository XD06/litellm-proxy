import unittest

from observability import ProxyObservability
from router import Attempt


def _attempt(request_id, *, provider, attempt_no=1, outcome="success"):
    return Attempt(
        request_id=request_id,
        attempt_no=attempt_no,
        provider=provider,
        key_index=0,
        key="secret-key",
        url="https://example/v1/chat/completions",
        headers={"Authorization": "Bearer secret-key"},
        provider_model="m",
        upstream_format="chat_completions",
    )


def _obs():
    # Disable SQLite history so tests stay in-memory and deterministic.
    return ProxyObservability({"observability": {"history": {"enabled": False}}})


def _record(obs, request_id, *, attempts, status_code, first_byte_ms=0, final_provider=""):
    """Drive a request through start -> attempts -> end."""
    obs.record_request_start(
        request_id,
        client_format="chat_completions",
        endpoint="chat_completions",
        model="m",
        stream=False,
        path="/v1/chat/completions",
    )
    if first_byte_ms:
        obs.record_first_byte(request_id, first_byte_ms)
    for attempt, outcome in attempts:
        obs.record_attempt(request_id, attempt, outcome=outcome)
    obs.record_request_end(
        request_id,
        status_code=status_code,
    )
    # record_request_end appends to recent; patch routing_summary/final_provider
    # onto the stored recent item so provider_activity_summary can see it.
    with obs._lock:
        for item in obs._recent:
            if item.get("request_id") == request_id:
                item.setdefault("routing_summary", {})["final_provider"] = final_provider


class ProviderActivitySummaryTests(unittest.TestCase):
    def test_success_counts_and_latency(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, first_byte_ms=150, final_provider="alpha")
        summary = obs.provider_activity_summary()
        alpha = summary["alpha"]
        self.assertEqual(alpha["total"], 1)
        self.assertEqual(alpha["ok"], 1)
        self.assertEqual(alpha["warn"], 0)
        self.assertEqual(alpha["bad"], 0)
        self.assertEqual(alpha["successRate"], 1.0)
        self.assertEqual(alpha["latestLatency"], 150)
        self.assertEqual(alpha["avgLatency"], 150)
        self.assertIsNone(alpha["lastError"])

    def test_failed_attempt_records_reason_and_bad_tone(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "failed")], status_code=502, final_provider="alpha")
        summary = obs.provider_activity_summary()
        alpha = summary["alpha"]
        self.assertEqual(alpha["ok"], 0)
        self.assertEqual(alpha["bad"], 1)
        self.assertEqual(alpha["successRate"], 0.0)
        self.assertIsNotNone(alpha["lastError"])
        self.assertEqual(alpha["lastError"]["tone"], "bad")

    def test_failover_success_marks_secondary_provider_ok(self):
        obs = _obs()
        primary = _attempt("r1", provider="alpha", attempt_no=1)
        secondary = _attempt("r1", provider="beta", attempt_no=2)
        _record(
            obs,
            "r1",
            attempts=[(primary, "failed"), (secondary, "success")],
            status_code=200,
            first_byte_ms=200,
            final_provider="beta",
        )
        summary = obs.provider_activity_summary()
        # alpha had a failed attempt but the request overall succeeded via
        # failover -> warn tone (matches frontend providerActivity semantics:
        # no success on this provider, but request.status == success).
        self.assertEqual(summary["alpha"]["warn"], 1)
        self.assertEqual(summary["alpha"]["ok"], 0)
        self.assertEqual(summary["beta"]["ok"], 1)
        self.assertEqual(summary["beta"]["latestLatency"], 200)
        # alpha did not own the final success, so it has no latency sample.
        self.assertEqual(summary["alpha"]["latestLatency"], 0)

    def test_limit_clips_to_most_recent_events(self):
        obs = _obs()
        for i in range(5):
            a = _attempt(f"r{i}", provider="alpha")
            _record(obs, f"r{i}", attempts=[(a, "success")], status_code=200, first_byte_ms=10, final_provider="alpha")
        summary = obs.provider_activity_summary(limit=3)
        self.assertEqual(summary["alpha"]["total"], 3)
        self.assertEqual(summary["alpha"]["ok"], 3)

    def test_provider_without_activity_is_absent(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, final_provider="alpha")
        summary = obs.provider_activity_summary()
        self.assertIn("alpha", summary)
        self.assertNotIn("beta", summary)

    def test_empty_recent_returns_empty_dict(self):
        obs = _obs()
        summary = obs.provider_activity_summary()
        self.assertEqual(summary, {})

    def test_invalid_limit_falls_back_to_default(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, first_byte_ms=5, final_provider="alpha")
        # Non-numeric / out of range must not raise; should clamp sensibly.
        summary = obs.provider_activity_summary(limit="not-a-number")
        self.assertIn("alpha", summary)

    def test_events_omitted_by_default_to_keep_poll_light(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, first_byte_ms=9, final_provider="alpha")
        summary = obs.provider_activity_summary()
        # Aggregate stats still present so cards render.
        self.assertIn("alpha", summary)
        self.assertEqual(summary["alpha"]["ok"], 1)
        # The per-event list is intentionally absent on the poll path; the
        # drawer fetches it on demand via provider_activity_summary(include_events=True).
        self.assertNotIn("events", summary["alpha"])

    def test_events_returned_when_requested(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, first_byte_ms=9, final_provider="alpha")
        summary = obs.provider_activity_summary(include_events=True)
        self.assertIn("events", summary["alpha"])
        self.assertEqual(len(summary["alpha"]["events"]), 1)
        self.assertEqual(summary["alpha"]["events"][0]["model"], "m")


class SnapshotLiteTests(unittest.TestCase):
    def test_lite_omits_recent_requests(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, first_byte_ms=12, final_provider="alpha")
        lite = obs.snapshot_lite()
        self.assertNotIn("recent_requests", lite)
        # counters and failure_summary remain so dashboards still render.
        self.assertIn("counters", lite)
        self.assertIn("failure_summary", lite)
        self.assertIn("active_requests", lite)
        self.assertEqual(lite["counters"]["requests_total"], 1)

    def test_full_snapshot_still_carries_recent_requests(self):
        obs = _obs()
        a = _attempt("r1", provider="alpha")
        _record(obs, "r1", attempts=[(a, "success")], status_code=200, final_provider="alpha")
        full = obs.snapshot()
        self.assertIn("recent_requests", full)
        self.assertEqual(len(full["recent_requests"]), 1)


if __name__ == "__main__":
    unittest.main()
