"""Google generateContent codec tests (upstream-only conversion)."""

import base64
import unittest

from conversion_core import (
    ANTHROPIC,
    CHAT,
    GOOGLE,
    RESPONSES,
    ConversionError,
    prepare_request,
    translate_response,
)
from conversion_core.codecs.google import thinking_override_for_effort


def same_model(name):
    return name


DUMMY = base64.b64encode(b"skip_thought_signature_validator").decode("ascii")


def _parts_by_role(payload, role):
    out = []
    for content in payload["contents"]:
        if content.get("role") == role:
            out.extend(content.get("parts") or [])
    return out


class GoogleRenderRequestTests(unittest.TestCase):
    def test_chat_basic_maps_system_temperature_and_generation_config(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [
                {"role": "system", "content": "You are terse."},
                {"role": "user", "content": "hi"},
            ],
            "temperature": 0.3,
            "top_p": 0.9,
            "max_tokens": 256,
            "stop": "END",
        }, resolve_model=same_model)

        payload = prepared.payload
        # Google rejects unknown top-level fields: model must stay in the URL.
        self.assertNotIn("model", payload)
        self.assertNotIn("stream", payload)
        self.assertEqual(payload["systemInstruction"], {"parts": [{"text": "You are terse."}]})
        self.assertEqual(payload["contents"], [{"role": "user", "parts": [{"text": "hi"}]}])
        config = payload["generationConfig"]
        self.assertEqual(config["temperature"], 0.3)
        self.assertEqual(config["topP"], 0.9)
        self.assertEqual(config["maxOutputTokens"], 256)
        self.assertEqual(config["stopSequences"], ["END"])
        self.assertEqual(config["thinkingConfig"], {"includeThoughts": True})

    def test_chat_tool_round_trip_history_becomes_function_call_and_response(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [
                {"role": "user", "content": "weather in SF?"},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {"id": "call_1", "type": "function", "function": {"name": "get-weather", "arguments": "{\"city\":\"SF\"}"}}
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "sunny, 21C"},
            ],
            "tools": [
                {"type": "function", "function": {"name": "get-weather", "description": "d", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}}}
            ],
        }, resolve_model=same_model)

        payload = prepared.payload
        declarations = payload["tools"][0]["functionDeclarations"]
        # Google function names forbid hyphens; the wire name is sanitized and
        # response name restoration happens through the conversion context.
        self.assertEqual(declarations[0]["name"], "get_weather")
        self.assertEqual(declarations[0]["parametersJsonSchema"]["properties"]["city"]["type"], "string")

        model_parts = _parts_by_role(payload, "model")
        self.assertEqual(model_parts[0]["functionCall"]["name"], "get_weather")
        self.assertEqual(model_parts[0]["functionCall"]["args"], {"city": "SF"})
        self.assertEqual(model_parts[0]["functionCall"]["id"], "call_1")
        # No round-trippable signature yet -> documented dummy, never a 400.
        # thoughtSignature is a Part-level field; the FunctionCall proto only
        # carries name/args/id, so anything else inside it is a Google 400.
        self.assertEqual(model_parts[0]["thoughtSignature"], DUMMY)
        self.assertNotIn("thoughtSignature", model_parts[0]["functionCall"])

        user_parts = _parts_by_role(payload, "user")
        response_part = [part for part in user_parts if "functionResponse" in part][0]["functionResponse"]
        self.assertEqual(response_part["name"], "get_weather")
        self.assertEqual(response_part["id"], "call_1")
        self.assertEqual(response_part["response"], {"result": "sunny, 21C"})

    def test_chat_history_top_level_signature_key_flows_through(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-3-pro",
            "messages": [
                {"role": "user", "content": "weather?"},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_9",
                            "type": "function",
                            "function": {"name": "get_weather", "arguments": "{}"},
                            "thought_signature": "REAL_SIG",
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "call_9", "content": {"ok": True}},
            ],
            "tools": [{"type": "function", "function": {"name": "get_weather", "parameters": {"type": "object", "properties": {}}}}],
        }, resolve_model=same_model)
        part = _parts_by_role(prepared.payload, "model")[0]
        # The chat codec accepts both provider_specific_fields and the
        # LiteLLM-style top-level thought_signature key on history calls.
        self.assertEqual(part["thoughtSignature"], "REAL_SIG")
        self.assertNotIn("thoughtSignature", part["functionCall"])

    def test_tool_choice_modes_map_to_function_calling_config(self):
        base = {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "tools": [{"type": "function", "function": {"name": "t1", "parameters": {"type": "object", "properties": {}}}}],
        }
        for mode, expected in (
            ("required", "ANY"),
            ("none", "NONE"),
            ("auto", "AUTO"),
        ):
            request = dict(base, tool_choice=mode)
            prepared = prepare_request(CHAT, GOOGLE, request, resolve_model=same_model)
            self.assertEqual(prepared.payload["toolConfig"]["functionCallingConfig"]["mode"], expected, mode)

        named = prepare_request(CHAT, GOOGLE, dict(base, tool_choice={"type": "function", "function": {"name": "t1"}}), resolve_model=same_model)
        config = named.payload["toolConfig"]["functionCallingConfig"]
        self.assertEqual(config["mode"], "ANY")
        self.assertEqual(config["allowedFunctionNames"], ["t1"])

    def test_parallel_tool_calls_disabled_is_dropped_with_report(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "tools": [{"type": "function", "function": {"name": "t1", "parameters": {"type": "object", "properties": {}}}}],
            "parallel_tool_calls": False,
        }, resolve_model=same_model)
        self.assertIn("parallel_tool_calls", [action.field for action in prepared.report.actions])

    def test_thinking_budget_for_25_and_level_for_3x(self):
        for model, effort, expect_key in (
            ("gemini-2.5-pro", "high", "thinkingBudget"),
            ("gemini-3-flash", "high", "thinkingLevel"),
        ):
            prepared = prepare_request(CHAT, GOOGLE, {
                "model": model,
                "messages": [{"role": "user", "content": "think"}],
                "reasoning_effort": effort,
            }, resolve_model=same_model)
            config = prepared.payload["generationConfig"]["thinkingConfig"]
            self.assertIn(expect_key, config)
            self.assertEqual(config["includeThoughts"], True)

        budget = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "think"}],
            "reasoning_effort": "low",
        }, resolve_model=same_model)
        self.assertEqual(budget.payload["generationConfig"]["thinkingConfig"]["thinkingBudget"], 1024)

        level = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-3-pro-preview",
            "messages": [{"role": "user", "content": "think"}],
            "reasoning_effort": "minimal",
        }, resolve_model=same_model)
        self.assertEqual(level.payload["generationConfig"]["thinkingConfig"]["thinkingLevel"], "minimal")

    def test_xhigh_effort_clamps_per_generation(self):
        # Live-verified upstream 400: thinkingBudget 32768 is invalid on
        # gemini-2.5-flash (0..24576) but valid on 2.5-pro; Gemini 3 exposes
        # no xhigh level, so unknown intensities clamp to the highest level.
        for model, expected in (
            ("gemini-2.5-flash", 24576),
            ("gemini-2.5-pro", 32768),
        ):
            prepared = prepare_request(CHAT, GOOGLE, {
                "model": model,
                "messages": [{"role": "user", "content": "think"}],
                "reasoning_effort": "xhigh",
            }, resolve_model=same_model)
            config = prepared.payload["generationConfig"]["thinkingConfig"]
            self.assertEqual(config["thinkingBudget"], expected, model)
            self.assertEqual(config["includeThoughts"], True, model)
        three = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-3.5-flash-lite",
            "messages": [{"role": "user", "content": "think"}],
            "reasoning_effort": "xhigh",
        }, resolve_model=same_model)
        config = three.payload["generationConfig"]["thinkingConfig"]
        self.assertEqual(config["thinkingLevel"], "high")
        self.assertEqual(config["includeThoughts"], True)

    def test_explicit_budget_clamped_to_family_cap(self):
        prepared = prepare_request(ANTHROPIC, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "thinking": {"type": "enabled", "budget_tokens": 32768},
            "max_tokens": 65536,
        }, resolve_model=same_model)
        config = prepared.payload["generationConfig"]["thinkingConfig"]
        self.assertEqual(config["thinkingBudget"], 24576)

    def test_thinking_override_for_effort_rules(self):
        self.assertEqual(
            thinking_override_for_effort("xhigh", "gemini-2.5-flash")["thinkingBudget"], 24576)
        self.assertEqual(
            thinking_override_for_effort("xhigh", "gemini-2.5-pro")["thinkingBudget"], 32768)
        self.assertEqual(
            thinking_override_for_effort("xhigh", "gemini-3.5-flash-lite")["thinkingLevel"], "high")
        self.assertEqual(
            thinking_override_for_effort("banana", "gemini-3-flash")["thinkingLevel"], "high")
        self.assertEqual(
            thinking_override_for_effort("off", "gemini-2.5-flash"),
            {"includeThoughts": False, "thinkingBudget": 0})
        self.assertIsNone(thinking_override_for_effort("banana", "gemini-2.5-flash"))

    def test_thinking_disabled_semantics(self):
        chat_off = prepare_request(ANTHROPIC, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "thinking": {"type": "disabled"},
            "max_tokens": 32,
        }, resolve_model=same_model)
        config = chat_off.payload["generationConfig"]["thinkingConfig"]
        self.assertEqual(config, {"includeThoughts": False, "thinkingBudget": 0})

        three = prepare_request(ANTHROPIC, GOOGLE, {
            "model": "gemini-3-flash",
            "messages": [{"role": "user", "content": "x"}],
            "thinking": {"type": "disabled"},
            "max_tokens": 32,
        }, resolve_model=same_model)
        three_config = three.payload["generationConfig"]["thinkingConfig"]
        self.assertEqual(three_config["thinkingLevel"], "minimal")
        self.assertEqual(three_config["includeThoughts"], False)

    def test_responses_reasoning_and_instructions_render(self):
        prepared = prepare_request(RESPONSES, GOOGLE, {
            "model": "gemini-2.5-flash",
            "instructions": "be nice",
            "input": [{"role": "user", "content": [{"type": "input_text", "text": "hello"}]}],
            "reasoning": {"effort": "medium"},
            "max_output_tokens": 512,
        }, resolve_model=same_model)
        payload = prepared.payload
        self.assertEqual(payload["systemInstruction"]["parts"][0]["text"], "be nice")
        self.assertEqual(payload["generationConfig"]["maxOutputTokens"], 512)
        self.assertEqual(payload["generationConfig"]["thinkingConfig"]["thinkingBudget"], 8192)

    def test_anthropic_history_and_image_blocks_render(self):
        png_b64 = "iVBORw0KGgoAAAANSUhEUg=="
        prepared = prepare_request(ANTHROPIC, GOOGLE, {
            "model": "gemini-2.5-flash",
            "max_tokens": 64,
            "system": "sys prompt",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "describe"},
                        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": png_b64}},
                    ],
                },
                {
                    "role": "assistant",
                    "content": [
                        {"type": "thinking", "thinking": "I see a cat", "signature": "ANTHROPIC_SIG"},
                        {"type": "text", "text": "a cat"},
                    ],
                },
            ],
        }, resolve_model=same_model)
        payload = prepared.payload
        user_parts = payload["contents"][0]["parts"]
        self.assertEqual(user_parts[1]["inlineData"], {"mimeType": "image/png", "data": png_b64})
        model_parts = payload["contents"][1]["parts"]
        self.assertEqual(model_parts, [{"text": "a cat"}])

    def test_remote_image_url_is_blocked(self):
        with self.assertRaises(ConversionError) as ctx:
            prepare_request(CHAT, GOOGLE, {
                "model": "gemini-2.5-flash",
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": "look"},
                    {"type": "image_url", "image_url": {"url": "https://example.com/a.png"}},
                ]}],
            }, resolve_model=same_model)
        self.assertEqual(ctx.exception.code, "conversion_blocked")
        self.assertEqual(ctx.exception.field, "contents[0].parts[1]")

    def test_data_url_image_becomes_inline_data(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAAA"}},
            ]}],
        }, resolve_model=same_model)
        self.assertEqual(prepared.payload["contents"][0]["parts"][0], {"inlineData": {"mimeType": "image/jpeg", "data": "AAAA"}})

    def test_custom_tool_is_blocked(self):
        with self.assertRaises(ConversionError) as ctx:
            prepare_request(RESPONSES, GOOGLE, {
                "model": "gemini-2.5-flash",
                "input": [{"role": "user", "content": "x"}],
                "tools": [{"type": "custom", "name": "apply_patch"}],
            }, resolve_model=same_model)
        self.assertEqual(ctx.exception.code, "conversion_blocked")

    def test_structured_output_json_schema_maps(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "answer", "schema": {"type": "object", "properties": {"a": {"type": "string"}}}},
            },
        }, resolve_model=same_model)
        config = prepared.payload["generationConfig"]
        self.assertEqual(config["responseMimeType"], "application/json")
        self.assertEqual(config["responseSchema"], {"type": "object", "properties": {"a": {"type": "string"}}})

    def test_chat_only_parameters_report_safe_drop(self):
        prepared = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [{"role": "user", "content": "x"}],
            "presence_penalty": 0.5,
            "seed": 7,
            "n": 3,
        }, resolve_model=same_model)
        fields = {action.field: action.action for action in prepared.report.actions}
        self.assertEqual(fields.get("presence_penalty"), "safe_drop")
        self.assertEqual(fields.get("seed"), "safe_drop")
        self.assertEqual(fields.get("n"), "map")
        self.assertEqual(prepared.payload["generationConfig"]["candidateCount"], 3)


