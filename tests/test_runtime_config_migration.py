import os
import tempfile
import time
import unittest
from unittest.mock import patch

import sse2json
from observability import ProxyObservability
from proxy_utils import key_fingerprint
from router import UpstreamRouter, _KeyState, _ProviderState


def _cfg(providers):
    return {"providers": providers, "routing": {}, "models": {}}


class RouterStateMigrationTests(unittest.TestCase):
    def setUp(self):
        self.providers = {
            "alpha": {"base_url": "https://a.test", "keys": ["k1", "k2"]},
            "beta": {"base_url": "https://b.test", "keys": ["k3"]},
        }

    def _seed_router(self):
        r = UpstreamRouter(_cfg(self.providers))
        r._providers_state["alpha"].cooldown_until = time.time() + 60
        r._keys_state[("alpha", 0)].fails = 5
        r._keys_state[("alpha", 0)].cooldown_until = time.time() + 30
        r._keys_state[("beta", 0)].runtime_enabled = False
        r._rr_model["m1"] = 3
        return r

    def test_migration_preserves_existing_state(self):
        old = self._seed_router()
        new = UpstreamRouter(_cfg(self.providers))
        new.migrate_state_from(old)

        self.assertGreater(new._providers_state["alpha"].cooldown_until, time.time())
        self.assertEqual(new._keys_state[("alpha", 0)].fails, 5)
        self.assertFalse(new._keys_state[("beta", 0)].runtime_enabled)
        self.assertEqual(new._rr_model.get("m1"), 3)

    def test_migration_drops_removed_provider(self):
        old = self._seed_router()
        remaining = {"alpha": self.providers["alpha"]}
        new = UpstreamRouter(_cfg(remaining))
        new.migrate_state_from(old)

        self.assertNotIn("beta", new._providers_state)
        self.assertNotIn(("beta", 0), new._keys_state)
        self.assertEqual(new._keys_state[("alpha", 0)].fails, 5)

    def test_migration_drops_out_of_range_key(self):
        old = self._seed_router()
        shrunk = {
            "alpha": {"base_url": "https://a.test", "keys": ["k1"]},
            "beta": self.providers["beta"],
        }
        new = UpstreamRouter(_cfg(shrunk))
        new.migrate_state_from(old)

        self.assertIn(("alpha", 0), new._keys_state)
        self.assertNotIn(("alpha", 1), new._keys_state)

    def test_migrate_from_none_is_noop(self):
        new = UpstreamRouter(_cfg(self.providers))
        new.migrate_state_from(None)
        self.assertIn("alpha", new._providers_state)

    # ------------------------------------------------------------------
    # Multi-key state migration: state must follow the *key value*, not the
    # *index*.  Deleting or reordering a middle key must not shift cooldown /
    # failure state onto a different key.
    # ------------------------------------------------------------------

    def test_migration_after_deleting_first_key_preserves_remaining_state(self):
        """Delete key[0] ("k1"); the cooldown on key[1] ("k2") must stay on k2."""
        old = UpstreamRouter(_cfg(self.providers))
        old._keys_state[("alpha", 1)].cooldown_until = time.time() + 300
        old._keys_state[("alpha", 1)].fails = 7

        # Simulate delete_key("alpha", 0): k1 is gone, k2 shifts to index 0.
        new_cfg = _cfg({
            "alpha": {"base_url": "https://a.test", "keys": ["k2"]},
            "beta": self.providers["beta"],
        })
        new = UpstreamRouter(new_cfg)
        new.migrate_state_from(old)

        # k2 is now at index 0 — its cooldown and fails must follow.
        self.assertGreater(new._keys_state[("alpha", 0)].cooldown_until, time.time())
        self.assertEqual(new._keys_state[("alpha", 0)].fails, 7)
        # k1's old slot (index 0 in old router) must NOT leak into k2's state.
        self.assertNotIn(("alpha", 1), new._keys_state)

    def test_migration_after_deleting_middle_key_preserves_state(self):
        """Three keys [A, B, C]; delete B (index 1); A and C keep their state."""
        providers = {
            "p": {"base_url": "https://x.test", "keys": ["A", "B", "C"]},
        }
        old = UpstreamRouter(_cfg(providers))
        old._keys_state[("p", 0)].fails = 1          # A
        old._keys_state[("p", 1)].cooldown_until = time.time() + 120  # B
        old._keys_state[("p", 2)].fails = 9          # C

        # Delete B: keys become [A, C]
        new_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["A", "C"]}})
        new = UpstreamRouter(new_cfg)
        new.migrate_state_from(old)

        self.assertEqual(new._keys_state[("p", 0)].fails, 1)          # A keeps fails=1
        self.assertEqual(new._keys_state[("p", 1)].fails, 9)          # C keeps fails=9
        # B's cooldown must NOT land on C.
        self.assertEqual(new._keys_state[("p", 1)].cooldown_until, 0.0)

    def test_migration_after_reordering_keys_preserves_state(self):
        """Reorder [A, B] → [B, A]; state must follow the key value."""
        old = UpstreamRouter(_cfg(self.providers))
        old._keys_state[("alpha", 0)].fails = 3   # k1
        old._keys_state[("alpha", 1)].fails = 8   # k2

        new_cfg = _cfg({
            "alpha": {"base_url": "https://a.test", "keys": ["k2", "k1"]},
            "beta": self.providers["beta"],
        })
        new = UpstreamRouter(new_cfg)
        new.migrate_state_from(old)

        self.assertEqual(new._keys_state[("alpha", 0)].fails, 8)   # k2 now idx 0
        self.assertEqual(new._keys_state[("alpha", 1)].fails, 3)   # k1 now idx 1

    def test_migration_duplicate_key_values_get_first_match(self):
        """If the same key value appears twice in the new config, the first
        matching index wins and the second gets no migrated state."""
        old = UpstreamRouter(_cfg({"p": {"base_url": "https://x.test", "keys": ["K"]}}))
        old._keys_state[("p", 0)].fails = 5

        new_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["K", "K"]}})
        new = UpstreamRouter(new_cfg)
        new.migrate_state_from(old)

        self.assertEqual(new._keys_state[("p", 0)].fails, 5)
        # The second slot was created by _init_states but receives no migration.
        self.assertEqual(new._keys_state[("p", 1)].fails, 0)


