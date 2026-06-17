import threading
import time
import unittest

from model_discovery_queue import ModelDiscoveryQueue


class _FakeStore:
    """Minimal in-memory snapshot store + fetch recorder for tests."""
    def __init__(self):
        self.lock = threading.Lock()
        self.snapshots = {}   # provider -> {"status": "ok"|"error"}
        self.fetched = []     # ordered list of providers fetched
        self.fetch_slow = {}  # provider -> seconds to sleep inside fetch

    def fetch(self, provider):
        # Simulate per-provider latency if requested.
        delay = self.fetch_slow.get(provider, 0)
        if delay:
            time.sleep(delay)
        with self.lock:
            self.fetched.append(provider)

    def get_snapshot(self, provider):
        with self.lock:
            return self.snapshots.get(provider)

    def set_status(self, provider, status):
        with self.lock:
            self.snapshots[provider] = {"status": status}


def _make_queue(store, providers, *, ok_ttl_s=1, retry_interval_s=1, inter_fetch_pause_s=0):
    return ModelDiscoveryQueue(
        fetch_provider_fn=store.fetch,
        get_snapshot_fn=store.get_snapshot,
        providers_fn=lambda: list(providers),
        enabled_fn=lambda: True,
        ok_ttl_s=ok_ttl_s,
        retry_interval_s=retry_interval_s,
        inter_fetch_pause_s=inter_fetch_pause_s,
    )


class ModelDiscoveryQueueTests(unittest.TestCase):
    def test_fetches_each_provider_once_when_ok(self):
        store = _FakeStore()
        providers = ["alpha", "beta", "gamma"]
        for p in providers:
            store.set_status(p, "ok")
        q = _make_queue(store, providers, ok_ttl_s=60, retry_interval_s=60)
        q.start()
        # Wait until all three have been fetched once.
        deadline = time.time() + 5
        while time.time() < deadline:
            with store.lock:
                if len(store.fetched) >= 3:
                    break
            time.sleep(0.05)
        q.stop()
        with store.lock:
            self.assertEqual(sorted(store.fetched), ["alpha", "beta", "gamma"])

    def test_retries_failed_provider_after_retry_interval(self):
        store = _FakeStore()
        providers = ["flaky"]
        # No snapshot set -> treated as missing -> retry cadence applies.
        q = _make_queue(store, providers, ok_ttl_s=60, retry_interval_s=1, inter_fetch_pause_s=0)
        q.start()
        # First fetch happens quickly.
        deadline = time.time() + 5
        while time.time() < deadline:
            with store.lock:
                if len(store.fetched) >= 1:
                    break
            time.sleep(0.05)
        first_count = len(store.fetched)
        self.assertGreaterEqual(first_count, 1)
        # The store has no ok snapshot for flaky, so the queue should retry
        # within ~retry_interval_s. Wait for a second fetch.
        deadline = time.time() + 4
        while time.time() < deadline:
            with store.lock:
                if len(store.fetched) >= 2:
                    break
            time.sleep(0.05)
        q.stop()
        with store.lock:
            self.assertGreaterEqual(len(store.fetched), 2,
                                    "failed/missing provider should be retried")

    def test_ok_snapshot_not_refetched_within_ttl(self):
        store = _FakeStore()
        providers = ["alpha"]
        store.set_status("alpha", "ok")
        q = _make_queue(store, providers, ok_ttl_s=60, retry_interval_s=60)
        q.start()
        # Wait for the first fetch.
        deadline = time.time() + 5
        while time.time() < deadline:
            with store.lock:
                if len(store.fetched) >= 1:
                    break
            time.sleep(0.05)
        first = len(store.fetched)
        # Sleep a short while; with a 60s TTL it must NOT be fetched again.
        time.sleep(1.5)
        q.stop()
        with store.lock:
            self.assertEqual(len(store.fetched), 1,
                             "ok snapshot must not be re-fetched within TTL")
            self.assertEqual(store.fetched, ["alpha"])

    def test_enqueue_force_bypasses_cooldown(self):
        store = _FakeStore()
        providers = ["alpha"]
        store.set_status("alpha", "ok")
        q = _make_queue(store, providers, ok_ttl_s=60, retry_interval_s=60)
        q.start()
        deadline = time.time() + 5
        while time.time() < deadline:
            with store.lock:
                if len(store.fetched) >= 1:
                    break
            time.sleep(0.05)
        # Now force-enqueue even though TTL is far in the future.
        q.enqueue("alpha", force=True)
        deadline = time.time() + 5
        while time.time() < deadline:
            with store.lock:
                if len(store.fetched) >= 2:
                    break
            time.sleep(0.05)
        q.stop()
        with store.lock:
            self.assertGreaterEqual(len(store.fetched), 2,
                                    "force enqueue should bypass the TTL cooldown")

    def test_snapshot_status_reports_queue_state(self):
        store = _FakeStore()
        providers = ["alpha", "beta"]
        store.set_status("alpha", "ok")
        q = _make_queue(store, providers, ok_ttl_s=60, retry_interval_s=60)
        status = q.snapshot_status()
        self.assertIn("running", status)
        self.assertIn("queued", status)
        self.assertEqual(status["ok_ttl_s"], 60)


if __name__ == "__main__":
    unittest.main()
