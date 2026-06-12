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


if __name__ == "__main__":
    unittest.main()
