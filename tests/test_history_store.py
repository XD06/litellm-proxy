import os
import sqlite3
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from history_store import RequestHistoryStore


def sample_request(request_id="req-1", *, status_code=200, provider="alpha", finished_at=None):
    if finished_at is None:
        finished_at = int(time.time())
    return {
        "request_id": request_id,
        "client_format": "chat_completions",
        "endpoint": "chat_completions",
        "model": "client-model",
        "stream": False,
        "path": "/v1/chat/completions",
        "status_code": status_code,
        "duration_ms": 1234,
        "first_byte_ms": 321,
        "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
        "cost_usd": 0.000016,
        "started_at": finished_at - 1,
        "finished_at": finished_at,
        "attempts": [
            {
                "attempt_no": 1,
                "provider": provider,
                "key_index": 0,
                "key_masked": "sk-abc**xyz",
                "key_id": "kid123",
                "provider_model": "provider-model",
                "upstream_format": "chat_completions",
                "outcome": "success" if status_code < 400 else "failed",
                "error_type": "" if status_code < 400 else "server_error",
                "reason": "" if status_code < 400 else "upstream_5xx",
                "http_status": None if status_code < 400 else 502,
                "diagnostic_stage": "" if status_code < 400 else "upstream_http_error",
                "upstream_error_summary": "" if status_code < 400 else "The content thinking block must be passed back.",
                "upstream_error_type": "" if status_code < 400 else "invalid_request_error",
                "upstream_error_code": "" if status_code < 400 else "invalid_request_error",
                "upstream_error_param": "" if status_code < 400 else "content[].thinking",
                "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
                "cost_usd": 0.000016,
            }
        ],
    }


