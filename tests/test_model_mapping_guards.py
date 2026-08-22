#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for model mapping guards (P0) and drift migration (P3)."""
import json
import os
import tempfile
import unittest

from config_manager import RuntimeConfigManager
from model_registry import detect_mapping_drift, key_supports_provider_model


def make_manager():
    tmp = tempfile.mkdtemp(prefix="mapping_test_")
    base = {
        "server": {"admin_key": "x"},
        "providers": {
            "requesty": {
                "base_url": "https://x.invalid",
                "keys": ["sk-r1"],
                "formats": {"chat_completions": {"enabled": True, "path": "/v1/c"}},
            }
        },
        "models": {},
    }
    return RuntimeConfigManager(base, overlay_path=os.path.join(tmp, "runtime.json"))


class CascadeDeletionGuardTests(unittest.TestCase):
    def test_rename_does_not_delete_other_raw_mapping(self):
        mgr = make_manager()
        mgr.update_provider_model_mapping(
            "requesty",
            model="deepseek-v4-pro-plus",
            raw_model="deepseek/deepseek-v4-pro-0813",
            old_model="",
        )
        # Cross-contaminated row: display name "pro-plus" but raw is flash.
        # Guard must refuse to remove the correct pro mapping.
        mgr.update_provider_model_mapping(
            "requesty",
            model="deepseek-v4-flash-plus",
            old_model="deepseek-v4-pro-plus",
            raw_model="deepseek/deepseek-v4-flash-0731",
        )
        merged = mgr.snapshot()["models"]["provider_model_map"]["requesty"]
        self.assertIn("deepseek-v4-pro-plus", merged)
        self.assertEqual(merged["deepseek-v4-pro-plus"], "deepseek/deepseek-v4-pro-0813")
        self.assertIn("deepseek-v4-flash-plus", merged)
        self.assertIn("refused to remove", mgr.last_model_mapping_warning)

    def test_rename_still_removes_matching_raw(self):
        mgr = make_manager()
        mgr.update_provider_model_mapping(
            "requesty",
            model="deepseek-v4-pro-plus",
            raw_model="deepseek/deepseek-v4-pro-0813",
            old_model="",
        )
        # Same raw, clean rename: removing the old name is allowed.
        mgr.update_provider_model_mapping(
            "requesty",
            model="deepseek-v4-pro-0813",
            old_model="deepseek-v4-pro-plus",
            raw_model="deepseek/deepseek-v4-pro-0813",
        )
        merged = mgr.snapshot()["models"]["provider_model_map"]["requesty"]
        self.assertNotIn("deepseek-v4-pro-plus", merged)
        self.assertEqual(merged["deepseek-v4-pro-0813"], "deepseek/deepseek-v4-pro-0813")
        self.assertEqual(mgr.last_model_mapping_warning, "")


class KeySupportNormalizationTests(unittest.TestCase):
    def test_whitelist_raw_value_match_after_rename(self):
        cfg = {
            "providers": {"requesty": {"keys": [
                {"key": "sk-r1", "models": {"deepseek-v4-flash-0731": "deepseek/deepseek-v4-flash-0731"}}
            ]}},
            "models": {},
        }
        self.assertTrue(key_supports_provider_model(
            cfg, "requesty", 0, "deepseek-v4-flash-plus", "deepseek/deepseek-v4-flash-0731"))

    def test_catalog_short_ids_vs_full_raw(self):
        cfg = {
            "providers": {"requesty": {"keys": ["sk-r1"]}},
            "models": {"provider_key_model_capabilities": {"requesty": {"<fp>": {
                "status": "ok",
                "models": ["deepseek-v4-flash-0731"],
                "canonical_map": {"deepseek-v4-flash-0731": "deepseek-v4-flash-0731"},
            }}}},
        }
        import model_registry as mr
        original = mr.key_fingerprint
        mr.key_fingerprint = lambda k: "<fp>"
        try:
            self.assertTrue(key_supports_provider_model(
                cfg, "requesty", 0, "deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0731"))
        finally:
            mr.key_fingerprint = original

    def test_whitelist_does_not_leak_unlisted_model(self):
        cfg = {
            "providers": {"requesty": {"keys": [
                {"key": "sk-r1", "models": {"gpt-4o": "openai/gpt-4o"}}
            ]}},
            "models": {},
        }
        self.assertFalse(key_supports_provider_model(
            cfg, "requesty", 0, "deepseek-v4-flash", "deepseek/deepseek-v4-flash"))


class DriftDetectionTests(unittest.TestCase):
    def test_unique_successor_migrates(self):
        manual = {"flash-plus": "deepseek/deepseek-v4-flash-0731"}
        new = ["deepseek/deepseek-v4-flash-0921", "anthropic/claude-opus-5"]
        self.assertEqual(
            detect_mapping_drift("requesty", manual, new),
            [("flash-plus", "deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-0921")],
        )

    def test_ambiguous_does_not_migrate(self):
        manual = {"flash-plus": "deepseek/deepseek-v4-flash-0731"}
        new = ["deepseek/deepseek-v4-flash-0921", "tensorx/deepseek-v4-flash-0921"]
        self.assertEqual(detect_mapping_drift("requesty", manual, new), [])

    def test_no_drift_when_raw_still_present(self):
        manual = {"flash-plus": "deepseek/deepseek-v4-flash-0731"}
        new = ["deepseek/deepseek-v4-flash-0731"]
        self.assertEqual(detect_mapping_drift("requesty", manual, new), [])

    def test_different_model_no_migration(self):
        manual = {"flash-plus": "deepseek/deepseek-v4-flash-0731"}
        new = ["deepseek/deepseek-v4-pro-0813"]
        self.assertEqual(detect_mapping_drift("requesty", manual, new), [])


if __name__ == "__main__":
    unittest.main()
