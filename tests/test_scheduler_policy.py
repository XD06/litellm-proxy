import unittest

import scheduler_policy


def cfg():
    return {
        "routing": {"max_attempts": 4, "connect_timeout_s": 3, "read_timeout_s": 9},
        "retry": {
            "retryable_status": [408, 409, 425, 429, 500, 502, 503, 504],
            "key_fatal_status": [401, 403],
            "respect_retry_after": True,
            "cooldown_s": {"rate_limit": 30},
        },
    }


class SchedulerPolicyTests(unittest.TestCase):
    def test_key_fatal_status_is_not_retryable_for_same_key(self):
        decision = scheduler_policy.classify_http_error(cfg(), 401)

        self.assertEqual(decision.error_type, "key_invalid")
        self.assertFalse(decision.retryable)
        self.assertFalse(decision.stop_attempts)
        self.assertEqual(decision.cooldown_scope, "key")
        self.assertEqual(decision.cooldown_s, 3600)
        self.assertTrue(decision.disables_key)

    def test_401_403_balance_messages_are_quota_not_invalid_key(self):
        for status, body in (
            (401, '{"error":{"message":"Insufficient balance. Manage billing"}}'),
            (403, '{"error":{"code":"insufficient_user_quota","message":"用户额度不足"}}'),
        ):
            with self.subTest(status=status):
                decision = scheduler_policy.classify_http_error(cfg(), status, error_body=body)
                self.assertEqual(decision.error_type, "quota_or_balance")
                self.assertEqual(decision.reason, "quota_or_balance")

    def test_invalid_auth_message_remains_key_invalid(self):
        decision = scheduler_policy.classify_http_error(
            cfg(), 401, error_body='{"error":{"message":"invalid api key"}}'
        )
        self.assertEqual(decision.error_type, "key_invalid")

    def test_rate_limit_and_server_errors_are_retryable(self):
        self.assertEqual(scheduler_policy.classify_http_error(cfg(), 429).error_type, "rate_limited")
        self.assertTrue(scheduler_policy.classify_http_error(cfg(), 429).retryable)
        self.assertEqual(scheduler_policy.classify_http_error(cfg(), 502).error_type, "server_error")
        self.assertTrue(scheduler_policy.classify_http_error(cfg(), 502).retryable)

    def test_quota_or_balance_has_dedicated_long_key_cooldown(self):
        decision = scheduler_policy.classify_http_error(
            cfg(),
            402,
            error_body='{"error":{"message":"Insufficient Balance"}}',
            model_name="deepseek-v4-flash",
        )

        self.assertEqual(decision.error_type, "quota_or_balance")
        self.assertTrue(decision.retryable)
        self.assertFalse(decision.stop_attempts)
        self.assertEqual(decision.reason, "quota_or_balance")
        self.assertEqual(decision.cooldown_scope, "key")
        self.assertGreaterEqual(decision.cooldown_s, 1800)

    def test_model_not_found_does_not_stop_attempts(self):
        body = {"error": {"message": "model deepseek-v4-flash does not exist"}}
        decision = scheduler_policy.classify_http_error(
            cfg(),
            404,
            error_body=__import__("json").dumps(body),
            model_name="deepseek-v4-flash",
        )

        self.assertEqual(decision.error_type, "client_error")
        self.assertFalse(decision.retryable)
        # Don't stop — another provider may support this model.
        self.assertFalse(decision.stop_attempts)
        self.assertEqual(decision.reason, "model_not_found")
        self.assertEqual(decision.cooldown_scope, "none")
        self.assertEqual(decision.cooldown_s, 0)

    def test_non_model_400_404_can_retry_other_provider(self):
        decision = scheduler_policy.classify_http_error(
            cfg(),
            400,
            error_body='{"error":{"message":"unsupported endpoint shape"}}',
            model_name="deepseek-v4-flash",
        )

        self.assertEqual(decision.error_type, "server_error")
        self.assertTrue(decision.retryable)
        self.assertFalse(decision.stop_attempts)

    def test_422_does_not_stop_attempts(self):
        decision = scheduler_policy.classify_http_error(cfg(), 422)

        self.assertEqual(decision.error_type, "client_error")
        self.assertFalse(decision.retryable)
        # Don't stop — another provider may accept the schema.
        self.assertFalse(decision.stop_attempts)

    def test_reasoning_content_detection_is_chat_only(self):
        body = '{"error":{"message":"reasoning_content must be passed back"}}'

        self.assertTrue(scheduler_policy.should_strip_reasoning_content("chat_completions", body))
        self.assertFalse(scheduler_policy.should_strip_reasoning_content("responses", body))

    def test_tool_choice_unsupported_is_provider_compat_retry(self):
        body = '{"error":{"message":"Thinking mode does not support this tool_choice"}}'
        decision = scheduler_policy.classify_http_error(
            cfg(),
            400,
            error_body=body,
            model_name="deepseek-v4-flash",
        )

        self.assertEqual(decision.error_type, "provider_compat")
        self.assertTrue(decision.retryable)
        self.assertFalse(decision.stop_attempts)
        self.assertEqual(decision.reason, "tool_choice_unsupported")
        self.assertEqual(decision.cooldown_scope, "none")
        self.assertEqual(decision.cooldown_s, 0)
        self.assertTrue(scheduler_policy.should_downgrade_tool_choice("chat_completions", body))
        self.assertTrue(scheduler_policy.should_downgrade_tool_choice("responses", body))
        self.assertTrue(scheduler_policy.should_downgrade_tool_choice("anthropic_messages", body))

    def test_thinking_content_required_is_provider_compat_retry(self):
        body = (
            '{"error":{"message":"The `content[].thinking` in the thinking mode must be passed back '
            'to the API.","type":"invalid_request_error","code":"invalid_request_error"}}'
        )
        decision = scheduler_policy.classify_http_error(
            cfg(),
            400,
            error_body=body,
            model_name="deepseek-v4-flash",
        )

        self.assertEqual(decision.error_type, "provider_compat")
        self.assertTrue(decision.retryable)
        self.assertFalse(decision.stop_attempts)
        self.assertEqual(decision.reason, "thinking_content_required")
        self.assertEqual(decision.cooldown_scope, "none")
        self.assertEqual(decision.cooldown_s, 0)

    def test_failure_policy_for_error_type_is_machine_readable(self):
        rate_limited = scheduler_policy.failure_policy_for_error_type(cfg(), "rate_limited", retry_after_s=12)
        quota_or_balance = scheduler_policy.failure_policy_for_error_type(cfg(), "quota_or_balance")
        provider_compat = scheduler_policy.failure_policy_for_error_type(cfg(), "provider_compat")
        empty_visible = scheduler_policy.failure_policy_for_error_type(cfg(), "empty_visible_output")
        network = scheduler_policy.failure_policy_for_error_type(
            {"retry": {"cooldown_s": {"network_error": 45}}},
            "network_error",
        )

        self.assertEqual(rate_limited["cooldown_scope"], "key")
        self.assertEqual(rate_limited["cooldown_s"], 12)
        self.assertFalse(rate_limited["disables_key"])
        self.assertEqual(quota_or_balance["cooldown_scope"], "key")
        self.assertGreaterEqual(quota_or_balance["cooldown_s"], 1800)
        self.assertFalse(quota_or_balance["disables_key"])
        self.assertEqual(provider_compat["cooldown_scope"], "none")
        self.assertEqual(empty_visible["cooldown_scope"], "none")
        self.assertEqual(network["cooldown_scope"], "key")
        self.assertEqual(network["provider_cooldown_s"], 0)

    def test_configured_failure_policy_overrides_defaults(self):
        custom = cfg()
        custom["retry"]["failure_policies"] = {
            "server_error": {"cooldown_scope": "provider", "provider_cooldown_s": 25, "cooldown_s": 99},
            "empty_visible_output": {"cooldown_scope": "key", "cooldown_s": 3},
        }

        server_error = scheduler_policy.failure_policy_for_error_type(custom, "server_error")
        empty_visible = scheduler_policy.failure_policy_for_error_type(custom, "empty_visible_output")
        decision = scheduler_policy.classify_http_error(custom, 502)

        self.assertEqual(server_error["cooldown_scope"], "provider")
        self.assertEqual(server_error["cooldown_s"], 0)
        self.assertEqual(server_error["provider_cooldown_s"], 25)
        self.assertFalse(server_error["disables_key"])
        self.assertEqual(empty_visible["cooldown_scope"], "key")
        self.assertEqual(empty_visible["cooldown_s"], 3)
        self.assertEqual(decision.cooldown_scope, "provider")
        self.assertEqual(decision.cooldown_s, 0)

    def test_invalid_failure_policy_values_are_clamped_or_ignored(self):
        custom = {
            "retry": {
                "failure_policies": {
                    "network_error": {
                        "cooldown_scope": "not-a-scope",
                        "cooldown_s": -1,
                        "provider_cooldown_s": 99999,
                        "disables_key": "yes",
                    },
                    "provider_compat": {
                        "cooldown_scope": "none",
                        "cooldown_s": 999,
                        "provider_cooldown_s": 999,
                        "disables_key": True,
                    },
                }
            }
        }

        network = scheduler_policy.failure_policy_for_error_type(custom, "network_error")
        provider_compat = scheduler_policy.failure_policy_for_error_type(custom, "provider_compat")

        self.assertEqual(network["cooldown_scope"], "key")
        self.assertEqual(network["cooldown_s"], 0)
        self.assertEqual(network["provider_cooldown_s"], 0)
        self.assertTrue(network["disables_key"])
        self.assertEqual(provider_compat["cooldown_scope"], "none")
        self.assertEqual(provider_compat["cooldown_s"], 0)
        self.assertEqual(provider_compat["provider_cooldown_s"], 0)
        self.assertFalse(provider_compat["disables_key"])

    def test_retry_after_still_overrides_rate_limit_cooldown_policy(self):
        custom = cfg()
        custom["retry"]["failure_policies"] = {
            "rate_limited": {"cooldown_scope": "key", "cooldown_s": 5}
        }

        rate_limited = scheduler_policy.failure_policy_for_error_type(custom, "rate_limited", retry_after_s=12)

        self.assertEqual(rate_limited["cooldown_s"], 12)

    def test_transport_decision_includes_cooldown_scope(self):
        decision = scheduler_policy.classify_transport_error("socket.timeout", cfg())

        self.assertEqual(decision.error_type, "network_error")
        self.assertTrue(decision.retryable)
        self.assertEqual(decision.reason, "timeout")
        self.assertEqual(decision.cooldown_scope, "key")

    def test_policy_snapshot_exposes_rules_for_admin(self):
        snap = scheduler_policy.policy_snapshot(cfg())

        self.assertEqual(snap["max_attempts"], 4)
        self.assertEqual(snap["same_key_retries"], 1)
        self.assertEqual(snap["key_failure_ladder_s"], [10, 60, 3600])
        self.assertIn("400_404_model_not_found", snap["rules"])
        self.assertIn("400_tool_choice_unsupported", snap["rules"])
        self.assertEqual(snap["failure_policies"]["provider_compat"]["cooldown_scope"], "none")
        self.assertEqual(snap["failure_policies"]["empty_visible_output"]["cooldown_scope"], "none")
        self.assertEqual(snap["failure_policies"]["quota_or_balance"]["cooldown_scope"], "key")
        self.assertTrue(any(rule["match"] == "HTTP 200 empty visible output" for rule in snap["rule_table"]))
        self.assertTrue(
            any(rule["match"] == "Duplicate provider/key/format candidate in same request" for rule in snap["rule_table"])
        )
        first_rule = snap["rule_table"][0]
        self.assertIn("decision", first_rule)
        self.assertIn("cooldown_scope", first_rule["decision"])


