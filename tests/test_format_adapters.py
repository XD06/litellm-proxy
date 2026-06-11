import unittest

from format_adapters import ANTHROPIC, CHAT, RESPONSES, convert_request, convert_response


def same_model(name):
    return name


class FormatAdapterTests(unittest.TestCase):
    def test_same_format_request_and_response_are_passthrough(self):
        req = {"model": "m", "messages": [{"role": "user", "content": "hi"}]}
        resp = {"id": "x", "object": "chat.completion"}

        self.assertIs(convert_request(CHAT, CHAT, req, resolve_model=same_model), req)
        self.assertIs(convert_response(RESPONSES, RESPONSES, resp, original_model="m"), resp)

    def test_responses_request_converts_to_anthropic_request_via_chat_hub(self):
        req = {
            "model": "m",
            "instructions": "Be brief",
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
            "tools": [{"type": "function", "name": "lookup", "parameters": {"type": "object"}}],
        }

        payload = convert_request(RESPONSES, ANTHROPIC, req, resolve_model=same_model)

        self.assertEqual(payload["model"], "m")
        self.assertEqual(payload["system"], "Be brief")
        self.assertEqual(payload["messages"][0], {"role": "user", "content": "lookup"})
        self.assertEqual(payload["messages"][1]["content"][0]["type"], "tool_use")
        self.assertEqual(payload["messages"][1]["content"][0]["id"], "call_1")
        self.assertEqual(payload["messages"][2]["content"][0]["type"], "tool_result")
        self.assertEqual(payload["tools"][0]["name"], "lookup")

    def test_anthropic_request_converts_to_responses_request_via_chat_hub(self):
        req = {
            "model": "m",
            "system": "Be brief",
            "messages": [
                {"role": "user", "content": "lookup"},
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {"q": "x"}}],
                },
                {
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok"}],
                },
            ],
            "tools": [{"name": "lookup", "input_schema": {"type": "object"}}],
        }

        payload = convert_request(ANTHROPIC, RESPONSES, req, resolve_model=same_model)

        self.assertEqual(payload["model"], "m")
        self.assertEqual(payload["instructions"], "Be brief")
        self.assertEqual(payload["input"][0], {"role": "user", "content": [{"type": "input_text", "text": "lookup"}]})
        self.assertEqual(payload["input"][1]["type"], "function_call")
        self.assertEqual(payload["input"][1]["call_id"], "toolu_1")
        self.assertEqual(payload["input"][2], {"type": "function_call_output", "call_id": "toolu_1", "output": "ok"})
        self.assertEqual(payload["tools"][0]["name"], "lookup")

    def test_responses_response_converts_to_anthropic_response_via_chat_hub(self):
        upstream_resp = {
            "id": "resp_1",
            "object": "response",
            "model": "provider-model",
            "output": [
                {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "answer"}]},
                {"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": "{\"q\":\"x\"}"},
            ],
            "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
        }

        resp = convert_response(RESPONSES, ANTHROPIC, upstream_resp, original_model="client-model")

        self.assertEqual(resp["type"], "message")
        self.assertEqual(resp["model"], "client-model")
        self.assertEqual([block["type"] for block in resp["content"]], ["text", "tool_use"])
        self.assertEqual(resp["content"][1]["id"], "call_1")
        self.assertEqual(resp["usage"], {"input_tokens": 4, "output_tokens": 6})

    def test_anthropic_response_converts_to_responses_response_via_chat_hub(self):
        upstream_resp = {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "provider-model",
            "content": [
                {"type": "text", "text": "answer"},
                {"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {"q": "x"}},
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 4, "output_tokens": 6},
        }

        resp = convert_response(ANTHROPIC, RESPONSES, upstream_resp, original_model="client-model")

        self.assertEqual(resp["object"], "response")
        self.assertEqual(resp["model"], "client-model")
        self.assertEqual(resp["output"][0]["type"], "message")
        self.assertEqual(resp["output"][1]["type"], "function_call")
        self.assertEqual(resp["output"][1]["call_id"], "toolu_1")
        self.assertEqual(resp["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})

    def test_responses_parallel_function_calls_group_for_anthropic_request(self):
        req = {
            "model": "m",
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": "lookup twice"}]},
                {"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": "{\"q\":\"x\"}"},
                {"type": "function_call", "call_id": "call_2", "name": "search", "arguments": "{\"q\":\"y\"}"},
                {"type": "function_call_output", "call_id": "call_1", "output": "one"},
                {"type": "function_call_output", "call_id": "call_2", "output": "two"},
            ],
        }

        payload = convert_request(RESPONSES, ANTHROPIC, req, resolve_model=same_model)

        self.assertEqual(len(payload["messages"]), 3)
        self.assertEqual(payload["messages"][0], {"role": "user", "content": "lookup twice"})
        self.assertEqual(payload["messages"][1]["role"], "assistant")
        self.assertEqual([b["type"] for b in payload["messages"][1]["content"]], ["tool_use", "tool_use"])
        self.assertEqual([b["id"] for b in payload["messages"][1]["content"]], ["call_1", "call_2"])
        self.assertEqual(payload["messages"][2]["role"], "user")
        self.assertEqual([b["type"] for b in payload["messages"][2]["content"]], ["tool_result", "tool_result"])
        self.assertEqual([b["tool_use_id"] for b in payload["messages"][2]["content"]], ["call_1", "call_2"])

    def test_responses_reasoning_response_converts_to_anthropic_thinking(self):
        upstream_resp = {
            "id": "resp_1",
            "object": "response",
            "model": "provider-model",
            "output": [
                {"type": "reasoning", "summary": [{"type": "summary_text", "text": "plan"}]},
                {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "answer"}]},
                {"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": "{\"q\":\"x\"}"},
            ],
            "usage": {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10},
        }

        resp = convert_response(RESPONSES, ANTHROPIC, upstream_resp, original_model="client-model")

        self.assertEqual([block["type"] for block in resp["content"]], ["thinking", "text", "tool_use"])
        self.assertEqual(resp["content"][0]["thinking"], "plan")
        self.assertEqual(resp["content"][1]["text"], "answer")
        self.assertEqual(resp["content"][2]["id"], "call_1")

    def test_chat_reasoning_response_converts_to_responses_reasoning_item(self):
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
                                "function": {"name": "lookup", "arguments": "{\"q\":\"x\"}"},
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
        }

        resp = convert_response(CHAT, RESPONSES, upstream_resp, original_model="client-model")

        self.assertEqual([item["type"] for item in resp["output"]], ["reasoning", "message", "function_call"])
        self.assertEqual(resp["output"][0]["summary"][0]["text"], "think")
        self.assertEqual(resp["output"][1]["content"][0]["text"], "answer")
        self.assertEqual(resp["output"][2]["call_id"], "call_1")


if __name__ == "__main__":
    unittest.main()
