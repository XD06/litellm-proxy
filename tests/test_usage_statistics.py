import os
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from history_store import RequestHistoryStore
from tests.test_history_store import sample_request
from usage_statistics import UsageStatisticsStore


class UsageStatisticsTests(unittest.TestCase):
    def temp_db(self):
        fd, path = tempfile.mkstemp(suffix=".sqlite3")
        os.close(fd)
        os.unlink(path)

        def cleanup():
            for candidate in (path, f"{path}-wal", f"{path}-shm"):
                try:
                    if os.path.exists(candidate):
                        os.unlink(candidate)
                except PermissionError:
                    pass

        self.addCleanup(cleanup)
        return path

    def config(self, path, *, timezone="UTC", retention_days=30):
        return {
            "observability": {
                "history": {
                    "enabled": True,
                    "path": path,
                    "retention_days": retention_days,
                    "sync_mode": True,
                },
                "usage_statistics": {
                    "enabled": True,
                    "hourly_retention_days": 90,
                    "reporting_timezone": timezone,
                },
            }
        }

    def store(self, *, path=None, timezone="UTC", retention_days=30):
        return RequestHistoryStore(
            self.config(path or self.temp_db(), timezone=timezone, retention_days=retention_days)
        )

    def test_summary_is_idempotent_and_separates_request_from_attempt_usage(self):
        store = self.store()
        item = sample_request("req-once")

        store.record_request(item)
        store.record_request(item)
        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["attempts"], 1)
        self.assertEqual(summary["usage"]["total_tokens"], 10)
        self.assertAlmostEqual(summary["cost"]["known_usd"], 0.000016)

    def test_admin_and_health_probes_do_not_pollute_user_usage_statistics(self):
        store = self.store()
        real = sample_request("req-real")
        admin = sample_request("req-admin-probe")
        admin["client_format"] = "admin_probe"
        admin["endpoint"] = "key_test"
        health = sample_request("req-health-probe")
        health["client_format"] = "health_probe"
        health["endpoint"] = "patrol_probe"

        store.record_request(real)
        store.record_request(admin)
        store.record_request(health)
        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(store.list_requests()["total"], 3)
        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["attempts"], 1)
        self.assertEqual(summary["usage"]["total_tokens"], 10)
        status = store.usage_statistics_status()
        self.assertEqual(status["backfill"]["eligible"], 1)
        self.assertEqual(status["backfill"]["remaining"], 0)

    def test_no_attempt_request_counts_result_without_inventing_usage(self):
        store = self.store()
        item = sample_request("req-no-candidate", status_code=503)
        item["attempts"] = []
        item["usage"] = {}
        item["cost_usd"] = 0
        item["cost_status"] = "legacy"

        store.record_request(item)
        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["attempts"], 0)
        self.assertEqual(summary["usage"]["total_tokens"], 0)
        self.assertEqual(summary["cost"]["statuses"]["legacy"], 0)

    def test_client_model_breakdown_combines_upstream_variants_and_providers(self):
        store = self.store()
        for index, (provider, upstream) in enumerate(
            (("alpha", "grok-4.3-low"), ("beta", "grok-4.3-high"))
        ):
            item = sample_request(f"req-variant-{index}", provider=provider)
            item["model"] = "grok-4.3"
            item["attempts"][0]["provider_model"] = upstream
            store.record_request(item)

        models = store.usage_statistics_breakdown(
            range_name="all", group_by="model"
        )
        providers = store.usage_statistics_breakdown(
            range_name="all", group_by="provider"
        )

        self.assertEqual(models["total"], 1)
        self.assertEqual(models["items"][0]["dimension"], "grok-4.3")
        self.assertEqual(models["items"][0]["requests"], 2)
        self.assertEqual(models["items"][0]["usage"]["total_tokens"], 20)
        self.assertEqual({item["dimension"] for item in providers["items"]}, {"alpha", "beta"})

    def test_recovered_request_attributes_attempt_usage_and_cost_to_actual_providers(self):
        store = self.store()
        item = sample_request("req-recovered", provider="recovery")
        item["model"] = "deepseek-v4"
        item["duration_ms"] = 1000
        item["first_byte_ms"] = 400
        item["attempts"] = [
            {
                "attempt_no": 1,
                "provider": "failed-provider",
                "provider_model": "deepseek/failed",
                "upstream_format": "chat_completions",
                "outcome": "failed",
                "usage": {"input_tokens": 3, "output_tokens": 1, "total_tokens": 4},
                "cost_usd": 0.1,
                "cost_status": "priced",
                "duration_ms": 100,
            },
            {
                "attempt_no": 2,
                "provider": "recovery",
                "provider_model": "deepseek/success",
                "upstream_format": "chat_completions",
                "outcome": "success",
                "usage": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
                "cost_usd": 0.2,
                "cost_status": "priced",
                "duration_ms": 500,
            },
        ]
        store.record_request(item)

        summary = store.usage_statistics_summary(range_name="all")["summary"]
        providers = store.usage_statistics_breakdown(
            range_name="all", group_by="provider", sort="cost"
        )["items"]
        by_provider = {entry["dimension"]: entry for entry in providers}

        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["recovered"], 1)
        self.assertEqual(summary["attempts"], 2)
        self.assertEqual(summary["usage"]["total_tokens"], 11)
        self.assertAlmostEqual(summary["cost"]["known_usd"], 0.3)
        self.assertEqual(by_provider["failed-provider"]["requests"], 0)
        self.assertEqual(by_provider["failed-provider"]["usage"]["total_tokens"], 4)
        self.assertAlmostEqual(by_provider["failed-provider"]["cost"]["known_usd"], 0.1)
        self.assertEqual(by_provider["recovery"]["requests"], 1)
        self.assertEqual(by_provider["recovery"]["usage"]["total_tokens"], 7)
        with store._connection() as conn:
            snapshot_bytes = conn.execute(
                "SELECT LENGTH(contribution_snapshot) FROM usage_statistics_ledger"
            ).fetchone()[0]
        self.assertLess(snapshot_bytes, 1200)

    def test_pending_pricing_backfill_applies_only_the_cost_delta(self):
        store = self.store()
        item = sample_request("req-pending", provider="alpha")
        item["cost_usd"] = 0
        item["cost_status"] = "pending"
        item["attempts"][0].update({"cost_usd": 0, "cost_status": "pending"})
        store.record_request(item)
        before = store.usage_statistics_summary(range_name="all")["summary"]
        snapshot = {
            "input_per_million": 1,
            "cache_read_per_million": 0.1,
            "cache_write_per_million": 1,
            "output_per_million": 2,
            "source": "aa_cache",
            "resolved_model": "provider-model",
            "resolved_at": int(time.time()),
            "complete": True,
        }

        store.backfill_pending_pricing("alpha", "provider-model", snapshot)
        store.backfill_pending_pricing("alpha", "provider-model", snapshot)
        after = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(before["cost"]["statuses"]["pending"], 1)
        self.assertEqual(after["requests"], 1)
        self.assertEqual(after["usage"]["total_tokens"], 10)
        self.assertEqual(after["cost"]["statuses"]["pending"], 0)
        self.assertEqual(after["cost"]["statuses"]["priced"], 1)
        self.assertAlmostEqual(after["cost"]["known_usd"], 0.000016)

    def test_same_second_post_clear_request_can_receive_pricing_backfill(self):
        store = self.store()
        store.record_request(sample_request("req-before-clear"))
        cleared = store.clear_usage_statistics()
        item = sample_request("req-same-second", provider="alpha")
        item["finished_at"] = cleared["backfill_cutoff_at"]
        item["started_at"] = item["finished_at"] - 1
        item["cost_usd"] = 0
        item["cost_status"] = "pending"
        item["attempts"][0].update({"cost_usd": 0, "cost_status": "pending"})
        store.record_request(item)
        snapshot = {
            "input_per_million": 1,
            "cache_read_per_million": 0.1,
            "cache_write_per_million": 1,
            "output_per_million": 2,
            "source": "aa_cache",
            "resolved_model": "provider-model",
            "resolved_at": int(time.time()),
            "complete": True,
        }

        store.backfill_pending_pricing("alpha", "provider-model", snapshot)
        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["cost"]["statuses"]["pending"], 0)
        self.assertEqual(summary["cost"]["statuses"]["priced"], 1)
        self.assertAlmostEqual(summary["cost"]["known_usd"], 0.000016)

    def test_deleting_request_detail_does_not_change_permanent_statistics(self):
        store = self.store()
        store.record_request(sample_request("req-delete-stats"))
        before = store.usage_statistics_summary(range_name="all")["summary"]

        store.delete_requests(["req-delete-stats"])
        after = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(store.list_requests()["total"], 0)
        self.assertEqual(after, before)

    def test_deleting_pending_detail_freezes_cost_status_as_unpriced(self):
        store = self.store()
        item = sample_request("req-delete-pending", provider="alpha")
        item["cost_usd"] = 0
        item["cost_status"] = "pending"
        item["attempts"][0].update({"cost_usd": 0, "cost_status": "pending"})
        store.record_request(item)

        store.delete_requests(["req-delete-pending"])
        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["usage"]["total_tokens"], 10)
        self.assertEqual(summary["cost"]["statuses"]["pending"], 0)
        self.assertEqual(summary["cost"]["statuses"]["unpriced"], 1)

    def test_clearing_request_history_keeps_permanent_statistics(self):
        store = self.store()
        store.record_request(sample_request("req-clear-history"))
        before = store.usage_statistics_summary(range_name="all")["summary"]

        store.clear()
        after = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(store.list_requests()["total"], 0)
        self.assertEqual(after, before)

    def test_clearing_request_history_freezes_pending_cost_as_unpriced(self):
        store = self.store()
        item = sample_request("req-clear-pending", provider="alpha")
        item["cost_usd"] = 0
        item["cost_status"] = "pending"
        item["attempts"][0].update({"cost_usd": 0, "cost_status": "pending"})
        store.record_request(item)

        store.clear()
        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(summary["requests"], 1)
        self.assertEqual(summary["cost"]["statuses"]["pending"], 0)
        self.assertEqual(summary["cost"]["statuses"]["unpriced"], 1)

    def test_clear_statistics_starts_new_generation_without_backfill_resurrection(self):
        path = self.temp_db()
        cfg = self.config(path)
        store = RequestHistoryStore(cfg)
        old = sample_request("req-old")
        old["finished_at"] = int(time.time()) - 10
        store.record_request(old)
        self.assertEqual(store.usage_statistics_summary(range_name="all")["summary"]["requests"], 1)

        cleared = store.clear_usage_statistics()
        after_clear = store.usage_statistics_summary(range_name="all")["summary"]
        store.shutdown()

        reopened = RequestHistoryStore(cfg)
        reopened_summary = reopened.usage_statistics_summary(range_name="all")["summary"]
        new = sample_request("req-new")
        new["finished_at"] = cleared["backfill_cutoff_at"]
        reopened.record_request(new)
        after_new = reopened.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(cleared["generation"], 2)
        self.assertEqual(after_clear["requests"], 0)
        self.assertEqual(reopened_summary["requests"], 0)
        self.assertEqual(after_new["requests"], 1)

    def test_statistics_clear_barrier_excludes_queued_old_request_but_keeps_detail(self):
        path = self.temp_db()
        store = RequestHistoryStore(
            {
                "observability": {
                    "history": {
                        "enabled": True,
                        "path": path,
                        "retention_days": 30,
                        "queue_size": 20,
                    },
                    "usage_statistics": {
                        "enabled": True,
                        "hourly_retention_days": 90,
                        "reporting_timezone": "UTC",
                    },
                }
            }
        )
        store._writer_running = True
        old = sample_request("req-queued-before-clear")
        store.record_request(old)

        cleared = store.clear_usage_statistics()
        queued = store._queue.get_nowait()
        store._queue.task_done()
        store._writer_running = False
        store._ensure_ready()
        with store._lock:
            with store._connection() as conn:
                store._insert_request(conn, queued)

        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertEqual(cleared["generation"], 2)
        self.assertIsNotNone(store.get_request("req-queued-before-clear"))
        self.assertEqual(summary["requests"], 0)

    def test_history_clear_barrier_accounts_queued_old_request_without_reappearing(self):
        path = self.temp_db()
        store = RequestHistoryStore(
            {
                "observability": {
                    "history": {
                        "enabled": True,
                        "path": path,
                        "retention_days": 30,
                        "queue_size": 20,
                    },
                    "usage_statistics": {
                        "enabled": True,
                        "hourly_retention_days": 90,
                        "reporting_timezone": "UTC",
                    },
                }
            }
        )
        store._writer_running = True
        store.record_request(sample_request("req-queued-history-clear"))
        store.clear()
        queued = store._queue.get_nowait()
        store._queue.task_done()
        store._writer_running = False
        store._ensure_ready()
        with store._lock:
            with store._connection() as conn:
                store._insert_request(conn, queued)

        summary = store.usage_statistics_summary(range_name="all")["summary"]

        self.assertIsNone(store.get_request("req-queued-history-clear"))
        self.assertEqual(summary["requests"], 1)

    def test_async_shutdown_drains_queued_requests_into_statistics(self):
        path = self.temp_db()
        store = RequestHistoryStore(
            {
                "observability": {
                    "history": {
                        "enabled": True,
                        "path": path,
                        "retention_days": 30,
                        "queue_size": 50,
                    },
                    "usage_statistics": {
                        "enabled": True,
                        "hourly_retention_days": 90,
                        "reporting_timezone": "UTC",
                    },
                }
            }
        )
        store._writer_running = True
        store._writer_thread = threading.Thread(
            target=store._write_loop, name="stats-shutdown-test", daemon=True
        )
        store._writer_thread.start()
        for index in range(20):
            store.record_request(sample_request(f"req-shutdown-{index}"))

        store.shutdown()

        reopened = RequestHistoryStore(self.config(path))
        summary = reopened.usage_statistics_summary(range_name="all")["summary"]
        self.assertEqual(reopened.list_requests()["total"], 20)
        self.assertEqual(summary["requests"], 20)

    def test_existing_history_is_backfilled_once_on_upgrade(self):
        path = self.temp_db()
        cfg = self.config(path)
        store = RequestHistoryStore(cfg)
        store.enabled = False
        store.initialize()
        store.enabled = True
        store._ready = False
        store.initialize()
        with store._lock:
            with store._connection() as conn:
                store._insert_request(conn, sample_request("req-existing"))
                for table in (
                    "usage_statistics_hourly",
                    "usage_statistics_daily",
                    "usage_statistics_totals",
                    "usage_statistics_ledger",
                    "usage_statistics_meta",
                ):
                    conn.execute(f"DROP TABLE IF EXISTS {table}")
        store.shutdown()

        reopened = RequestHistoryStore(cfg)
        first = reopened.usage_statistics_summary(range_name="all")
        second = reopened.usage_statistics_summary(range_name="all")

        self.assertEqual(first["summary"]["requests"], 1)
        self.assertEqual(second["summary"]["requests"], 1)
        self.assertTrue(second["backfill_completed_at"])

    def test_detail_prune_waits_until_first_backfill_is_complete(self):
        path = self.temp_db()
        cfg = self.config(path, retention_days=1)
        store = RequestHistoryStore(cfg)
        store.initialize()
        old = sample_request("req-prune-after-backfill")
        old["finished_at"] = int(time.time()) - 10 * 86400
        old["started_at"] = old["finished_at"] - 1
        old["_statistics_sequence"] = 1
        store._statistics_sequence = 1
        with store._lock:
            with store._connection() as conn:
                conn.execute(
                    "UPDATE usage_statistics_meta SET backfill_completed_at = 0 WHERE id = 1"
                )
                store._insert_request(conn, old)
                store._prune_locked(conn)
                before = conn.execute(
                    "SELECT COUNT(*) FROM requests WHERE request_id = ?",
                    ("req-prune-after-backfill",),
                ).fetchone()[0]
                conn.execute(
                    "UPDATE usage_statistics_meta SET backfill_completed_at = ? WHERE id = 1",
                    (int(time.time()),),
                )
                store._last_prune_time = 0
                store._prune_locked(conn)
                after = conn.execute(
                    "SELECT COUNT(*) FROM requests WHERE request_id = ?",
                    ("req-prune-after-backfill",),
                ).fetchone()[0]

        self.assertEqual(before, 1)
        self.assertEqual(after, 0)
        self.assertEqual(
            store.usage_statistics_summary(range_name="all")["summary"]["requests"],
            1,
        )

    def test_hourly_prune_keeps_daily_and_totals(self):
        path = self.temp_db()
        store = self.store(path=path, retention_days=365)
        old = sample_request("req-old-hour")
        old["finished_at"] = int(time.time()) - 100 * 86400
        old["started_at"] = old["finished_at"] - 1
        store.record_request(old)

        with store._connection() as conn:
            store._usage_statistics.prune(conn, now=int(time.time()))
            hourly = conn.execute("SELECT COUNT(*) FROM usage_statistics_hourly").fetchone()[0]
            daily = conn.execute("SELECT COUNT(*) FROM usage_statistics_daily").fetchone()[0]
            totals = conn.execute("SELECT COUNT(*) FROM usage_statistics_totals").fetchone()[0]

        self.assertEqual(hourly, 0)
        self.assertGreater(daily, 0)
        self.assertGreater(totals, 0)

    def test_reporting_timezone_controls_daily_bucket(self):
        store = self.store(timezone="Asia/Shanghai")
        item = sample_request("req-timezone")
        # 2026-07-18 16:30 UTC == 2026-07-19 00:30 Asia/Shanghai.
        item["finished_at"] = 1784392200
        item["started_at"] = item["finished_at"] - 1
        store.record_request(item)

        with store._connection() as conn:
            bucket = conn.execute(
                "SELECT MIN(bucket_start) FROM usage_statistics_daily"
            ).fetchone()[0]

        self.assertEqual(bucket, 1784390400)

    def test_custom_range_validation_and_dimensions(self):
        store = self.store()
        store.record_request(sample_request("req-dim", provider="alpha"))

        dimensions = store.usage_statistics_dimensions()
        summary = store.usage_statistics_summary(
            range_name="custom",
            start=int(time.time()) - 60,
            end=int(time.time()) + 60,
            filters={"model": "client-model", "provider": "alpha"},
        )

        self.assertEqual(dimensions["models"], ["client-model"])
        self.assertEqual(dimensions["providers"], ["alpha"])
        self.assertEqual(summary["summary"]["requests"], 1)
        with self.assertRaises(ValueError):
            store.usage_statistics_summary(range_name="custom", start=10, end=5)

    def test_long_hourly_timeseries_is_bounded_server_side(self):
        store = self.store()
        now = int(time.time())
        for index in range(500):
            item = sample_request(f"req-series-{index}")
            item["finished_at"] = now - index * 4 * 3600
            item["started_at"] = item["finished_at"] - 1
            store.record_request(item)

        series = store.usage_statistics_timeseries(
            range_name="90d", resolution="hour", metric="tokens"
        )

        self.assertLessEqual(len(series["points"]), 400)
        self.assertGreater(series["bucket_s"], 3600)

    def test_schema_is_added_to_existing_history_database(self):
        path = self.temp_db()
        with sqlite3.connect(path) as conn:
            conn.executescript(
                """
                CREATE TABLE requests (
                  request_id TEXT PRIMARY KEY,
                  client_format TEXT NOT NULL DEFAULT '',
                  endpoint TEXT NOT NULL DEFAULT '',
                  model TEXT NOT NULL DEFAULT '',
                  stream INTEGER NOT NULL DEFAULT 0,
                  path TEXT NOT NULL DEFAULT '',
                  status_code INTEGER NOT NULL DEFAULT 0,
                  status TEXT NOT NULL DEFAULT '',
                  duration_ms INTEGER NOT NULL DEFAULT 0,
                  started_at INTEGER NOT NULL DEFAULT 0,
                  finished_at INTEGER NOT NULL DEFAULT 0,
                  error TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE attempts (
                  request_id TEXT NOT NULL,
                  attempt_no INTEGER NOT NULL DEFAULT 0,
                  provider TEXT NOT NULL DEFAULT '',
                  key_index INTEGER NOT NULL DEFAULT 0,
                  key_masked TEXT NOT NULL DEFAULT '',
                  key_id TEXT NOT NULL DEFAULT '',
                  provider_model TEXT NOT NULL DEFAULT '',
                  upstream_format TEXT NOT NULL DEFAULT '',
                  outcome TEXT NOT NULL DEFAULT '',
                  error_type TEXT NOT NULL DEFAULT '',
                  reason TEXT NOT NULL DEFAULT '',
                  http_status INTEGER,
                  PRIMARY KEY (request_id, attempt_no, provider, key_index, upstream_format)
                );
                """
            )
        store = RequestHistoryStore(self.config(path))

        store.initialize()

        with store._connection() as conn:
            names = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
        self.assertTrue(
            {
                "usage_statistics_meta",
                "usage_statistics_ledger",
                "usage_statistics_hourly",
                "usage_statistics_daily",
                "usage_statistics_totals",
                "usage_statistics_dirty",
            }.issubset(names)
        )

    def test_development_v1_statistics_are_rebuilt_with_v2_semantics(self):
        path = self.temp_db()
        store = self.store(path=path)
        store.record_request(sample_request("req-v1-real"))
        probe = sample_request("req-v1-probe")
        probe["client_format"] = "admin_probe"
        probe["endpoint"] = "key_test"
        store.record_request(probe)
        with store._connection() as conn:
            conn.execute(
                "UPDATE usage_statistics_meta SET schema_version = 1 WHERE id = 1"
            )
        store.shutdown()

        reopened = self.store(path=path)
        summary = reopened.usage_statistics_summary(range_name="all")

        self.assertEqual(summary["schema_version"], 2)
        self.assertEqual(summary["summary"]["requests"], 1)
        self.assertEqual(summary["backfill"]["eligible"], 1)
        self.assertEqual(summary["backfill"]["remaining"], 0)

    def test_statistics_failure_keeps_history_and_is_repaired_from_dirty_queue(self):
        store = self.store()
        item = sample_request("req-dirty-repair")

        with patch.object(
            store._usage_statistics,
            "reconcile_request",
            side_effect=RuntimeError("aggregate unavailable"),
        ):
            store.record_request(item)

        self.assertIsNotNone(store.get_request("req-dirty-repair"))
        with store._connection() as conn:
            dirty = conn.execute(
                "SELECT reason FROM usage_statistics_dirty WHERE request_id = ?",
                ("req-dirty-repair",),
            ).fetchone()
        self.assertIn("aggregate unavailable", dirty["reason"])

        repaired = store.usage_statistics_summary(range_name="all")

        self.assertEqual(repaired["summary"]["requests"], 1)
        with store._connection() as conn:
            remaining = conn.execute(
                "SELECT COUNT(*) FROM usage_statistics_dirty"
            ).fetchone()[0]
        self.assertEqual(remaining, 0)


if __name__ == "__main__":
    unittest.main()