class KeyFingerprintPersistenceTests(unittest.TestCase):
    """Verify dump_state / load_state survive key-list reordering via key_hint."""

    def test_dump_state_includes_key_hint(self):
        cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["secret-A"]}})
        r = UpstreamRouter(cfg)
        state = r.dump_state()
        entry = state["keys"]["p\x000"]
        self.assertIn("key_hint", entry)
        self.assertTrue(entry["key_hint"])
        self.assertNotIn("secret", entry["key_hint"])

    def test_load_state_matches_by_fingerprint_after_reorder(self):
        """State saved with keys [A, B] must restore correctly when config is
        reordered to [B, A] before restart."""
        old_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["A", "B"]}})
        old = UpstreamRouter(old_cfg)
        old._keys_state[("p", 0)].fails = 4          # A
        old._keys_state[("p", 1)].cooldown_until = time.time() + 200  # B
        state = old.dump_state()

        # Restart with reordered keys [B, A]
        new_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["B", "A"]}})
        new = UpstreamRouter(new_cfg)
        new.load_state(state)

        # B is now at index 0, A at index 1.
        self.assertGreater(new._keys_state[("p", 0)].cooldown_until, time.time())  # B
        self.assertEqual(new._keys_state[("p", 1)].fails, 4)                       # A

    def test_load_state_falls_back_to_index_without_hint(self):
        """Old state files without key_hint must still work via index fallback."""
        old_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["A"]}})
        old = UpstreamRouter(old_cfg)
        old._keys_state[("p", 0)].fails = 2
        state = old.dump_state()
        # Strip the hint to simulate a legacy state file.
        state["keys"]["p\x000"].pop("key_hint", None)

        new = UpstreamRouter(old_cfg)
        new.load_state(state)
        self.assertEqual(new._keys_state[("p", 0)].fails, 2)

    def test_load_state_skips_unknown_key_after_deletion(self):
        """State for a key that no longer exists must be silently dropped."""
        old_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["A", "B"]}})
        old = UpstreamRouter(old_cfg)
        old._keys_state[("p", 1)].fails = 6  # B
        state = old.dump_state()

        # Restart with only [A] — B is gone.
        new_cfg = _cfg({"p": {"base_url": "https://x.test", "keys": ["A"]}})
        new = UpstreamRouter(new_cfg)
        new.load_state(state)

        self.assertNotIn(("p", 1), new._keys_state)


