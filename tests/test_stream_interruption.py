#!/usr/bin/env python3
"""Tests for relay_sse_stream graceful interruption handling."""
from __future__ import annotations

import io
import unittest
from typing import List

from stream_adapters import relay_sse_stream


class _MockUpstream:
    """Simulates an upstream SSE connection that can raise mid-stream."""

    def __init__(self, lines: List[bytes], error_at: int = -1, exc=None):
        self._lines = list(lines)
        self._error_at = error_at
        self._exc = exc or ConnectionError("upstream gone")
        self._idx = 0

    def __iter__(self):
        return self

    def __next__(self):
        if self._error_at >= 0 and self._idx >= self._error_at:
            raise self._exc
        if self._idx >= len(self._lines):
            raise StopIteration
        line = self._lines[self._idx]
        self._idx += 1
        return line

    def close(self):
        pass


class TestRelaySseStreamInterruption(unittest.TestCase):
    """Tests for graceful error handling in relay_sse_stream."""

    def test_successful_passthrough_returns_usage(self):
        """Normal streaming returns a usage dict, not None."""
        lines = [
            b'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
            b'data: {"usage":{"prompt_tokens":5,"completion_tokens":2}}\n',
            b'data: [DONE]\n',
        ]
        upstream = _MockUpstream(lines)
        output = io.BytesIO()

        result = relay_sse_stream(upstream, output, client_format="chat_completions")

        self.assertIsNotNone(result)
        self.assertEqual(result.get("input_tokens"), 5)
        self.assertEqual(result.get("output_tokens"), 2)
        # Verify data was written to output
        written = output.getvalue()
        self.assertIn(b"hi", written)
        self.assertIn(b"[DONE]", written)

    def test_interruption_returns_none(self):
        """When upstream drops mid-stream, relay_sse_stream returns None."""
        lines = [
            b'data: {"choices":[{"delta":{"content":"hel"}}]}\n',
            # Stream will error here
        ]
        upstream = _MockUpstream(lines, error_at=1, exc=ConnectionError("connection reset"))
        output = io.BytesIO()

        result = relay_sse_stream(upstream, output, client_format="chat_completions")

        self.assertIsNone(result)
        # Verify partial data was written
        written = output.getvalue()
        self.assertIn(b"hel", written)
        # Verify a [DONE] was sent as graceful close
        self.assertIn(b"[DONE]", written)

    def test_interruption_anthropic_format(self):
        """Anthropic-format stream gets a proper message_stop on interruption."""
        lines = [
            b'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n',
        ]
        upstream = _MockUpstream(lines, error_at=1, exc=ConnectionError("dropped"))
        output = io.BytesIO()

        result = relay_sse_stream(upstream, output, client_format="anthropic_messages")

        self.assertIsNone(result)
        written = output.getvalue()
        self.assertIn(b"message_stop", written)

    def test_interruption_responses_format(self):
        """Responses-format stream gets a response.failed on interruption."""
        lines = [
            b'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n',
        ]
        upstream = _MockUpstream(lines, error_at=1, exc=ConnectionError("dropped"))
        output = io.BytesIO()

        result = relay_sse_stream(upstream, output, client_format="responses")

        self.assertIsNone(result)
        written = output.getvalue()
        self.assertIn(b"response.failed", written)

    def test_interruption_with_initial_lines(self):
        """Interruption after initial_lines were written still returns None."""
        initial = [b'data: {"choices":[{"delta":{"content":"first"}}]}\n']
        lines = [
            b'data: {"choices":[{"delta":{"content":"second"}}]}\n',
        ]
        upstream = _MockUpstream(lines, error_at=0, exc=ConnectionError("dropped"))
        output = io.BytesIO()

        result = relay_sse_stream(
            upstream, output, initial_lines=initial, client_format="chat_completions"
        )

        self.assertIsNone(result)
        written = output.getvalue()
        self.assertIn(b"first", written)
        self.assertIn(b"[DONE]", written)

    def test_successful_stream_with_initial_lines(self):
        """Both initial_lines and upstream lines are relayed successfully."""
        initial = [b'data: {"choices":[{"delta":{"content":"first"}}]}\n']
        lines = [
            b'data: {"choices":[{"delta":{"content":"second"}}]}\n',
            b'data: [DONE]\n',
        ]
        upstream = _MockUpstream(lines)
        output = io.BytesIO()

        result = relay_sse_stream(
            upstream, output, initial_lines=initial, client_format="chat_completions"
        )

        self.assertIsNotNone(result)
        written = output.getvalue()
        self.assertIn(b"first", written)
        self.assertIn(b"second", written)

    def test_collect_usage_false(self):
        """When collect_usage=False, usage should be empty."""
        lines = [
            b'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
            b'data: {"usage":{"prompt_tokens":5,"completion_tokens":2}}\n',
            b'data: [DONE]\n',
        ]
        upstream = _MockUpstream(lines)
        output = io.BytesIO()

        result = relay_sse_stream(
            upstream, output, collect_usage=False, client_format="chat_completions"
        )

        self.assertIsNotNone(result)
        self.assertEqual(result.get("input_tokens", 0), 0)


if __name__ == "__main__":
    unittest.main()
