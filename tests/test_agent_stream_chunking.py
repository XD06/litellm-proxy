import io
import json
import random
import unittest

from stream_adapters import (
    stream_anthropic_sse_to_openai_chat,
    stream_anthropic_sse_to_responses,
    stream_openai_sse_to_anthropic,
    stream_openai_sse_to_responses,
    stream_responses_sse_to_anthropic,
    stream_responses_sse_to_openai_chat,
)


def sse_data(payload):
    return f"data: {json.dumps(payload, ensure_ascii=True)}\n".encode("utf-8")


def fragmentations(value):
    yielded = set()
    for split_at in range(len(value) + 1):
        parts = tuple(part for part in (value[:split_at], value[split_at:]) if part)
        if parts not in yielded:
            yielded.add(parts)
            yield list(parts)
    each = tuple(value)
    if each not in yielded:
        yielded.add(each)
        yield list(each)
    rng = random.Random(20260715)
    for _ in range(20):
        positions = sorted(rng.sample(range(1, len(value)), rng.randint(1, min(10, len(value) - 1))))
        parts = []
        start = 0
        for end in [*positions, len(value)]:
            parts.append(value[start:end])
            start = end
        key = tuple(parts)
        if key not in yielded:
            yielded.add(key)
            yield parts


class AgentToolArgumentChunkingTests(unittest.TestCase):
    arguments = json.dumps(
        {"path": "C:\\workspace\\file.txt", "emoji": "世界", "count": 3},
        ensure_ascii=True,
        separators=(",", ":"),
    )

    def _chat_lines(self, parts):
        lines = []
        for index, part in enumerate(parts):
            tool = {"index": 0, "function": {"arguments": part}}
            if index == 0:
                tool.update({"id": "call_1", "type": "function"})
                tool["function"]["name"] = "inspect"
            lines.append(sse_data({"choices": [{"delta": {"tool_calls": [tool]}}]}))
        lines.append(sse_data({"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}))
        return lines

    def _anthropic_lines(self, parts):
        lines = [
            sse_data(
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "tool_use", "id": "call_1", "name": "inspect", "input": {}},
                }
            )
        ]
        lines.extend(
            sse_data(
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "input_json_delta", "partial_json": part},
                }
            )
            for part in parts
        )
        lines.extend(
            [
                sse_data({"type": "content_block_stop", "index": 0}),
                sse_data({"type": "message_delta", "delta": {"stop_reason": "tool_use"}}),
                sse_data({"type": "message_stop"}),
            ]
        )
        return lines

    def _responses_lines(self, parts):
        lines = [
            sse_data(
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {
                        "id": "fc_1",
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "inspect",
                        "arguments": "",
                    },
                }
            )
        ]
        lines.extend(
            sse_data(
                {
                    "type": "response.function_call_arguments.delta",
                    "item_id": "fc_1",
                    "output_index": 0,
                    "delta": part,
                }
            )
            for part in parts
        )
        lines.append(
            sse_data(
                {
                    "type": "response.completed",
                    "response": {"id": "resp_1", "status": "completed", "finish_reason": "tool_calls"},
                }
            )
        )
        return lines

    def test_all_protocol_pairs_preserve_arguments_across_every_boundary(self):
        expected_object = json.loads(self.arguments)
        for parts in fragmentations(self.arguments):
            with self.subTest(parts=len(parts), direction="chat_to_responses"):
                result = stream_openai_sse_to_responses(
                    [], io.BytesIO(), "m", initial_lines=self._chat_lines(parts)
                )
                self.assertEqual(result["output"][0]["arguments"], self.arguments)

            with self.subTest(parts=len(parts), direction="chat_to_anthropic"):
                result = stream_openai_sse_to_anthropic(
                    [], io.BytesIO(), "m", initial_lines=self._chat_lines(parts)
                )
                self.assertEqual(result["content"][0]["input"], expected_object)

            with self.subTest(parts=len(parts), direction="anthropic_to_responses"):
                result = stream_anthropic_sse_to_responses(
                    [], io.BytesIO(), "m", initial_lines=self._anthropic_lines(parts)
                )
                self.assertEqual(result["output"][0]["arguments"], self.arguments)

            with self.subTest(parts=len(parts), direction="anthropic_to_chat"):
                result = stream_anthropic_sse_to_openai_chat(
                    [], io.BytesIO(), "m", initial_lines=self._anthropic_lines(parts)
                )
                self.assertEqual(
                    result["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],
                    self.arguments,
                )

            with self.subTest(parts=len(parts), direction="responses_to_chat"):
                result = stream_responses_sse_to_openai_chat(
                    [], io.BytesIO(), "m", initial_lines=self._responses_lines(parts)
                )
                self.assertEqual(
                    result["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],
                    self.arguments,
                )

            with self.subTest(parts=len(parts), direction="responses_to_anthropic"):
                result = stream_responses_sse_to_anthropic(
                    [], io.BytesIO(), "m", initial_lines=self._responses_lines(parts)
                )
                self.assertEqual(result["content"][0]["input"], expected_object)


if __name__ == "__main__":
    unittest.main()
