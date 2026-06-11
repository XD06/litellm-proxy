import unittest

from tools.real_stream_tool_smoke import summarize_stream


class RealStreamToolSmokeTests(unittest.TestCase):
    def test_summarize_chat_tool_stream(self):
        body = (
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function",'
            '"function":{"name":"get_weather","arguments":"{\\\\\\"location\\\\\\""}}]},"finish_reason":null}]}\n\n'
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\\\\\"Shanghai\\\\\\"}"}}]},'
            '"finish_reason":null}]}\n\n'
            'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'
            "data: [DONE]\n\n"
        )

        summary = summarize_stream("chat_completions", body)

        self.assertEqual(summary["tool_calls"], 1)
        self.assertEqual(summary["argument_deltas"], 2)
        self.assertTrue(summary["has_done"])
        self.assertIn("tool_calls", summary["stop_reasons"])

    def test_summarize_responses_tool_stream(self):
        body = (
            "event: response.output_item.added\n"
            'data: {"type":"response.output_item.added","output_index":0,'
            '"item":{"id":"fc_1","type":"function_call","call_id":"call_1","name":"get_weather","arguments":""}}\n\n'
            "event: response.function_call_arguments.delta\n"
            'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,'
            '"delta":"{\\\\\\"location\\\\\\""}\n\n'
            "event: response.function_call_arguments.delta\n"
            'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,'
            '"delta":":\\\\\\"Shanghai\\\\\\"}"}\n\n'
            "event: response.completed\n"
            'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}\n\n'
        )

        summary = summarize_stream("responses", body)

        self.assertEqual(summary["tool_calls"], 1)
        self.assertEqual(summary["argument_deltas"], 2)
        self.assertIn("response.function_call_arguments.delta", summary["event_sample"])

    def test_summarize_anthropic_tool_stream(self):
        body = (
            "event: content_block_start\n"
            'data: {"type":"content_block_start","index":0,'
            '"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather","input":{}}}\n\n'
            "event: content_block_delta\n"
            'data: {"type":"content_block_delta","index":0,'
            '"delta":{"type":"input_json_delta","partial_json":"{\\\\\\"location\\\\\\""}}\n\n'
            "event: content_block_delta\n"
            'data: {"type":"content_block_delta","index":0,'
            '"delta":{"type":"input_json_delta","partial_json":":\\\\\\"Shanghai\\\\\\"}"}}\n\n'
            "event: message_delta\n"
            'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":4}}\n\n'
        )

        summary = summarize_stream("anthropic_messages", body)

        self.assertEqual(summary["tool_calls"], 1)
        self.assertEqual(summary["argument_deltas"], 2)
        self.assertIn("tool_use", summary["stop_reasons"])


if __name__ == "__main__":
    unittest.main()
