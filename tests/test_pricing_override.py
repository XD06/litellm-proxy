import os
import tempfile
import unittest

from config_manager import ConfigValidationError, RuntimeConfigManager
from usage_accounting import price_usage


class ModelPricingOverrideConfig(unittest.TestCase):
    def _manager(self):
        base = {
            "server": {"admin_key": "k"},
            "routing": {"default_provider_pool": ["alpha"]},
            "retry": {"retryable_status": [429], "key_fatal_status": [401]},
            "models": {},
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["sk-a"], "priority": 10}},
        }
        tmp = tempfile.TemporaryDirectory()
        overlay = os.path.join(tmp.name, "runtime.json")
        mgr = RuntimeConfigManager(base, overlay_path=overlay)
        self.addCleanup(tmp.cleanup)
        return mgr

    def test_update_and_clear_override(self):
        mgr = self._manager()
        mgr.update_model_pricing_override({"model": "m1", "input": 1.5, "output": 7.5})
        self.assertEqual(
            mgr.config["models"]["pricing_overrides"]["m1"],
            {"input": 1.5, "output": 7.5},
        )
        mgr.update_model_pricing_override({"model": "m1"})
        self.assertFalse(mgr.config["models"]["pricing_overrides"].get("m1"))

    def test_invalid_rates_rejected(self):
        mgr = self._manager()
        with self.assertRaises(ConfigValidationError):
            mgr.update_model_pricing_override({"model": "m1", "input": -1})
        with self.assertRaises(ConfigValidationError):
            mgr.update_model_pricing_override({"model": "m1", "output": "abc"})
        with self.assertRaises(ConfigValidationError):
            mgr.update_model_pricing_override({"model": "m1", "bogus": 1})

    def test_delete_override(self):
        mgr = self._manager()
        mgr.update_model_pricing_override({"model": "m1", "input": 1.0})
        mgr.delete_model_pricing_override("m1")
        self.assertFalse(mgr.config["models"]["pricing_overrides"].get("m1"))


class PricingOverridePriority(unittest.TestCase):
    def _cfg(self, overrides=None):
        return {
            "models": {"pricing_overrides": overrides or {}},
            "providers": {
                "p": {"pricing": {"input_per_million": 1.0, "output_per_million": 2.0}},
            },
        }

    def test_manual_override_beats_provider_config(self):
        cfg = self._cfg({"m": {"input": 5.0, "output": 20.0}})
        r = price_usage(cfg, "p", "m", {"input_tokens": 1000, "output_tokens": 1000})
        self.assertEqual(r["pricing_source"], "manual_override")
        self.assertAlmostEqual(r["cost_usd"], 0.025)

    def test_no_override_falls_back_to_provider_config(self):
        cfg = self._cfg({})
        r = price_usage(cfg, "p", "m", {"input_tokens": 1000, "output_tokens": 1000})
        self.assertEqual(r["pricing_source"], "provider_config")

    def test_fuzzy_model_match(self):
        cfg = self._cfg({"m": {"input": 5.0, "output": 20.0}})
        r = price_usage(cfg, "p", "vendor/m", {"input_tokens": 1000, "output_tokens": 1000})
        self.assertEqual(r["pricing_source"], "manual_override")


if __name__ == "__main__":
    unittest.main()
