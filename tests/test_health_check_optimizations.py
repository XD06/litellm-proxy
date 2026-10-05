"""Health-check optimization behaviour tests.

Covers the probe anti-poisoning and scheduling changes:
- probe "opened but no first event" → flat compatibility circuit
  (probe_first_event_timeout), never the escalating provider_compat ladder
- adaptive probe first-event budget (plain-profile p95)
- ProbeCoordinator failure-count decay
- idle probe skips cooled keys, caps disabled-key re-checks at one per round
- idle round breadth scaled by idle tier (recent → 1, medium → 3)
- failed-round backoff streak bookkeeping
- patrol rounds interrupted by traffic reschedule within minutes
"""

import time
import unittest
from unittest.mock import patch

import sse2json
from observability import ProxyObservability
from proxy_utils import key_fingerprint
from router import Attempt, UpstreamRouter


def _ok_stream_line():
    return b'data: {"choices":[{"delta":{}}]}\n'


class _OkStream:
    def readline(self, *args, **kwargs):
        return _ok_stream_line()

    def close(self):
        pass


class _EmptyStream:
    def readline(self, *args, **kwargs):
        return b""

    def close(self):
        pass


class _CoordinatorStub:
    """Always-armed coordinator stub so tests can drive report paths directly."""

    def run_auto(self, key, fn, *, recent_success=False):
        _ = key, recent_success
        return True, fn()

    def record_success(self, key):
        _ = key

    def should_apply_failure(self, key, error_type):
        _ = key, error_type
        return True


