import time
import unittest
from unittest.mock import patch

from pricing_resolver import PricingResolver


class FakeHistory:
    def __init__(self, *, fail_backfill=False):
        self.backfilled = []
        self.unpriced = []
        self.fail_backfill = fail_backfill

    def backfill_pending_pricing(self, provider, provider_model, snapshot):
        if self.fail_backfill:
            raise RuntimeError("database unavailable")
        self.backfilled.append((provider, provider_model, snapshot))

    def mark_pending_unpriced(self, provider, provider_model):
        self.unpriced.append((provider, provider_model))


def wait_until(predicate, timeout=1.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.005)
    return bool(predicate())


class PricingResolverTests(unittest.TestCase):
    def config(self, **pricing):
        return {
            "observability": {
                "pricing": {
                    "resolve_missing_prices": True,
                    "max_retries": 2,
                    "retry_backoff_s": 0.01,
                    "connect_timeout_s": 1,
                    "total_timeout_s": 2,
                    **pricing,
                }
            }
        }

    def test_deduplicates_inflight_lookup_and_backfills_after_retry(self):
        history = FakeHistory()
        resolver = PricingResolver(self.config(), history)
        snapshot = {
            "input_per_million": 1,
            "output_per_million": 2,
            "cache_read_per_million": 0.1,
            "cache_write_per_million": 1,
            "source": "aa_cache",
        }
        calls = []

        def fetch(provider, provider_model):
            calls.append((provider, provider_model))
            return None if len(calls) == 1 else snapshot

        with patch.object(resolver, "_fetch", side_effect=fetch):
            self.assertTrue(resolver.enqueue("alpha", "model-a"))
            self.assertFalse(resolver.enqueue("alpha", "model-a"))
            self.assertTrue(wait_until(lambda: len(history.backfilled) == 1))

        resolver.shutdown()
        self.assertEqual(calls, [("alpha", "model-a"), ("alpha", "model-a")])
        self.assertEqual(history.backfilled[0], ("alpha", "model-a", snapshot))
        self.assertEqual(resolver.snapshot()["queued"], 0)

    def test_exhausted_retries_mark_pending_rows_unpriced_once(self):
        history = FakeHistory()
        resolver = PricingResolver(self.config(max_retries=2), history)

        with patch.object(resolver, "_fetch", return_value=None) as fetch:
            self.assertTrue(resolver.enqueue("alpha", "missing-model"))
            self.assertTrue(wait_until(lambda: history.unpriced == [("alpha", "missing-model")]))

        resolver.shutdown()
        self.assertEqual(fetch.call_count, 3)
        self.assertEqual(resolver.snapshot()["failures"], 1)

    def test_backfill_failure_is_counted_without_dropping_resolved_snapshot(self):
        history = FakeHistory(fail_backfill=True)
        resolver = PricingResolver(self.config(max_retries=0), history)
        snapshot = {"input_per_million": 1, "output_per_million": 2, "source": "aa_cache"}

        with patch.object(resolver, "_fetch", return_value=snapshot):
            self.assertTrue(resolver.enqueue("alpha", "model-a"))
            self.assertTrue(wait_until(lambda: resolver.snapshot()["backfill_failures"] == 1))

        resolver.shutdown()
        self.assertEqual(resolver.local_snapshot("alpha", "model-a"), snapshot)

    def test_fetch_forwards_independent_short_timeouts(self):
        resolver = PricingResolver(self.config(connect_timeout_s=2, total_timeout_s=5), FakeHistory())
        snapshot = {"input_per_million": 1, "output_per_million": 2, "source": "aa_cache"}

        with patch("artificial_analysis_api.aa.get", return_value={"summary": {}}) as get, patch(
            "pricing_resolver.resolve_price_snapshot", return_value=snapshot
        ):
            result = resolver._fetch("alpha", "model-a")

        resolver.shutdown()
        self.assertEqual(result, snapshot)
        get.assert_called_once_with(
            "model-a",
            proxy=None,
            connect_timeout_s=2.0,
            total_timeout_s=5.0,
        )


if __name__ == "__main__":
    unittest.main()
