#!/usr/bin/env python3
"""Tests for model mapping auto-discovery (find_providers_for_model / infer_model_mapping)."""
from __future__ import annotations

import unittest
from typing import Any, Dict

from model_registry import find_providers_for_model, infer_model_mapping


def _config_with_caps() -> Dict[str, Any]:
    """Config with discovered model capabilities for two providers."""
    return {
        "providers": {
            "openai": {
                "enabled": True,
                "base_url": "https://api.openai.com",
                "keys": [{"key": "sk-test"}],
                "formats": {"chat_completions": {"enabled": True, "path": "/v1/chat/completions"}},
            },
            "deepseek": {
                "enabled": True,
                "base_url": "https://api.deepseek.com",
                "keys": [{"key": "sk-test"}],
                "formats": {"chat_completions": {"enabled": True, "path": "/v1/chat/completions"}},
            },
            "anthropic": {
                "enabled": True,
                "base_url": "https://api.anthropic.com",
                "keys": [{"key": "sk-test"}],
                "formats": {"anthropic_messages": {"enabled": True, "path": "/v1/messages"}},
            },
        },
        "models": {
            "models_source": "union",
            "provider_model_capabilities": {
                "openai": {
                    "status": "ok",
                    "canonical_map": {
                        "gpt-4": "gpt-4",
                        "gpt-4o": "gpt-4o",
                        "gpt-4o-mini": "gpt-4o-mini",
                    },
                    "models": ["gpt-4", "gpt-4o", "gpt-4o-mini"],
                },
                "deepseek": {
                    "status": "ok",
                    "canonical_map": {
                        "deepseek-chat": "deepseek-chat",
                        "deepseek-reasoner": "deepseek-reasoner",
                    },
                    "models": ["deepseek-chat", "deepseek-reasoner"],
                },
                "anthropic": {
                    "status": "ok",
                    "canonical_map": {
                        "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
                        "claude-3-5-haiku": "claude-3-5-haiku-20241022",
                    },
                    "models": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
                },
            },
            "provider_model_map": {},
        },
    }


class TestFindProvidersForModel(unittest.TestCase):

    def test_exact_match(self):
        config = _config_with_caps()
        results = find_providers_for_model(config, "gpt-4")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["provider"], "openai")
        self.assertEqual(results[0]["raw_model"], "gpt-4")
        self.assertEqual(results[0]["match_type"], "exact")

    def test_exact_match_case_insensitive(self):
        config = _config_with_caps()
        results = find_providers_for_model(config, "GPT-4")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["provider"], "openai")

    def test_no_match(self):
        config = _config_with_caps()
        results = find_providers_for_model(config, "nonexistent-model")
        self.assertEqual(results, [])

    def test_manual_map_takes_priority(self):
        config = _config_with_caps()
        config["models"]["provider_model_map"] = {
            "openai": {"gpt-4": "gpt-4-turbo-preview"},
        }
        results = find_providers_for_model(config, "gpt-4")
        # Manual match should be found first
        manual_results = [r for r in results if r["match_type"] == "manual"]
        self.assertEqual(len(manual_results), 1)
        self.assertEqual(manual_results[0]["raw_model"], "gpt-4-turbo-preview")
        # openai should only appear once (manual, not exact)
        openai_results = [r for r in results if r["provider"] == "openai"]
        self.assertEqual(len(openai_results), 1)

    def test_fuzzy_match(self):
        config = _config_with_caps()
        # Add a provider with a differently-named but equivalent model
        config["models"]["provider_model_capabilities"]["custom"] = {
            "status": "ok",
            "canonical_map": {
                "gpt_4": "my-gpt-4-model",  # _safe_model_id normalises to "gpt-4"
            },
            "models": ["my-gpt-4-model"],
        }
        results = find_providers_for_model(config, "gpt-4")
        providers = {r["provider"] for r in results}
        self.assertIn("custom", providers)
        custom_result = next(r for r in results if r["provider"] == "custom")
        self.assertEqual(custom_result["match_type"], "fuzzy")
        self.assertEqual(custom_result["raw_model"], "my-gpt-4-model")

    def test_multiple_providers_exact(self):
        """Multiple providers can match the same canonical model."""
        config = _config_with_caps()
        # Add gpt-4 to deepseek's capabilities too
        config["models"]["provider_model_capabilities"]["deepseek"]["canonical_map"]["gpt-4"] = "deepseek-gpt-4"
        results = find_providers_for_model(config, "gpt-4")
        providers = {r["provider"] for r in results}
        self.assertIn("openai", providers)
        self.assertIn("deepseek", providers)

    def test_empty_model_name(self):
        config = _config_with_caps()
        results = find_providers_for_model(config, "")
        self.assertEqual(results, [])

    def test_none_model_name(self):
        config = _config_with_caps()
        results = find_providers_for_model(config, None)
        self.assertEqual(results, [])

    def test_skips_non_ok_providers(self):
        config = _config_with_caps()
        config["models"]["provider_model_capabilities"]["openai"]["status"] = "error"
        results = find_providers_for_model(config, "gpt-4")
        # openai should not be in results since its status is "error"
        providers = {r["provider"] for r in results}
        self.assertNotIn("openai", providers)


class TestInferModelMapping(unittest.TestCase):

    def test_returns_dict_mapping(self):
        config = _config_with_caps()
        mapping = infer_model_mapping(config, "gpt-4")
        self.assertIsInstance(mapping, dict)
        self.assertEqual(mapping.get("openai"), "gpt-4")

    def test_empty_for_nonexistent(self):
        config = _config_with_caps()
        mapping = infer_model_mapping(config, "nonexistent")
        self.assertEqual(mapping, {})

    def test_multiple_providers(self):
        config = _config_with_caps()
        config["models"]["provider_model_capabilities"]["deepseek"]["canonical_map"]["claude-3-5-sonnet"] = "deepseek-claude"
        mapping = infer_model_mapping(config, "claude-3-5-sonnet")
        self.assertIn("anthropic", mapping)
        self.assertIn("deepseek", mapping)
        self.assertEqual(mapping["anthropic"], "claude-3-5-sonnet-20241022")
        self.assertEqual(mapping["deepseek"], "deepseek-claude")


if __name__ == "__main__":
    unittest.main()
