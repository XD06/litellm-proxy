"""Google thought signature fidelity chain: provider_specific_fields round-trip,
bounded proxy store, and the dummy fallback."""

import base64
import os
import tempfile
import time
import unittest

import format_adapters
import thought_signature_store
from conversion_core import prepare_request
from conversion_core.codecs import google as google_codec
from format_adapters import ANTHROPIC, CHAT, GOOGLE, RESPONSES

DUMMY = base64.b64encode(b"skip_thought_signature_validator").decode("ascii")


def same_model(name):
    return name


def _chat_request_with_history(arguments="{}", tool_call_id="call_1", extra=None):
    call = {
        "id": tool_call_id,
        "type": "function",
        "function": {"name": "get-weather", "arguments": arguments},
    }
    if extra:
        call.update(extra)
    return {
        "model": "gemini-2.5-flash",
        "messages": [
            {"role": "user", "content": "weather?"},
            {"role": "assistant", "content": None, "tool_calls": [call]},
            {"role": "tool", "tool_call_id": tool_call_id, "content": "sunny"},
        ],
        "tools": [{"type": "function", "function": {"name": "get-weather", "parameters": {"type": "object", "properties": {}}}}],
    }


def _google_signed_response(signature="REAL_SIG", call_id="call_1"):
    return {
        "candidates": [{
            "content": {"role": "model", "parts": [{
                "functionCall": {"id": call_id, "name": "get-weather", "args": {"city": "SF"}},
                "thoughtSignature": signature,
            }]},
            "finishReason": "STOP",
        }],
    }


class ThoughtSignatureStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="gts-store-")
        self.path = os.path.join(self.tmpdir, "sigs.sqlite3")

    def tearDown(self):
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})

    def test_save_get_and_ttl_expiry(self):
        store = thought_signature_store.GoogleThoughtSignatureStore(self.path).initialize()
        self.addCleanup(store.close)
        store.save({"call_1": "SIG_ONE"})
        self.assertEqual(store.get("call_1"), "SIG_ONE")
        self.assertEqual(store.get("missing"), None)
        store._conn.execute("UPDATE google_thought_signatures SET updated_at = ?", (time.time() - 999999,))
        store._conn.commit()
        self.assertEqual(store.get("call_1"), None)

    def test_max_records_trim_keeps_freshest(self):
        limits = thought_signature_store.SignatureStoreLimits(ttl_seconds=3600, max_records=3)
        store = thought_signature_store.GoogleThoughtSignatureStore(self.path, limits=limits).initialize()
        self.addCleanup(store.close)
        for index in range(10):
            store.save({f"call_{index}": f"SIG{index}"})
            time.sleep(0.001)
        remaining = {
            (row[0], row[1])
            for row in store._conn.execute("SELECT call_id, signature FROM google_thought_signatures")
        }
        self.assertLessEqual(len(remaining), 3)
        self.assertIn(("call_9", "SIG9"), remaining)

    def test_configure_installs_and_disables_codec_hooks(self):
        config = {"observability": {"google_thought_signatures": {"enabled": True, "path": self.path}}}
        store = thought_signature_store.configure(config)
        self.assertIsNotNone(store)
        self.addCleanup(store.close)
        self.assertIsNotNone(google_codec._SIGNATURE_LOOKUP)
        google_codec.persist_signatures({"call_hook": "HOOK_SIG"})
        self.assertEqual(google_codec._lookup_signature("call_hook"), "HOOK_SIG")
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})
        self.assertIsNone(google_codec._SIGNATURE_LOOKUP)
        self.assertEqual(google_codec._lookup_signature("call_hook"), "")