class GoogleParseResponseTests(unittest.TestCase):
    def _prepared_chat(self, model="gemini-2.5-flash"):
        return prepare_request(CHAT, GOOGLE, {
            "model": model,
            "messages": [{"role": "user", "content": "x"}],
            "tools": [{"type": "function", "function": {"name": "get-weather", "parameters": {"type": "object", "properties": {}}}}],
        }, resolve_model=same_model)

    def test_google_text_and_thought_become_chat_message(self):
        prepared = self._prepared_chat()
        converted = translate_response(GOOGLE, CHAT, {
            "responseId": "r1",
            "modelVersion": "gemini-2.5-flash",
            "candidates": [{
                "content": {"role": "model", "parts": [
                    {"text": "hidden reasoning", "thought": True, "thoughtSignature": "TS=="},
                    {"text": "final answer"},
                ]},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5, "thoughtsTokenCount": 4, "totalTokenCount": 19},
        }, context=prepared.context)
        message = converted["choices"][0]["message"]
        self.assertEqual(message["content"], "final answer")
        self.assertEqual(message["reasoning_content"], "hidden reasoning")
        self.assertEqual(converted["choices"][0]["finish_reason"], "stop")
        self.assertEqual(converted["usage"]["prompt_tokens"], 10)
        self.assertEqual(converted["usage"]["completion_tokens_details"]["reasoning_tokens"], 4)

    def test_google_function_call_restores_original_tool_name(self):
        prepared = self._prepared_chat()
        converted = translate_response(GOOGLE, CHAT, {
            "candidates": [{
                "content": {"role": "model", "parts": [
                    {"functionCall": {"name": "get_weather", "args": {"city": "SF"}, "id": "call_1", "thoughtSignature": "FSIG=="}},
                ]},
                "finishReason": "STOP",
            }],
        }, context=prepared.context)
        message = converted["choices"][0]["message"]
        self.assertEqual(message["tool_calls"][0]["function"]["name"], "get-weather")
        self.assertEqual(message["tool_calls"][0]["id"], "call_1")
        self.assertEqual(converted["choices"][0]["finish_reason"], "tool_calls")

    def test_google_parallel_calls_only_first_signed(self):
        prepared = self._prepared_chat()
        converted = translate_response(GOOGLE, CHAT, {
            "candidates": [{
                "content": {"role": "model", "parts": [
                    {"functionCall": {"name": "get_weather", "args": {"c": "SF"}, "thoughtSignature": "S1=="}},
                    {"functionCall": {"name": "get_weather", "args": {"c": "LA"}}},
                ]},
                "finishReason": "STOP",
            }],
        }, context=prepared.context)
        calls = converted["choices"][0]["message"]["tool_calls"]
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(call["id"] for call in calls))
        # Round-trip back into a Google request: both history calls render, the
        # first keeps its real signature, the second gets the documented dummy.
        back = prepare_request(CHAT, GOOGLE, {
            "model": "gemini-2.5-flash",
            "messages": [
                {"role": "user", "content": "x"},
                {"role": "assistant", "content": None, "tool_calls": calls},
                {"role": "tool", "tool_call_id": calls[0]["id"], "content": "ok"},
                {"role": "tool", "tool_call_id": calls[1]["id"], "content": "ok"},
            ],
            "tools": [
                {"type": "function", "function": {"name": "get-weather", "parameters": {"type": "object", "properties": {}}}}
            ],
        }, resolve_model=same_model)
        model_parts = _parts_by_role(back.payload, "model")
        # The first (signed) call replays its real signature via
        # provider_specific_fields; the second, never signed, gets the dummy.
        # Both render at Part level, never inside functionCall.
        self.assertEqual(model_parts[0]["thoughtSignature"], "S1==")
        self.assertEqual(model_parts[1]["thoughtSignature"], DUMMY)
        self.assertNotIn("thoughtSignature", model_parts[0]["functionCall"])
        self.assertNotIn("thoughtSignature", model_parts[1]["functionCall"])

    def test_finish_reason_mappings(self):
        prepared = self._prepared_chat()
        for finish, expected in (
            ("MAX_TOKENS", "length"),
            ("SAFETY", "content_filter"),
            ("RECITATION", "content_filter"),
            ("BLOCKLIST", "content_filter"),
            ("OTHER", "stop"),
        ):
            converted = translate_response(GOOGLE, CHAT, {
                "candidates": [{"content": {"role": "model", "parts": [{"text": "t"}]}, "finishReason": finish}],
            }, context=prepared.context)
            self.assertEqual(converted["choices"][0]["finish_reason"], expected, finish)

    def test_max_tokens_marks_responses_incomplete(self):
        prepared = self._prepared_chat()
        converted = translate_response(GOOGLE, RESPONSES, {
            "candidates": [{"content": {"role": "model", "parts": [{"text": "partial"}]}, "finishReason": "MAX_TOKENS"}],
        }, context=prepared.context)
        self.assertEqual(converted["status"], "incomplete")
        self.assertEqual(converted["incomplete_details"], {"reason": "max_output_tokens"})

    def test_blocked_prompt_without_candidates(self):
        prepared = self._prepared_chat()
        converted = translate_response(GOOGLE, ANTHROPIC, {
            "promptFeedback": {"blockReason": "SAFETY"},
        }, context=prepared.context)
        self.assertEqual(converted["stop_reason"], "end_turn")
        self.assertEqual(converted["content"], [{"type": "text", "text": ""}])

    def test_google_to_anthropic_thinking_block(self):
        prepared = self._prepared_chat()
        converted = translate_response(GOOGLE, ANTHROPIC, {
            "candidates": [{
                "content": {"role": "model", "parts": [
                    {"text": "pondering", "thought": True},
                    {"text": "done"},
                ]},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 2},
        }, context=prepared.context)
        self.assertEqual(
            converted["content"],
            [{"type": "thinking", "thinking": "pondering"}, {"type": "text", "text": "done"}],
        )
        self.assertEqual(converted["usage"], {"input_tokens": 3, "output_tokens": 2})


class GoogleOneWayContractTests(unittest.TestCase):
    def test_google_source_format_is_refused(self):
        with self.assertRaises(ConversionError):
            prepare_request(GOOGLE, CHAT, {"contents": []}, resolve_model=same_model)

    def test_google_target_response_render_is_refused(self):
        with self.assertRaises(ConversionError) as ctx:
            translate_response(CHAT, GOOGLE, {"id": "x", "choices": []})
        self.assertEqual(ctx.exception.code, "unsupported_format")


if __name__ == "__main__":
    unittest.main()
