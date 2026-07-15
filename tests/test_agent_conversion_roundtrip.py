import json
import unittest

from conversion_core import ANTHROPIC, CHAT, RESPONSES, ConversionReport, prepare_request, translate_response
from conversion_core.codecs import anthropic, chat, responses
from conversion_core.common import content_text


CODECS = {CHAT: chat, RESPONSES: responses, ANTHROPIC: anthropic}


def same_model(model):
    return model


def request_signature(request):
    blocks = []
    for turn in request.turns:
        for block in turn.content:
            value = None
            if block.kind in ("text", "refusal", "reasoning"):
                value = block.text
            elif block.kind in ("tool_call", "custom_tool_call"):
                value = block.input
                if value is None:
                    value = json.loads(block.arguments or "{}")
                value = (block.call_id, block.name, value)
            elif block.kind == "tool_result":
                value = (block.call_id, content_text(block.output), block.is_error)
            blocks.append((turn.role, block.kind, value))
    return {
        "model": request.model,
        "system": [block.text for block in request.system if block.kind == "text"],
        "blocks": blocks,
        "tools": [
            (tool.kind, tool.name, tool.input_schema, tool.strict)
            for tool in request.tools
        ],
        "tool_choice": (
            request.tool_choice.mode,
            request.tool_choice.name,
            request.tool_choice.parallel,
        ),
        "structured_output": request.structured_output,
    }


def parse_request(protocol, payload):
    return CODECS[protocol].parse_request(payload, ConversionReport(protocol, protocol))


class AgentRequestRoundTripTests(unittest.TestCase):
    requests = {
        CHAT: {
            "model": "m",
            "messages": [
                {"role": "system", "content": "You are precise."},
                {"role": "user", "content": "Inspect it."},
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "inspect", "arguments": '{"path":"a.txt"}'},
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "call_1", "content": "contents"},
                {"role": "user", "content": "Summarize."},
            ],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "inspect",
                        "description": "Read a file",
                        "parameters": {
                            "type": "object",
                            "properties": {"path": {"type": "string"}},
                            "required": ["path"],
                        },
                        "strict": True,
                    },
                }
            ],
            "tool_choice": "required",
            "parallel_tool_calls": False,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "summary",
                    "schema": {"type": "object", "properties": {"summary": {"type": "string"}}},
                    "strict": True,
                },
            },
        },
        RESPONSES: {
            "model": "m",
            "instructions": "You are precise.",
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": "Inspect it."}]},
                {"type": "function_call", "call_id": "call_1", "name": "inspect", "arguments": '{"path":"a.txt"}'},
                {"type": "function_call_output", "call_id": "call_1", "output": "contents"},
                {"role": "user", "content": [{"type": "input_text", "text": "Summarize."}]},
            ],
            "tools": [
                {
                    "type": "function",
                    "name": "inspect",
                    "description": "Read a file",
                    "parameters": {
                        "type": "object",
                        "properties": {"path": {"type": "string"}},
                        "required": ["path"],
                    },
                    "strict": True,
                }
            ],
            "tool_choice": "required",
            "parallel_tool_calls": False,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "summary",
                    "schema": {"type": "object", "properties": {"summary": {"type": "string"}}},
                    "strict": True,
                }
            },
        },
        ANTHROPIC: {
            "model": "m",
            "max_tokens": 1024,
            "system": "You are precise.",
            "messages": [
                {"role": "user", "content": "Inspect it."},
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "call_1", "name": "inspect", "input": {"path": "a.txt"}}
                    ],
                },
                {
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": "call_1", "content": "contents"}],
                },
                {"role": "user", "content": "Summarize."},
            ],
            "tools": [
                {
                    "name": "inspect",
                    "description": "Read a file",
                    "input_schema": {
                        "type": "object",
                        "properties": {"path": {"type": "string"}},
                        "required": ["path"],
                    },
                    "strict": True,
                }
            ],
            "tool_choice": {"type": "any", "disable_parallel_tool_use": True},
            "output_config": {
                "format": {
                    "type": "json_schema",
                    "name": "summary",
                    "schema": {"type": "object", "properties": {"summary": {"type": "string"}}},
                    "strict": True,
                }
            },
        },
    }

    def test_semantics_survive_all_six_request_directions(self):
        for source, source_payload in self.requests.items():
            expected = request_signature(parse_request(source, source_payload))
            for target in (CHAT, RESPONSES, ANTHROPIC):
                if target == source:
                    continue
                with self.subTest(source=source, target=target):
                    prepared = prepare_request(source, target, source_payload, resolve_model=same_model)
                    actual = request_signature(parse_request(target, prepared.payload))
                    self.assertEqual(actual, expected)


class AgentResponseRoundTripTests(unittest.TestCase):
    def test_tool_call_semantics_survive_all_protocol_pairs(self):
        responses_by_format = {
            CHAT: {
                "id": "chatcmpl_1",
                "model": "m",
                "choices": [
                    {
                        "finish_reason": "tool_calls",
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {"name": "inspect", "arguments": '{"path":"a.txt"}'},
                                }
                            ],
                        },
                    }
                ],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
            },
            RESPONSES: {
                "id": "resp_1",
                "model": "m",
                "status": "completed",
                "output": [
                    {
                        "id": "fc_1",
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "inspect",
                        "arguments": '{"path":"a.txt"}',
                        "status": "completed",
                    }
                ],
                "usage": {"input_tokens": 3, "output_tokens": 2, "total_tokens": 5},
            },
            ANTHROPIC: {
                "id": "msg_1",
                "model": "m",
                "content": [
                    {"type": "tool_use", "id": "call_1", "name": "inspect", "input": {"path": "a.txt"}}
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 3, "output_tokens": 2},
            },
        }

        for source, source_response in responses_by_format.items():
            for target in (CHAT, RESPONSES, ANTHROPIC):
                if target == source:
                    continue
                with self.subTest(source=source, target=target):
                    converted = translate_response(source, target, source_response, original_model="m")
                    ir = CODECS[target].parse_response(converted)
                    tool = next(item for item in ir.items if item.kind == "tool_call")
                    value = tool.input if tool.input is not None else json.loads(tool.arguments)
                    self.assertEqual((tool.call_id, tool.name, value), ("call_1", "inspect", {"path": "a.txt"}))
                    self.assertEqual(ir.usage.total_tokens, 5)


if __name__ == "__main__":
    unittest.main()
