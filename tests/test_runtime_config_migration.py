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


if __name__ == "__main__":
    unittest.main()
