import unittest

import sse2json
from config_manager import ConfigValidationError, RuntimeConfigManager


class ClientReasoningEffortExtraction(unittest.TestCase):
    def test_chat_reasoning_effort_string(self):
        self.assertEqual(
            sse2json._client_reasoning_effort({"reasoning_effort": "low"}, sse2json.CHAT),
            "low",
        )

    def test_chat_reasoning_dict_effort(self):
        req = {"reasoning": {"effort": "High"}}
        self.assertEqual(sse2json._client_reasoning_effort(req, sse2json.CHAT), "high")

    def test_chat_reasoning_disabled(self):
        req = {"reasoning": {"enabled": False}}
        self.assertEqual(sse2json._client_reasoning_effort(req, sse2json.CHAT), "off")

    def test_chat_absent(self):
        self.assertEqual(sse2json._client_reasoning_effort({}, sse2json.CHAT), "")

    def test_responses_effort(self):
        self.assertEqual(
            sse2json._client_reasoning_effort({"reasoning": {"effort": "medium"}}, sse2json.RESPONSES),
            "medium",
        )
        self.assertEqual(
            sse2json._client_reasoning_effort({"reasoning": "high"}, sse2json.RESPONSES),
            "high",
        )

    def test_anthropic_budget(self):
        req = {"thinking": {"type": "enabled", "budget_tokens": 8192}}
        self.assertEqual(
            sse2json._client_reasoning_effort(req, sse2json.ANTHROPIC),
            "budget:8192",
        )

    def test_anthropic_disabled(self):
        req = {"thinking": {"type": "disabled"}}
        self.assertEqual(sse2json._client_reasoning_effort(req, sse2json.ANTHROPIC), "off")


def _config_with_route(effort):
    return {
        "models": {
            "routes": {
                "test-model": {"providers": [{"name": "p1"}], "reasoning_effort": effort},
            },
        },
    }


class ReasoningEffortOverride(unittest.TestCase):
    def test_chat_override_replaces_client_value(self):
        payload = {"reasoning_effort": "low", "reasoning": {"effort": "low"}}
        adaptation = sse2json._apply_reasoning_effort_override(
            payload, sse2json.CHAT, "test-model", _config_with_route("high")
        )
        self.assertEqual(payload.get("reasoning_effort"), "high")
        self.assertNotIn("reasoning", payload)
        self.assertEqual(adaptation["action"], "override")
        self.assertEqual(adaptation["from"], "low")
        self.assertEqual(adaptation["to"], "high")

    def test_chat_off_strips_all_reasoning_keys(self):
        payload = {"reasoning_effort": "low", "enable_thinking": True}
        adaptation = sse2json._apply_reasoning_effort_override(
            payload, sse2json.CHAT, "test-model", _config_with_route("off")
        )
        self.assertNotIn("reasoning_effort", payload)
        self.assertNotIn("enable_thinking", payload)
        self.assertEqual(adaptation["to"], "off")

    def test_responses_override(self):
        payload = {"reasoning": {"effort": "low"}}
        sse2json._apply_reasoning_effort_override(
            payload, sse2json.RESPONSES, "test-model", _config_with_route("medium")
        )
        self.assertEqual(payload.get("reasoning"), {"effort": "medium"})

    def test_anthropic_override_sets_budget(self):
        payload = {"max_tokens": 8192}
        adaptation = sse2json._apply_reasoning_effort_override(
            payload, sse2json.ANTHROPIC, "test-model", _config_with_route("high")
        )
        thinking = payload.get("thinking")
        self.assertEqual(thinking.get("type"), "enabled")
        # high = 20000 but must clamp below max_tokens
        self.assertLess(thinking.get("budget_tokens"), 8192)
        self.assertEqual(adaptation["to"], "high")

    def test_anthropic_off_removes_thinking(self):
        payload = {"thinking": {"type": "enabled", "budget_tokens": 4096}}
        sse2json._apply_reasoning_effort_override(
            payload, sse2json.ANTHROPIC, "test-model", _config_with_route("off")
        )
        self.assertNotIn("thinking", payload)

    def test_no_override_follows_client(self):
        payload = {"reasoning_effort": "low"}
        adaptation = sse2json._apply_reasoning_effort_override(
            payload, sse2json.CHAT, "test-model", _config_with_route("")
        )
        self.assertIsNone(adaptation)
        self.assertEqual(payload.get("reasoning_effort"), "low")

    def test_no_route_entry(self):
        payload = {"reasoning_effort": "low"}
        adaptation = sse2json._apply_reasoning_effort_override(
            payload, sse2json.CHAT, "other-model", _config_with_route("high")
        )
        self.assertIsNone(adaptation)
        self.assertEqual(payload.get("reasoning_effort"), "low")


class ModelRouteReasoningEffortValidation(unittest.TestCase):
    def _manager(self):
        import tempfile, os

        base = {
            "server": {"admin_key": "k"},
            "routing": {"default_provider_pool": ["alpha"]},
            "retry": {"retryable_status": [429], "key_fatal_status": [401]},
            "models": {},
            "providers": {"alpha": {"base_url": "https://a.test", "keys": ["sk-a"], "priority": 10}},
        }
        with tempfile.TemporaryDirectory() as tmp:
            overlay = os.path.join(tmp, "runtime.json")
            yield RuntimeConfigManager(base, overlay_path=overlay)

    def test_reasoning_effort_accepted_and_stored(self):
        for mgr in self._manager():
            mgr.update_model_route(
                {"model": "m1", "providers": ["alpha"], "reasoning_effort": "high"}
            )
            route = mgr.config["models"]["routes"]["m1"]
            self.assertEqual(route["reasoning_effort"], "high")

    def test_reasoning_effort_invalid_rejected(self):
        for mgr in self._manager():
            with self.assertRaises(ConfigValidationError):
                mgr.update_model_route(
                    {"model": "m1", "providers": ["alpha"], "reasoning_effort": "extreme"}
                )

    def test_reasoning_effort_absent_preserves_existing(self):
        for mgr in self._manager():
            mgr.update_model_route(
                {"model": "m1", "providers": ["alpha"], "reasoning_effort": "low"}
            )
            mgr.update_model_route({"model": "m1", "providers": ["alpha"]})
            route = mgr.config["models"]["routes"]["m1"]
            self.assertEqual(route.get("reasoning_effort"), "low")

    def test_reasoning_effort_empty_clears(self):
        for mgr in self._manager():
            mgr.update_model_route(
                {"model": "m1", "providers": ["alpha"], "reasoning_effort": "low"}
            )
            mgr.update_model_route(
                {"model": "m1", "providers": ["alpha"], "reasoning_effort": ""}
            )
            route = mgr.config["models"]["routes"]["m1"]
            # Cleared via tombstone: either absent or explicitly None.
            self.assertFalse(route.get("reasoning_effort"))


class EmptyOutputFallbackFlag(unittest.TestCase):
    def test_default_enabled(self):
        self.assertTrue(sse2json._empty_output_fallback_enabled({}))

    def test_explicitly_disabled(self):
        cfg = {"routing": {"empty_visible_output_fallback": False}}
        self.assertFalse(sse2json._empty_output_fallback_enabled(cfg))


if __name__ == "__main__":
    unittest.main()
