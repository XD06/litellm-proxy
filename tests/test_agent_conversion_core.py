import json
import unittest

from conversion_core import (
    ANTHROPIC,
    CHAT,
    RESPONSES,
    ConversionError,
    analyze_request,
    prepare_request,
    translate_response,
)


def same_model(name):
    return name


class AgentConversionCoreTests(unittest.TestCase):
    def test_codex_custom_tool_round_trips_through_chat(self):
        request = {
            "model": "codex-model",
            "input": [{"role": "user", "content": [{"type": "input_text", "text": "patch it"}]}],
            "tools": [
                {
                    "type": "custom",
                    "name": "apply_patch",
                    "description": "Apply a patch",
                    "format": {"type": "grammar", "syntax": "lark", "definition": "start: /.+/s"},
                }
            ],
            "tool_choice": {"type": "custom", "name": "apply_patch"},
            "parallel_tool_calls": False,
        }

        prepared = prepare_request(RESPONSES, CHAT, request, resolve_model=same_model)

        function = prepared.payload["tools"][0]["function"]
        self.assertEqual(function["name"], "apply_patch")
        self.assertEqual(function["parameters"]["required"], ["content"])
        self.assertIn("start: /.+/s", function["description"])
        self.assertEqual(
            prepared.payload["tool_choice"],
            {"type": "function", "function": {"name": "apply_patch"}},
        )
        self.assertIs(prepared.payload["parallel_tool_calls"], False)

        upstream = {
            "model": "upstream",
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_patch",
                                "type": "function",
                                "function": {
                                    "name": "apply_patch",
                                    "arguments": json.dumps({"content": "*** Begin Patch\n*** End Patch"}),
                                },
                            }
                        ],
                    },
                }
            ],
        }
        response = translate_response(
            CHAT,
            RESPONSES,
            upstream,
            original_model="codex-model",
            context=prepared.context,
        )

        self.assertEqual(response["output"][0]["type"], "custom_tool_call")
        self.assertEqual(response["output"][0]["call_id"], "call_patch")
        self.assertEqual(response["output"][0]["name"], "apply_patch")
        self.assertEqual(response["output"][0]["input"], "*** Begin Patch\n*** End Patch")

    def test_codex_custom_tool_sanitized_chat_name_restores_original(self):
        prepared = prepare_request(
            RESPONSES,
            CHAT,
            {
                "model": "m",
                "input": "patch",
                "tools": [{"type": "custom", "name": "apply.patch"}],
            },
            resolve_model=same_model,
        )
        wire_name = prepared.payload["tools"][0]["function"]["name"]
        self.assertEqual(wire_name, "apply_patch")

        response = translate_response(
            CHAT,
            RESPONSES,
            {
                "model": "upstream",
                "choices": [
                    {
                        "finish_reason": "tool_calls",
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": wire_name,
                                        "arguments": json.dumps({"content": "raw patch"}),
                                    },
                                }
                            ]
                        },
                    }
                ],
            },
            context=prepared.context,
        )

        self.assertEqual(response["output"][0]["type"], "custom_tool_call")
        self.assertEqual(response["output"][0]["name"], "apply.patch")
        self.assertEqual(response["output"][0]["input"], "raw patch")

    def test_codex_custom_tool_history_converts_to_chat(self):
        request = {
            "model": "m",
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": "patch"}]},
                {
                    "type": "custom_tool_call",
                    "call_id": "call_1",
                    "name": "apply_patch",
                    "input": "*** Begin Patch\n*** End Patch",
                },
                {"type": "custom_tool_call_output", "call_id": "call_1", "output": "Done!"},
            ],
            "tools": [{"type": "custom", "name": "apply_patch"}],
        }

        payload = prepare_request(RESPONSES, CHAT, request, resolve_model=same_model).payload

        self.assertEqual(payload["messages"][1]["role"], "assistant")
        args = payload["messages"][1]["tool_calls"][0]["function"]["arguments"]
        self.assertEqual(json.loads(args), {"content": "*** Begin Patch\n*** End Patch"})
        self.assertEqual(
            payload["messages"][2],
            {"role": "tool", "tool_call_id": "call_1", "content": "Done!"},
        )

    def test_codex_custom_tool_round_trips_through_anthropic(self):
        request = {
            "model": "m",
            "input": "patch it",
            "tools": [{"type": "custom", "name": "apply_patch", "description": "Apply a patch"}],
        }

        prepared = prepare_request(RESPONSES, ANTHROPIC, request, resolve_model=same_model)

        self.assertEqual(prepared.payload["tools"][0]["name"], "apply_patch")
        self.assertEqual(prepared.payload["tools"][0]["input_schema"]["required"], ["content"])
        response = translate_response(
            ANTHROPIC,
            RESPONSES,
            {
                "id": "msg_1",
                "model": "upstream",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "call_patch",
                        "name": "apply_patch",
                        "input": {"content": "*** Begin Patch\n*** End Patch"},
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 2, "output_tokens": 3},
            },
            original_model="m",
            context=prepared.context,
        )
        self.assertEqual(response["output"][0]["type"], "custom_tool_call")
        self.assertEqual(response["output"][0]["input"], "*** Begin Patch\n*** End Patch")

    def test_anthropic_tool_name_is_sanitized_and_restored(self):
        request = {
            "model": "m",
            "messages": [{"role": "user", "content": "read"}],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "mcp.server/read file",
                        "parameters": {"type": "object", "properties": {}},
                    },
                }
            ],
            "tool_choice": {
                "type": "function",
                "function": {"name": "mcp.server/read file"},
            },
        }

        prepared = prepare_request(CHAT, ANTHROPIC, request, resolve_model=same_model)
        wire_name = prepared.payload["tools"][0]["name"]

        self.assertEqual(wire_name, "mcp_server_read_file")
        self.assertEqual(prepared.payload["tool_choice"]["name"], wire_name)
        chat_response = translate_response(
            ANTHROPIC,
            CHAT,
            {
                "id": "msg_1",
                "model": "upstream",
                "content": [{"type": "tool_use", "id": "call_1", "name": wire_name, "input": {}}],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
            context=prepared.context,
        )
        self.assertEqual(
            chat_response["choices"][0]["message"]["tool_calls"][0]["function"]["name"],
            "mcp.server/read file",
        )

    def test_chat_required_and_parallel_false_map_to_anthropic(self):
        request = {
            "model": "m",
            "messages": [{"role": "user", "content": "use a tool"}],
            "tools": [
                {
                    "type": "function",
                    "function": {"name": "lookup", "parameters": {"type": "object", "properties": {}}},
                }
            ],
            "tool_choice": "required",
            "parallel_tool_calls": False,
        }

        payload = prepare_request(CHAT, ANTHROPIC, request, resolve_model=same_model).payload

        self.assertEqual(payload["tool_choice"], {"type": "any", "disable_parallel_tool_use": True})

    def test_anthropic_any_and_parallel_false_map_to_responses(self):
        request = {
            "model": "m",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": "use a tool"}],
            "tools": [{"name": "lookup", "input_schema": {"type": "object", "properties": {}}}],
            "tool_choice": {"type": "any", "disable_parallel_tool_use": True},
        }

        payload = prepare_request(ANTHROPIC, RESPONSES, request, resolve_model=same_model).payload

        self.assertEqual(payload["tool_choice"], "required")
        self.assertIs(payload["parallel_tool_calls"], False)

    def test_claude_code_two_round_tool_history_converts_to_both_openai_protocols(self):
        request = {
            "model": "claude-code-model",
            "max_tokens": 4096,
            "system": [
                {
                    "type": "text",
                    "text": "You are Claude Code.",
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [
                {"role": "user", "content": "Read the file."},
                {
                    "role": "assistant",
                    "content": [
                        {"type": "thinking", "thinking": "I should inspect it.", "signature": "sig_valid"},
                        {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": "README.md"}},
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_1",
                            "content": [{"type": "text", "text": "project readme"}],
                        },
                        {"type": "text", "text": "Now summarize it."},
                    ],
                },
            ],
            "tools": [
                {
                    "name": "Read",
                    "description": "Read a file",
                    "input_schema": {
                        "type": "object",
                        "properties": {"file_path": {"type": "string"}},
                        "required": ["file_path"],
                    },
                    "cache_control": {"type": "ephemeral"},
                }
            ],
        }

        chat_prepared = prepare_request(ANTHROPIC, CHAT, request, resolve_model=same_model)
        responses_prepared = prepare_request(ANTHROPIC, RESPONSES, request, resolve_model=same_model)

        chat_messages = chat_prepared.payload["messages"]
        self.assertEqual(chat_messages[2]["tool_calls"][0]["id"], "toolu_1")
        self.assertEqual(chat_messages[3]["tool_call_id"], "toolu_1")
        self.assertEqual(chat_messages[4]["content"], "Now summarize it.")
        self.assertEqual(chat_messages[2]["reasoning_content"], "I should inspect it.")
        response_input = responses_prepared.payload["input"]
        self.assertEqual(response_input[1]["type"], "reasoning")
        self.assertEqual(response_input[2]["type"], "function_call")
        self.assertEqual(response_input[3]["type"], "function_call_output")
        self.assertEqual(response_input[3]["call_id"], "toolu_1")
        self.assertEqual(chat_prepared.report.actions_for("cache_control")[0].action, "safe_drop")

    def test_invalid_tool_arguments_are_not_silently_replaced(self):
        request = {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "lookup", "arguments": '{"broken":'},
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "result"},
            ],
        }

        with self.assertRaises(ConversionError) as raised:
            prepare_request(CHAT, ANTHROPIC, request, resolve_model=same_model)

        self.assertEqual(raised.exception.code, "invalid_tool_arguments")
        self.assertEqual(raised.exception.field, "messages[0].tool_calls[0].function.arguments")

    def test_invalid_response_tool_arguments_are_not_silently_replaced(self):
        upstream = {
            "model": "m",
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "tool_calls": [
                            {"id": "call_1", "function": {"name": "lookup", "arguments": '{"broken":'}}
                        ]
                    },
                }
            ],
        }

        with self.assertRaises(ConversionError) as raised:
            translate_response(CHAT, ANTHROPIC, upstream)

        self.assertEqual(raised.exception.code, "invalid_tool_arguments")
        self.assertEqual(raised.exception.field, "response.output[0].arguments")

        with self.assertRaises(ConversionError) as responses_raised:
            translate_response(CHAT, RESPONSES, upstream)
        self.assertEqual(responses_raised.exception.code, "invalid_tool_arguments")

    def test_usage_details_round_trip_from_chat_to_responses(self):
        converted = translate_response(
            CHAT,
            RESPONSES,
            {
                "id": "chatcmpl_1",
                "model": "m",
                "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 4,
                    "total_tokens": 14,
                    "prompt_tokens_details": {"cached_tokens": 6},
                    "completion_tokens_details": {"reasoning_tokens": 2},
                },
            },
        )

        self.assertEqual(converted["usage"]["input_tokens_details"], {"cached_tokens": 6})
        self.assertEqual(converted["usage"]["output_tokens_details"], {"reasoning_tokens": 2})

    def test_media_only_tool_result_blocks_chat_instead_of_silent_loss(self):
        request = {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "id": "call_1", "name": "inspect", "input": {}}],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "call_1",
                            "content": [{"type": "image", "source": {"type": "url", "url": "https://example.test/a.png"}}],
                        }
                    ],
                },
            ],
        }

        with self.assertRaises(ConversionError) as raised:
            prepare_request(ANTHROPIC, CHAT, request, resolve_model=same_model)

        self.assertEqual(raised.exception.code, "conversion_blocked")

    def test_text_and_media_tool_result_reports_safe_drop_for_chat(self):
        request = {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "id": "call_1", "name": "inspect", "input": {}}],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "call_1",
                            "content": [
                                {"type": "text", "text": "visible result"},
                                {"type": "image", "source": {"type": "url", "url": "https://example.test/a.png"}},
                            ],
                        }
                    ],
                },
            ],
        }

        prepared = prepare_request(ANTHROPIC, CHAT, request, resolve_model=same_model)

        self.assertEqual(prepared.payload["messages"][1]["content"], "visible result")
        self.assertEqual(prepared.report.fidelity, "safe_drop")

    def test_responses_tool_result_image_is_preserved_for_anthropic(self):
        request = {
            "model": "m",
            "input": [
                {"type": "function_call", "call_id": "call_1", "name": "inspect", "arguments": "{}"},
                {
                    "type": "function_call_output",
                    "call_id": "call_1",
                    "output": [
                        {"type": "input_text", "text": "caption"},
                        {"type": "input_image", "image_url": "https://example.test/a.png"},
                    ],
                },
            ],
        }

        converted = prepare_request(RESPONSES, ANTHROPIC, request, resolve_model=same_model).payload
        result = converted["messages"][1]["content"][0]

        self.assertEqual(result["type"], "tool_result")
        self.assertEqual(result["content"][0], {"type": "text", "text": "caption"})
        self.assertEqual(result["content"][1]["type"], "image")
        self.assertEqual(result["content"][1]["source"]["url"], "https://example.test/a.png")

    def test_anthropic_reasoning_and_output_format_map_directly_to_responses(self):
        request = {
            "model": "m",
            "max_tokens": 9000,
            "messages": [{"role": "user", "content": "return json"}],
            "thinking": {"type": "enabled", "budget_tokens": 8192},
            "output_config": {
                "effort": "high",
                "format": {
                    "type": "json_schema",
                    "schema": {"type": "object", "properties": {"ok": {"type": "boolean"}}},
                },
            },
        }

        payload = prepare_request(ANTHROPIC, RESPONSES, request, resolve_model=same_model).payload

        self.assertEqual(payload["reasoning"], {"effort": "high"})
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertEqual(payload["max_output_tokens"], 9000)

    def test_typical_codex_reasoning_request_is_cross_format_eligible(self):
        request = {
            "model": "m",
            "input": "inspect the repository",
            "store": False,
            "reasoning": {"effort": "high", "summary": "auto"},
            "include": ["reasoning.encrypted_content"],
            "prompt_cache_key": "workspace-123",
            "text": {"format": {"type": "text"}},
        }

        chat = analyze_request(RESPONSES, CHAT, request)
        anthropic = analyze_request(RESPONSES, ANTHROPIC, request)

        self.assertTrue(chat.allowed)
        self.assertTrue(anthropic.allowed)
        self.assertIn(chat.fidelity, {"mapped", "safe_drop"})
        self.assertIn(anthropic.fidelity, {"mapped", "safe_drop"})
        self.assertEqual(chat.actions_for("reasoning")[0].action, "map")
        self.assertEqual(anthropic.actions_for("reasoning")[0].action, "map")
        self.assertEqual(chat.actions_for("prompt_cache_key")[0].action, "safe_drop")

    def test_responses_json_schema_maps_to_both_targets(self):
        request = {
            "model": "m",
            "input": "return json",
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "result",
                    "schema": {
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                }
            },
        }

        chat = prepare_request(RESPONSES, CHAT, request, resolve_model=same_model).payload
        anthropic = prepare_request(RESPONSES, ANTHROPIC, request, resolve_model=same_model).payload

        self.assertEqual(chat["response_format"]["type"], "json_schema")
        self.assertEqual(chat["response_format"]["json_schema"]["name"], "result")
        self.assertEqual(anthropic["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(anthropic["output_config"]["format"]["schema"]["required"], ["ok"])

    def test_orphan_tool_result_is_rejected_instead_of_silently_dropped(self):
        request = {
            "model": "m",
            "messages": [{"role": "tool", "tool_call_id": "missing", "content": "result"}],
        }

        with self.assertRaises(ConversionError) as raised:
            prepare_request(CHAT, ANTHROPIC, request, resolve_model=same_model)

        self.assertEqual(raised.exception.code, "orphan_tool_result")

    def test_missing_tool_result_is_rejected_instead_of_fabricated(self):
        request = {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {"id": "call_1", "type": "function", "function": {"name": "lookup", "arguments": "{}"}}
                    ],
                }
            ],
        }

        with self.assertRaises(ConversionError) as raised:
            prepare_request(CHAT, ANTHROPIC, request, resolve_model=same_model)

        self.assertEqual(raised.exception.code, "missing_tool_result")

    def test_duplicate_tool_result_is_rejected(self):
        request = {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {"id": "call_1", "type": "function", "function": {"name": "lookup", "arguments": "{}"}}
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "first"},
                {"role": "tool", "tool_call_id": "call_1", "content": "second"},
            ],
        }

        with self.assertRaises(ConversionError) as raised:
            prepare_request(CHAT, RESPONSES, request, resolve_model=same_model)

        self.assertEqual(raised.exception.code, "duplicate_tool_result")

    def test_responses_hosted_tool_is_explicitly_blocked(self):
        request = {
            "model": "m",
            "input": "search",
            "tools": [{"type": "web_search_preview"}],
        }

        report = analyze_request(RESPONSES, ANTHROPIC, request)

        self.assertFalse(report.allowed)
        self.assertEqual(report.blockers, ("tools[0]",))


if __name__ == "__main__":
    unittest.main()