class RuntimeStatePersistenceTests(unittest.TestCase):
    def test_apply_runtime_config_does_not_replace_newer_discovery_with_stale_overlay_snapshot(self):
        """A config save must not resurrect capabilities persisted by an older overlay.

        Discovery state is persisted in router_state.json. Legacy runtime overlays
        can still contain provider_model_capabilities; rebuilding config from that
        overlay must retain the newer live snapshot instead of replacing it.
        """
        provider = {"base_url": "https://a.test", "keys": ["k1"]}
        live_cfg = {
            "providers": {"alpha": provider},
            "models": {
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 200,
                        "models": ["new-model"],
                        "canonical_map": {"new-model": "new-model"},
                    }
                }
            },
            "routing": {},
        }
        rebuilt_from_overlay = {
            "providers": {"alpha": provider},
            "models": {
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 100,
                        "models": ["old-model"],
                        "canonical_map": {"old-model": "old-model"},
                    }
                }
            },
            "routing": {},
        }
        originals = {
            "CONFIG": sse2json.CONFIG,
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
            "OBSERVABILITY": sse2json.OBSERVABILITY,
            "AUDIT": sse2json.AUDIT,
            "RUNTIME": sse2json.RUNTIME,
            "MODEL_DISCOVERY_QUEUE": sse2json.MODEL_DISCOVERY_QUEUE,
        }
        try:
            sse2json.CONFIG = live_cfg
            sse2json.ROUTER = UpstreamRouter(live_cfg)
            sse2json.MODEL_DISCOVERY_QUEUE = None
            with patch.object(sse2json, "_save_router_state"):
                sse2json._apply_runtime_config(rebuilt_from_overlay)

            capability = sse2json.CONFIG["models"]["provider_model_capabilities"]["alpha"]
            self.assertEqual(capability["fetched_at"], 200)
            self.assertEqual(capability["models"], ["new-model"])
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)

    def test_apply_runtime_config_persists_migrated_router_state(self):
        old_cfg = {
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["k1"]}},
            "models": {
                "provider_key_model_capabilities": {
                    "alpha": {
                        key_fingerprint("k1"): {
                            "status": "ok",
                            "key_index": 0,
                            "models": ["alpha-model"],
                            "canonical_map": {"alpha-model": "alpha-model"},
                        }
                    }
                }
            },
            "routing": {},
        }
        old_router = UpstreamRouter(old_cfg)
        old_router._keys_state[("alpha", 0)].fails = 3
        new_cfg = {
            "providers": {
                "alpha": {"base_url": "https://a.test", "keys": ["k1"]},
                "beta": {"base_url": "https://b.test", "keys": ["k2"]},
            },
            "models": {},
            "routing": {},
        }

        originals = {
            "CONFIG": sse2json.CONFIG,
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
            "OBSERVABILITY": sse2json.OBSERVABILITY,
            "AUDIT": sse2json.AUDIT,
            "RUNTIME": sse2json.RUNTIME,
            "MODEL_DISCOVERY_QUEUE": sse2json.MODEL_DISCOVERY_QUEUE,
        }
        try:
            sse2json.CONFIG = old_cfg
            sse2json.ROUTER = old_router
            sse2json.MODEL_DISCOVERY_QUEUE = None

            with patch.object(sse2json, "_save_router_state") as save_router_state:
                sse2json._apply_runtime_config(new_cfg)

            save_router_state.assert_called_once_with()
            self.assertEqual(sse2json.ROUTER._keys_state[("alpha", 0)].fails, 3)
            self.assertIn(("beta", 0), sse2json.ROUTER._keys_state)
            retained = sse2json.CONFIG["models"]["provider_key_model_capabilities"]["alpha"]
            self.assertEqual(retained[key_fingerprint("k1")]["models"], ["alpha-model"])
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)

    def test_router_state_file_restores_provider_model_capabilities(self):
        cfg = {
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["k1"]}},
            "models": {
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 123,
                        "models": ["raw-alpha-model"],
                        "canonical_map": {"canonical-alpha": "raw-alpha-model"},
                        "formats": ["chat_completions"],
                    }
                },
                "provider_key_model_capabilities": {
                    "alpha": {
                        key_fingerprint("k1"): {
                            "status": "ok",
                            "key_index": 0,
                            "fetched_at": 123,
                            "models": ["raw-alpha-model"],
                            "canonical_map": {"canonical-alpha": "raw-alpha-model"},
                        }
                    }
                },
            },
        }
        router = UpstreamRouter(cfg)
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "router_state.json")
            with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router), patch.object(
                sse2json, "_ROUTER_STATE_FILE", path
            ):
                sse2json.model_registry.restore_union_model_ids({"canonical-alpha"})
                sse2json.model_registry.rebuild_models_union_snapshot(cfg, router)
                sse2json._save_router_state()

            restored_cfg = {
                "providers": {"alpha": {"base_url": "https://a.test", "keys": ["k1"]}},
                "models": {"provider_model_capabilities": {}},
            }
            restored_router = UpstreamRouter(restored_cfg)
            with patch.object(sse2json, "CONFIG", restored_cfg), patch.object(sse2json, "ROUTER", restored_router), patch.object(
                sse2json, "_ROUTER_STATE_FILE", path
            ):
                sse2json.model_registry.clear_cache()
                sse2json._load_router_state()

            caps = restored_cfg["models"]["provider_model_capabilities"]["alpha"]
            self.assertEqual(caps["canonical_map"]["canonical-alpha"], "raw-alpha-model")
            key_caps = restored_cfg["models"]["provider_key_model_capabilities"]["alpha"]
            self.assertEqual(key_caps[key_fingerprint("k1")]["models"], ["raw-alpha-model"])
            self.assertIn("canonical-alpha", sse2json.model_registry.union_model_ids())
            self.assertEqual(
                restored_cfg["models"]["models_union_snapshot"]["payload"]["data"][0]["id"],
                "raw-alpha-model",
            )

    def test_provider_capability_snapshot_marks_config_signature_mismatch_stale(self):
        cfg = {
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["k1"]}},
            "models": {
                "models_source": "union",
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 123,
                        "models": ["raw-alpha-model"],
                        "canonical_map": {"canonical-alpha": "raw-alpha-model"},
                        "formats": ["chat_completions"],
                        "config_signature": "old-signature",
                    }
                },
            },
        }

        with patch.object(sse2json, "CONFIG", cfg):
            snapshot = sse2json._provider_capability_snapshot("alpha")

        self.assertEqual(snapshot["status"], "stale")
        self.assertEqual(snapshot["fetched_at"], 0)
        self.assertEqual(snapshot["canonical_map"]["canonical-alpha"], "raw-alpha-model")