def _provider_cfg(provider="alpha", key_count=1):
    return {
        "base_url": f"https://{provider}.example",
        "keys": [f"raw-{provider}-key-{i}" for i in range(key_count)],
        "enabled": True,
        "formats": {
            "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
            "responses": {"enabled": False, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        },
    }


def _idle_cfg(provider="alpha", key_count=1):
    return {
        "server": {"admin_key": "admin-secret"},
        "routing": {"provider_select": "priority_failover"},
        "models": {
            "provider_model_capabilities": {
                provider: {
                    "status": "ok",
                    "models": ["alpha-model"],
                    "canonical_map": {"alpha-model": "alpha-model"},
                    "formats": ["chat_completions"],
                }
            },
        },
        "providers": {provider: _provider_cfg(provider, key_count)},
    }


def _record_plain_success(obs, provider, model, first_event_ms, seq, key_index=0):
    request_id = f"req-{seq}"
    obs.record_request_start(
        request_id,
        client_format="chat_completions",
        endpoint="chat_completions",
        model=model,
        stream=True,
        path="/v1/chat/completions",
        request_profile="plain",
    )
    attempt = Attempt(
        request_id=request_id,
        attempt_no=1,
        provider=provider,
        key_index=key_index,
        key=f"raw-{provider}-key-{key_index}",
        url=f"https://{provider}.example/v1/chat/completions",
        headers={},
        provider_model=model,
        upstream_format="chat_completions",
        canonical_model=model,
    )
    obs.record_attempt(request_id, attempt, outcome="success", first_event_ms=first_event_ms)
    obs.record_request_end(request_id, status_code=200)


class ProbeFirstEventFlatCircuitTests(unittest.TestCase):
    """Probe no-data failures open a FLAT compatibility circuit."""

    def _patrol_cfg(self):
        return _idle_cfg("alpha", 1)

    def test_repeated_no_data_keeps_flat_circuit_cooldown(self):
        cfg = self._patrol_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class EmptyClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                return _EmptyStream()

        rt = sse2json.RuntimeContext(cfg, router, EmptyClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            for _ in range(3):
                self.assertFalse(
                    sse2json._patrol_probe_one_key_impl(
                        rt, "alpha", 0, canonical_model="alpha-model", model_source="capability"
                    )
                )

        self.assertEqual(len(router._compatibility_state), 1)
        state = next(iter(router._compatibility_state.values()))
        self.assertEqual(state.fails, 3)
        # Flat 120s circuit — the third failure must NOT escalate to the
        # 3600s rung of the compatibility ladder.
        remaining = state.cooldown_until - time.time()
        self.assertGreater(remaining, 100)
        self.assertLessEqual(remaining, 120)
        # Key-level state untouched: no cooldown, no failure counters.
        ks = router._keys_state.get(("alpha", 0))
        self.assertIsNotNone(ks)
        self.assertEqual(ks.fails, 0)
        self.assertEqual(ks.cooldown_until, 0.0)

    def test_scheduler_policy_branch_is_flat_and_overridable(self):
        policy = sse2json.scheduler_policy.failure_policy_for_error_type({}, "probe_first_event_timeout")
        self.assertEqual(policy["cooldown_scope"], "compatibility")
        self.assertEqual(policy["cooldown_s"], sse2json.scheduler_policy.PROBE_FIRST_EVENT_CIRCUIT_S)
        self.assertFalse(policy["disables_key"])

        overridden = sse2json.scheduler_policy.failure_policy_for_error_type(
            {"retry": {"failure_policies": {"probe_first_event_timeout": {"cooldown_s": 30}}}},
            "probe_first_event_timeout",
        )
        self.assertEqual(overridden["cooldown_s"], 30)


class AdaptiveProbeBudgetTests(unittest.TestCase):
    """Probe first-event budget adapts to observed plain-traffic p95."""

    def _capture_probe(self, cfg, obs):
        captured = {}

        class CaptureClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                captured["first_byte_timeout_s"] = first_byte_timeout_s
                return _OkStream()

        router = UpstreamRouter(cfg)
        rt = sse2json.RuntimeContext(cfg, router, CaptureClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")
        return healthy, captured

    def test_slow_model_raises_probe_budget_to_plain_ceiling(self):
        cfg = _idle_cfg("alpha", 1)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        for seq in range(20):
            _record_plain_success(obs, "alpha", "alpha-model", first_event_ms=40000, seq=seq)

        healthy, captured = self._capture_probe(cfg, obs)

        self.assertTrue(healthy)
        # p95 = 40s → adaptive budget 60s, clamped to the plain ceiling (45s).
        self.assertEqual(captured["first_byte_timeout_s"], 45.0)

    def test_no_stats_falls_back_to_configured_timeout(self):
        cfg = _idle_cfg("alpha", 1)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        healthy, captured = self._capture_probe(cfg, obs)

        self.assertTrue(healthy)
        # No stats yet → the plain-profile floor (20s) applies, slightly above
        # the configured 15s fallback; still far below any dangerous ceiling.
        self.assertEqual(captured["first_byte_timeout_s"], 20.0)


class CoordinatorDecayTests(unittest.TestCase):
    """Probe failure counts decay so stale evidence cannot arm the gate."""

    def test_stale_failures_do_not_arm_two_strike_gate(self):
        coordinator = sse2json.ProbeCoordinator(min_interval_s=0, failure_decay_s=0.05)
        self.assertFalse(coordinator.should_apply_failure("scope", "network_error"))
        time.sleep(0.08)
        # Count decayed back to zero → this failure is strike one again.
        self.assertFalse(coordinator.should_apply_failure("scope", "network_error"))
        # Immediate follow-up is strike two → gate opens.
        self.assertTrue(coordinator.should_apply_failure("scope", "network_error"))

    def test_zero_decay_keeps_cumulative_counting(self):
        coordinator = sse2json.ProbeCoordinator(min_interval_s=0, failure_decay_s=0)
        self.assertFalse(coordinator.should_apply_failure("scope", "network_error"))
        time.sleep(0.02)
        self.assertTrue(coordinator.should_apply_failure("scope", "network_error"))


class IdleKeySelectionTests(unittest.TestCase):
    """Idle probe skips cooled keys and caps disabled-key re-checks."""

    def _multi_key_cfg(self):
        return _idle_cfg("alpha", 3)

    def test_cooled_key_is_skipped_until_expiry(self):
        cfg = self._multi_key_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        router._keys_state[("alpha", 0)].cooldown_until = time.time() + 300

        probed_keys = []

        class RecordingClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                probed_keys.append(headers.get("Authorization"))
                return _OkStream()

        rt = sse2json.RuntimeContext(cfg, router, RecordingClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertTrue(healthy)
        # Only the available key 1 was probed; the cooled key 0 was skipped.
        self.assertEqual(len(probed_keys), 1)
        self.assertEqual(probed_keys[0], "Bearer raw-alpha-key-1")

    def test_all_keys_cooling_down_records_skip(self):
        cfg = self._multi_key_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        now = time.time()
        for i in range(3):
            router._keys_state[("alpha", i)].cooldown_until = now + 300

        calls = []

        class CountingClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                calls.append(url)
                return _OkStream()

        rt = sse2json.RuntimeContext(cfg, router, CountingClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        self.assertEqual(calls, [])
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "skipped")
        self.assertEqual(probes["last"]["reason"], "keys cooling down or disabled")

    def test_disabled_keys_limited_to_one_check_per_round(self):
        cfg = self._multi_key_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        now = time.time()
        for i in range(3):
            ks = router._keys_state[("alpha", i)]
            ks.disabled_until = now + 3600
            ks.cooldown_until = now + 3600

        calls = []

        class CountingClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                calls.append(url)
                return _EmptyStream()

        rt = sse2json.RuntimeContext(cfg, router, CountingClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        self.assertEqual(len(calls), 1, "at most one disabled key re-check per round")


class IdleRoundBreadthAndBackoffTests(unittest.TestCase):
    """Idle round breadth scales by tier; failed rounds feed the backoff."""

    def setUp(self):
        self._old_streak = sse2json._idle_failed_round_streak
        sse2json._idle_failed_round_streak = 0

    def tearDown(self):
        sse2json._idle_failed_round_streak = self._old_streak

    def _round_env(self, tier_finished_at):
        cfg = _idle_cfg("alpha", 1)
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        with patch.object(obs, "last_request_finished_at", return_value=tier_finished_at):
            rt = sse2json.RuntimeContext(cfg, router, object(), obs, sse2json.AUDIT)
            yield cfg, rt

    def test_recent_tier_probes_only_first_plan_entry(self):
        for cfg, rt in self._round_env(time.time()):
            probed = []

            def fake_probe(rt, provider, **kwargs):
                probed.append(provider)
                return False

            with patch.object(sse2json, "_request_runtime", return_value=rt), patch.object(
                sse2json,
                "_build_probe_plan",
                return_value=[(f"p{i}", "alpha-model", "src") for i in range(5)],
            ), patch.object(sse2json, "_idle_probe_one_provider", side_effect=fake_probe):
                result = sse2json._idle_health_check_round()

            self.assertIs(result, False)
            self.assertEqual(len(probed), 1, "recent tier probes only plan[0]")
            self.assertEqual(sse2json._idle_failed_round_streak, 1)

    def test_medium_tier_probes_top_three(self):
        for cfg, rt in self._round_env(time.time() - 300):
            probed = []

            def fake_probe(rt, provider, **kwargs):
                probed.append(provider)
                return False

            with patch.object(sse2json, "_request_runtime", return_value=rt), patch.object(
                sse2json,
                "_build_probe_plan",
                return_value=[(f"p{i}", "alpha-model", "src") for i in range(5)],
            ), patch.object(sse2json, "_idle_probe_one_provider", side_effect=fake_probe):
                result = sse2json._idle_health_check_round()

            self.assertIs(result, False)
            self.assertEqual(len(probed), 3, "medium tier probes top three")

    def test_deep_tier_probes_full_plan(self):
        for cfg, rt in self._round_env(time.time() - 4000):
            probed = []

            def fake_probe(rt, provider, **kwargs):
                probed.append(provider)
                return False

            with patch.object(sse2json, "_request_runtime", return_value=rt), patch.object(
                sse2json,
                "_build_probe_plan",
                return_value=[(f"p{i}", "alpha-model", "src") for i in range(5)],
            ), patch.object(sse2json, "_idle_probe_one_provider", side_effect=fake_probe):
                result = sse2json._idle_health_check_round()

            self.assertIs(result, False)
            self.assertEqual(len(probed), 5, "long/deep tiers probe the full plan")

    def test_healthy_round_resets_backoff_streak(self):
        for cfg, rt in self._round_env(time.time() - 4000):
            with patch.object(sse2json, "_request_runtime", return_value=rt), patch.object(
                sse2json,
                "_build_probe_plan",
                return_value=[("p0", "alpha-model", "src"), ("p1", "alpha-model", "src")],
            ), patch.object(sse2json, "_idle_probe_one_provider", return_value=True):
                result = sse2json._idle_health_check_round()

            self.assertIs(result, True)
            self.assertEqual(sse2json._idle_failed_round_streak, 0)

    def test_round_without_probes_does_not_count_as_failure(self):
        for cfg, rt in self._round_env(time.time()):
            with patch.object(sse2json, "_request_runtime", return_value=rt), patch.object(
                sse2json, "_build_probe_plan", return_value=[]
            ):
                result = sse2json._idle_health_check_round()

            self.assertIsNone(result)
            self.assertEqual(sse2json._idle_failed_round_streak, 0)


class PatrolInterruptRescheduleTests(unittest.TestCase):
    """A patrol round interrupted by traffic reschedules within minutes."""

    def test_interrupted_round_sets_short_next_run(self):
        cfg = _idle_cfg("alpha", 2)
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class InterruptingClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                # A real request lands mid-probe → next key iteration bails.
                with obs._lock:
                    obs._counters["requests_in_flight"] = 1
                return _EmptyStream()

        rt = sse2json.RuntimeContext(cfg, router, InterruptingClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ), patch.object(sse2json, "_request_runtime", return_value=rt):
            sse2json._patrol_health_check_round()

        schedule = sse2json._patrol_probe_schedule
        self.assertEqual(schedule["last_result"], "interrupted")
        self.assertFalse(schedule["running"])
        remaining = schedule["next_run_at"] - time.time()
        self.assertGreater(remaining, 0)
        self.assertLessEqual(
            remaining,
            sse2json._PATROL_RESCHEDULE_AFTER_INTERRUPT_S + 1,
            "interrupted patrol must retry within minutes, not 6-12h",
        )


class PatrolKeyModelPreferenceTests(unittest.TestCase):
    """Patrol prefers the model this specific key last succeeded with."""

    def test_key_recent_success_ranks_first_for_that_key(self):
        cfg = _idle_cfg("alpha", 2)
        cfg["models"]["provider_model_capabilities"]["alpha"]["models"] = ["model-a", "model-b", "alpha-model"]
        cfg["models"]["provider_model_capabilities"]["alpha"]["canonical_map"] = {
            "model-a": "model-a",
            "model-b": "model-b",
            "alpha-model": "alpha-model",
        }
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        # key 0 (older) and key 1 (newer) succeeded with different models.
        _record_plain_success(obs, "alpha", "model-a", 100, seq=1, key_index=0)
        _record_plain_success(obs, "alpha", "model-b", 100, seq=2, key_index=1)

        per_key = sse2json._collect_patrol_models("alpha", observability=obs, config=cfg, key_index=1)
        self.assertEqual(per_key[0], ("model-b", "key_recent_success"))
        # Provider-level newest success is model-b too (deduped); model-a
        # still appears as a capability candidate.
        self.assertIn(("model-a", "capability"), per_key)

        provider_level = sse2json._collect_patrol_models("alpha", observability=obs, config=cfg)
        self.assertEqual(provider_level[0], ("model-b", "recent_success"))

        other_key = sse2json._collect_patrol_models("alpha", observability=obs, config=cfg, key_index=0)
        self.assertEqual(other_key[0], ("model-a", "key_recent_success"))


class ProbeCountVisibilityTests(unittest.TestCase):
    """provider_activity_summary exposes a 24h probe count per provider."""

    def test_probe_count24h_reflects_recent_probe_events(self):
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        for _ in range(3):
            obs.record_health_probe({"provider": "alpha", "outcome": "success"})
        obs.record_health_probe({"provider": "beta", "outcome": "failed"})

        summary = obs.provider_activity_summary(limit=60, include_events=False)
        self.assertEqual(summary["alpha"]["probeCount24h"], 3)
        self.assertEqual(summary["beta"]["probeCount24h"], 1)

        entry = obs.provider_activity_for("alpha", limit=60)
        self.assertEqual(entry["probeCount24h"], 3)
        self.assertIsNotNone(entry["lastProbe"])


class PerKeyCatalogProbeTests(unittest.TestCase):
    """Idle/patrol probes honor per-key catalogs: keys whose own catalog
    lacks the probe model are skipped, and each probed key receives the raw
    id its own catalog maps the canonical to."""

    def _dual_key_cfg(self):
        cfg = _idle_cfg("alpha", 2)
        cfg["models"]["provider_key_model_capabilities"] = {
            "alpha": {
                key_fingerprint("raw-alpha-key-0"): {
                    "status": "ok",
                    "key_index": 0,
                    "models": ["alpha-model"],
                    "canonical_map": {"alpha-model": "alpha-model"},
                },
                key_fingerprint("raw-alpha-key-1"): {
                    "status": "ok",
                    "key_index": 1,
                    "models": ["beta-model"],
                    "canonical_map": {"beta-model": "beta-model-raw"},
                },
            }
        }
        return cfg

    def test_idle_probe_skips_keys_without_model_support(self):
        cfg = self._dual_key_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        probed_models = []

        class CountingClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                probed_models.append(payload.get("model"))
                return _EmptyStream()

        rt = sse2json.RuntimeContext(cfg, router, CountingClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            healthy = sse2json._idle_probe_one_provider_impl(
                rt, "alpha", suggested_model="alpha-model"
            )

        self.assertFalse(healthy)
        # Only key #0 (whose catalog supports alpha-model) may be probed;
        # key #1's catalog lacks the model and must be skipped entirely.
        self.assertEqual(probed_models, ["alpha-model"])

    def test_patrol_probe_sends_key_level_raw(self):
        cfg = self._dual_key_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        captured = {}

        class CaptureClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                captured["payload"] = payload
                return _OkStream()

        rt = sse2json.RuntimeContext(cfg, router, CaptureClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ):
            healthy = sse2json._patrol_probe_one_key_impl(
                rt, "alpha", 1, canonical_model="beta-model", model_source="capability"
            )
            self.assertTrue(healthy)
            # The probe must send key #1's own raw id, not key #0's.
            self.assertEqual(captured["payload"]["model"], "beta-model-raw")

            # A model absent from key #1's catalog is skipped with no
            # upstream call at all.
            skipped = sse2json._patrol_probe_one_key_impl(
                rt, "alpha", 1, canonical_model="alpha-model", model_source="capability"
            )
            self.assertFalse(skipped)
            self.assertEqual(captured["payload"]["model"], "beta-model-raw")


class _PatrolScheduleReset:
    def _reset_schedule(self):
        sse2json._patrol_probe_schedule.update(
            {
                "last_result": "",
                "last_summary": "",
                "running": False,
                "cursor": None,
                "next_run_at": 0.0,
                "interval_s": 0.0,
            }
        )


class PatrolPostponedTests(_PatrolScheduleReset, unittest.TestCase):
    """A patrol round postponed at start (traffic in flight) retries soon."""

    def test_in_flight_at_round_start_postpones_instead_of_full_interval(self):
        self._reset_schedule()
        cfg = _idle_cfg("alpha", 1)
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        with obs._lock:
            obs._counters["requests_in_flight"] = 1

        rt = sse2json.RuntimeContext(cfg, router, object(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ), patch.object(sse2json, "_request_runtime", return_value=rt):
            sse2json._patrol_health_check_round()

        schedule = sse2json._patrol_probe_schedule
        self.assertEqual(schedule["last_result"], "postponed")
        self.assertFalse(schedule["running"])
        remaining = schedule["next_run_at"] - time.time()
        self.assertGreater(remaining, 0)
        self.assertLessEqual(
            remaining,
            sse2json._PATROL_RESCHEDULE_AFTER_INTERRUPT_S + 1,
            "postponed patrol must retry within minutes, not wait 6-12h",
        )


class PatrolCursorResumeTests(_PatrolScheduleReset, unittest.TestCase):
    """Interrupted rounds resume from the cursor instead of restarting."""

    def _two_provider_cfg(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"provider_select": "priority_failover"},
            "health_monitor": {"patrol_delay_s": 0, "patrol_delay_jitter_s": 0},
            "models": {
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "models": ["alpha-model"],
                        "canonical_map": {"alpha-model": "alpha-model"},
                        "formats": ["chat_completions"],
                    },
                    "beta": {
                        "status": "ok",
                        "models": ["beta-model"],
                        "canonical_map": {"beta-model": "beta-model"},
                        "formats": ["chat_completions"],
                    },
                },
            },
            "providers": {
                "alpha": _provider_cfg("alpha", 2),
                "beta": _provider_cfg("beta", 1),
            },
        }
        return cfg

    def test_interrupted_round_resumes_from_cursor(self):
        self._reset_schedule()
        cfg = self._two_provider_cfg()
        router = UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class InterruptAfterFirstProbe:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                # A real request lands during the first probe → the next key
                # iteration bails with cursor=(alpha, 1).
                with obs._lock:
                    obs._counters["requests_in_flight"] = 1
                return _OkStream()

        rt = sse2json.RuntimeContext(cfg, router, InterruptAfterFirstProbe(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ), patch.object(sse2json, "_request_runtime", return_value=rt):
            sse2json._patrol_health_check_round()

        schedule = sse2json._patrol_probe_schedule
        self.assertEqual(schedule["last_result"], "interrupted")
        self.assertEqual(schedule["cursor"], {"provider": "alpha", "key_index": 1})

        # Traffic clears; the next round must NOT re-probe (alpha, 0).
        with obs._lock:
            obs._counters["requests_in_flight"] = 0

        class QuietClient:
            def open_stream(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None, first_byte_timeout_s=None):
                return _EmptyStream()

        rt2 = sse2json.RuntimeContext(cfg, router, QuietClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "PROBE_COORDINATOR", _CoordinatorStub()
        ), patch.object(sse2json, "_request_runtime", return_value=rt2):
            sse2json._patrol_health_check_round()

        attempts = [
            (str(event.get("provider") or ""), int(event.get("key_index")))
            for event in obs._health_probe_events
            if event.get("outcome") in ("success", "failed")
            and str(event.get("idle_tier") or "") == "patrol"
        ]
        from collections import Counter

        counts = Counter(attempts)
        self.assertEqual(
            counts[("alpha", 0)],
            1,
            "resumed round must not re-probe keys already swept",
        )
        self.assertEqual(counts[("alpha", 1)], 1)
        self.assertEqual(counts[("beta", 0)], 1)
        # Full sweep finished → cursor cleared.
        self.assertIsNone(sse2json._patrol_probe_schedule["cursor"])


class ProbeEventPersistenceTests(unittest.TestCase):
    """Probe events survive restarts: SQLite is the durable 24h source."""

    def _make_obs(self, path):
        return ProxyObservability(
            {
                "observability": {
                    "history": {
                        "enabled": True,
                        "path": path,
                        "retention_days": 30,
                        "sync_mode": True,
                    }
                }
            }
        )

    def test_probe_events_persist_and_survive_new_instance(self):
        import os
        import tempfile

        fd, path = tempfile.mkstemp(prefix="probe-events-", suffix=".sqlite3")
        os.close(fd)
        try:
            obs = self._make_obs(path)
            now = time.time()
            obs.record_health_probe({
                "provider": "alpha", "key_index": 0, "idle_tier": "patrol",
                "outcome": "success", "latency_ms": 12, "ts": int(now) - 3600,
            })
            obs.record_health_probe({
                "provider": "alpha", "key_index": 1, "idle_tier": "recent",
                "outcome": "failed", "http_status": 429, "action": "observed_only",
                "ts": int(now) - 60,
            })

            summary = obs.provider_activity_summary(limit=60, include_events=False)
            bucket = summary["alpha"]
            self.assertEqual(bucket["probeCount24hPatrol"], 1)
            self.assertEqual(bucket["probeCount24hReadiness"], 1)
            self.assertEqual(bucket["probeCount24h"], 2)
            self.assertEqual(bucket["lastProbePatrol"]["outcome"], "success")
            self.assertEqual(bucket["lastProbeReadiness"]["http_status"], 429)

            # A brand-new instance (simulating a restart) reads the same
            # durable counts from SQLite even with an empty in-memory deque.
            obs2 = self._make_obs(path)
            summary2 = obs2.provider_activity_summary(limit=60, include_events=False)
            self.assertEqual(summary2["alpha"]["probeCount24h"], 2)
            self.assertIsNotNone(summary2["alpha"]["lastProbePatrol"])

            # Drawer path merges persisted rows into the event list.
            entry = obs2.provider_activity_for("alpha", limit=60)
            tiers = {event.get("idle_tier") for event in entry["probeEvents"]}
            self.assertIn("patrol", tiers)
            self.assertIn("recent", tiers)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass


if __name__ == "__main__":
    unittest.main()
