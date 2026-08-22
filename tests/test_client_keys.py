#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for the client virtual key store and access decisions."""
import os
import tempfile
import time
import unittest

from client_key_store import (
    ClientKeyError,
    ClientKeyStore,
    _parse_models,
    _parse_expires,
    parse_quota_tokens,
)


def make_store(**overrides):
    tmp = tempfile.mkdtemp(prefix="client_keys_test_")
    cfg = {
        "client_keys": {
            "enabled": True,
            "store_path": os.path.join(tmp, "keys.sqlite3"),
        }
    }
    cfg["client_keys"].update(overrides)
    return ClientKeyStore(cfg)


class ClientKeyStoreTests(unittest.TestCase):
    def test_create_returns_full_key_once_and_masks_in_list(self):
        store = make_store()
        record, full = store.create_key(name="cherry", quota_tokens=1000, rpm=10)
        self.assertTrue(full.startswith("sk-proxy-"))
        listing = store.list_keys()
        self.assertEqual(listing["count"], 1)
        listed = listing["keys"][0]
        self.assertNotIn("key_hash", listed)
        self.assertNotIn(full, listed["masked"])
        self.assertIn("***", listed["masked"])
        self.assertEqual(listed["name"], "cherry")
        self.assertEqual(listed["quota_tokens"], 1000)

    def test_authenticate_by_token_only(self):
        store = make_store()
        record, full = store.create_key(name="a")
        self.assertEqual(store.authenticate(full)["id"], record["id"])
        self.assertIsNone(store.authenticate("sk-proxy-wrong-token"))
        self.assertIsNone(store.authenticate(""))

    def test_update_delete_reset(self):
        store = make_store()
        record, _ = store.create_key(name="a")
        updated = store.update_key(record["id"], {"name": "b", "enabled": False, "quota_tokens": "5M"})
        self.assertEqual(updated["name"], "b")
        self.assertFalse(updated["enabled"])
        self.assertEqual(updated["quota_tokens"], 5_000_000)
        self.assertEqual(store.delete_key(record["id"])["action"], "client_key_deleted")
        self.assertEqual(store.list_keys()["count"], 0)
        with self.assertRaises(ClientKeyError):
            store.delete_key(record["id"])

        record2, _ = store.create_key(name="c")
        store.add_usage(record2["id"], 500, 0.25, True)
        store.add_usage(record2["id"], 100, 0.1, False)
        listed = store.list_keys()["keys"][0]
        self.assertEqual(listed["consumed_tokens"], 600)
        self.assertEqual(listed["requests_total"], 2)
        self.assertEqual(listed["requests_failed"], 1)
        self.assertAlmostEqual(listed["cost_usd"], 0.35, places=6)
        self.assertIsNotNone(listed["last_used_at"])
        store.reset_usage(record2["id"])
        listed = store.list_keys()["keys"][0]
        self.assertEqual(listed["consumed_tokens"], 0)
        self.assertEqual(listed["requests_total"], 0)
        self.assertIsNone(listed["last_used_at"])

    def test_check_access_disabled_expired_model_quota(self):
        store = make_store()
        rec, _ = store.create_key(name="a", models=["gpt-5", "claude-x"], quota_tokens=100)
        ok, status, code, _msg = store.check_access(rec, model="gpt-5")
        self.assertTrue(ok)

        ok, status, code, _msg = store.check_access(rec, model="grok")
        self.assertFalse(ok)
        self.assertEqual(status, 403)
        self.assertEqual(code, "model_not_allowed")

        disabled = dict(rec, enabled=False)
        ok, status, code, _msg = store.check_access(disabled)
        self.assertEqual((status, code), (403, "key_disabled"))

        expired = dict(rec, expires_at=time.time() - 1)
        ok, status, code, _msg = store.check_access(expired)
        self.assertEqual((status, code), (403, "key_expired"))

        exhausted = dict(rec, consumed_tokens=100)
        ok, status, code, _msg = store.check_access(exhausted)
        self.assertEqual((status, code), (429, "quota_exceeded"))

    def test_rate_limit_sliding_window(self):
        store = make_store()
        rec, _ = store.create_key(name="a", rpm=2)
        now = time.time()
        store.stamp_rate_limit(rec["id"], now=now)
        store.stamp_rate_limit(rec["id"], now=now + 0.1)
        ok, status, code, _msg = store.check_access(rec, now=now + 0.2)
        self.assertFalse(ok)
        self.assertEqual((status, code), (429, "rate_limit_exceeded"))
        # window slides past 60s
        ok, _s, _c, _m = store.check_access(rec, now=now + 61)
        self.assertTrue(ok)

    def test_has_any_keys_and_enabled_keys(self):
        store = make_store()
        self.assertFalse(store.has_any_keys())
        rec, _ = store.create_key(name="a")
        self.assertTrue(store.has_any_keys())
        self.assertTrue(store.has_enabled_keys())
        store.update_key(rec["id"], {"enabled": False})
        # Disabling the last key must not silently reopen the endpoints.
        self.assertTrue(store.has_any_keys())
        self.assertFalse(store.has_enabled_keys())

    def test_persistence_across_reopen(self):
        store = make_store()
        record, full = store.create_key(name="keep", rpm=7)
        path = store.path
        reopened = ClientKeyStore({"client_keys": {"store_path": path}})
        self.assertEqual(reopened.list_keys()["count"], 1)
        self.assertIsNotNone(reopened.authenticate(full))


class ParseHelpersTests(unittest.TestCase):
    def test_parse_models(self):
        self.assertEqual(_parse_models(None), "*")
        self.assertEqual(_parse_models("*"), "*")
        self.assertEqual(_parse_models("a, b ,a"), ["a", "b"])
        self.assertEqual(_parse_models(["b", "a"]), ["a", "b"])
        self.assertEqual(_parse_models([]), "*")
        self.assertEqual(_parse_models('["x"]'), ["x"])

    def test_parse_expires(self):
        self.assertIsNone(_parse_expires("never"))
        self.assertIsNone(_parse_expires(""))
        now = 1000.0
        self.assertAlmostEqual(_parse_expires("30d", now=now), now + 30 * 86400)
        self.assertAlmostEqual(_parse_expires("90d", now=now), now + 90 * 86400)
        self.assertAlmostEqual(_parse_expires("2h", now=now), now + 7200)

    def test_parse_quota_tokens(self):
        self.assertEqual(parse_quota_tokens("100M"), 100_000_000)
        self.assertEqual(parse_quota_tokens("1.5B"), 1_500_000_000)
        self.assertEqual(parse_quota_tokens("500k"), 500_000)
        self.assertEqual(parse_quota_tokens("123"), 123)
        self.assertEqual(parse_quota_tokens(""), 0)
        self.assertEqual(parse_quota_tokens(None), 0)


if __name__ == "__main__":
    unittest.main()