class ObservabilityMigrationTests(unittest.TestCase):
    def _cfg(self):
        return {"providers": {}, "observability": {"recent_requests_limit": 50}}

    def test_counters_are_carried_over(self):
        old = ProxyObservability(self._cfg())
        old._counters["requests_total"] = 17
        old._counters["by_provider"]["alpha"] = {"attempts": 3, "success": 2}
        old._recent.append({"request_id": "r1"})
        old._active["r2"] = {"request_id": "r2"}

        new = ProxyObservability(self._cfg())
        new.migrate_counters_from(old)

        self.assertEqual(new._counters["requests_total"], 17)
        self.assertEqual(new._counters["by_provider"]["alpha"]["attempts"], 3)
        self.assertEqual(len(new._recent), 1)
        self.assertIn("r2", new._active)

    def test_migrate_preserves_last_request_finished_at(self):
        """_last_request_finished_at must be migrated so the idle health
        checker doesn't reset to cold_start (45s) after a config reload."""
        import time as _time
        old = ProxyObservability(self._cfg())
        ts = _time.time() - 600  # 10 minutes ago
        old._last_request_finished_at = ts

        new = ProxyObservability(self._cfg())
        new.migrate_counters_from(old)

        self.assertEqual(new._last_request_finished_at, ts,
                         "_last_request_finished_at must survive config reload "
                         "so idle tier doesn't reset to cold_start")

    def test_migrate_forwards_last_request_finished_at(self):
        """When an in-flight request calls record_request_end on the OLD
        observability after config hot-swap, the NEW observability must
        receive the updated _last_request_finished_at via forwarding."""
        import time as _time
        old = ProxyObservability(self._cfg())
        # Simulate a request that started before config reload
        old.record_request_start(
            "r1", client_format="chat_completions", endpoint="chat_completions",
            model="test-model", stream=False, path="/v1/chat/completions",
        )

        # Config reload creates a new observability and migrates state
        new = ProxyObservability(self._cfg())
        new.migrate_counters_from(old)

        # At this point, new._last_request_finished_at should be 0.0 (no
        # request has finished yet on either old or new)
        self.assertEqual(new._last_request_finished_at, 0.0)

        # The in-flight request finishes — record_request_end is called on
        # the OLD observability (because the request handler captured it
        # before the config reload)
        old.record_request_end("r1", status_code=200)

        # The NEW observability should now have the updated timestamp
        self.assertGreater(new._last_request_finished_at, 0.0,
                           "record_request_end on old observability must "
                           "forward _last_request_finished_at to the new one")

    def test_migrate_from_none_is_noop(self):
        new = ProxyObservability(self._cfg())
        new.migrate_counters_from(None)
        self.assertEqual(new._counters["requests_total"], 0)

    def test_last_request_finished_at_falls_back_to_recent(self):
        """When _last_request_finished_at is 0.0 (e.g. lost during a
        multi-hop migration chain B→C→D), last_request_finished_at()
        must fall back to the most recent _recent entry's finished_at
        timestamp.  The _recent deque is shared by reference across
        migrations, so it always has the latest data."""
        import time as _time
        obs = ProxyObservability(self._cfg())
        # Simulate a completed request
        obs.record_request_start(
            "r1", client_format="chat_completions", endpoint="chat_completions",
            model="test-model", stream=False, path="/v1/chat/completions",
        )
        obs.record_request_end("r1", status_code=200)
        ts1 = obs.last_request_finished_at()
        self.assertGreater(ts1, 0.0, "record_request_end should set the timestamp")

        # Simulate the scalar being lost (multi-hop migration chain)
        obs._last_request_finished_at = 0.0

        # The fallback should kick in and return the timestamp from _recent
        ts2 = obs.last_request_finished_at()
        self.assertGreater(ts2, 0.0,
                           "last_request_finished_at() must fall back to "
                           "_recent when the scalar is 0.0")
        self.assertAlmostEqual(ts2, ts1, delta=1.0,
                               msg="fallback should return the same timestamp "
                                   "that record_request_end set")


