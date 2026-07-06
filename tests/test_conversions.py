import json
import unittest
from unittest.mock import patch

import sse2json
from format_adapters import ANTHROPIC, CHAT, RESPONSES, convert_request, convert_response


def same_model(name):
    return name
from protocol_adapters import (
    anthropic_message_to_openai_chat_response,
    openai_chat_request_to_anthropic_request,
    openai_chat_request_to_responses_request,
    openai_chat_response_to_responses_response,
    responses_response_to_openai_chat_response,
    responses_to_openai_request,
)


class ConversionTests(unittest.TestCase):
    def test_resolve_model_uses_only_safe_union_matching(self):
        with patch.object(sse2json, "DISABLE_MAP", False), patch.object(
            sse2json, "MODEL_MAP", {}
        ), patch.object(sse2json, "CONFIG", {"models": {"models_source": "union"}}), patch.object(
            sse2json.model_registry, "union_model_ids", return_value={"v4-flash"}
        ):
            self.assertEqual(sse2json.resolve_model("deepseek-v4-flash"), "deepseek-v4-flash")

        with patch.object(sse2json, "DISABLE_MAP", False), patch.object(
            sse2json, "MODEL_MAP", {}
        ), patch.object(sse2json, "CONFIG", {"models": {"models_source": "union"}}), patch.object(
            sse2json.model_registry, "union_model_ids", return_value={"deepseek-v4-flash"}
        ):
            self.assertEqual(sse2json.resolve_model("deepseek-ai/DeepSeek-V4-Flash"), "deepseek-v4-flash")

    def test_to_openai_preserves_thinking_tools_and_tool_results(self):
        req = {
            "model": "claude-test",
            "system": [{"type": "text", "text": "Be brief"}],
            "max_tokens": 123,
            "stream": True,
            "messages": [
                {
                    "role": "assistant",
                    "content": [
                        {"type": "thinking", "thinking": "plan"},
                        {"type": "text", "text": "answer"},
                        {
                            "type": "tool_use",
                            "id": "toolu_1",
                            "name": "lookup",
                            "input": {"query": "status"},
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_1",
                            "content": [{"type": "text", "text": "ok"}],
                        },
                        {"type": "text", "text": "continue"},
                    ],
                },
            ],
            "tools": [
                {
                    "name": "lookup",
                    "description": "Lookup a value",
                    "input_schema": {"type": "object"},
                }
            ],
            "tool_choice": {"type": "any"},
        }

        with patch.object(sse2json, "DISABLE_MAP", False), patch.object(
            sse2json, "MODEL_MAP", {"claude-test": "canonical-model"}
        ), patch.object(sse2json.model_registry, "union_model_ids", return_value=set()):
            payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=sse2json.resolve_model)

        self.assertEqual(payload["model"], "canonical-model")
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["max_tokens"], 123)
        self.assertEqual(payload["tool_choice"], "auto")
        self.assertEqual(payload["messages"][0], {"role": "system", "content": "Be brief"})

        assistant = payload["messages"][1]
        self.assertEqual(assistant["role"], "assistant")
        self.assertEqual(assistant["content"], "answer")
        self.assertEqual(assistant["reasoning_content"], "plan")
        self.assertEqual(assistant["tool_calls"][0]["id"], "toolu_1")
        self.assertEqual(
            json.loads(assistant["tool_calls"][0]["function"]["arguments"]),
            {"query": "status"},
        )

        self.assertEqual(payload["messages"][2], {"role": "tool", "tool_call_id": "toolu_1", "content": "ok"})
        self.assertEqual(payload["messages"][3], {"role": "user", "content": "continue"})

    def test_to_openai_fills_reasoning_content_after_thinking_mode(self):
        req = {
            "model": "plain-model",
            "messages": [
                {"role": "assistant", "content": [{"type": "thinking", "thinking": "first"}]},
                {"role": "assistant", "content": "later answer"},
            ],
        }

        with patch.object(sse2json, "DISABLE_MAP", True):
            payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=sse2json.resolve_model)

        self.assertEqual(payload["messages"][0]["reasoning_content"], "first")
        self.assertEqual(payload["messages"][1]["reasoning_content"], ".")

    def test_to_anthropic_preserves_reasoning_text_tool_calls_and_usage(self):
        upstream_resp = {
            "model": "provider-model",
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "reasoning_content": "think",
                        "content": "answer",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "function": {
                                    "name": "lookup",
                                    "arguments": "{\"query\":\"status\"}",
                                },
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }

        anth = convert_response(CHAT, ANTHROPIC, upstream_resp, original_model="client-model")

        self.assertEqual(anth["model"], "client-model")
        self.assertEqual(anth["stop_reason"], "tool_use")
        self.assertEqual(anth["usage"], {"input_tokens": 10, "output_tokens": 5})
        self.assertEqual([block["type"] for block in anth["content"]], ["thinking", "text", "tool_use"])
        self.assertEqual(anth["content"][0]["thinking"], "think")
        self.assertEqual(anth["content"][1]["text"], "answer")
        self.assertEqual(anth["content"][2]["input"], {"query": "status"})

    def test_responses_request_converts_to_openai_chat_request(self):
        req = {
            "model": "resp-model",
            "instructions": "Be brief",
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "hello"},
                        {"type": "input_text", "text": "world"},
                    ],
                },
                {"type": "function_call_output", "call_id": "call_1", "output": "ok"},
            ],
            "max_output_tokens": 77,
            "temperature": 0.2,
            "tool_choice": "auto",
            "tools": [
                {
                    "type": "function",
                    "name": "lookup",
                    "description": "Lookup a value",
                    "parameters": {"type": "object"},
                }
            ],
        }

        payload = responses_to_openai_request(req, resolve_model=lambda name: "canonical-" + name)

        self.assertEqual(payload["model"], "canonical-resp-model")
        self.assertEqual(payload["messages"][0], {"role": "system", "content": "Be brief"})
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "hello\nworld"})
        self.assertEqual(payload["messages"][2], {"role": "tool", "tool_call_id": "call_1", "content": "ok"})
        self.assertEqual(payload["max_tokens"], 77)
        self.assertEqual(payload["temperature"], 0.2)
        self.assertEqual(payload["tool_choice"], "auto")
        self.assertEqual(payload["tools"][0]["function"]["name"], "lookup")

    def test_responses_function_tool_choice_converts_to_chat_shape(self):
        req = {
            "model": "resp-model",
            "input": "lookup",
            "tool_choice": {"type": "function", "name": "lookup"},
            "tools": [
                {
                    "type": "function",
                    "name": "lookup",
                    "description": "Lookup a value",
                    "parameters": {"type": "object"},
                    "strict": True,
                }
            ],
        }

        payload = responses_to_openai_request(req, resolve_model=lambda name: name)

        self.assertEqual(payload["tool_choice"], {"type": "function", "function": {"name": "lookup"}})
        self.assertEqual(payload["tools"][0]["function"]["name"], "lookup")
        self.assertTrue(payload["tools"][0]["function"]["strict"])

    def test_openai_chat_response_converts_to_responses_response(self):
        upstream_resp = {
            "id": "chatcmpl_1",
            "model": "provider-model",
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "content": "answer",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
        }

        resp = openai_chat_response_to_responses_response(upstream_resp, original_model="client-model")

        self.assertEqual(resp["object"], "response")
        self.assertEqual(resp["status"], "completed")
        self.assertEqual(resp["model"], "client-model")
        self.assertEqual(resp["output_text"], "answer")
        self.assertEqual(resp["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(resp["output"][0]["type"], "message")
        self.assertEqual(resp["output"][0]["content"][0], {"type": "output_text", "text": "answer", "annotations": []})
        self.assertEqual(resp["output"][1]["type"], "function_call")
        self.assertEqual(resp["output"][1]["call_id"], "call_1")
        self.assertEqual(resp["output"][1]["name"], "lookup")

    def test_openai_chat_response_to_responses_ignores_blank_reasoning(self):
        upstream_resp = {
            "id": "chatcmpl_1",
            "model": "provider-model",
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "reasoning_content": "\n  ",
                        "content": "answer",
                    },
                }
            ],
        }

        resp = openai_chat_response_to_responses_response(upstream_resp, original_model="client-model")

        self.assertEqual([item["type"] for item in resp["output"]], ["message"])
        self.assertEqual(resp["output_text"], "answer")

    def test_openai_chat_request_converts_to_anthropic_request(self):
        req = {
            "model": "chat-model",
            "messages": [
                {"role": "system", "content": "Be brief"},
                {"role": "user", "content": "hello"},
                {
                    "role": "assistant",
                    "content": "checking",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
            ],
            "max_tokens": 55,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "lookup",
                        "description": "Lookup a value",
                        "parameters": {"type": "object"},
                    },
                }
            ],
            "tool_choice": "auto",
        }

        payload = openai_chat_request_to_anthropic_request(req, resolve_model=lambda name: "canonical-" + name)

        self.assertEqual(payload["model"], "canonical-chat-model")
        self.assertEqual(payload["system"], "Be brief")
        self.assertEqual(payload["max_tokens"], 55)
        self.assertEqual(payload["messages"][0], {"role": "user", "content": "hello"})
        self.assertEqual([block["type"] for block in payload["messages"][1]["content"]], ["text", "tool_use"])
        self.assertEqual(payload["messages"][1]["content"][1]["input"], {"q": "x"})
        self.assertEqual(payload["messages"][2]["content"][0]["type"], "tool_result")
        self.assertEqual(payload["tools"][0]["name"], "lookup")

    def test_openai_chat_request_groups_consecutive_tool_results_for_anthropic(self):
        req = {
            "model": "chat-model",
            "messages": [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                        },
                        {
                            "id": "call_2",
                            "type": "function",
                            "function": {"name": "search", "arguments": "{\"q\":\"y\"}"},
                        },
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "one"},
                {"role": "tool", "tool_call_id": "call_2", "content": "two"},
                {"role": "user", "content": "continue"},
            ],
            "max_tokens": 55,
        }

        payload = openai_chat_request_to_anthropic_request(req, resolve_model=lambda name: name)

        self.assertEqual(len(payload["messages"]), 3)
        self.assertEqual(payload["messages"][0]["role"], "assistant")
        self.assertEqual([b["id"] for b in payload["messages"][0]["content"]], ["call_1", "call_2"])
        self.assertEqual(payload["messages"][1]["role"], "user")
        self.assertEqual([b["type"] for b in payload["messages"][1]["content"]], ["tool_result", "tool_result"])
        self.assertEqual([b["tool_use_id"] for b in payload["messages"][1]["content"]], ["call_1", "call_2"])
        self.assertEqual(payload["messages"][2], {"role": "user", "content": "continue"})

    def test_anthropic_message_converts_to_openai_chat_response(self):
        upstream_resp = {
            "id": "msg_1",
            "model": "provider-model",
            "content": [
                {"type": "thinking", "thinking": "plan"},
                {"type": "text", "text": "answer"},
                {"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {"q": "x"}},
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 4, "output_tokens": 6},
        }

        resp = anthropic_message_to_openai_chat_response(upstream_resp, original_model="client-model")

        self.assertEqual(resp["object"], "chat.completion")
        self.assertEqual(resp["model"], "client-model")
        self.assertEqual(resp["choices"][0]["finish_reason"], "tool_calls")
        msg = resp["choices"][0]["message"]
        self.assertEqual(msg["content"], "answer")
        self.assertEqual(msg["reasoning_content"], "plan")
        self.assertEqual(msg["tool_calls"][0]["function"]["name"], "lookup")
        self.assertEqual(resp["usage"], {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10})

    def test_openai_chat_request_converts_to_responses_request(self):
        req = {
            "model": "chat-model",
            "messages": [
                {"role": "system", "content": "Be brief"},
                {"role": "user", "content": "hello"},
                {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
            ],
            "max_tokens": 55,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "lookup",
                        "description": "Lookup a value",
                        "parameters": {"type": "object"},
                    },
                }
            ],
        }

        payload = openai_chat_request_to_responses_request(req, resolve_model=lambda name: "canonical-" + name)

        self.assertEqual(payload["model"], "canonical-chat-model")
        self.assertEqual(payload["instructions"], "Be brief")
        self.assertEqual(payload["input"][0], {"role": "user", "content": [{"type": "input_text", "text": "hello"}]})
        self.assertEqual(payload["input"][1], {"type": "function_call_output", "call_id": "call_1", "output": "ok"})
        self.assertEqual(payload["max_output_tokens"], 55)
        self.assertEqual(payload["tools"][0]["name"], "lookup")

    def test_openai_chat_request_converts_assistant_tool_call_to_responses_input_item(self):
        req = {
            "model": "chat-model",
            "messages": [
                {"role": "user", "content": "lookup"},
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
            ],
        }

        payload = openai_chat_request_to_responses_request(req, resolve_model=lambda name: name)

        self.assertEqual(payload["input"][0]["role"], "user")
        self.assertEqual(payload["input"][1]["type"], "function_call")
        self.assertEqual(payload["input"][1]["call_id"], "call_1")
        self.assertEqual(payload["input"][1]["name"], "lookup")
        self.assertEqual(payload["input"][2], {"type": "function_call_output", "call_id": "call_1", "output": "ok"})

    def test_responses_request_converts_function_call_history_to_chat_messages(self):
        req = {
            "model": "resp-model",
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": "lookup"}]},
                {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "lookup",
                    "arguments": "{\"q\":\"x\"}",
                },
                {"type": "function_call_output", "call_id": "call_1", "output": "ok"},
            ],
        }

        payload = responses_to_openai_request(req, resolve_model=lambda name: name)

        self.assertEqual(payload["messages"][0], {"role": "user", "content": "lookup"})
        self.assertEqual(payload["messages"][1]["role"], "assistant")
        self.assertEqual(payload["messages"][1]["tool_calls"][0]["id"], "call_1")
        self.assertEqual(payload["messages"][1]["tool_calls"][0]["function"]["name"], "lookup")
        self.assertEqual(payload["messages"][2], {"role": "tool", "tool_call_id": "call_1", "content": "ok"})

    def test_responses_response_converts_to_openai_chat_response(self):
        upstream_resp = {
            "id": "resp_1",
            "model": "provider-model",
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "answer"}],
                },
                {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "lookup",
                    "arguments": "{\"q\":\"x\"}",
                },
            ],
            "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
        }

        resp = responses_response_to_openai_chat_response(upstream_resp, original_model="client-model")

        self.assertEqual(resp["object"], "chat.completion")
        self.assertEqual(resp["model"], "client-model")
        self.assertEqual(resp["choices"][0]["finish_reason"], "tool_calls")
        self.assertEqual(resp["choices"][0]["message"]["content"], "answer")
        self.assertEqual(resp["choices"][0]["message"]["tool_calls"][0]["id"], "call_1")
        self.assertEqual(resp["usage"], {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10})