class ProviderSpecificFieldsTests(unittest.TestCase):
    def tearDown(self):
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})

    def _chat_to_google_with_store_off(self):
        # Guarantee a clean codec state regardless of other test files.
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})

    def test_google_response_exposes_signature_to_chat_history(self):
        self._chat_to_google_with_store_off()
        prepared = prepare_request(CHAT, GOOGLE, _chat_request_with_history(), resolve_model=same_model)
        converted = translate_response(GOOGLE, CHAT, _google_signed_response("WIRE_SIG"), context=prepared.context)
        call = converted["choices"][0]["message"]["tool_calls"][0]
        self.assertEqual(call["provider_specific_fields"]["thought_signature"], "WIRE_SIG")

        # The client replays its assistant history verbatim -> real signature.
        replay = _chat_request_with_history(extra={"provider_specific_fields": {"thought_signature": "WIRE_SIG"}})
        prepared2 = prepare_request(CHAT, GOOGLE, replay, resolve_model=same_model)
        fc = prepared2.payload["contents"][1]["parts"][0]["functionCall"]
        self.assertEqual(fc["thoughtSignature"], "WIRE_SIG")

    def test_google_response_exposes_signature_to_responses_history(self):
        self._chat_to_google_with_store_off()
        prepared = prepare_request(CHAT, GOOGLE, _chat_request_with_history(tool_call_id="call_9"), resolve_model=same_model)
        converted = translate_response(GOOGLE, RESPONSES, _google_signed_response("RS_SIG", call_id="call_9"), context=prepared.context)
        item = [o for o in converted["output"] if o["type"] == "function_call"][0]
        self.assertEqual(item["provider_specific_fields"]["thought_signature"], "RS_SIG")

        replay = {
            "model": "gemini-2.5-flash",
            "input": [
                {"role": "user", "content": "weather?"},
                {"type": "function_call", "call_id": "call_9", "name": "get-weather", "arguments": "{}",
                 "provider_specific_fields": {"thought_signature": "RS_SIG"}},
                {"type": "function_call_output", "call_id": "call_9", "output": "sunny"},
            ],
            "tools": [{"type": "function", "name": "get-weather", "parameters": {"type": "object", "properties": {}}}],
        }
        prepared2 = prepare_request(RESPONSES, GOOGLE, replay, resolve_model=same_model)
        model_parts = [p for c in prepared2.payload["contents"] if c["role"] == "model" for p in c["parts"]]
        self.assertEqual(model_parts[0]["functionCall"]["thoughtSignature"], "RS_SIG")

    def test_signed_reasoning_blocks_never_forge_chat_signatures(self):
        self._chat_to_google_with_store_off()
        prepared = prepare_request(CHAT, GOOGLE, _chat_request_with_history(), resolve_model=same_model)
        translated = format_adapters.convert_response(GOOGLE, CHAT, {
            "candidates": [{"content": {"role": "model", "parts": [
                {"text": "thoughtful", "thought": True},
                {"functionCall": {"id": "call_1", "name": "get-weather", "args": {}}},
            ]}, "finishReason": "STOP"}],
        }, context=prepared.context)
        call = translated["choices"][0]["message"]["tool_calls"][0]
        # No signature on the upstream call -> no provider_specific_fields key.
        self.assertNotIn("provider_specific_fields", call)

    def test_anthropic_history_without_slot_falls_back_to_store(self):
        tmpdir = tempfile.mkdtemp(prefix="gts-roundtrip-")
        store = thought_signature_store.configure({
            "observability": {"google_thought_signatures": {"enabled": True, "path": os.path.join(tmpdir, "s.sqlite3")}},
        })
        self.addCleanup(store.close)

        prepared = prepare_request(ANTHROPIC, GOOGLE, {
            "model": "gemini-2.5-flash",
            "max_tokens": 64,
            "messages": [{"role": "user", "content": "weather?"}],
            "tools": [{"name": "get-weather", "input_schema": {"type": "object", "properties": {}}}],
        }, resolve_model=same_model)

        # Turn 1: google returns a signed call; anthropic clients get thinking+tool_use,
        # the fc signature has no Anthropic slot so only the store keeps it.
        anthropic_response = format_adapters.convert_response(GOOGLE, ANTHROPIC, _google_signed_response("STORED_SIG"), context=prepared.context)
        self.assertEqual(anthropic_response["content"][0]["type"], "tool_use")

        # Turn 2: client history carries the tool_use block without any signature.
        history = {
            "model": "gemini-2.5-flash",
            "max_tokens": 64,
            "messages": [
                {"role": "user", "content": "weather?"},
                {"role": "assistant", "content": [
                    {"type": "tool_use", "id": "call_1", "name": "get-weather", "input": {"city": "SF"}},
                ]},
                {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call_1", "content": "sunny"}]},
            ],
            "tools": [{"name": "get-weather", "input_schema": {"type": "object", "properties": {}}}],
        }
        prepared2 = prepare_request(ANTHROPIC, GOOGLE, history, resolve_model=same_model)
        model_parts = [p for c in prepared2.payload["contents"] if c["role"] == "model" for p in c["parts"]]
        self.assertEqual(model_parts[0]["functionCall"]["thoughtSignature"], "STORED_SIG")

    def test_unknown_call_id_uses_dummy_signature(self):
        thought_signature_store.configure({"observability": {"google_thought_signatures": {"enabled": False}}})
        prepared = prepare_request(CHAT, GOOGLE, _chat_request_with_history(tool_call_id="never-seen"), resolve_model=same_model)
        model_parts = [p for c in prepared.payload["contents"] if c["role"] == "model" for p in c["parts"]]
        self.assertEqual(model_parts[0]["functionCall"]["thoughtSignature"], DUMMY)


if __name__ == "__main__":
    unittest.main()
