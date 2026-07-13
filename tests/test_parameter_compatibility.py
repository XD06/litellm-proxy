import unittest

from format_adapters import ANTHROPIC, CHAT, RESPONSES, convert_request
from parameter_compatibility import (
    ParameterCompatibilityError,
    alternate_output_token_payload,
    extract_output_token_limit,
    format_compatibility_plan,
    native_only_request_parameters,
    upstream_format_eligibility,
)


class OutputTokenCompatibilityTests(unittest.TestCase):
    def test_accepts_common_aliases(self):
        for field in ("max_token", "max_tokens", "max_completion_tokens", "max_output_tokens"):
            with self.subTest(field=field):
                limit = extract_output_token_limit({field: 37}, client_format=CHAT)
                self.assertEqual(limit.value, 37)
                self.assertEqual(limit.source_field, field)

    def test_rejects_conflicting_aliases(self):
        with self.assertRaises(ParameterCompatibilityError):
            extract_output_token_limit(
                {"max_tokens": 10, "max_completion_tokens": 20},
                client_format=CHAT,
            )

    def test_allows_duplicate_aliases_with_same_value(self):
        limit = extract_output_token_limit(
            {"max_tokens": 10, "max_completion_tokens": 10},
            client_format=CHAT,
        )
        self.assertEqual(limit.value, 10)

    def test_rejects_bool_zero_and_non_integer(self):
        for value in (True, 0, -1, "nope", 1.5):
            with self.subTest(value=value), self.assertRaises(ParameterCompatibilityError):
                extract_output_token_limit({"max_token": value}, client_format=CHAT)

    def test_chat_alias_maps_to_each_target_format(self):
        req = {"model": "m", "messages": [], "max_token": 41}
        chat = convert_request(CHAT, CHAT, req, resolve_model=lambda m: m)
        responses = convert_request(CHAT, RESPONSES, req, resolve_model=lambda m: m)
        anthropic = convert_request(CHAT, ANTHROPIC, req, resolve_model=lambda m: m)

        self.assertEqual(chat["max_tokens"], 41)
        self.assertEqual(responses["max_output_tokens"], 41)
        self.assertEqual(anthropic["max_tokens"], 41)
        for payload in (chat, responses, anthropic):
            self.assertNotIn("max_token", payload)

    def test_responses_limit_survives_cross_format_conversion(self):
        req = {"model": "m", "input": "hello", "max_output_tokens": 53}
        chat = convert_request(RESPONSES, CHAT, req, resolve_model=lambda m: m)
        anthropic = convert_request(RESPONSES, ANTHROPIC, req, resolve_model=lambda m: m)
        self.assertEqual(chat["max_tokens"], 53)
        self.assertEqual(anthropic["max_tokens"], 53)

    def test_anthropic_limit_maps_to_responses(self):
        req = {"model": "m", "messages": [], "max_tokens": 67}
        payload = convert_request(ANTHROPIC, RESPONSES, req, resolve_model=lambda m: m)
        self.assertEqual(payload["max_output_tokens"], 67)

    def test_chat_provider_can_select_modern_field(self):
        req = {"model": "m", "messages": [], "max_token": 71}
        payload = convert_request(
            CHAT,
            CHAT,
            req,
            resolve_model=lambda m: m,
            output_token_field="max_completion_tokens",
        )
        self.assertEqual(payload["max_completion_tokens"], 71)
        self.assertNotIn("max_tokens", payload)

    def test_explicit_chat_parameter_rejection_swaps_field_without_changing_value(self):
        retry = alternate_output_token_payload(
            {"model": "m", "max_completion_tokens": 17},
            upstream_format=CHAT,
            status=400,
            error_body="Unsupported parameter: max_completion_tokens",
        )
        self.assertEqual(retry["max_tokens"], 17)
        self.assertNotIn("max_completion_tokens", retry)

    def test_502_or_ambiguous_error_never_swaps_token_field(self):
        payload = {"model": "m", "max_tokens": 8}
        self.assertIsNone(alternate_output_token_payload(
            payload, upstream_format=CHAT, status=502, error_body="bad gateway"
        ))
        self.assertIsNone(alternate_output_token_payload(
            payload, upstream_format=CHAT, status=400, error_body="invalid request"
        ))

    def test_stop_alias_maps_between_chat_and_anthropic(self):
        chat_req = {"model": "m", "messages": [], "stop_sequences": ["END"]}
        anthropic = convert_request(CHAT, ANTHROPIC, chat_req, resolve_model=lambda m: m)
        self.assertEqual(anthropic["stop_sequences"], ["END"])
        self.assertNotIn("stop", anthropic)

        anth_req = {"model": "m", "messages": [], "max_tokens": 10, "stop": "DONE"}
        chat = convert_request(ANTHROPIC, CHAT, anth_req, resolve_model=lambda m: m)
        self.assertEqual(chat["stop"], "DONE")
        self.assertNotIn("stop_sequences", chat)

    def test_conflicting_stop_aliases_are_rejected(self):
        with self.assertRaises(ParameterCompatibilityError):
            convert_request(
                CHAT, CHAT,
                {"model": "m", "messages": [], "stop": "A", "stop_sequences": ["B"]},
                resolve_model=lambda m: m,
            )

    def test_transport_options_do_not_require_native_chat_upstream(self):
        params = native_only_request_parameters(
            {"stream_options": {"include_usage": True}, "parallel_tool_calls": True},
            client_format=CHAT,
        )
        self.assertEqual(params, ())

    def test_responses_store_false_does_not_force_native_format(self):
        allowed, blocked = upstream_format_eligibility(
            {"model": "m", "input": "hello", "store": False},
            client_format=RESPONSES,
            candidate_formats=[RESPONSES, CHAT, ANTHROPIC],
        )
        self.assertEqual(allowed, [RESPONSES, CHAT, ANTHROPIC])
        self.assertEqual(blocked, {})

    def test_responses_stateful_field_blocks_fallback_formats(self):
        allowed, blocked = upstream_format_eligibility(
            {"model": "m", "input": "hello", "previous_response_id": "resp_1"},
            client_format=RESPONSES,
            candidate_formats=[RESPONSES, CHAT, ANTHROPIC],
        )
        self.assertEqual(allowed, [RESPONSES])
        self.assertEqual(blocked[CHAT], ("previous_response_id",))
        self.assertEqual(blocked[ANTHROPIC], ("previous_response_id",))

    def test_safe_anthropic_agent_fields_produce_explicit_cross_format_plan(self):
        request = {
            "model": "m",
            "messages": [],
            "thinking": {"type": "enabled", "budget_tokens": 4096},
            "cache_control": {"type": "ephemeral"},
            "service_tier": "auto",
        }

        chat_plan = format_compatibility_plan(
            request,
            client_format=ANTHROPIC,
            target_format=CHAT,
            mode="safe",
        )
        responses_plan = format_compatibility_plan(
            request,
            client_format=ANTHROPIC,
            target_format=RESPONSES,
            mode="safe",
        )

        self.assertTrue(chat_plan.allowed)
        self.assertTrue(responses_plan.allowed)
        self.assertEqual(chat_plan.blockers, ())
        self.assertEqual(
            {item["field"] for item in chat_plan.transformations},
            {"thinking"},
        )
        self.assertEqual(
            {item["field"] for item in chat_plan.dropped_hints},
            {"cache_control", "service_tier"},
        )

    def test_safe_anthropic_stateful_field_still_blocks_cross_format(self):
        plan = format_compatibility_plan(
            {"model": "m", "messages": [], "context_management": {"edits": []}},
            client_format=ANTHROPIC,
            target_format=CHAT,
            mode="safe",
        )

        self.assertFalse(plan.allowed)
        self.assertEqual(plan.blockers, ("context_management",))

    def test_anthropic_thinking_control_is_applied_to_cross_format_payloads(self):
        request = {
            "model": "m",
            "messages": [{"role": "user", "content": "hello"}],
            "thinking": {"type": "enabled", "budget_tokens": 4096},
            "cache_control": {"type": "ephemeral"},
            "service_tier": "auto",
        }

        chat = convert_request(ANTHROPIC, CHAT, request, resolve_model=lambda model: model)
        responses = convert_request(ANTHROPIC, RESPONSES, request, resolve_model=lambda model: model)

        self.assertEqual(chat["reasoning_effort"], "medium")
        self.assertEqual(responses["reasoning"], {"effort": "medium"})
        for payload in (chat, responses):
            self.assertNotIn("thinking", payload)
            self.assertNotIn("cache_control", payload)
            self.assertNotIn("service_tier", payload)

    def test_responses_parallel_tools_can_convert_to_chat_but_not_anthropic(self):
        allowed, blocked = upstream_format_eligibility(
            {"model": "m", "input": "hello", "parallel_tool_calls": False},
            client_format=RESPONSES,
            candidate_formats=[RESPONSES, CHAT, ANTHROPIC],
        )
        self.assertEqual(allowed, [RESPONSES, CHAT])
        self.assertEqual(blocked[ANTHROPIC], ("parallel_tool_calls",))

    def test_parallel_tool_calls_survives_responses_to_chat_conversion(self):
        payload = convert_request(
            RESPONSES,
            CHAT,
            {"model": "m", "input": "hello", "parallel_tool_calls": False},
            resolve_model=lambda m: m,
        )
        self.assertIs(payload["parallel_tool_calls"], False)
    def test_parallel_tool_calls_survives_chat_to_responses_conversion(self):
        payload = convert_request(
            CHAT,
            RESPONSES,
            {"model": "m", "messages": [], "parallel_tool_calls": False},
            resolve_model=lambda m: m,
        )
        self.assertIs(payload["parallel_tool_calls"], False)
    def test_non_convertible_chat_semantics_still_require_native_upstream(self):
        params = native_only_request_parameters(
            {"response_format": {"type": "json_object"}, "reasoning_effort": "high"},
            client_format=CHAT,
        )
        self.assertEqual(params, ("reasoning_effort", "response_format"))
    def test_anthropic_target_gets_configured_default_when_limit_absent(self):
        payload = convert_request(
            CHAT, ANTHROPIC,
            {"model": "m", "messages": []},
            resolve_model=lambda m: m,
            anthropic_default_max_tokens=3072,
        )
        self.assertEqual(payload["max_tokens"], 3072)

    def test_absent_limit_is_not_invented_for_chat_or_responses(self):
        chat = convert_request(CHAT, CHAT, {"model": "m", "messages": []}, resolve_model=lambda m: m)
        responses = convert_request(
            CHAT,
            RESPONSES,
            {"model": "m", "messages": []},
            resolve_model=lambda m: m,
        )
        self.assertNotIn("max_tokens", chat)
        self.assertNotIn("max_completion_tokens", chat)
        self.assertNotIn("max_output_tokens", responses)


if __name__ == "__main__":
    unittest.main()
