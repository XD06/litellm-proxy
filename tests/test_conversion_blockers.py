"""Regression tests for cross-format conversion blockers found in production.

Production 30d data: 287 conversion failures, all raised as
``invalid_output_token_limit`` but actually IR-level blocks on
``turns[N].content[0]`` — Codex-style Responses requests carrying
``encrypted_content`` reasoning-only assistant turns that could not route to
Chat Completions upstreams.
"""
import unittest

from format_adapters import CHAT, RESPONSES, prepare_request_conversion
from parameter_compatibility import ParameterCompatibilityError


def same_model(name):
    return name


def codex_style_request():
    return {
        "model": "gpt-test",
        "stream": True,
        "store": False,
        "include": ["reasoning.encrypted_content"],
        "reasoning": {"effort": "medium", "summary": "auto"},
        "instructions": "You are a helpful agent.",
        "input": [
            {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "hi"}]},
            # The production blocker: reasoning item whose only payload is
            # opaque encrypted content, alone in its turn because the next
            # item switches back to the user role (Codex omits the
            # function_call but keeps its output on resend).
            {"type": "reasoning", "id": "rs_1", "summary": [{"type": "summary_text", "text": ""}], "encrypted_content": "gAAAAopaque"},
            {"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": "{\"q\":\"x\"}"},
            {"type": "function_call_output", "call_id": "call_1", "output": "result text"},
            # Second reasoning-only turn: role switches right after it.
            {"type": "reasoning", "id": "rs_2", "summary": [], "encrypted_content": "gAAAAopaque2"},
            {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "continue"}]},
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "final answer"}]},
        ],
        "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object", "properties": {}}}],
    }


class EncryptedReasoningTurnTests(unittest.TestCase):
    def test_encrypted_reasoning_only_turns_no_longer_block_chat_conversion(self):
        prepared = prepare_request_conversion(RESPONSES, CHAT, codex_style_request(), resolve_model=same_model)
        messages = prepared.payload["messages"]
        roles = [m["role"] for m in messages]
        self.assertEqual(roles, ["system", "user", "assistant", "tool", "user", "assistant"])

    def test_no_empty_assistant_messages_after_dropping_reasoning_turns(self):
        prepared = prepare_request_conversion(RESPONSES, CHAT, codex_style_request(), resolve_model=same_model)
        empty = [
            m for m in prepared.payload["messages"]
            if m.get("role") == "assistant"
            and not m.get("content")
            and not m.get("tool_calls")
            and not m.get("reasoning_content")
        ]
        self.assertEqual(empty, [])

    def test_tool_call_pairing_survives_reasoning_drop(self):
        prepared = prepare_request_conversion(RESPONSES, CHAT, codex_style_request(), resolve_model=same_model)
        messages = prepared.payload["messages"]
        call_ids = {c["id"] for m in messages for c in m.get("tool_calls") or []}
        tool_ids = {m.get("tool_call_id") for m in messages if m.get("role") == "tool"}
        self.assertTrue(call_ids)
        self.assertEqual(call_ids, tool_ids)

    def test_conversion_report_notes_the_dropped_turn(self):
        prepared = prepare_request_conversion(RESPONSES, CHAT, codex_style_request(), resolve_model=same_model)
        report = prepared.context.report
        dropped = [
            a for a in report.actions
            if a.action == "safe_drop" and "reasoning-only assistant turn" in str(a.detail)
        ]
        self.assertTrue(dropped, "expected a safe_drop action describing the omitted reasoning-only turn")


class ErrorCodeTruthfulness(unittest.TestCase):
    def test_blocked_conversion_keeps_real_code(self):
        req = codex_style_request()
        req["background"] = True  # genuinely unconvertible execution mode
        with self.assertRaises(ParameterCompatibilityError) as ctx:
            prepare_request_conversion(RESPONSES, CHAT, req, resolve_model=same_model)
        self.assertEqual(ctx.exception.code, "conversion_blocked")

    def test_plain_parameter_errors_keep_legacy_default_code(self):
        with self.assertRaises(ParameterCompatibilityError) as ctx:
            prepare_request_conversion(RESPONSES, CHAT, {"model": "m", "max_output_tokens": -5}, resolve_model=same_model)
        self.assertEqual(ctx.exception.code, "invalid_output_token_limit")


if __name__ == "__main__":
    unittest.main()
