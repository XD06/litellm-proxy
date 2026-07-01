#!/usr/bin/env python3
"""Tests for the auto routing mode and hot-reload priority/weight overrides."""
from __future__ import annotations

import unittest
from typing import Any, Dict

from router import UpstreamRouter, PROVIDER_SELECT_MODES


def _base_config() -> Dict[str, Any]:
    return {
        "providers": {
            "alpha": {
                "enabled": True,
                "base_url": "https://alpha.example.com",
                "priority": 10,
                "keys": [{"key": "sk-alpha-1"}],
                "formats": {
                    "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                },
            },
            "beta": {
                "enabled": True,
                "base_url": "https://beta.example.com",
                "priority": 5,
                "keys": [{"key": "sk-beta-1"}],
                "formats": {
                    "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                },
            },
            "gamma": {
                "enabled": True,
                "base_url": "https://gamma.example.com",
                "priority": 1,
                "keys": [{"key": "sk-gamma-1"}],
                "formats": {
                    "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                },
            },
        },
        "routing": {
            "provider_select": "priority_failover",
            "default_provider_pool": ["alpha", "beta", "gamma"],
        },
        "models": {
            "models_source": "union",
            "assume_supports_unknown_models": True,
        },
    }


class TestAutoRoutingMode(unittest.TestCase):
    """Tests for the 'auto' provider_select mode."""

    def test_auto_is_in_valid_modes(self):
        self.assertIn("auto", PROVIDER_SELECT_MODES)

    def test_auto_mode_accepted_by_router(self):
        cfg = _base_config()
        cfg["routing"]["provider_select"] = "auto"
        router = UpstreamRouter(cfg)
        mode = router._provider_select_mode("gpt-4")
        self.assertEqual(mode, "auto")

    def test_auto_mode_falls_back_to_priority_failover_ordering(self):
        """In auto mode, providers should be ordered by priority (like priority_failover)."""
        cfg = _base_config()
        cfg["routing"]["provider_select"] = "auto"
        router = UpstreamRouter(cfg)

        order = router._select_provider_attempts(
            "gpt-4",
            request_id="test-1",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions"],
        )
        # alpha (priority 10) should come before beta (priority 5) before gamma (priority 1)
        providers_in_order = []
        for p, _ in order:
            if p not in providers_in_order:
                providers_in_order.append(p)
        self.assertEqual(providers_in_order, ["alpha", "beta", "gamma"])

    def test_auto_mode_adjusts_priority_based_on_health_scores(self):
        """A provider with a low health score should be deprioritised."""
        cfg = _base_config()
        cfg["routing"]["provider_select"] = "auto"
        router = UpstreamRouter(cfg)

        # Give beta a terrible health score
        router.update_health_scores({
            "providers": {
                "beta": {"score": 20},  # critical → -20 penalty
            },
            "overall": 50,
        })

        order = router._select_provider_attempts(
            "gpt-4",
            request_id="test-2",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions"],
        )
        providers_in_order = []
        for p, _ in order:
            if p not in providers_in_order:
                providers_in_order.append(p)
        # alpha (10) > gamma (1) > beta (5 - 20 = -15)
        self.assertEqual(providers_in_order, ["alpha", "gamma", "beta"])

    def test_auto_mode_no_health_data_uses_base_priority(self):
        """Without health scores, auto mode behaves like priority_failover."""
        cfg = _base_config()
        cfg["routing"]["provider_select"] = "auto"
        router = UpstreamRouter(cfg)
        # No health scores set

        order = router._select_provider_attempts(
            "gpt-4",
            request_id="test-3",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions"],
        )
        providers_in_order = []
        for p, _ in order:
            if p not in providers_in_order:
                providers_in_order.append(p)
        self.assertEqual(providers_in_order, ["alpha", "beta", "gamma"])

    def test_auto_mode_high_score_no_penalty(self):
        """A provider with a good health score should not be penalised."""
        cfg = _base_config()
        cfg["routing"]["provider_select"] = "auto"
        router = UpstreamRouter(cfg)
        router.update_health_scores({
            "providers": {
                "alpha": {"score": 95},
                "beta": {"score": 80},
                "gamma": {"score": 90},
            },
            "overall": 88,
        })

        order = router._select_provider_attempts(
            "gpt-4",
            request_id="test-4",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions"],
        )
        providers_in_order = []
        for p, _ in order:
            if p not in providers_in_order:
                providers_in_order.append(p)
        # All healthy → same as base priority order
        self.assertEqual(providers_in_order, ["alpha", "beta", "gamma"])

    def test_auto_adjusted_priority_thresholds(self):
        """Verify the penalty tiers in _auto_adjusted_priority."""
        cfg = _base_config()
        router = UpstreamRouter(cfg)
        router.update_health_scores({
            "providers": {
                "a": {"score": 75},
                "b": {"score": 74},
                "c": {"score": 50},
                "d": {"score": 49},
                "e": {"score": 25},
                "f": {"score": 24},
            },
            "overall": 50,
        })

        self.assertEqual(router._auto_adjusted_priority("a", 100), 100)  # >= 75: no penalty
        self.assertEqual(router._auto_adjusted_priority("b", 100), 95)   # 50-74: -5
        self.assertEqual(router._auto_adjusted_priority("c", 100), 95)   # 50-74: -5
        self.assertEqual(router._auto_adjusted_priority("d", 100), 90)   # 25-49: -10
        self.assertEqual(router._auto_adjusted_priority("e", 100), 90)   # 25-49: -10
        self.assertEqual(router._auto_adjusted_priority("f", 100), 80)   # < 25: -20

    def test_auto_mode_with_format_preference(self):
        """Auto mode should respect format_preference like priority_failover."""
        cfg = _base_config()
        cfg["routing"]["provider_select"] = "auto"
        cfg["routing"]["format_preference"] = "priority_first"
        # Add a provider with different format
        cfg["providers"]["delta"] = {
            "enabled": True,
            "base_url": "https://delta.example.com",
            "priority": 8,
            "keys": [{"key": "sk-delta-1"}],
            "formats": {
                "anthropic_messages": {"enabled": True, "path": "/v1/messages"},
            },
        }
        cfg["routing"]["default_provider_pool"].append("delta")
        router = UpstreamRouter(cfg)

        order = router._select_provider_attempts(
            "gpt-4",
            request_id="test-5",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions", "anthropic_messages"],
        )
        providers_in_order = []
        for p, _ in order:
            if p not in providers_in_order:
                providers_in_order.append(p)
        # Native (chat_completions) providers: alpha(10), beta(5), gamma(1)
        # Fallback (anthropic_messages): delta(8)
        # With priority_first, alpha > delta > beta > gamma
        self.assertEqual(providers_in_order, ["alpha", "delta", "beta", "gamma"])


class TestHotReloadRouting(unittest.TestCase):
    """Tests for runtime priority/weight hot-reload overrides."""

    def test_update_provider_priority(self):
        cfg = _base_config()
        router = UpstreamRouter(cfg)

        # alpha has priority 10, beta has priority 5
        self.assertEqual(router._provider_priority("alpha"), 10)
        self.assertEqual(router._provider_priority("beta"), 5)

        # Hot-update alpha's priority to 1
        router.update_provider_priority("alpha", 1)
        self.assertEqual(router._provider_priority("alpha"), 1)
        self.assertEqual(router._provider_priority("beta"), 5)

    def test_update_provider_weight(self):
        cfg = _base_config()
        router = UpstreamRouter(cfg)

        self.assertEqual(router._provider_weight("alpha", 3), 3)

        router.update_provider_weight("alpha", 10)
        self.assertEqual(router._provider_weight("alpha", 3), 10)  # override wins

    def test_clear_runtime_overrides(self):
        cfg = _base_config()
        router = UpstreamRouter(cfg)

        router.update_provider_priority("alpha", 99)
        router.update_provider_weight("beta", 7)
        self.assertEqual(router._provider_priority("alpha"), 99)

        router.clear_runtime_overrides("alpha")
        self.assertEqual(router._provider_priority("alpha"), 10)  # back to config
        self.assertEqual(router._provider_weight("beta", 1), 7)  # still overridden

        router.clear_runtime_overrides()
        self.assertEqual(router._provider_weight("beta", 1), 1)

    def test_hot_reload_priority_affects_provider_order(self):
        cfg = _base_config()
        router = UpstreamRouter(cfg)

        # Initially alpha > beta > gamma
        order = router._select_provider_attempts(
            "gpt-4",
            request_id="test-hr-1",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions"],
        )
        providers = []
        for p, _ in order:
            if p not in providers:
                providers.append(p)
        self.assertEqual(providers, ["alpha", "beta", "gamma"])

        # Hot-swap: make gamma the highest priority
        router.update_provider_priority("gamma", 100)

        order2 = router._select_provider_attempts(
            "gpt-4",
            request_id="test-hr-2",
            client_format="chat_completions",
            allowed_upstream_formats=["chat_completions"],
        )
        providers2 = []
        for p, _ in order2:
            if p not in providers2:
                providers2.append(p)
        self.assertEqual(providers2, ["gamma", "alpha", "beta"])

    def test_migrate_state_preserves_runtime_overrides(self):
        cfg = _base_config()
        old_router = UpstreamRouter(cfg)
        old_router.update_provider_priority("alpha", 42)
        old_router.update_provider_weight("beta", 8)
        old_router.update_health_scores({"providers": {"alpha": {"score": 30}}, "overall": 50})

        new_router = UpstreamRouter(cfg)
        new_router.migrate_state_from(old_router)

        self.assertEqual(new_router._provider_priority("alpha"), 42)
        self.assertEqual(new_router._provider_weight("beta", 1), 8)
        self.assertEqual(
            new_router._health_scores.get("providers", {}).get("alpha", {}).get("score"),
            30,
        )

    def test_update_health_scores_stores_data(self):
        cfg = _base_config()
        router = UpstreamRouter(cfg)
        scores = {"providers": {"alpha": {"score": 80}}, "overall": 80}
        router.update_health_scores(scores)
        self.assertEqual(router._health_scores, scores)

    def test_update_health_scores_empty(self):
        cfg = _base_config()
        router = UpstreamRouter(cfg)
        router.update_health_scores(None)
        self.assertEqual(router._health_scores, {})


if __name__ == "__main__":
    unittest.main()