class RuntimeSwapConsistencyTests(unittest.TestCase):
    """Verify _request_runtime returns an internally consistent bundle even
    while the module global RUNTIME is being swapped concurrently."""

    def test_request_runtime_snapshot_is_internally_consistent_under_swap(self):
        import threading
        from upstream_client import OpenAIUpstreamClient
        from observability import ProxyObservability
        from audit_store import AdminAuditStore

        def _make_bundle(tag):
            cfg = {"providers": {}, "models": {}, "tag": tag}
            router = UpstreamRouter(cfg)
            client = OpenAIUpstreamClient(cfg)
            obs = ProxyObservability(cfg)
            audit = AdminAuditStore(cfg)
            return sse2json.RuntimeContext(cfg, router, client, obs, audit)

        bundle_a = _make_bundle("A")
        bundle_b = _make_bundle("B")

        originals = {
            "CONFIG": sse2json.CONFIG,
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
            "OBSERVABILITY": sse2json.OBSERVABILITY,
            "AUDIT": sse2json.AUDIT,
            "RUNTIME": sse2json.RUNTIME,
        }

        observed = []
        stop = threading.Event()
        inconsistencies = []

        def reader():
            while not stop.is_set():
                rt = sse2json._request_runtime()
                # Each snapshot must be internally consistent: all five fields
                # must come from the SAME bundle instance.
                tag = rt.config.get("tag")
                expected_bundle = bundle_a if tag == "A" else bundle_b if tag == "B" else None
                if expected_bundle is None:
                    inconsistencies.append(("unknown_tag", tag))
                    continue
                if not (
                    rt.router is expected_bundle.router
                    and rt.upstream_client is expected_bundle.upstream_client
                    and rt.observability is expected_bundle.observability
                    and rt.audit is expected_bundle.audit
                ):
                    inconsistencies.append(("torn", tag))
                observed.append(tag)

        try:
            # Install bundle A so RUNTIME and legacy globals are consistent
            # (the production invariant). _request_runtime will return RUNTIME
            # directly without rebuilding.
            sse2json.RUNTIME = bundle_a
            sse2json.CONFIG = bundle_a.config
            sse2json.ROUTER = bundle_a.router
            sse2json.UPSTREAM_CLIENT = bundle_a.upstream_client
            sse2json.OBSERVABILITY = bundle_a.observability
            sse2json.AUDIT = bundle_a.audit

            t = threading.Thread(target=reader, daemon=True)
            t.start()

            # Hammer the swap from A <-> B many times. Each swap mimics
            # _apply_runtime_config: reassign RUNTIME first, then legacy globals
            # follow immediately. The reader must never observe a torn bundle.
            for _ in range(200):
                target = bundle_b if sse2json.RUNTIME is bundle_a else bundle_a
                sse2json.RUNTIME = target
                sse2json.CONFIG = target.config
                sse2json.ROUTER = target.router
                sse2json.UPSTREAM_CLIENT = target.upstream_client
                sse2json.OBSERVABILITY = target.observability
                sse2json.AUDIT = target.audit

            stop.set()
            t.join(timeout=5)

            self.assertFalse(t.is_alive(), "reader thread did not stop")
            self.assertGreater(len(observed), 0, "reader never observed any snapshot")
            self.assertEqual(inconsistencies, [], f"observed torn/inconsistent bundles: {inconsistencies[:5]}")
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)

    def test_request_runtime_falls_back_to_legacy_globals_when_patched(self):
        # When a test patches legacy globals directly, RUNTIME still points at
        # the unpatched bundle. _request_runtime must detect the mismatch and
        # rebuild from the patched globals so handlers observe the fake objects.
        from upstream_client import OpenAIUpstreamClient

        fake_router = UpstreamRouter({"providers": {}, "models": {}})
        fake_client = OpenAIUpstreamClient({"providers": {}, "models": {}})
        originals = {
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
        }
        try:
            sse2json.ROUTER = fake_router
            sse2json.UPSTREAM_CLIENT = fake_client
            rt = sse2json._request_runtime()
            # The returned snapshot must reflect the patched globals, not the
            # cached RUNTIME bundle.
            self.assertIs(rt.router, fake_router)
            self.assertIs(rt.upstream_client, fake_client)
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)

    def test_save_router_state_uses_consistent_runtime_snapshot(self):
        """_save_router_state must use _request_runtime() so that router state
        and model capabilities come from the same config snapshot, preventing
        a torn read during concurrent config hot-swap."""
        import json

        cfg_a = {
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["k1"]}},
            "models": {"provider_model_capabilities": {
                "alpha": {"status": "ok", "models": ["alpha-model"], "canonical_map": {}},
            }},
            "routing": {},
        }
        router_a = UpstreamRouter(cfg_a)
        router_a._keys_state[("alpha", 0)].fails = 7

        from upstream_client import OpenAIUpstreamClient
        from audit_store import AdminAuditStore
        client_a = OpenAIUpstreamClient(cfg_a)
        obs_a = ProxyObservability(cfg_a)
        audit_a = AdminAuditStore(cfg_a)
        bundle_a = sse2json.RuntimeContext(cfg_a, router_a, client_a, obs_a, audit_a)

        originals = {
            "CONFIG": sse2json.CONFIG,
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
            "OBSERVABILITY": sse2json.OBSERVABILITY,
            "AUDIT": sse2json.AUDIT,
            "RUNTIME": sse2json.RUNTIME,
            "MODEL_DISCOVERY_QUEUE": sse2json.MODEL_DISCOVERY_QUEUE,
        }

        tmpdir = tempfile.mkdtemp()
        state_file = os.path.join(tmpdir, "router_state.json")
        try:
            # Install bundle_a as the consistent runtime
            sse2json.RUNTIME = bundle_a
            sse2json.CONFIG = cfg_a
            sse2json.ROUTER = router_a
            sse2json.UPSTREAM_CLIENT = client_a
            sse2json.OBSERVABILITY = obs_a
            sse2json.AUDIT = audit_a
            sse2json.MODEL_DISCOVERY_QUEUE = None

            with patch.object(sse2json, "_ROUTER_STATE_FILE", state_file):
                sse2json._save_router_state()

            with open(state_file, "r", encoding="utf-8") as f:
                state = json.load(f)

            # Router state must come from bundle_a's router
            self.assertIn("alpha", state["router"]["providers"])
            # The key state must reflect the seeded fails count
            alpha_key = state["router"]["keys"].get("alpha\x000") or {}
            self.assertEqual(alpha_key.get("fails"), 7)
            # Model capabilities must come from bundle_a's config
            self.assertIn("alpha", state["model_capabilities"])
            self.assertEqual(state["model_capabilities"]["alpha"]["status"], "ok")
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)

    def test_save_router_state_never_produces_torn_state_under_swap(self):
        """Concurrent _save_router_state calls during config hot-swap must
        never produce a state file where router providers and model
        capabilities come from different configs."""
        import json
        import threading

        def _make_bundle(tag):
            cfg = {
                "providers": {tag: {"base_url": f"https://{tag}.test", "keys": [f"k-{tag}"]}},
                "models": {"provider_model_capabilities": {
                    tag: {"status": "ok", "models": [f"{tag}-model"], "canonical_map": {}},
                }},
                "routing": {},
            }
            router = UpstreamRouter(cfg)
            from upstream_client import OpenAIUpstreamClient
            from audit_store import AdminAuditStore
            client = OpenAIUpstreamClient(cfg)
            obs = ProxyObservability(cfg)
            audit = AdminAuditStore(cfg)
            return sse2json.RuntimeContext(cfg, router, client, obs, audit), cfg

        bundle_a, cfg_a = _make_bundle("alpha")
        bundle_b, cfg_b = _make_bundle("beta")

        originals = {
            "CONFIG": sse2json.CONFIG,
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
            "OBSERVABILITY": sse2json.OBSERVABILITY,
            "AUDIT": sse2json.AUDIT,
            "RUNTIME": sse2json.RUNTIME,
            "MODEL_DISCOVERY_QUEUE": sse2json.MODEL_DISCOVERY_QUEUE,
        }

        tmpdir = tempfile.mkdtemp()
        state_file = os.path.join(tmpdir, "router_state.json")
        torn_states = []
        save_count = [0]

        try:
            # Install bundle_a as the initial consistent runtime
            sse2json.RUNTIME = bundle_a
            sse2json.CONFIG = cfg_a
            sse2json.ROUTER = bundle_a.router
            sse2json.UPSTREAM_CLIENT = bundle_a.upstream_client
            sse2json.OBSERVABILITY = bundle_a.observability
            sse2json.AUDIT = bundle_a.audit
            sse2json.MODEL_DISCOVERY_QUEUE = None

            stop = threading.Event()

            def saver():
                while not stop.is_set():
                    with patch.object(sse2json, "_ROUTER_STATE_FILE", state_file):
                        sse2json._save_router_state()
                    save_count[0] += 1
                    # Read and validate the saved state is not torn
                    try:
                        with open(state_file, "r", encoding="utf-8") as f:
                            state = json.load(f)
                        router_providers = set(state.get("router", {}).get("providers", {}).keys())
                        cap_providers = set(state.get("model_capabilities", {}).keys())
                        # The providers in router state and model capabilities
                        # must be the same set — they come from the same config.
                        if router_providers != cap_providers:
                            torn_states.append((router_providers, cap_providers))
                    except Exception:
                        pass

            t = threading.Thread(target=saver, daemon=True)
            t.start()

            # Hammer the swap between A and B while saving
            for _ in range(100):
                target = bundle_b if sse2json.RUNTIME is bundle_a else bundle_a
                sse2json.RUNTIME = target
                sse2json.CONFIG = target.config
                sse2json.ROUTER = target.router
                sse2json.UPSTREAM_CLIENT = target.upstream_client
                sse2json.OBSERVABILITY = target.observability
                sse2json.AUDIT = target.audit

            stop.set()
            t.join(timeout=5)
            self.assertFalse(t.is_alive(), "saver thread did not stop")
            self.assertGreater(save_count[0], 0, "saver never ran")
            self.assertEqual(torn_states, [], f"observed torn states: {torn_states[:5]}")
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)