class RetryAfterClampTests(unittest.TestCase):
    """NC3: an upstream-supplied Retry-After must be clamped to a sane max."""

    def test_huge_retry_after_is_clamped_to_max_configured_cooldown(self):
        decision = scheduler_policy.classify_http_error(
            cfg(),
            429,
            error_body='{"error":{"message":"rate limited"}}',
        )
        # failure_policy_for_error_type is called with retry_after_s; use it
        # directly to exercise the clamp path.
        policy = scheduler_policy.failure_policy_for_error_type(
            cfg(), "rate_limited", retry_after_s=999999999
        )
        self.assertLessEqual(policy["cooldown_s"], scheduler_policy.MAX_CONFIGURED_COOLDOWN_S)
        self.assertTrue(policy.get("used_retry_after"))

    def test_small_retry_after_is_respected(self):
        policy = scheduler_policy.failure_policy_for_error_type(
            cfg(), "rate_limited", retry_after_s=5
        )
        self.assertEqual(policy["cooldown_s"], 5)

    def test_zero_retry_after_is_zero(self):
        policy = scheduler_policy.failure_policy_for_error_type(
            cfg(), "rate_limited", retry_after_s=0
        )
        self.assertEqual(policy["cooldown_s"], 0)


if __name__ == "__main__":
    unittest.main()