class MultimodalConversionTests(unittest.TestCase):
    """Tests for image content cross-format conversion."""

    # ---- Anthropic → OpenAI Chat ----

    def test_anthropic_url_image_to_openai(self):
        """Anthropic image with URL source → OpenAI image_url."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What is this?"},
                        {"type": "image", "source": {"type": "url", "url": "https://example.com/cat.png"}},
                    ],
                }
            ],
        }
        payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=same_model)
        msg = payload["messages"][0]
        self.assertEqual(msg["role"], "user")
        self.assertIsInstance(msg["content"], list)
        parts = msg["content"]
        self.assertEqual(parts[0], {"type": "text", "text": "What is this?"})
        self.assertEqual(parts[1], {"type": "image_url", "image_url": {"url": "https://example.com/cat.png"}})

    def test_anthropic_base64_image_to_openai(self):
        """Anthropic image with base64 source → OpenAI data URL."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/jpeg", "data": "abc123"},
                        },
                    ],
                }
            ],
        }
        payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=same_model)
        parts = payload["messages"][0]["content"]
        self.assertEqual(parts[0]["type"], "image_url")
        self.assertEqual(parts[0]["image_url"]["url"], "data:image/jpeg;base64,abc123")

    def test_anthropic_mixed_text_and_image_to_openai(self):
        """Anthropic mixed content (text + image + text) → OpenAI multipart."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Look at this:"},
                        {"type": "image", "source": {"type": "url", "url": "https://example.com/img.png"}},
                        {"type": "text", "text": "Is it a dog?"},
                    ],
                }
            ],
        }
        payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=same_model)
        parts = payload["messages"][0]["content"]
        self.assertIsInstance(parts, list)
        self.assertEqual(len(parts), 3)
        self.assertEqual(parts[0]["type"], "text")
        self.assertEqual(parts[1]["type"], "image_url")
        self.assertEqual(parts[2]["type"], "text")

    def test_anthropic_multiple_images_to_openai(self):
        """Anthropic with multiple images → OpenAI with multiple image_url parts."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "url", "url": "https://a.com/1.png"}},
                        {"type": "image", "source": {"type": "url", "url": "https://a.com/2.png"}},
                    ],
                }
            ],
        }
        payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=same_model)
        parts = payload["messages"][0]["content"]
        self.assertEqual(len(parts), 2)
        self.assertTrue(all(p["type"] == "image_url" for p in parts))

    # ---- OpenAI Chat → Anthropic ----

    def test_openai_url_image_to_anthropic(self):
        """OpenAI image_url with URL → Anthropic image block."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What is this?"},
                        {"type": "image_url", "image_url": {"url": "https://example.com/cat.png"}},
                    ],
                }
            ],
        }
        payload = convert_request(CHAT, ANTHROPIC, req, resolve_model=same_model)
        msg = payload["messages"][0]
        self.assertEqual(msg["role"], "user")
        self.assertIsInstance(msg["content"], list)
        blocks = msg["content"]
        self.assertEqual(blocks[0], {"type": "text", "text": "What is this?"})
        self.assertEqual(blocks[1]["type"], "image")
        self.assertEqual(blocks[1]["source"]["type"], "url")
        self.assertEqual(blocks[1]["source"]["url"], "https://example.com/cat.png")

    def test_openai_base64_image_to_anthropic(self):
        """OpenAI image_url with data URL → Anthropic image base64 block."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,xyz789"}},
                    ],
                }
            ],
        }
        payload = convert_request(CHAT, ANTHROPIC, req, resolve_model=same_model)
        blocks = payload["messages"][0]["content"]
        self.assertEqual(blocks[0]["type"], "image")
        self.assertEqual(blocks[0]["source"]["type"], "base64")
        self.assertEqual(blocks[0]["source"]["media_type"], "image/png")
        self.assertEqual(blocks[0]["source"]["data"], "xyz789")

    def test_openai_mixed_content_to_anthropic_preserves_text_only(self):
        """Pure text messages still work when no images are present."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {"role": "user", "content": "hello"},
            ],
        }
        payload = convert_request(CHAT, ANTHROPIC, req, resolve_model=same_model)
        self.assertEqual(payload["messages"][0], {"role": "user", "content": "hello"})

    # ---- OpenAI Chat → Responses ----

    def test_openai_image_to_responses(self):
        """OpenAI image_url → Responses input_image."""
        req = {
            "model": "m",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "describe"},
                        {"type": "image_url", "image_url": {"url": "https://example.com/img.png"}},
                    ],
                }
            ],
        }
        payload = convert_request(CHAT, RESPONSES, req, resolve_model=same_model)
        user_item = payload["input"][0]
        self.assertEqual(user_item["role"], "user")
        parts = user_item["content"]
        self.assertEqual(parts[0], {"type": "input_text", "text": "describe"})
        self.assertEqual(parts[1], {"type": "input_image", "image_url": "https://example.com/img.png"})

    # ---- Responses → OpenAI Chat ----

    def test_responses_image_to_openai(self):
        """Responses input_image → OpenAI image_url."""
        req = {
            "model": "m",
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "describe"},
                        {"type": "input_image", "image_url": "https://example.com/img.png"},
                    ],
                }
            ],
        }
        payload = convert_request(RESPONSES, CHAT, req, resolve_model=same_model)
        msg = payload["messages"][0]
        self.assertEqual(msg["role"], "user")
        self.assertIsInstance(msg["content"], list)
        parts = msg["content"]
        self.assertEqual(parts[0], {"type": "text", "text": "describe"})
        self.assertEqual(parts[1], {"type": "image_url", "image_url": {"url": "https://example.com/img.png"}})

    # ---- Hub path: Anthropic → Responses (via Chat) ----

    def test_anthropic_image_to_responses_via_hub(self):
        """Anthropic image → Responses input_image (two-step hub conversion)."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "look"},
                        {"type": "image", "source": {"type": "url", "url": "https://example.com/img.png"}},
                    ],
                }
            ],
        }
        payload = convert_request(ANTHROPIC, RESPONSES, req, resolve_model=same_model)
        user_item = payload["input"][0]
        self.assertEqual(user_item["role"], "user")
        parts = user_item["content"]
        self.assertEqual(parts[0], {"type": "input_text", "text": "look"})
        self.assertEqual(parts[1], {"type": "input_image", "image_url": "https://example.com/img.png"})

    # ---- Hub path: Responses → Anthropic (via Chat) ----

    def test_responses_image_to_anthropic_via_hub(self):
        """Responses input_image → Anthropic image block (two-step hub conversion)."""
        req = {
            "model": "m",
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "look"},
                        {"type": "input_image", "image_url": "https://example.com/img.png"},
                    ],
                }
            ],
        }
        payload = convert_request(RESPONSES, ANTHROPIC, req, resolve_model=same_model)
        msg = payload["messages"][0]
        self.assertEqual(msg["role"], "user")
        self.assertIsInstance(msg["content"], list)
        blocks = msg["content"]
        self.assertEqual(blocks[0], {"type": "text", "text": "look"})
        self.assertEqual(blocks[1]["type"], "image")
        self.assertEqual(blocks[1]["source"]["type"], "url")
        self.assertEqual(blocks[1]["source"]["url"], "https://example.com/img.png")

    # ---- Backward compatibility: no images = existing behavior ----

    def test_text_only_anthropic_to_openai_unchanged(self):
        """Ensure text-only Anthropic messages still produce string content (not list)."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "hello"}]},
            ],
        }
        payload = convert_request(ANTHROPIC, CHAT, req, resolve_model=same_model)
        self.assertEqual(payload["messages"][0]["content"], "hello")

    def test_text_only_openai_to_anthropic_unchanged(self):
        """Ensure text-only OpenAI messages still produce string content (not list)."""
        req = {
            "model": "m",
            "max_tokens": 100,
            "messages": [
                {"role": "user", "content": "hello"},
            ],
        }
        payload = convert_request(CHAT, ANTHROPIC, req, resolve_model=same_model)
        self.assertEqual(payload["messages"][0], {"role": "user", "content": "hello"})

    def test_text_only_openai_to_responses_unchanged(self):
        """Ensure text-only OpenAI → Responses still produces input_text."""
        req = {
            "model": "m",
            "messages": [
                {"role": "user", "content": "hello"},
            ],
        }
        payload = convert_request(CHAT, RESPONSES, req, resolve_model=same_model)
        self.assertEqual(payload["input"][0], {"role": "user", "content": [{"type": "input_text", "text": "hello"}]})

    def test_text_only_responses_to_openai_unchanged(self):
        """Ensure text-only Responses → OpenAI still produces string content."""
        req = {
            "model": "m",
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": "hello"}]},
            ],
        }
        payload = convert_request(RESPONSES, CHAT, req, resolve_model=same_model)
        self.assertEqual(payload["messages"][0]["content"], "hello")


class RobustnessRegressionTests(unittest.TestCase):
    """Regression tests for crash fixes C2/C3 in to_anthropic_message."""

    def test_c2_null_tool_arguments_does_not_crash(self):
        """C2: tool_calls[].function.arguments = null must not raise TypeError.

        Previously json.loads(None) raised TypeError because only
        JSONDecodeError was caught. The streaming path already caught both;
        this keeps the non-streaming path consistent.
        """
        from protocol_adapters import to_anthropic_message

        upstream = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "ok",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "function": {"name": "lookup", "arguments": None},
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
            "model": "m",
        }
        result = to_anthropic_message(upstream, original_model="m")
        tool_use = next(b for b in result["content"] if b.get("type") == "tool_use")
        self.assertEqual(tool_use["input"], {})

    def test_c2_malformed_tool_arguments_does_not_crash(self):
        """Malformed JSON arguments still fall back to empty dict."""
        from protocol_adapters import to_anthropic_message

        upstream = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "function": {"name": "lookup", "arguments": "{not json"},
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {},
            "model": "m",
        }
        result = to_anthropic_message(upstream, original_model="m")
        tool_use = next(b for b in result["content"] if b.get("type") == "tool_use")
        self.assertEqual(tool_use["input"], {})

    def test_c3_empty_choices_does_not_crash(self):
        """C3: upstream returning empty/missing choices must not raise.

        Previously ``upstream_resp["choices"][0]`` raised KeyError/IndexError.
        Now it degrades gracefully (empty content, null stop_reason) so the
        upper layer can surface the upstream error instead of a proxy 500.
        """
        from protocol_adapters import to_anthropic_message

        result = to_anthropic_message({"choices": [], "model": "m"}, original_model="m")
        self.assertEqual(result["content"], [])
        self.assertIsNone(result["stop_reason"])

        result2 = to_anthropic_message({"model": "m"}, original_model="m")
        self.assertEqual(result2["content"], [])

    def test_nc4_missing_role_does_not_crash(self):
        """NC4: an Anthropic message missing the ``role`` field must not raise
        KeyError. The conversion previously did ``m["role"]`` (direct index);
        every other conversion uses ``.get("role")``. A malformed message is
        now skipped instead of producing a proxy 500."""
        from protocol_adapters import to_openai_request

        req = {
            "model": "m",
            "max_tokens": 10,
            "messages": [
                {"content": "no role here"},  # missing "role"
                {"role": "user", "content": "hello"},
            ],
        }
        # Must not raise.
        payload = to_openai_request(req, resolve_model=same_model)
        # The well-formed message survives; the malformed one is skipped.
        roles = [m.get("role") for m in payload["messages"]]
        self.assertIn("user", roles)
        self.assertNotIn(None, [r for r in roles if r is not None])


if __name__ == "__main__":
    unittest.main()
