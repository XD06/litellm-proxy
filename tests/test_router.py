import unittest

from proxy_utils import key_fingerprint
from router import Attempt, UpstreamRouter
from routing_trace import RoutingTrace


def base_config():
    return {
        "routing": {
            "default_provider_pool": ["alpha", "beta", "disabled"],
            "provider_select": "round_robin",
            "max_attempts": 4,
        },
        "retry": {
            "cooldown_s": {},
            "respect_retry_after": True,
        },
        "models": {
            "routes": {},
            "provider_model_map": {},
        },
        "providers": {
            "alpha": {
                "base_url": "https://alpha.example",
                "chat_completions_path": "/v1/chat/completions",
                "keys": ["alpha-key"],
                "enabled": True,
            },
            "beta": {
                "base_url": "https://beta.example",
                "chat_completions_path": "/chat",
                "keys": ["beta-key-1", "beta-key-2"],
                "headers": {"X-Static": "configured"},
                "forward_client_headers": ["X-Trace"],
                "enabled": True,
            },
            "disabled": {
                "base_url": "https://disabled.example",
                "keys": ["disabled-key"],
                "enabled": False,
            },
        },
        "proxy": {},
        "observability": {"log_key_mask": {"prefix": 6, "suffix": 2}},
    }


class RouterTests(unittest.TestCase):
    def test_snapshot_exposes_effective_runtime_priority_override(self):
        cfg = base_config()
        cfg["providers"]["alpha"]["priority"] = 10
        router = UpstreamRouter(cfg)

        before = router.snapshot()["providers"]["alpha"]
        router.update_provider_priority("alpha", 90)
        after = router.snapshot()["providers"]["alpha"]

        self.assertEqual(before["priority"], 10)
        self.assertEqual(before["configured_priority"], 10)
        self.assertFalse(before["priority_override_active"])
        self.assertEqual(after["priority"], 90)
        self.assertEqual(after["configured_priority"], 10)
        self.assertTrue(after["priority_override_active"])

    def test_priority_failover_prefers_high_priority_provider_and_orders_keys_as_fallbacks(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["priority"] = 10
        cfg["providers"]["beta"]["priority"] = 80
        router = UpstreamRouter(cfg)

        first = list(router.iter_attempts("any-model", False, "req-priority-1"))
        second = list(router.iter_attempts("any-model", False, "req-priority-2"))

        self.assertEqual([a.provider for a in first], ["beta", "beta", "alpha"])
        self.assertEqual([a.key_index for a in first[:2]], [0, 1])
        self.assertEqual([a.provider for a in second], ["beta", "beta", "alpha"])
        self.assertEqual([a.key_index for a in second[:2]], [0, 1])

    def test_successive_requests_keep_primary_key_when_it_is_available(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["routing"]["max_attempts"] = 2
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)

        first = next(router.iter_attempts("any-model", False, "req-primary-key-1"))
        router.report_success(first)
        second = next(router.iter_attempts("any-model", False, "req-primary-key-2"))

        self.assertEqual(first.key_index, 0)
        self.assertEqual(second.key_index, 0)
        self.assertEqual(first.key, "beta-key-1")
        self.assertEqual(second.key, "beta-key-1")

    def test_priority_failover_uses_route_priority_override(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["max_attempts"] = 3
        cfg["providers"]["alpha"]["priority"] = 100
        cfg["providers"]["beta"]["priority"] = 10
        cfg["models"]["routes"] = {
            "priority-model": {
                "providers": [
                    {"name": "alpha", "priority": 1},
                    {"name": "beta", "priority": 200},
                ],
                "provider_select": "priority_failover",
            }
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("priority-model", False, "req-route-priority"))

        self.assertEqual([a.provider for a in attempts], ["beta", "beta", "alpha"])

    def test_priority_failover_skips_unavailable_primary_provider(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["providers"]["alpha"]["priority"] = 100
        cfg["providers"]["beta"]["priority"] = 10
        router = UpstreamRouter(cfg)
        first = list(router.iter_attempts("any-model", False, "req-primary"))[0]
        router.report_failure(first, error_type="server_error", http_status=500)
        router.clear_key_state("alpha")
        router._cooldown_provider("alpha", reason="test")

        attempts = list(router.iter_attempts("any-model", False, "req-fallback"))

        self.assertEqual([a.provider for a in attempts], ["beta", "beta"])

    def test_round_robin_rotates_enabled_providers(self):
        router = UpstreamRouter(base_config())

        attempts = list(router.iter_attempts("any-model", False, "req-1"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "beta"])
        self.assertEqual(attempts[0].provider_model, "any-model")
        self.assertEqual(attempts[1].url, "https://beta.example/chat")

    def test_route_round_robin_ignores_provider_weights(self):
        cfg = base_config()
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["keys"] = ["alpha-key-1", "alpha-key-2"]
        cfg["models"]["routes"] = {
            "weighted-model": {
                "providers": [
                    {"name": "alpha", "weight": 1},
                    {"name": "beta", "weight": 2},
                ],
                "provider_select": "round_robin",
            }
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("weighted-model", False, "req-route-rr"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "alpha", "beta"])

    def test_route_weighted_rr_uses_provider_weights(self):
        cfg = base_config()
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["keys"] = ["alpha-key-1", "alpha-key-2"]
        cfg["models"]["routes"] = {
            "weighted-model": {
                "providers": [
                    {"name": "alpha", "weight": 1},
                    {"name": "beta", "weight": 2},
                ],
                "provider_select": "weighted_rr",
            }
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("weighted-model", False, "req-route-weighted"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "beta", "alpha"])

    def test_random_provider_select_is_stable_per_request(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta", "gamma"]
        cfg["routing"]["provider_select"] = "random"
        cfg["routing"]["max_attempts"] = 3
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("any-model", False, "req-random"))

        self.assertEqual([a.provider for a in attempts], ["beta", "gamma", "alpha"])

    def test_provider_model_map_rewrites_provider_model(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["routing"]["max_attempts"] = 3
        cfg["providers"]["alpha"]["enabled"] = False
        cfg["models"]["provider_model_map"] = {
            "beta": {"canonical-model": "beta-real-model"},
        }
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "canonical-model",
                False,
                "req-2",
                client_headers={"X-Trace": "trace-id"},
            )
        )

        self.assertEqual([a.provider for a in attempts], ["beta", "beta"])
        self.assertEqual([a.key for a in attempts], ["beta-key-1", "beta-key-2"])
        self.assertTrue(all(a.provider_model == "beta-real-model" for a in attempts))
        self.assertEqual(attempts[0].headers["Authorization"], "Bearer beta-key-1")
        self.assertEqual(attempts[0].headers["X-Static"], "configured")
        self.assertEqual(attempts[0].headers["X-Trace"], "trace-id")

    def test_provider_model_variants_expand_one_canonical_model_by_priority(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["routing"]["max_attempts"] = 3
        cfg["providers"]["alpha"]["keys"] = ["alpha-key"]
        cfg["providers"]["beta"]["enabled"] = False
        cfg["models"]["provider_model_variants"] = {
            "alpha": {
                "grok-4.3": [
                    {"model": "grok-4.3-low", "priority": 10},
                    {"model": "grok-4.3-high", "priority": 100},
                    {"model": "grok-4.3-console", "priority": 50},
                ]
            }
        }

        attempts = list(UpstreamRouter(cfg).iter_attempts("grok-4.3", False, "req-variants"))

        self.assertEqual(
            [attempt.provider_model for attempt in attempts],
            ["grok-4.3-high", "grok-4.3-console", "grok-4.3-low"],
        )

    def test_provider_model_variants_remain_routable_with_strict_discovery(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["providers"]["beta"]["enabled"] = False
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["grok-4.3-high", "grok-4.3-low"],
                "canonical_map": {
                    "grok-4.3-high": "grok-4.3-high",
                    "grok-4.3-low": "grok-4.3-low",
                },
            }
        }
        cfg["models"]["provider_model_variants"] = {
            "alpha": {
                "grok-4.3": [
                    {"model": "grok-4.3-low", "priority": 10},
                    {"model": "grok-4.3-high", "priority": 100},
                ]
            }
        }

        attempts = list(UpstreamRouter(cfg).iter_attempts("grok-4.3", False, "req-strict-variants"))

        self.assertEqual(
            [attempt.provider_model for attempt in attempts],
            ["grok-4.3-high", "grok-4.3-low"],
        )

    def test_static_model_remains_routable_with_strict_key_discovery(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["providers"]["alpha"]["static_models"] = ["manual-static-model"]
        cfg["providers"]["beta"]["enabled"] = False
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["discovered-model"],
                "canonical_map": {"discovered-model": "discovered-model"},
            }
        }
        cfg["models"]["provider_key_model_capabilities"] = {
            "alpha": {
                key_fingerprint("alpha-key"): {
                    "status": "ok",
                    "models": ["discovered-model"],
                    "canonical_map": {"discovered-model": "discovered-model"},
                }
            }
        }

        attempts = list(
            UpstreamRouter(cfg).iter_attempts("manual-static-model", False, "req-static-model")
        )

        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0].provider_model, "manual-static-model")

    def test_static_model_overrides_key_model_filter_and_preserves_key_proxy(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["providers"]["alpha"]["static_models"] = ["grok-4.2"]
        cfg["providers"]["alpha"]["keys"] = [
            {
                "key": "alpha-key",
                "proxy": "http://127.0.0.1:9000",
                "models": {"other-model": "other-model"},
            }
        ]
        cfg["providers"]["beta"]["enabled"] = False

        attempts = list(
            UpstreamRouter(cfg).iter_attempts("grok-4.2", False, "req-static-key-filter")
        )

        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0].provider, "alpha")
        self.assertEqual(attempts[0].key_index, 0)
        self.assertEqual(attempts[0].provider_model, "grok-4.2")
        self.assertEqual(attempts[0].proxy_url, "http://127.0.0.1:9000")

    def test_static_model_provider_is_considered_with_explicit_route(self):
        cfg = base_config()
        cfg["providers"]["alpha"]["static_models"] = ["grok-4.2"]
        cfg["models"]["routes"] = {
            "grok-4.2": {
                "providers": [{"name": "beta", "priority": 1}],
                "provider_select": "priority_failover",
            }
        }

        attempts = list(
            UpstreamRouter(cfg).iter_attempts("grok-4.2", False, "req-static-explicit-route")
        )

        self.assertIn("alpha", [attempt.provider for attempt in attempts])

    def test_model_variant_priority_precedes_key_order(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["keys"] = ["alpha-key-a", "alpha-key-b"]
        cfg["providers"]["beta"]["enabled"] = False
        cfg["models"]["provider_model_variants"] = {
            "alpha": {
                "grok-4.3": [
                    {"model": "grok-4.3-low", "priority": 10},
                    {"model": "grok-4.3-high", "priority": 100},
                ]
            }
        }

        attempts = list(UpstreamRouter(cfg).iter_attempts("grok-4.3", False, "req-variant-keys"))

        self.assertEqual(
            [(attempt.provider_model, attempt.key_index) for attempt in attempts],
            [
                ("grok-4.3-high", 0),
                ("grok-4.3-high", 1),
                ("grok-4.3-low", 0),
                ("grok-4.3-low", 1),
            ],
        )

    def test_key_model_maps_bind_each_raw_model_to_a_supporting_key(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["keys"] = [
            {"key": "alpha-high-key", "models": {"grok-4.3": "grok-4.3-high"}},
            {"key": "alpha-low-key", "models": {"grok-4.3": "grok-4.3-low"}},
        ]
        cfg["providers"]["beta"]["enabled"] = False

        attempts = list(UpstreamRouter(cfg).iter_attempts("grok-4.3", False, "req-key-models"))

        self.assertEqual(
            [(attempt.key_index, attempt.provider_model) for attempt in attempts],
            [(0, "grok-4.3-high"), (1, "grok-4.3-low")],
        )

    def test_discovered_key_capabilities_route_only_to_supporting_key(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["providers"]["alpha"]["keys"] = ["alpha-high-key", "alpha-low-key"]
        cfg["providers"]["beta"]["enabled"] = False
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["grok-4.3-high", "grok-4.3-low"],
                "canonical_map": {
                    "grok-4.3-high": "grok-4.3-high",
                    "grok-4.3-low": "grok-4.3-low",
                },
            }
        }
        cfg["models"]["provider_key_model_capabilities"] = {
            "alpha": {
                key_fingerprint("alpha-high-key"): {
                    "status": "ok",
                    "models": ["grok-4.3-high"],
                    "canonical_map": {"grok-4.3-high": "grok-4.3-high"},
                },
                key_fingerprint("alpha-low-key"): {
                    "status": "ok",
                    "models": ["grok-4.3-low"],
                    "canonical_map": {"grok-4.3-low": "grok-4.3-low"},
                },
            }
        }

        attempts = list(UpstreamRouter(cfg).iter_attempts("grok-4.3-high", False, "req-key-caps"))

        self.assertEqual(
            [(attempt.key_index, attempt.provider_model) for attempt in attempts],
            [(0, "grok-4.3-high")],
        )

    def test_routing_trace_records_rejected_and_selected_key_candidates(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["providers"]["alpha"]["keys"] = [
            {"key": "alpha-other-key", "models": {"other": "other"}},
            {"key": "alpha-target-key", "models": {"target": "target-raw"}},
        ]
        cfg["providers"]["beta"]["enabled"] = False
        trace = RoutingTrace()

        attempts = list(
            UpstreamRouter(cfg).iter_attempts(
                "target",
                False,
                "req-trace",
                routing_trace=trace,
            )
        )

        self.assertEqual([(attempt.key_index, attempt.provider_model) for attempt in attempts], [(1, "target-raw")])
        events = trace.snapshot()
        self.assertTrue(any(event["code"] == "model_unsupported_by_key" and event["key_index"] == 0 for event in events))
        self.assertTrue(any(event["code"] == "selected" and event["key_index"] == 1 for event in events))
        self.assertNotIn("alpha-target-key", str(events))

    def test_key_proxy_with_empty_model_filter_remains_routable(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["providers"]["alpha"]["keys"] = [
            {
                "key": "alpha-key",
                "proxy": "http://127.0.0.1:9000",
                "models": {},
            }
        ]
        cfg["providers"]["beta"]["enabled"] = False

        attempts = list(
            UpstreamRouter(cfg).iter_attempts(
                "agnes-2.0-flash", False, "req-key-proxy-empty-models"
            )
        )

        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0].provider, "alpha")
        self.assertEqual(attempts[0].provider_model, "agnes-2.0-flash")
        self.assertEqual(attempts[0].proxy_url, "http://127.0.0.1:9000")

    def test_rejected_key_candidate_is_traced_only_once(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["routing"]["max_attempts"] = 6
        cfg["providers"]["alpha"]["keys"] = [
            {"key": "alpha-key", "models": {"other-model": "other-model"}}
        ]
        cfg["providers"]["beta"]["enabled"] = False
        trace = RoutingTrace()

        attempts = list(
            UpstreamRouter(cfg).iter_attempts(
                "agnes-2.0-flash",
                False,
                "req-rejected-key-once",
                routing_trace=trace,
            )
        )

        self.assertEqual(attempts, [])
        rejected = [
            event
            for event in trace.snapshot()
            if event["code"] == "model_unsupported_by_key"
        ]
        self.assertEqual(len(rejected), 1)

    def test_iter_attempts_does_not_repeat_same_provider_key_format_in_one_request(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["routing"]["max_attempts"] = 6
        cfg["providers"]["beta"]["keys"] = ["beta-key-1"]
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("any-model", False, "req-no-duplicate-candidate"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta"])
        self.assertEqual(
            [(a.provider, a.key_index, a.upstream_format) for a in attempts],
            [("alpha", 0, "chat_completions"), ("beta", 0, "chat_completions")],
        )

    def test_iter_attempts_allows_same_provider_with_different_keys(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("any-model", False, "req-multi-key"))

        self.assertEqual([a.provider for a in attempts], ["beta", "beta"])
        self.assertEqual([a.key_index for a in attempts], [0, 1])

    def test_request_local_fallback_uses_next_key_without_global_rotation(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["routing"]["max_attempts"] = 2
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)

        attempts = router.iter_attempts("any-model", False, "req-local-fallback")
        first = next(attempts)
        second = next(attempts)
        next_request_first = next(router.iter_attempts("any-model", False, "req-after-local-fallback"))

        self.assertEqual(first.key_index, 0)
        self.assertEqual(second.key_index, 1)
        self.assertEqual(next_request_first.key_index, 0)

    def test_attempts_include_upstream_format_and_format_specific_url(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["providers"]["alpha"]["formats"] = {
            "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
            "responses": {"enabled": True, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        cfg["providers"]["beta"]["formats"] = {
            "chat_completions": {"enabled": True, "path": "/chat"},
            "responses": {"enabled": False, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "any-model",
                False,
                "req-3",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )

        self.assertEqual(attempts[0].provider, "alpha")
        self.assertEqual(attempts[0].upstream_format, "responses")
        self.assertEqual(attempts[0].url, "https://alpha.example/v1/responses")
        self.assertEqual(attempts[1].provider, "beta")
        self.assertEqual(attempts[1].upstream_format, "chat_completions")
        self.assertEqual(attempts[1].url, "https://beta.example/chat")

    def test_format_filter_blocks_unavailable_upstream_formats(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "any-model",
                False,
                "req-4",
                client_format="responses",
                allowed_upstream_formats=["responses"],
            )
        )

        self.assertEqual(attempts, [])

    def test_router_prefers_native_format_before_fallback(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta", "alpha"]
        cfg["providers"]["alpha"]["formats"] = {
            "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
            "responses": {"enabled": True, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        cfg["providers"]["beta"]["formats"] = {
            "chat_completions": {"enabled": True, "path": "/chat"},
            "responses": {"enabled": False, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "any-model",
                False,
                "req-5",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )

        self.assertEqual(attempts[0].provider, "alpha")
        self.assertEqual(attempts[0].upstream_format, "responses")
        self.assertEqual(attempts[1].provider, "beta")
        self.assertEqual(attempts[1].upstream_format, "chat_completions")

    def _native_fallback_cfg(self, *, alpha_native, beta_fallback, alpha_prio, beta_prio, format_preference="priority_first"):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["routing"]["format_preference"] = format_preference
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["alpha"]["priority"] = alpha_prio
        cfg["providers"]["beta"]["priority"] = beta_prio
        cfg["providers"]["alpha"]["formats"] = {
            "chat_completions": {"enabled": alpha_native == "chat", "path": "/v1/chat/completions"},
            "responses": {"enabled": alpha_native == "responses", "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        cfg["providers"]["beta"]["formats"] = {
            "chat_completions": {"enabled": beta_fallback == "chat", "path": "/v1/chat/completions"},
            "responses": {"enabled": beta_fallback == "responses", "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        return cfg

    def test_priority_first_lets_high_priority_fallback_beat_low_priority_native(self):
        # client requests responses. alpha is native (responses, prio 10),
        # beta is fallback (chat_completions, prio 80). Under priority_first
        # the high-priority fallback beta must come BEFORE the low-priority
        # native alpha, even though alpha matches the client format natively.
        cfg = self._native_fallback_cfg(
            alpha_native="responses", beta_fallback="chat", alpha_prio=10, beta_prio=80,
        )
        router = UpstreamRouter(cfg)
        attempts = list(
            router.iter_attempts(
                "any-model", False, "req-prio-first",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )
        # beta has 2 keys in base_config, so it occupies the first two attempts
        # (priority_failover expands by key count), then alpha.
        self.assertEqual([a.provider for a in attempts[:3]], ["beta", "beta", "alpha"])
        self.assertEqual(attempts[0].upstream_format, "chat_completions")
        self.assertEqual(attempts[2].upstream_format, "responses")

    def test_priority_first_native_is_tiebreaker_at_equal_priority(self):
        # Equal priority: native (alpha, responses) beats fallback (beta, chat).
        cfg = self._native_fallback_cfg(
            alpha_native="responses", beta_fallback="chat", alpha_prio=50, beta_prio=50,
        )
        router = UpstreamRouter(cfg)
        attempts = list(
            router.iter_attempts(
                "any-model", False, "req-tie",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )
        self.assertEqual([a.provider for a in attempts[:3]], ["alpha", "beta", "beta"])
        self.assertEqual(attempts[0].upstream_format, "responses")

    def test_native_first_setting_preserves_legacy_grouping(self):
        # With format_preference=native_first, all native precede all fallback
        # regardless of priority (legacy behavior).
        cfg = self._native_fallback_cfg(
            alpha_native="responses", beta_fallback="chat", alpha_prio=10, beta_prio=80,
            format_preference="native_first",
        )
        router = UpstreamRouter(cfg)
        attempts = list(
            router.iter_attempts(
                "any-model", False, "req-native-first",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )
        # alpha (native responses, prio 10) comes before beta (fallback, prio 80).
        self.assertEqual([a.provider for a in attempts[:3]], ["alpha", "beta", "beta"])
        self.assertEqual(attempts[0].upstream_format, "responses")
        self.assertEqual(attempts[1].upstream_format, "chat_completions")

    def test_priority_first_retries_other_formats_for_same_high_priority_provider(self):
        cfg = base_config()
        cfg["routing"].update({
            "provider_select": "priority_failover",
            "default_provider_pool": ["alpha", "beta"],
            "format_preference": "priority_first",
        })
        cfg["providers"]["alpha"]["priority"] = 80
        cfg["providers"]["alpha"]["formats"] = {
            "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
            "responses": {"enabled": True, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        cfg["providers"]["beta"]["priority"] = 70
        cfg["providers"]["beta"]["keys"] = ["beta-key-1"]
        cfg["providers"]["beta"]["formats"] = {
            "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
            "responses": {"enabled": True, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }

        attempts = list(
            UpstreamRouter(cfg).iter_attempts(
                "any-model",
                False,
                "req-multi-format-priority",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )

        self.assertEqual(
            [(a.provider, a.upstream_format) for a in attempts],
            [
                ("alpha", "responses"),
                ("alpha", "chat_completions"),
                ("beta", "responses"),
            ],
        )
        self.assertEqual(attempts[0].url, "https://alpha.example/v1/responses")
        self.assertEqual(attempts[1].url, "https://alpha.example/v1/chat/completions")

    def test_native_first_keeps_all_native_candidates_before_same_provider_fallback(self):
        cfg = base_config()
        cfg["routing"].update({
            "provider_select": "priority_failover",
            "default_provider_pool": ["alpha", "beta"],
            "format_preference": "native_first",
        })
        cfg["providers"]["alpha"]["priority"] = 80
        cfg["providers"]["alpha"]["formats"] = {
            "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
            "responses": {"enabled": True, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }
        cfg["providers"]["beta"]["priority"] = 70
        cfg["providers"]["beta"]["keys"] = ["beta-key-1"]
        cfg["providers"]["beta"]["formats"] = {
            "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
            "responses": {"enabled": True, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }

        attempts = list(
            UpstreamRouter(cfg).iter_attempts(
                "any-model",
                False,
                "req-multi-format-native",
                client_format="responses",
                allowed_upstream_formats=["responses", "chat_completions"],
            )
        )

        self.assertEqual(
            [(a.provider, a.upstream_format) for a in attempts],
            [
                ("alpha", "responses"),
                ("beta", "responses"),
                ("alpha", "chat_completions"),
            ],
        )

    def test_attempt_proxy_priority_key_provider_global(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["proxy"] = "http://127.0.0.1:7000"
        cfg["providers"]["alpha"]["proxy"] = "http://127.0.0.1:8000"
        cfg["providers"]["alpha"]["keys"] = [
            {"key": "alpha-key", "proxy": "http://127.0.0.1:9000"},
        ]
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("any-model", False, "req-proxy-key"))

        self.assertEqual(attempts[0].key, "alpha-key")
        self.assertEqual(attempts[0].headers["Authorization"], "Bearer alpha-key")
        self.assertEqual(attempts[0].proxy_url, "http://127.0.0.1:9000")

    def test_attempt_proxy_falls_back_to_provider_then_global(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["proxy"] = "http://127.0.0.1:7000"
        cfg["providers"]["alpha"]["proxy"] = "http://127.0.0.1:8000"
        router = UpstreamRouter(cfg)

        provider_attempt = list(router.iter_attempts("any-model", False, "req-proxy-provider"))[0]
        self.assertEqual(provider_attempt.proxy_url, "http://127.0.0.1:8000")

        cfg["providers"]["alpha"]["proxy"] = {}
        router = UpstreamRouter(cfg)
        global_attempt = list(router.iter_attempts("any-model", False, "req-proxy-global"))[0]
        self.assertEqual(global_attempt.proxy_url, "http://127.0.0.1:7000")

    def test_default_pool_includes_enabled_providers_not_listed_in_stale_pool(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha"]
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
            "formats": {
                "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
                "responses": {"enabled": True, "path": "/v1/responses"},
                "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "any-model",
                False,
                "req-6",
                client_format="responses",
                allowed_upstream_formats=["responses"],
            )
        )

        self.assertEqual([a.provider for a in attempts], ["gamma"])

    def test_explicit_model_route_appends_discovered_supporting_providers(self):
        cfg = base_config()
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
            "formats": {
                "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
                "responses": {"enabled": True, "path": "/v1/responses"},
                "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
            },
        }
        cfg["models"]["routes"] = {"any-model": {"providers": ["alpha"]}}
        cfg["models"]["provider_model_capabilities"] = {
            "gamma": {
                "status": "ok",
                "models": ["any-model"],
                "canonical_map": {"any-model": "any-model"},
            }
        }
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "any-model",
                False,
                "req-7",
                client_format="responses",
                allowed_upstream_formats=["responses"],
            )
        )

        self.assertEqual([a.provider for a in attempts], ["gamma"])

    def test_explicit_model_route_is_authoritative_over_incomplete_discovery(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["providers"]["alpha"]["priority"] = 100
        cfg["providers"]["beta"]["priority"] = 1
        cfg["models"]["routes"] = {
            "target-model": {
                "providers": [{"name": "alpha", "priority": 200}],
                "provider_select": "priority_failover",
            }
        }
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["different-model"],
                "canonical_map": {"different-model": "different-model"},
            },
            "beta": {
                "status": "ok",
                "models": ["target-model"],
                "canonical_map": {"target-model": "target-model"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("target-model", False, "req-explicit-authoritative"))

        self.assertTrue(attempts)
        self.assertEqual(attempts[0].provider, "alpha")
    def test_explicit_model_route_does_not_append_unknown_capability_providers(self):
        cfg = base_config()
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
            "formats": {
                "chat_completions": {"enabled": False, "path": "/v1/chat/completions"},
                "responses": {"enabled": True, "path": "/v1/responses"},
                "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
            },
        }
        cfg["models"]["routes"] = {"any-model": {"providers": ["alpha"]}}
        router = UpstreamRouter(cfg)

        attempts = list(
            router.iter_attempts(
                "any-model",
                False,
                "req-7b",
                client_format="responses",
                allowed_upstream_formats=["responses"],
            )
        )

        self.assertEqual(attempts, [])

    def test_stale_provider_model_map_for_missing_provider_does_not_filter_pool(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "missing-provider", "beta"]
        cfg["models"]["provider_model_map"] = {
            "missing-provider": {"canonical-model": "real-model"},
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("canonical-model", False, "req-8"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "beta"])

    def test_provider_model_map_does_not_hide_new_unknown_provider(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta", "gamma"]
        cfg["routing"]["max_attempts"] = 3
        cfg["providers"]["alpha"]["enabled"] = False
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
        }
        cfg["models"]["provider_model_map"] = {
            "beta": {"deepseek-v4-flash": "beta-deepseek-v4-flash"},
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("deepseek-v4-flash", False, "req-new-provider"))

        self.assertEqual([a.provider for a in attempts], ["beta", "gamma", "beta"])
        self.assertEqual(attempts[0].provider_model, "beta-deepseek-v4-flash")
        self.assertEqual(attempts[1].provider_model, "deepseek-v4-flash")

    def test_auto_provider_capabilities_filter_to_supporting_provider(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["deepseek-v4-flash"],
                "canonical_map": {"deepseek-v4-flash": "deepseek-v4-flash"},
            },
            "beta": {
                "status": "ok",
                "models": ["gpt-5.5"],
                "canonical_map": {"gpt-5.5": "gpt-5.5"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("deepseek-v4-flash", False, "req-9"))

        self.assertEqual([a.provider for a in attempts], ["alpha"])
        self.assertTrue(all(a.provider_model == "deepseek-v4-flash" for a in attempts))

    def test_partial_capabilities_do_not_route_target_model_to_unknown_or_mismatched_providers(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["rawchat", "gamma", "alpha"]
        cfg["routing"]["max_attempts"] = 4
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
        }
        cfg["models"]["assume_supports_unknown_models"] = True
        cfg["models"]["provider_model_capabilities"] = {
            "rawchat": {
                "status": "ok",
                "models": ["gpt-5.5"],
                "canonical_map": {"gpt-5.5": "gpt-5.5"},
            },
            "alpha": {
                "status": "ok",
                "models": ["deepseek-v4-flash"],
                "canonical_map": {"deepseek-v4-flash": "deepseek-v4-flash"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("deepseek-v4-flash", False, "req-partial-caps"))

        self.assertEqual([a.provider for a in attempts], ["alpha"])

    def test_provider_can_explicitly_allow_unknown_model_after_capability_filter_is_active(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["gamma", "alpha"]
        cfg["providers"]["gamma"] = {
            "base_url": "https://gamma.example",
            "keys": ["gamma-key"],
            "enabled": True,
            "assume_supports_unknown_models": True,
        }
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["deepseek-v4-flash"],
                "canonical_map": {"deepseek-v4-flash": "deepseek-v4-flash"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("deepseek-v4-flash", False, "req-explicit-unknown"))

        self.assertEqual([a.provider for a in attempts], ["gamma", "alpha"])

    def test_auto_provider_capabilities_use_provider_model_name(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["gpt-5.5"],
                "canonical_map": {"gpt-5.5": "gpt-5.5"},
            },
            "beta": {
                "status": "ok",
                "models": ["vendor/gpt-5.5"],
                "canonical_map": {"gpt-5.5": "vendor/gpt-5.5"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("gpt-5.5", False, "req-10"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "beta"])
        self.assertEqual(attempts[1].provider_model, "vendor/gpt-5.5")

    def test_manual_provider_model_map_overrides_auto_capabilities(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["models"]["provider_model_map"] = {
            "beta": {"deepseek-v4-flash": "manual-beta-model"},
        }
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["deepseek-v4-flash"],
                "canonical_map": {"deepseek-v4-flash": "deepseek-v4-flash"},
            },
            "beta": {
                "status": "ok",
                "models": ["gpt-5.5"],
                "canonical_map": {"gpt-5.5": "gpt-5.5"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("deepseek-v4-flash", False, "req-11"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "beta"])
        beta_attempts = [a for a in attempts if a.provider == "beta"]
        self.assertTrue(all(a.provider_model == "manual-beta-model" for a in beta_attempts))

    def test_provider_model_disabled_excludes_provider_for_that_model(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["deepseek-v4-flash"],
                "canonical_map": {"deepseek-v4-flash": "deepseek-v4-flash"},
            },
            "beta": {
                "status": "ok",
                "models": ["vendor/deepseek-v4-flash"],
                "canonical_map": {"deepseek-v4-flash": "vendor/deepseek-v4-flash"},
            },
        }
        cfg["models"]["provider_model_disabled"] = {"alpha": {"deepseek-v4-flash": True}}
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("deepseek-v4-flash", False, "req-disabled-model"))

        self.assertTrue(attempts)
        self.assertEqual({a.provider for a in attempts}, {"beta"})
        self.assertTrue(all(a.provider_model == "vendor/deepseek-v4-flash" for a in attempts))

    def test_unknown_capability_state_falls_back_by_default(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "error",
                "models": [],
                "canonical_map": {},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("unknown-model", False, "req-12"))

        self.assertEqual([a.provider for a in attempts], ["alpha", "beta", "beta"])

    def test_unknown_capability_state_can_be_strict(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["models"]["assume_supports_unknown_models"] = False
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "error",
                "models": [],
                "canonical_map": {},
            },
            "beta": {
                "status": "ok",
                "models": ["gpt-5.5"],
                "canonical_map": {"gpt-5.5": "gpt-5.5"},
            },
        }
        router = UpstreamRouter(cfg)

        attempts = list(router.iter_attempts("unknown-model", False, "req-13"))

        self.assertEqual(attempts, [])

    def test_snapshot_exposes_key_state_without_raw_keys(self):
        router = UpstreamRouter(base_config())

        snap = router.snapshot()

        self.assertIn("alpha", snap["providers"])
        alpha_key = snap["providers"]["alpha"]["keys"][0]
        self.assertEqual(alpha_key["index"], 0)
        self.assertTrue(alpha_key["available"])
        self.assertIn("key_id", alpha_key)
        self.assertNotIn("alpha-key", str(snap))
        self.assertTrue(snap["providers"]["alpha"]["formats"]["chat_completions"]["enabled"])

    def test_compatibility_circuit_survives_state_dump_and_load(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["providers"]["alpha"]["priority"] = 100
        cfg["providers"]["beta"]["priority"] = 10
        original = UpstreamRouter(cfg)
        failed = next(original.iter_attempts(
            "any-model", False, "req-persist", compatibility_profile="tools"
        ))
        original.report_failure(failed, error_type="provider_compat", http_status=400)

        restored = UpstreamRouter(cfg)
        restored.load_state(original.dump_state())

        attempts = list(restored.iter_attempts(
            "any-model", False, "req-restored", compatibility_profile="tools"
        ))
        self.assertNotEqual(attempts[0].provider, "alpha")
        self.assertEqual(restored.snapshot()["compatibility_circuits"]["active"], 1)

    def test_model_mapping_change_drops_stale_raw_model_compatibility_circuit(self):
        old_cfg = base_config()
        old_cfg["routing"]["default_provider_pool"] = ["alpha"]
        old_cfg["providers"]["beta"]["enabled"] = False
        old_cfg["models"]["provider_model_map"] = {"alpha": {"alias": "wrong-raw"}}
        old_router = UpstreamRouter(old_cfg)
        failed = next(old_router.iter_attempts("alias", False, "req-old"))
        old_router.report_failure(failed, error_type="provider_compat", http_status=422)

        new_cfg = base_config()
        new_cfg["routing"]["default_provider_pool"] = ["alpha"]
        new_cfg["providers"]["beta"]["enabled"] = False
        new_cfg["models"]["provider_model_map"] = {"alpha": {"alias": "correct-raw"}}
        new_router = UpstreamRouter(new_cfg)
        new_router.migrate_state_from(old_router)

        self.assertEqual(new_router.snapshot()["compatibility_circuits"]["active"], 0)
        self.assertEqual(next(new_router.iter_attempts("alias", False, "req-new")).provider_model, "correct-raw")

        restarted_router = UpstreamRouter(new_cfg)
        restarted_router.load_state(old_router.dump_state())
        self.assertEqual(restarted_router.snapshot()["compatibility_circuits"]["active"], 0)

    def test_runtime_provider_disable_enable_controls_attempts(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        router = UpstreamRouter(cfg)

        self.assertTrue(router.set_provider_enabled("alpha", False))
        disabled_attempts = list(router.iter_attempts("any-model", False, "req-disable-provider"))

        self.assertEqual([a.provider for a in disabled_attempts], ["beta", "beta"])
        snap = router.snapshot()
        self.assertFalse(snap["providers"]["alpha"]["enabled"])
        self.assertTrue(snap["providers"]["alpha"]["config_enabled"])
        self.assertFalse(snap["providers"]["alpha"]["runtime_enabled"])
        self.assertTrue(cfg["providers"]["alpha"]["enabled"])

        self.assertTrue(router.set_provider_enabled("alpha", True))
        enabled_attempts = list(router.iter_attempts("any-model", False, "req-enable-provider"))

        self.assertIn("alpha", [a.provider for a in enabled_attempts])
        self.assertIn("beta", [a.provider for a in enabled_attempts])

    def test_runtime_provider_disable_is_not_bypassed_by_empty_fallback(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        router = UpstreamRouter(cfg)

        self.assertTrue(router.set_provider_enabled("alpha", False))
        self.assertTrue(router.set_provider_enabled("beta", False))

        attempts = list(router.iter_attempts("any-model", False, "req-disable-all"))

        self.assertEqual(attempts, [])

    def test_runtime_key_disable_enable_and_clear_state(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)

        self.assertTrue(router.set_key_enabled("beta", 0, False))
        disabled_key_attempts = list(router.iter_attempts("any-model", False, "req-disable-key"))

        self.assertEqual([a.key_index for a in disabled_key_attempts], [1])
        snap = router.snapshot()
        self.assertFalse(snap["providers"]["beta"]["keys"][0]["runtime_enabled"])
        self.assertFalse(snap["providers"]["beta"]["keys"][0]["available"])

        self.assertTrue(router.set_key_enabled("beta", 0, True))
        failed_attempt = Attempt(
            request_id="req-failed-key",
            attempt_no=1,
            provider="beta",
            key_index=0,
            key="beta-key-1",
            url="https://beta.example/chat",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )
        router.report_failure(failed_attempt, error_type="rate_limited", retry_after_s=30)
        snap = router.snapshot()
        self.assertGreaterEqual(snap["providers"]["beta"]["keys"][0]["cooldown_remaining_s"], 0)
        self.assertFalse(snap["providers"]["beta"]["keys"][0]["available"])

        self.assertTrue(router.clear_key_state("beta", 0))
        snap = router.snapshot()
        self.assertEqual(snap["providers"]["beta"]["keys"][0]["cooldown_remaining_s"], 0)
        self.assertEqual(snap["providers"]["beta"]["keys"][0]["disabled_remaining_s"], 0)
        self.assertEqual(snap["providers"]["beta"]["keys"][0]["fails"], 0)
        self.assertTrue(snap["providers"]["beta"]["keys"][0]["available"])

    def test_cooldown_key_is_skipped_for_next_available_key(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["routing"]["max_attempts"] = 2
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)
        failed_attempt = Attempt(
            request_id="req-key-cooldown-skip",
            attempt_no=1,
            provider="beta",
            key_index=0,
            key="beta-key-1",
            url="https://beta.example/chat",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )
        router.report_failure(failed_attempt, error_type="rate_limited", http_status=429, retry_after_s=30)

        attempts = list(router.iter_attempts("any-model", False, "req-key-cooldown-skip-next"))

        self.assertEqual([a.key_index for a in attempts], [1])
        self.assertEqual([a.key for a in attempts], ["beta-key-2"])

    def test_provider_snapshot_unavailable_when_all_keys_are_unavailable(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)

        self.assertTrue(router.set_key_enabled("beta", 0, False))
        self.assertTrue(router.set_key_enabled("beta", 1, False))

        snap = router.snapshot()
        self.assertFalse(snap["providers"]["beta"]["available"])
        self.assertEqual(snap["providers"]["beta"]["available_key_count"], 0)
        self.assertEqual(snap["providers"]["beta"]["key_count"], 2)

    def test_quota_or_balance_cools_key_long_enough_to_skip_repeated_attempts(self):
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["beta"]
        cfg["routing"]["max_attempts"] = 2
        cfg["providers"]["alpha"]["enabled"] = False
        router = UpstreamRouter(cfg)
        failed_attempt = Attempt(
            request_id="req-quota",
            attempt_no=1,
            provider="beta",
            key_index=0,
            key="beta-key-1",
            url="https://beta.example/chat",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        action = router.report_failure(failed_attempt, error_type="quota_or_balance", http_status=402)

        snap = router.snapshot()
        self.assertEqual(action["scope"], "key")
        self.assertEqual(action["action"], "cooldown")
        self.assertGreaterEqual(action["cooldown_s"], 3600)
        self.assertEqual(action["key_id"], router.key_id("beta-key-1"))
        self.assertGreaterEqual(snap["providers"]["beta"]["keys"][0]["cooldown_remaining_s"], 1800)
        self.assertTrue(snap["providers"]["beta"]["keys"][0]["has_failure"])
        attempts = list(router.iter_attempts("any-model", False, "req-quota-next"))
        self.assertEqual([a.key_index for a in attempts], [1])

    def test_key_invalid_starts_with_cooldown_before_disable(self):
        cfg = base_config()
        router = UpstreamRouter(cfg)
        failed_attempt = Attempt(
            request_id="req-key-invalid",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="key_invalid", http_status=401)
        first = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(first["cooldown_remaining_s"], 45)
        self.assertLess(first["disabled_remaining_s"], 1)
        self.assertTrue(first["has_failure"])

        router.report_failure(failed_attempt, error_type="key_invalid", http_status=401)
        second = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(second["cooldown_remaining_s"], 45)
        self.assertLess(second["disabled_remaining_s"], 1)

        router.report_failure(failed_attempt, error_type="key_invalid", http_status=401)
        router.report_failure(failed_attempt, error_type="key_invalid", http_status=401)
        disabled = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(disabled["disabled_remaining_s"], 3500)
        self.assertFalse(disabled["available"])

    def test_credential_failures_escalate_to_one_six_twenty_four_hours(self):
        cfg = base_config()
        cfg["retry"]["credential_failure_ladder_s"] = [3600, 21600, 86400]
        router = UpstreamRouter(cfg)
        failed = next(router.iter_attempts("any-model", False, "req-credential"))

        router.report_failure(failed, error_type="quota_or_balance", http_status=403)
        first = router.snapshot()["providers"][failed.provider]["keys"][failed.key_index]
        self.assertGreaterEqual(first["cooldown_remaining_s"], 3500)

        router.report_failure(failed, error_type="quota_or_balance", http_status=403)
        second = router.snapshot()["providers"][failed.provider]["keys"][failed.key_index]
        self.assertGreaterEqual(second["cooldown_remaining_s"], 21500)

        router.report_failure(failed, error_type="quota_or_balance", http_status=403)
        third = router.snapshot()["providers"][failed.provider]["keys"][failed.key_index]
        self.assertGreaterEqual(third["cooldown_remaining_s"], 86300)
        self.assertEqual(third["credential_fails"], 3)

    def test_runtime_controls_reject_unknown_provider_or_key(self):
        router = UpstreamRouter(base_config())

        self.assertFalse(router.set_provider_enabled("missing", False))
        self.assertFalse(router.clear_provider_cooldown("missing"))
        self.assertFalse(router.set_key_enabled("alpha", 9, False))
        self.assertFalse(router.clear_key_state("alpha", 9))

    def test_model_level_client_error_does_not_cool_down_shared_key(self):
        router = UpstreamRouter(base_config())
        failed_attempt = Attempt(
            request_id="req-model-not-found",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="missing-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="client_error", http_status=404)

        key_state = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertEqual(key_state["fails"], 0)
        self.assertEqual(key_state["cooldown_remaining_s"], 0)
        self.assertFalse(key_state["has_failure"])
        self.assertTrue(key_state["available"])
        attempts = list(router.iter_attempts("other-supported-model", False, "req-after-model-not-found"))
        self.assertIn("alpha", [attempt.provider for attempt in attempts])

    def test_provider_compat_failure_does_not_cool_down_key(self):
        router = UpstreamRouter(base_config())
        failed_attempt = Attempt(
            request_id="req-provider-compat",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="provider_compat", http_status=400)

        snap = router.snapshot()
        key_state = snap["providers"]["alpha"]["keys"][0]
        self.assertEqual(key_state["fails"], 0)
        self.assertEqual(key_state["cooldown_remaining_s"], 0)
        self.assertFalse(key_state["has_failure"])
        self.assertTrue(key_state["available"])

    def test_provider_compat_failure_does_not_advance_transient_ladder(self):
        cfg = base_config()
        cfg["retry"]["key_failure_ladder_s"] = [10, 60, 3600]
        router = UpstreamRouter(cfg)
        failed_attempt = Attempt(
            request_id="req-provider-compat-ladder",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="provider_compat", http_status=400)
        router.report_failure(failed_attempt, error_type="server_error", http_status=502)

        key_state = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertEqual(key_state["fails"], 1)
        self.assertEqual(key_state["transient_fails"], 1)
        self.assertGreaterEqual(key_state["cooldown_remaining_s"], 8)
        self.assertLessEqual(key_state["cooldown_remaining_s"], 10)

    def test_empty_visible_output_failure_does_not_cool_down_key(self):
        router = UpstreamRouter(base_config())
        failed_attempt = Attempt(
            request_id="req-empty-visible-output",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="empty_visible_output", http_status=200)

        snap = router.snapshot()
        key_state = snap["providers"]["alpha"]["keys"][0]
        self.assertEqual(key_state["fails"], 0)
        self.assertEqual(key_state["cooldown_remaining_s"], 0)
        self.assertFalse(key_state["has_failure"])
        self.assertTrue(key_state["available"])

    def test_provider_compat_uses_profile_scoped_circuit(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["providers"]["alpha"]["priority"] = 100
        cfg["providers"]["beta"]["priority"] = 10
        router = UpstreamRouter(cfg)
        failed = next(router.iter_attempts(
            "any-model", False, "req-tools", compatibility_profile="tools"
        ))

        router.report_failure(failed, error_type="provider_compat", http_status=400)

        same_profile = list(router.iter_attempts(
            "any-model", False, "req-tools-next", compatibility_profile="tools"
        ))
        plain = list(router.iter_attempts(
            "any-model", False, "req-plain", compatibility_profile="plain"
        ))
        self.assertNotEqual(same_profile[0].provider, "alpha")
        self.assertEqual(plain[0].provider, "alpha")
        circuits = router.snapshot()["compatibility_circuits"]
        self.assertEqual(circuits["active"], 1)
        entry = circuits["entries"][0]
        self.assertEqual(entry["provider"], "alpha")
        self.assertEqual(entry["canonical_model"], "any-model")
        self.assertEqual(entry["provider_model"], "any-model")
        self.assertEqual(entry["upstream_format"], "chat_completions")
        self.assertEqual(entry["compatibility_profile"], "tools")
        self.assertEqual(entry["key_id"], router.key_id("alpha-key"))
        self.assertNotIn("alpha-key", str(circuits))

    def test_compatibility_failures_use_10_60_3600_ladder_without_key_cooldown(self):
        cfg = base_config()
        cfg["retry"]["compatibility_failure_ladder_s"] = [10, 60, 3600]
        router = UpstreamRouter(cfg)
        failed = next(router.iter_attempts(
            "any-model", False, "req-compat", compatibility_profile="tools"
        ))

        for _ in range(3):
            router.report_failure(failed, error_type="client_error", http_status=422)

        snap = router.snapshot()
        key_state = snap["providers"][failed.provider]["keys"][failed.key_index]
        self.assertEqual(key_state["fails"], 0)
        self.assertTrue(key_state["available"])
        self.assertGreaterEqual(snap["compatibility_circuits"]["nearest_recovery_s"], 3500)

    def test_probe_success_does_not_clear_user_compatibility_circuit(self):
        router = UpstreamRouter(base_config())
        failed = next(router.iter_attempts(
            "any-model", False, "req-user", compatibility_profile="tools"
        ))
        router.report_failure(failed, error_type="provider_compat", http_status=400)
        probe = Attempt(
            request_id="probe", attempt_no=1, provider=failed.provider,
            key_index=failed.key_index, key=failed.key, url=failed.url, headers={},
            provider_model=failed.provider_model, upstream_format=failed.upstream_format,
            canonical_model=failed.canonical_model, compatibility_profile="health_probe",
        )

        router.report_success(probe)

        attempts = list(router.iter_attempts(
            "any-model", False, "req-user-next", compatibility_profile="tools"
        ))
        self.assertNotEqual(attempts[0].provider, failed.provider)

    def test_report_failure_uses_retry_after_for_rate_limit_key_cooldown(self):
        router = UpstreamRouter(base_config())
        failed_attempt = Attempt(
            request_id="req-rate-limit",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="rate_limited", http_status=429, retry_after_s=42)

        snap = router.snapshot()
        key_state = snap["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(key_state["cooldown_remaining_s"], 35)
        self.assertLessEqual(key_state["cooldown_remaining_s"], 42)
        self.assertFalse(key_state["available"])
        self.assertEqual(snap["providers"]["alpha"]["cooldown_remaining_s"], 0)

    def test_network_failure_cools_key_not_provider_by_default(self):
        router = UpstreamRouter(base_config())
        failed_attempt = Attempt(
            request_id="req-network",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="network_error")

        snap = router.snapshot()
        key_state = snap["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(key_state["cooldown_remaining_s"], 1)
        self.assertEqual(snap["providers"]["alpha"]["cooldown_remaining_s"], 0)
        self.assertFalse(key_state["available"])

    def test_transient_failures_use_key_failure_ladder(self):
        cfg = base_config()
        cfg["retry"]["key_failure_ladder_s"] = [10, 60, 3600]
        router = UpstreamRouter(cfg)
        failed_attempt = Attempt(
            request_id="req-ladder",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="server_error", http_status=502)
        first = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(first["cooldown_remaining_s"], 8)
        self.assertLessEqual(first["cooldown_remaining_s"], 10)
        self.assertEqual(first["disabled_remaining_s"], 0)

        router.report_failure(failed_attempt, error_type="server_error", http_status=502)
        router.report_failure(failed_attempt, error_type="server_error", http_status=502)
        third = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(third["cooldown_remaining_s"], 3500)
        self.assertEqual(third["disabled_remaining_s"], 0)

        router.report_failure(failed_attempt, error_type="server_error", http_status=502)
        disabled = router.snapshot()["providers"]["alpha"]["keys"][0]
        self.assertGreaterEqual(disabled["disabled_remaining_s"], 3500)
        self.assertFalse(disabled["available"])

    def test_transient_key_cooldown_falls_back_then_returns_to_priority_provider(self):
        cfg = base_config()
        cfg["routing"]["provider_select"] = "priority_failover"
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["routing"]["max_attempts"] = 3
        cfg["providers"]["alpha"]["priority"] = 100
        cfg["providers"]["beta"]["priority"] = 10
        cfg["retry"]["key_failure_ladder_s"] = [10, 60, 3600]
        router = UpstreamRouter(cfg)
        first = list(router.iter_attempts("any-model", False, "req-priority-before"))[0]

        router.report_failure(first, error_type="server_error", http_status=502)
        fallback = list(router.iter_attempts("any-model", False, "req-priority-fallback"))
        router.clear_key_state("alpha", 0)
        router.clear_provider_cooldown("alpha")
        recovered = list(router.iter_attempts("any-model", False, "req-priority-recovered"))

        self.assertEqual([a.provider for a in fallback], ["beta", "beta"])
        self.assertEqual(recovered[0].provider, "alpha")

    def test_configured_failure_policy_changes_router_cooldown_scope(self):
        cfg = base_config()
        cfg["retry"]["failure_policies"] = {
            "server_error": {
                "cooldown_scope": "provider",
                "provider_cooldown_s": 20,
                "cooldown_s": 99,
                "disables_key": False,
            }
        }
        router = UpstreamRouter(cfg)
        failed_attempt = Attempt(
            request_id="req-configured-policy",
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={},
            provider_model="any-model",
            upstream_format="chat_completions",
        )

        router.report_failure(failed_attempt, error_type="server_error", http_status=502)

        snap = router.snapshot()
        key_state = snap["providers"]["alpha"]["keys"][0]
        self.assertEqual(key_state["fails"], 1)
        self.assertEqual(key_state["cooldown_remaining_s"], 0)
        self.assertGreaterEqual(snap["providers"]["alpha"]["cooldown_remaining_s"], 15)
        self.assertFalse(snap["providers"]["alpha"]["available"])

    def test_clear_provider_cooldown_also_clears_compatibility_circuits(self):
        """clear_provider_cooldown must also clear compatibility circuits for that provider."""
        router = UpstreamRouter(base_config())
        failed = next(router.iter_attempts(
            "any-model", False, "req-1", compatibility_profile="tools"
        ))
        # Open a compatibility circuit
        for _ in range(3):
            router.report_failure(failed, error_type="client_error", http_status=422)

        snap = router.snapshot()
        self.assertGreater(snap["compatibility_circuits"]["active"], 0)

        # Clear provider cooldown — should also clear compatibility circuits
        self.assertTrue(router.clear_provider_cooldown(failed.provider))
        snap = router.snapshot()
        self.assertEqual(snap["compatibility_circuits"]["active"], 0)

        # The candidate should now be available again
        attempts = list(router.iter_attempts(
            "any-model", False, "req-2", compatibility_profile="tools"
        ))
        self.assertTrue(any(a.provider == failed.provider for a in attempts))

    def test_clear_key_state_also_clears_compatibility_circuits(self):
        """clear_key_state must also clear compatibility circuits for that key."""
        router = UpstreamRouter(base_config())
        failed = next(router.iter_attempts(
            "any-model", False, "req-1", compatibility_profile="tools"
        ))
        # Open a compatibility circuit
        for _ in range(3):
            router.report_failure(failed, error_type="provider_compat", http_status=400)

        snap = router.snapshot()
        self.assertGreater(snap["compatibility_circuits"]["active"], 0)

        # Clear key state — should also clear compatibility circuits
        self.assertTrue(router.clear_key_state(failed.provider, failed.key_index))
        snap = router.snapshot()
        self.assertEqual(snap["compatibility_circuits"]["active"], 0)

    def test_clear_compatibility_circuits_filtered_by_provider(self):
        """clear_compatibility_circuits with provider filter only clears that provider."""
        router = UpstreamRouter(base_config())
        alpha_attempt = next(router.iter_attempts(
            "any-model", False, "req-a", compatibility_profile="tools"
        ))
        # Force a beta attempt
        router.report_failure(alpha_attempt, error_type="client_error", http_status=422)
        router.report_failure(alpha_attempt, error_type="client_error", http_status=422)
        router.report_failure(alpha_attempt, error_type="client_error", http_status=422)

        beta_attempts = [a for a in router.iter_attempts(
            "any-model", False, "req-b", compatibility_profile="tools"
        ) if a.provider == "beta"]
        if beta_attempts:
            beta_attempt = beta_attempts[0]
            router.report_failure(beta_attempt, error_type="client_error", http_status=422)
            router.report_failure(beta_attempt, error_type="client_error", http_status=422)
            router.report_failure(beta_attempt, error_type="client_error", http_status=422)

        snap = router.snapshot()
        self.assertGreaterEqual(snap["compatibility_circuits"]["active"], 1)

        # Clear only alpha
        removed = router.clear_compatibility_circuits(provider="alpha")
        self.assertGreaterEqual(removed, 1)

        snap = router.snapshot()
        # Beta circuits should still exist if they were created
        beta_circuits = [e for e in snap["compatibility_circuits"]["entries"] if e["provider"] == "beta"]
        alpha_circuits = [e for e in snap["compatibility_circuits"]["entries"] if e["provider"] == "alpha"]
        self.assertEqual(len(alpha_circuits), 0)

    def test_clear_compatibility_circuits_all(self):
        """clear_compatibility_circuits with no args clears all circuits."""
        router = UpstreamRouter(base_config())
        failed = next(router.iter_attempts(
            "any-model", False, "req-1", compatibility_profile="tools"
        ))
        router.report_failure(failed, error_type="client_error", http_status=422)
        router.report_failure(failed, error_type="client_error", http_status=422)
        router.report_failure(failed, error_type="client_error", http_status=422)

        snap = router.snapshot()
        self.assertGreater(snap["compatibility_circuits"]["active"], 0)

        removed = router.clear_compatibility_circuits()
        self.assertGreaterEqual(removed, 1)

        snap = router.snapshot()
        self.assertEqual(snap["compatibility_circuits"]["active"], 0)


if __name__ == "__main__":
    unittest.main()
