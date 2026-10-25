"""Regression: proxy handlers must not leak observability state on exceptions.

Before the chat/responses/aux handlers grew a function-level guard, one
exception between record_request_start and the attempt loop left the request
in _active forever and requests_in_flight never returned to zero, which
permanently froze model discovery and pricing resolution
(ProxyObservability.background_network_clear gates on in-flight == 0).
"""
import time
import unittest
from types import SimpleNamespace

import sse2json
from observability import ProxyObservability

CFG = {"observability": {"history": {"enabled": False}}}


def _bare_handler():
    return object.__new__(sse2json.Handler)


def _start(obs, request_id, **overrides):
    kwargs = dict(
        client_format="chat_completions",
        endpoint="/v1/chat/completions",
        model="m1",
        stream=False,
        path="/v1/chat/completions",
    )
    kwargs.update(overrides)
    obs.record_request_start(request_id, **kwargs)


class FatalGuardTests(unittest.TestCase):
    def _patch_impl(self, impl_name, impl):
        original = getattr(sse2json.Handler, impl_name)
        setattr(sse2json.Handler, impl_name, impl)
        self.addCleanup(setattr, sse2json.Handler, impl_name, original)

    def test_exception_releases_in_flight_and_returns_502(self):
        obs = ProxyObservability(CFG)
        sse2json._set_request_rt(SimpleNamespace(observability=obs))
        self.addCleanup(sse2json._clear_request_rt)
        handler = _bare_handler()
        captured = {}

        def fake_resp_json(payload, status, **kwargs):
            captured["payload"], captured["status"] = payload, status
            return "sent"

        handler._resp_json = fake_resp_json

        def boom(self, req, request_id, start_ts):
            _start(obs, request_id)
            raise RuntimeError("boom")

        self._patch_impl("_proxy_openai_chat_completions_impl", boom)
        handler._proxy_openai_chat_completions({"stream": False}, "req_fatal_1", time.time())

        self.assertEqual(captured["status"], 502)
        self.assertIn("RuntimeError: boom", captured["payload"]["error"]["message"])
        self.assertEqual(captured["payload"]["error"]["request_id"], "req_fatal_1")
        self.assertEqual(obs._counters["requests_in_flight"], 0)
        self.assertFalse(obs.is_request_active("req_fatal_1"))

    def test_guard_never_double_records_after_normal_end(self):
        obs = ProxyObservability(CFG)
        sse2json._set_request_rt(SimpleNamespace(observability=obs))
        self.addCleanup(sse2json._clear_request_rt)
        handler = _bare_handler()
        handler._resp_json = lambda payload, status, **kw: None

        def start_end_then_raise(self, req, request_id, start_ts, path="/openai/v1/responses"):
            _start(obs, request_id, client_format="responses", endpoint="/v1/responses",
                   stream=True, path="/v1/responses")
            obs.record_request_end(request_id, status_code=200)
            raise RuntimeError("late failure after response")

        self._patch_impl("_proxy_openai_responses_impl", start_end_then_raise)
        handler._proxy_openai_responses({"stream": True}, "req_fatal_2", time.time())

        self.assertEqual(obs._counters["by_status"].get("200"), 1)
        self.assertEqual(obs._counters["by_status"].get("502", 0), 0)
        self.assertEqual(obs._counters["requests_success"], 1)
        self.assertEqual(obs._counters["requests_failed"], 0)
        self.assertEqual(obs._counters["requests_in_flight"], 0)

    def test_guard_records_nothing_when_start_never_ran(self):
        obs = ProxyObservability(CFG)
        sse2json._set_request_rt(SimpleNamespace(observability=obs))
        self.addCleanup(sse2json._clear_request_rt)
        handler = _bare_handler()
        captured = {}
        handler._resp_json = lambda payload, status, **kw: captured.update(payload=payload, status=status)

        def early_boom(self, req, request_id, start_ts):
            raise ValueError("prologue broke")

        self._patch_impl("_proxy_openai_aux_impl", early_boom)
        handler._proxy_openai_aux(
            {"model": "m1"}, "req_fatal_3", time.time(),
            endpoint="/v1/embeddings", upstream_path="/embeddings", client_format="embeddings",
        )

        self.assertEqual(captured["status"], 502)
        # No phantom record: the guard must not invent an ended request
        # (that would steal an in-flight slot from another request).
        self.assertEqual(obs._counters["requests_in_flight"], 0)
        self.assertEqual(obs._counters["by_status"].get("502", 0), 0)
        self.assertEqual(len(obs._recent), 0)