class AdminProbeNoIdleResetTests(unittest.TestCase):
    """Verify that admin_probe (manual key test) requests do NOT refresh
    _last_request_finished_at, which would reset the idle health checker's
    adaptive cadence to 'recent' (30s)."""

    def _cfg(self):
        return {"providers": {}, "models": {}, "routing": {}}

    def test_admin_probe_does_not_update_last_request_finished_at(self):
        """record_request_end with client_format='admin_probe' must NOT
        update _last_request_finished_at."""
        import time as _time
        obs = ProxyObservability(self._cfg())
        # Baseline: no requests yet
        self.assertEqual(obs._last_request_finished_at, 0.0)

        # Simulate a manual key test (admin_probe)
        obs.record_request_start(
            "probe-1", client_format="admin_probe", endpoint="key_test",
            model="test-model", stream=False, path="/-/admin/providers/p/keys/0/test",
        )
        obs.record_request_end("probe-1", status_code=200)

        # _last_request_finished_at must still be 0.0 — admin probes are
        # diagnostic, not real user traffic.
        self.assertEqual(obs._last_request_finished_at, 0.0,
                         "admin_probe must not update _last_request_finished_at")

    def test_real_request_updates_last_request_finished_at(self):
        """Sanity check: real (non-admin-probe) requests DO update
        _last_request_finished_at."""
        obs = ProxyObservability(self._cfg())
        obs.record_request_start(
            "r1", client_format="chat_completions", endpoint="chat_completions",
            model="test-model", stream=False, path="/v1/chat/completions",
        )
        obs.record_request_end("r1", status_code=200)
        self.assertGreater(obs._last_request_finished_at, 0.0,
                           "real requests must update _last_request_finished_at")

    def test_admin_probe_with_key_test_endpoint_does_not_update(self):
        """Even if client_format is not 'admin_probe', endpoint='key_test'
        should also prevent updating _last_request_finished_at."""
        obs = ProxyObservability(self._cfg())
        obs.record_request_start(
            "probe-2", client_format="unknown", endpoint="key_test",
            model="test-model", stream=False, path="/-/admin/providers/p/keys/0/test",
        )
        obs.record_request_end("probe-2", status_code=404)
        self.assertEqual(obs._last_request_finished_at, 0.0,
                         "key_test endpoint must not update _last_request_finished_at")

    def test_admin_probe_does_not_forward_during_migration(self):
        """admin_probe on OLD observability must NOT forward timestamp to NEW."""
        old = ProxyObservability(self._cfg())
        new = ProxyObservability(self._cfg())
        new.migrate_counters_from(old)

        old.record_request_start(
            "probe-3", client_format="admin_probe", endpoint="key_test",
            model="m", stream=False, path="/test",
        )
        old.record_request_end("probe-3", status_code=200)

        self.assertEqual(new._last_request_finished_at, 0.0,
                         "admin_probe must not forward _last_request_finished_at")


