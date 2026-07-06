#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression tests for AdminAuditStore (C5: atomic prune)."""
import json
import os
import tempfile
import unittest

from audit_store import AdminAuditStore


class AuditPruneTests(unittest.TestCase):
    def _store(self, path: str, max_records: int) -> AdminAuditStore:
        cfg = {"observability": {"audit": {"enabled": True, "path": path, "max_records": max_records}}}
        store = AdminAuditStore(cfg)
        # _max_records() clamps to >=100. The prune logic reads the instance
        # attribute directly, so override it here to exercise pruning with a
        # small bound without writing 100+ records.
        store.max_records = max_records
        return store

    def test_prune_keeps_last_max_records(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "audit.jsonl")
            store = self._store(path, max_records=5)
            for i in range(12):
                store.record("test_action", target=f"t{i}")
            with open(path, "r", encoding="utf-8") as f:
                lines = [ln for ln in f.read().splitlines() if ln.strip()]
            self.assertEqual(len(lines), 5)
            # The kept records should be the most recent 5 (t7..t11).
            targets = [json.loads(ln)["target"] for ln in lines]
            self.assertEqual(targets, [f"t{i}" for i in range(7, 12)])

    def test_prune_is_atomic_no_tmp_left_behind(self):
        """C5: prune must use tmp + os.replace, leaving no .tmp file on success."""
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "audit.jsonl")
            store = self._store(path, max_records=3)
            for i in range(10):
                store.record("test_action", target=f"t{i}")
            # After prune, no .tmp file should remain.
            self.assertFalse(os.path.exists(path + ".tmp"))
            # And the file must be valid JSONL (no truncation artefacts).
            with open(path, "r", encoding="utf-8") as f:
                for ln in f:
                    json.loads(ln)

    def test_prune_not_triggered_below_threshold(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "audit.jsonl")
            store = self._store(path, max_records=100)
            for i in range(3):
                store.record("test_action", target=f"t{i}")
            with open(path, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
            self.assertEqual(len(lines), 3)

    def test_record_works_with_small_bound(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "audit.jsonl")
            store = self._store(path, max_records=2)
            store.record("test_action", target="t0")
            store.record("test_action", target="t1")
            self.assertTrue(os.path.exists(path))
            with open(path, "r", encoding="utf-8") as f:
                self.assertEqual(len(f.read().splitlines()), 2)


if __name__ == "__main__":
    unittest.main()
