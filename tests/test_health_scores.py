"""Tests for provider health score calculation in observability.py."""
import unittest

from observability import ProxyObservability


class HealthScoreTests(unittest.TestCase):
    def setUp(self):
        self.cfg = {
            "server": {"admin_key": "test"},
            "providers": {
                "alpha": {"base_url": "https://alpha.example", "keys": ["alpha-key"]},
                "beta": {"base_url": "https://beta.example", "keys": ["beta-key"]},
            },
            "observability": {"recent_requests_limit": 50},
        }
        self.obs = ProxyObservability(self.cfg)

    def _record_request(self, request_id, status_code=200, attempts=None):
        """Helper to record a completed request."""
        self.obs.record_request_start(
            request_id,
            client_format="chat_completions",
            endpoint="chat_completions",
            model="test-model",
            stream=False,
            path="/v1/chat/completions",
        )
        if attempts:
            for attempt in attempts:
                self.obs.record_attempt(request_id, attempt, **attempt)
        self.obs.record_request_end(request_id, status_code=status_code)

    def test_empty_providers_returns_overall_100(self):
        """No providers → overall score is 100 (perfect by default)."""
        result = self.obs.provider_health_scores(router_snapshot={"providers": {}})
        self.assertEqual(result["overall"], 100)
        self.assertEqual(result["providers"], {})

    def test_no_activity_data_providers_get_full_score(self):
        """Providers with no activity and healthy router state get high scores."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True,
                    "config_enabled": True,
                    "runtime_enabled": True,
                    "available": True,
                    "has_hard_failure": False,
                    "cooldown_remaining_s": 0,
                    "key_count": 2,
                    "available_key_count": 2,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        self.assertIn("alpha", result["providers"])
        score = result["providers"]["alpha"]["score"]
        # No activity → success rate assumed 1.0 (50 pts)
        # No latency data → 20 pts
        # All keys available → 20 pts
        # Available, no cooldown → 10 pts
        self.assertEqual(score, 100)
        self.assertEqual(result["providers"]["alpha"]["grade"], "excellent")

    def test_failed_provider_gets_low_score(self):
        """A provider with all failed attempts should get a low score."""
        # Record a failed request
        attempt = type("Attempt", (), {
            "provider": "alpha",
            "upstream_format": "chat_completions",
            "provider_model": "test-model",
            "key": "alpha-key",
            "key_index": 0,
            "attempt_no": 1,
        })()
        self.obs.record_request_start(
            "req-fail-1",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="test-model",
            stream=False,
            path="/v1/chat/completions",
        )
        self.obs.record_attempt(
            "req-fail-1",
            attempt,
            outcome="failed",
            error_type="server_error",
            reason="server_error",
            http_status=500,
        )
        self.obs.record_request_end("req-fail-1", status_code=502)

        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True,
                    "config_enabled": True,
                    "runtime_enabled": True,
                    "available": True,
                    "has_hard_failure": False,
                    "cooldown_remaining_s": 0,
                    "key_count": 1,
                    "available_key_count": 1,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        score = result["providers"]["alpha"]["score"]
        # All failures → success rate 0 → 0 pts for success
        # Latency 0 (no successful latency) → 20 pts
        # 1/1 keys available → 20 pts
        # Available → 10 pts
        self.assertLess(score, 60)
        self.assertIn(result["providers"]["alpha"]["grade"], ("poor", "critical", "fair"))

    def test_cooldown_reduces_score(self):
        """A provider in cooldown should have reduced availability score."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True,
                    "config_enabled": True,
                    "runtime_enabled": True,
                    "available": False,
                    "has_hard_failure": False,
                    "cooldown_remaining_s": 30,
                    "key_count": 2,
                    "available_key_count": 2,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        avail_pts = result["providers"]["alpha"]["components"]["availability"]
        self.assertEqual(avail_pts, 4)  # cooldown → 4 pts

    def test_hard_failure_reduces_score(self):
        """A provider with hard failure should have very low availability score."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True,
                    "config_enabled": True,
                    "runtime_enabled": True,
                    "available": False,
                    "has_hard_failure": True,
                    "cooldown_remaining_s": 0,
                    "key_count": 2,
                    "available_key_count": 0,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        avail_pts = result["providers"]["alpha"]["components"]["availability"]
        self.assertEqual(avail_pts, 2)  # hard failure → 2 pts

    def test_disabled_provider_gets_zero_availability(self):
        """A disabled provider should get 0 availability points."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": False,
                    "config_enabled": False,
                    "runtime_enabled": True,
                    "available": False,
                    "has_hard_failure": False,
                    "cooldown_remaining_s": 0,
                    "key_count": 2,
                    "available_key_count": 2,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        avail_pts = result["providers"]["alpha"]["components"]["availability"]
        self.assertEqual(avail_pts, 0)

    def test_partial_key_availability(self):
        """Partial key availability should give partial key score."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True,
                    "config_enabled": True,
                    "runtime_enabled": True,
                    "available": True,
                    "has_hard_failure": False,
                    "cooldown_remaining_s": 0,
                    "key_count": 4,
                    "available_key_count": 2,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        key_pts = result["providers"]["alpha"]["components"]["keys"]
        # 2/4 = 0.5 → 0.5 * 20 = 10 pts
        self.assertEqual(key_pts, 10)

    def test_overall_is_average(self):
        """Overall score should be the average of all provider scores."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True, "config_enabled": True, "runtime_enabled": True,
                    "available": True, "has_hard_failure": False,
                    "cooldown_remaining_s": 0, "key_count": 1, "available_key_count": 1,
                },
                "beta": {
                    "enabled": True, "config_enabled": True, "runtime_enabled": True,
                    "available": True, "has_hard_failure": False,
                    "cooldown_remaining_s": 0, "key_count": 1, "available_key_count": 1,
                },
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        alpha_score = result["providers"]["alpha"]["score"]
        beta_score = result["providers"]["beta"]["score"]
        expected_overall = round((alpha_score + beta_score) / 2)
        self.assertEqual(result["overall"], expected_overall)

    def test_score_components_sum_to_total(self):
        """The four component scores should sum to the total score."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True, "config_enabled": True, "runtime_enabled": True,
                    "available": True, "has_hard_failure": False,
                    "cooldown_remaining_s": 0, "key_count": 2, "available_key_count": 1,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        comps = result["providers"]["alpha"]["components"]
        total = comps["success"] + comps["latency"] + comps["keys"] + comps["availability"]
        self.assertEqual(total, result["providers"]["alpha"]["score"])

    def test_grades_are_correct(self):
        """Grade thresholds are correct."""
        # We can test the grade logic by checking a perfect and a terrible provider.
        # The terrible provider has no activity data (success rate defaults to 1.0)
        # but is disabled with hard failure and no available keys, so its score is
        # still lowered by 0 availability + 0 key pts.
        router_snap = {
            "providers": {
                "perfect": {
                    "enabled": True, "config_enabled": True, "runtime_enabled": True,
                    "available": True, "has_hard_failure": False,
                    "cooldown_remaining_s": 0, "key_count": 2, "available_key_count": 2,
                },
                "terrible": {
                    "enabled": False, "config_enabled": False, "runtime_enabled": True,
                    "available": False, "has_hard_failure": True,
                    "cooldown_remaining_s": 0, "key_count": 1, "available_key_count": 0,
                },
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        self.assertEqual(result["providers"]["perfect"]["grade"], "excellent")
        perfect_score = result["providers"]["perfect"]["score"]
        terrible_score = result["providers"]["terrible"]["score"]
        # Perfect should score higher than terrible
        self.assertGreater(perfect_score, terrible_score)
        # Terrible should not be excellent
        terrible_grade = result["providers"]["terrible"]["grade"]
        self.assertNotEqual(terrible_grade, "excellent")

    def test_none_router_snapshot(self):
        """Should work with None router_snapshot."""
        result = self.obs.provider_health_scores(router_snapshot=None)
        # No activity, no router state → should still return a result
        self.assertIn("overall", result)
        self.assertIn("providers", result)

    def test_score_never_exceeds_100(self):
        """Score should be clamped to 100."""
        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": True, "config_enabled": True, "runtime_enabled": True,
                    "available": True, "has_hard_failure": False,
                    "cooldown_remaining_s": 0, "key_count": 0, "available_key_count": 0,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        score = result["providers"]["alpha"]["score"]
        self.assertLessEqual(score, 100)

    def test_score_never_below_0(self):
        """Score should be clamped to 0."""
        # Create a provider with all failures and disabled state
        attempt = type("Attempt", (), {
            "provider": "alpha",
            "upstream_format": "chat_completions",
            "provider_model": "test-model",
            "key": "alpha-key",
            "key_index": 0,
            "attempt_no": 1,
        })()
        self.obs.record_request_start(
            "req-0",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="test-model",
            stream=False,
            path="/v1/chat/completions",
        )
        self.obs.record_attempt(
            "req-0", attempt, outcome="failed",
            error_type="key_invalid", reason="key_invalid", http_status=401,
        )
        self.obs.record_request_end("req-0", status_code=401)

        router_snap = {
            "providers": {
                "alpha": {
                    "enabled": False, "config_enabled": False, "runtime_enabled": True,
                    "available": False, "has_hard_failure": True,
                    "cooldown_remaining_s": 0, "key_count": 1, "available_key_count": 0,
                }
            }
        }
        result = self.obs.provider_health_scores(router_snapshot=router_snap)
        score = result["providers"]["alpha"]["score"]
        self.assertGreaterEqual(score, 0)


if __name__ == "__main__":
    unittest.main()
