import os
import tempfile
import time
import unittest
from unittest.mock import patch

import sse2json
from observability import ProxyObservability
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
    def test_apply_runtime_config_persists_migrated_router_state(self):
        old_cfg = {
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["k1"]}},
            "models": {},
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
                }
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

    def test_migrate_from_none_is_noop(self):
        new = ProxyObservability(self._cfg())
        new.migrate_counters_from(None)
        self.assertEqual(new._counters["requests_total"], 0)


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


if __name__ == "__main__":
    unittest.main()