class RequestHistoryStoreTests(unittest.TestCase):
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

    def store(self):
        return RequestHistoryStore(
            {
                "observability": {
                    "history": {
                        "enabled": True,
                        "path": self.temp_db(),
                        "retention_days": 30,
                        "sync_mode": True,
                    }
                }
            }
        )

    def test_records_lists_and_filters_requests_without_raw_keys(self):
        store = self.store()
        store.record_request(sample_request("req-ok", provider="alpha"))
        store.record_request(sample_request("req-fail", status_code=502, provider="beta"))

        listed = store.list_requests(filters={"provider": "beta", "status": "failed"})

        self.assertEqual(listed["source"], "sqlite")
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")
        self.assertEqual(listed["items"][0]["first_byte_ms"], 321)
        self.assertEqual(listed["items"][0]["providers"], ["beta"])
        self.assertEqual(listed["items"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertAlmostEqual(listed["items"][0]["cost_usd"], 0.000016)
        self.assertEqual(listed["items"][0]["error_types"], ["server_error"])
        self.assertEqual(listed["items"][0]["failure_reasons"], ["upstream_5xx"])
        self.assertEqual(listed["items"][0]["attempt_http_statuses"], ["502"])
        self.assertEqual(listed["items"][0]["routing_summary"]["outcome"], "failed")
        self.assertNotIn("secret", str(listed))

    def test_fuzzy_filtering_on_requests(self):
        store = self.store()
        req_ok = sample_request("req-ok", provider="alpha-provider")
        req_ok["model"] = "gpt-4o"
        store.record_request(req_ok)

        req_fail = sample_request("req-fail", status_code=502, provider="beta-provider")
        req_fail["model"] = "claude-3-opus"
        store.record_request(req_fail)

        # Test model fuzzy match
        listed = store.list_requests(filters={"model": "gpt"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-ok")

        listed = store.list_requests(filters={"model": "claude"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")

        # Test provider fuzzy match
        listed = store.list_requests(filters={"provider": "alpha"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-ok")

        listed = store.list_requests(filters={"provider": "beta"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")

        # Test error_type / failure_reason / http_status fuzzy match
        listed = store.list_requests(filters={"error_type": "server"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")

        listed = store.list_requests(filters={"failure_reason": "5xx"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")

        listed = store.list_requests(filters={"http_status": "50"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")

    def test_nh4_like_wildcards_are_escaped(self):
        """NH4: ``%`` and ``_`` in filter values must be literal, not wildcards.

        Previously ``model="100%"`` matched every model (trailing ``%`` is a
        SQL LIKE wildcard) and ``provider="model_1"`` matched ``modelA1``.
        """
        store = self.store()
        r1 = sample_request("req-1", provider="alpha")
        r1["model"] = "100%"
        store.record_request(r1)
        r2 = sample_request("req-2", provider="beta")
        r2["model"] = "100X"
        store.record_request(r2)
        r3 = sample_request("req-3", provider="gamma")
        r3["model"] = "model_1"
        store.record_request(r3)
        r4 = sample_request("req-4", provider="delta")
        r4["model"] = "modelA1"
        store.record_request(r4)

        # "100%" must match only the literal "100%", not "100X".
        listed = store.list_requests(filters={"model": "100%"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-1")

        # "model_1" must match only the literal "model_1", not "modelA1".
        listed = store.list_requests(filters={"model": "model_1"})
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-3")

    def test_get_request_returns_attempt_detail_with_masked_key(self):
        store = self.store()
        store.record_request(sample_request("req-detail"))

        detail = store.get_request("req-detail")

        self.assertEqual(detail["state"], "finished")
        self.assertEqual(detail["request_id"], "req-detail")
        self.assertEqual(detail["first_byte_ms"], 321)
        self.assertEqual(detail["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertAlmostEqual(detail["cost_usd"], 0.000016)
        self.assertEqual(detail["attempts"][0]["key_masked"], "sk-abc**xyz")
        self.assertEqual(detail["attempts"][0]["key_id"], "kid123")
        self.assertEqual(detail["attempts"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(detail["routing_summary"]["outcome"], "direct_success")
        self.assertIn("routing_explanation", detail["attempts"][0])
        self.assertIsNone(store.get_request("missing"))

    def test_get_request_returns_attempt_diagnostics(self):
        store = self.store()
        store.record_request(sample_request("req-diagnostic", status_code=502, provider="deepseek"))

        attempt = store.get_request("req-diagnostic")["attempts"][0]

        self.assertEqual(attempt["diagnostic_stage"], "upstream_http_error")
        self.assertEqual(attempt["upstream_error_summary"], "The content thinking block must be passed back.")
        self.assertEqual(attempt["upstream_error_type"], "invalid_request_error")
        self.assertEqual(attempt["upstream_error_code"], "invalid_request_error")
        self.assertEqual(attempt["upstream_error_param"], "content[].thinking")

    def test_timeseries_aggregates_persisted_history(self):
        store = self.store()
        now = int(time.time())
        store.record_request(sample_request("req-ok", finished_at=now))
        store.record_request(sample_request("req-fail", status_code=502, provider="beta", finished_at=now))

        series = store.timeseries(bucket_s=60, buckets=1)

        self.assertEqual(series["source"], "sqlite")
        self.assertEqual(len(series["buckets"]), 1)
        self.assertEqual(series["buckets"][0]["requests"], 2)
        self.assertEqual(series["buckets"][0]["success"], 1)
        self.assertEqual(series["buckets"][0]["failed"], 1)
        self.assertEqual(series["buckets"][0]["by_provider_attempts"]["alpha"], 1)
        self.assertEqual(series["buckets"][0]["by_provider_attempts"]["beta"], 1)
        self.assertEqual(series["buckets"][0]["usage"]["input_tokens"], 8)
        self.assertEqual(series["buckets"][0]["usage"]["output_tokens"], 12)
        self.assertEqual(series["buckets"][0]["usage"]["total_tokens"], 20)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["usage"]["total_tokens"], 10)
        self.assertEqual(series["buckets"][0]["by_provider"]["beta"]["usage"]["total_tokens"], 10)
        self.assertEqual(series["buckets"][0]["by_model_usage"]["client-model"]["total_tokens"], 20)
        self.assertEqual(series["buckets"][0]["by_error_type"]["server_error"], 1)
        self.assertEqual(series["buckets"][0]["by_attempt_http_status"]["502"], 1)
        self.assertEqual(series["buckets"][0]["first_byte_ms_count"], 2)
        self.assertEqual(series["buckets"][0]["first_byte_ms_total"], 642)
        self.assertEqual(series["buckets"][0]["first_byte_ms_avg"], 321)
        self.assertEqual(series["buckets"][0]["first_byte_ms_max"], 321)
        self.assertEqual(series["buckets"][0]["first_byte_ms_min"], 321)

    def test_clear_removes_persisted_requests_and_attempts(self):
        store = self.store()
        store.record_request(sample_request("req-1"))
        store.record_request(sample_request("req-2", provider="beta"))
        store.record_request(sample_request("req-3"))

        result = store.clear()

        self.assertTrue(result["enabled"])
        self.assertEqual(result["requests_deleted"], 3)
        self.assertEqual(result["attempts_deleted"], 3)

    def test_attempts_batch_returns_grouped_attempts_in_one_query(self):
        store = self.store()
        store.record_request(sample_request("req-a"))
        store.record_request(sample_request("req-b", provider="beta"))
        store.record_request(sample_request("req-c"))
        store.initialize()

        import sqlite3
        with store._connect() as conn:
            grouped = store._attempts_batch(conn, ["req-a", "req-b", "req-c", "missing"])
        # Each existing request has exactly one attempt; missing yields no key.
        self.assertEqual(set(grouped.keys()), {"req-a", "req-b", "req-c"})
        self.assertEqual(len(grouped["req-a"]), 1)
        self.assertEqual(grouped["req-a"][0]["provider"], "alpha")
        self.assertEqual(grouped["req-b"][0]["provider"], "beta")
        # Empty input returns an empty dict without querying.
        with store._connect() as conn:
            self.assertEqual(store._attempts_batch(conn, []), {})

    def test_attempts_batch_chunks_large_id_lists(self):
        # More than the 500-id chunk size: verify all are still returned.
        store = self.store()
        ids = []
        for i in range(520):
            rid = f"req-{i:04d}"
            ids.append(rid)
            store.record_request(sample_request(rid, provider="alpha" if i % 2 == 0 else "beta"))
        store.initialize()

        with store._connect() as conn:
            grouped = store._attempts_batch(conn, ids)
        self.assertEqual(len(grouped), 520)
        # i=0 -> alpha, i=501 -> beta (odd), confirms chunk >500 boundary works.
        self.assertEqual(grouped["req-0000"][0]["provider"], "alpha")
        self.assertEqual(grouped["req-0501"][0]["provider"], "beta")
        store = self.store()
        store.record_request(sample_request("req-ok", provider="alpha"))
        store.record_request(sample_request("req-fail", status_code=502, provider="beta"))

        result = store.clear()

        self.assertEqual(result["requests_deleted"], 2)
        self.assertEqual(result["attempts_deleted"], 2)
        self.assertEqual(store.list_requests()["total"], 0)
        self.assertIsNone(store.get_request("req-ok"))
        self.assertEqual(store.timeseries(bucket_s=60, buckets=1)["buckets"][0]["requests"], 0)

    def test_delete_requests_removes_only_selected_records(self):
        store = self.store()
        store.record_request(sample_request("req-ok", provider="alpha"))
        store.record_request(sample_request("req-fail", status_code=502, provider="beta"))

        result = store.delete_requests(["req-ok", "req-ok", "missing"])

        self.assertEqual(result["requested"], 2)
        self.assertEqual(result["requests_deleted"], 1)
        self.assertEqual(result["attempts_deleted"], 1)
        self.assertIsNone(store.get_request("req-ok"))
        self.assertIsNotNone(store.get_request("req-fail"))
        listed = store.list_requests()
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-fail")

    def test_delete_matching_requests_removes_only_filtered_records(self):
        store = self.store()
        store.record_request(sample_request("req-alpha", provider="alpha"))
        store.record_request(sample_request("req-beta", status_code=502, provider="beta"))
        store.record_request(sample_request("req-beta-ok", provider="beta"))

        result = store.delete_matching_requests({"provider": "beta", "status": "failed"})

        self.assertEqual(result["filters"], {"provider": "beta", "status": "failed"})
        self.assertEqual(result["requests_deleted"], 1)
        self.assertEqual(result["attempts_deleted"], 1)
        self.assertIsNone(store.get_request("req-beta"))
        self.assertIsNotNone(store.get_request("req-alpha"))
        self.assertIsNotNone(store.get_request("req-beta-ok"))
        self.assertEqual(store.list_requests(filters={"provider": "beta"})["total"], 1)

    def test_delete_matching_requests_requires_filter(self):
        store = self.store()
        store.record_request(sample_request("req-alpha", provider="alpha"))

        result = store.delete_matching_requests({})

        self.assertIn("at least one filter", result["error"])
        self.assertEqual(result["requests_deleted"], 0)
        self.assertEqual(store.list_requests()["total"], 1)

    def test_existing_history_schema_is_migrated_for_usage_and_latency_columns(self):
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
        store = RequestHistoryStore(
            {
                "observability": {
                    "history": {
                        "enabled": True,
                        "path": path,
                        "retention_days": 30,
                        "sync_mode": True,
                    }
                }
            }
        )

        store.record_request(sample_request("req-migrated", status_code=502))
        detail = store.get_request("req-migrated")

        self.assertEqual(detail["first_byte_ms"], 321)
        self.assertEqual(detail["usage"]["total_tokens"], 10)
        self.assertEqual(detail["attempts"][0]["usage"]["output_tokens"], 6)
        self.assertEqual(detail["attempts"][0]["diagnostic_stage"], "upstream_http_error")
        self.assertEqual(detail["attempts"][0]["upstream_error_code"], "invalid_request_error")

    def test_dropped_count_increments_when_queue_full(self):
        # Use a tiny queue so it saturates quickly. sync_mode defaults to
        # False (the production async path) so record_request exercises the
        # real queue.Full path. We mark the writer as already running so
        # record_request does not spawn a consumer thread that would drain
        # the queue and hide the overflow.
        cfg = {
            "observability": {
                "history": {
                    "enabled": True,
                    "path": os.path.join(tempfile.mkdtemp(), "h.sqlite3"),
                    "queue_size": 10,
                }
            }
        }
        store = RequestHistoryStore(cfg)
        self.assertEqual(store.dropped_count(), 0)

        # Pretend the writer is already running so record_request only does
        # the queue.put path; otherwise initialize() would spawn a consumer.
        store._writer_running = True
        # Fill the queue to capacity.
        for i in range(store._queue.maxsize):
            store._queue.put({"request_id": f"fill-{i}"}, block=False)
        # Now the queue is full; further records must be dropped + counted.
        store.record_request(sample_request(request_id="overflow-1"))
        store.record_request(sample_request(request_id="overflow-2"))

        self.assertEqual(store.dropped_count(), 2)

    def test_dropped_count_starts_at_zero(self):
        cfg = {"observability": {"history": {"enabled": True, "path": ":memory:"}}}
        store = RequestHistoryStore(cfg)
        self.assertEqual(store.dropped_count(), 0)


    def test_attempt_parameter_adaptations_are_persisted(self):
        store = self.store()
        item = sample_request("req-adapt")
        item["attempts"][0]["parameter_adaptations"] = [
            {"source": "max_token", "target": "max_tokens", "value": 64}
        ]
        store.record_request(item)
        detail = store.get_request("req-adapt")
        self.assertEqual(
            detail["attempts"][0]["parameter_adaptations"],
            [{"source": "max_token", "target": "max_tokens", "value": 64}],
        )


if __name__ == "__main__":
    unittest.main()