class ProbeModelDisabledTests(unittest.TestCase):
    """Verify that disabled models are not selected for probing."""

    def setUp(self):
        self.providers = {
            "alpha": {
                "base_url": "https://a.test",
                "keys": ["k1"],
                "static_models": ["model-a", "model-b"],
                "formats": {"chat_completions": {"enabled": True, "path": "/v1/chat/completions"}},
            },
        }

    def _cfg_with_disabled(self, disabled_models):
        return {
            "providers": self.providers,
            "models": {
                "provider_model_disabled": {"alpha": {m: True for m in disabled_models}},
            },
            "routing": {},
        }

    def test_provider_supports_model_rejects_disabled(self):
        """_provider_supports_model returns False for disabled models."""
        cfg = self._cfg_with_disabled(["model-a"])
        self.assertFalse(sse2json._provider_supports_model("alpha", "model-a", cfg),
                         "disabled model should not be 'supported'")
        self.assertTrue(sse2json._provider_supports_model("alpha", "model-b", cfg),
                        "non-disabled model should be supported")

    def test_pick_probe_model_skips_disabled_static(self):
        """_pick_probe_model_with_source skips disabled static_models."""
        cfg = self._cfg_with_disabled(["model-a"])
        model, source = sse2json._pick_probe_model_with_source("alpha", observability=None, config=cfg)
        self.assertIsNotNone(model, "should find a non-disabled model")
        self.assertEqual(model, "model-b")
        self.assertEqual(source, "static")

    def test_pick_probe_model_all_disabled_returns_none(self):
        """When all models are disabled, _pick_probe_model_with_source returns None."""
        cfg = self._cfg_with_disabled(["model-a", "model-b"])
        model, source = sse2json._pick_probe_model_with_source("alpha", observability=None, config=cfg)
        self.assertIsNone(model, "should return None when all models are disabled")

    def test_pick_probe_model_skips_disabled_manual_map(self):
        """_pick_probe_model_with_source skips disabled models in provider_model_map."""
        cfg = {
            "providers": self.providers,
            "models": {
                "provider_model_map": {"alpha": {"gpt-5": "gpt-5-upstream", "gpt-4": "gpt-4-upstream"}},
                "provider_model_disabled": {"alpha": {"gpt-5": True}},
            },
            "routing": {},
        }
        model, source = sse2json._pick_probe_model_with_source("alpha", observability=None, config=cfg)
        self.assertEqual(model, "gpt-4")
        self.assertEqual(source, "manual_map")

    def test_pick_probe_model_skips_disabled_route(self):
        """_pick_probe_model_with_source skips disabled route models."""
        # Use a provider WITHOUT static_models so the route path is exercised.
        providers_no_static = {
            "alpha": {
                "base_url": "https://a.test",
                "keys": ["k1"],
                "formats": {"chat_completions": {"enabled": True, "path": "/v1/chat/completions"}},
            },
        }
        cfg = {
            "providers": providers_no_static,
            "models": {
                "routes": {
                    "route-model-1": {"providers": [{"name": "alpha"}]},
                    "route-model-2": {"providers": [{"name": "alpha"}]},
                },
                "provider_model_disabled": {"alpha": {"route-model-1": True}},
            },
            "routing": {},
        }
        model, source = sse2json._pick_probe_model_with_source("alpha", observability=None, config=cfg)
        self.assertEqual(model, "route-model-2")
        self.assertEqual(source, "route")

    def test_build_probe_plan_skips_disabled_recent_model(self):
        """_build_probe_plan Phase 1 skips providers where the recent model
        is disabled."""
        cfg = {
            "providers": self.providers,
            "models": {
                "static_models_via_provider": True,
                "provider_model_disabled": {"alpha": {"model-a": True}},
            },
            "routing": {},
        }
        from router import UpstreamRouter
        router = UpstreamRouter(cfg)

        # Mock observability that returns "model-a" as recent success
        class MockObs:
            def latest_successful_model_for_provider(self, provider):
                return "model-a" if provider == "alpha" else None

        plan = sse2json._build_probe_plan(MockObs(), cfg, router)
        # "model-a" is disabled for alpha, so Phase 1 should skip it.
        # Phase 2 should fall back to alpha's own default model.
        alpha_entries = [(p, m, s) for p, m, s in plan if p == "alpha"]
        self.assertTrue(alpha_entries, "alpha should still be in the plan via fallback")
        # The model should NOT be "model-a"
        for _, m, _ in alpha_entries:
            self.assertNotEqual(m, "model-a",
                                "disabled model-a should not appear in the plan")


if __name__ == "__main__":
    unittest.main()
