import json
import os
import tempfile
import unittest

from config_loader import _normalize_config, load_config


class ConfigLoaderTests(unittest.TestCase):
    def restore_env(self, key, old_value):
        if old_value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = old_value

    def unused_runtime_config_path(self):
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        os.unlink(path)
        return path

    def load_from_temp_config(self, config):
        fd, path = tempfile.mkstemp(suffix=".json")
        runtime_path = self.unused_runtime_config_path()
        old_path = os.environ.get("PROXY_CONFIG_PATH")
        old_runtime_path = os.environ.get("PROXY_RUNTIME_CONFIG_PATH")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(config, f)
            os.environ["PROXY_CONFIG_PATH"] = path
            os.environ["PROXY_RUNTIME_CONFIG_PATH"] = runtime_path
            return load_config()
        finally:
            self.restore_env("PROXY_CONFIG_PATH", old_path)
            self.restore_env("PROXY_RUNTIME_CONFIG_PATH", old_runtime_path)
            try:
                os.unlink(path)
            except OSError:
                pass
            try:
                os.unlink(runtime_path)
            except OSError:
                pass

    def test_provider_without_formats_defaults_to_chat_completions(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "alpha": {
                        "base_url": "https://alpha.example/v1",
                        "keys": "alpha-key",
                    }
                }
            }
        )

        provider = cfg["providers"]["alpha"]

        self.assertEqual(provider["base_url"], "https://alpha.example")
        self.assertEqual(cfg["models"]["provider_model_capabilities"], {})
        self.assertTrue(cfg["models"]["assume_supports_unknown_models"])
        self.assertEqual(provider["chat_completions_path"], "/v1/chat/completions")
        self.assertTrue(provider["formats"]["chat_completions"]["enabled"])
        self.assertEqual(provider["formats"]["chat_completions"]["path"], "/v1/chat/completions")
        self.assertFalse(provider["formats"]["responses"]["enabled"])
        self.assertFalse(provider["formats"]["anthropic_messages"]["enabled"])
        self.assertEqual(provider["keys"], ["alpha-key"])

    def test_key_level_proxy_entries_are_normalized(self):
        cfg = self.load_from_temp_config(
            {
                "proxy": "http://127.0.0.1:7000",
                "providers": {
                    "alpha": {
                        "base_url": "https://alpha.example",
                        "proxy": "http://127.0.0.1:8000",
                        "keys": [
                            "alpha-key-1",
                            {
                                "key": "alpha-key-2",
                                "proxy": "http://127.0.0.1:9000",
                                "models": {"grok-4.3": "grok-4.3-high"},
                            },
                        ],
                    }
                },
            }
        )

        provider = cfg["providers"]["alpha"]

        self.assertEqual(cfg["proxy"], {"http": "http://127.0.0.1:7000", "https": "http://127.0.0.1:7000"})
        self.assertEqual(provider["proxy"], {"http": "http://127.0.0.1:8000", "https": "http://127.0.0.1:8000"})
        self.assertEqual(provider["keys"][0], "alpha-key-1")
        self.assertEqual(
            provider["keys"][1],
            {
                "key": "alpha-key-2",
                "proxy": {"http": "http://127.0.0.1:9000", "https": "http://127.0.0.1:9000"},
                "models": {"grok-4.3": "grok-4.3-high"},
            },
        )

    def test_comma_separated_string_keys_are_split(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "alpha": {
                        "base_url": "https://alpha.example",
                        "keys": ["alpha-key-1, alpha-key-2", "alpha-key-3"],
                    }
                }
            }
        )

        self.assertEqual(cfg["providers"]["alpha"]["keys"], ["alpha-key-1", "alpha-key-2", "alpha-key-3"])

    def test_config_file_with_utf8_bom_is_loaded(self):
        fd, path = tempfile.mkstemp(suffix=".json")
        runtime_path = self.unused_runtime_config_path()
        old_path = os.environ.get("PROXY_CONFIG_PATH")
        old_runtime_path = os.environ.get("PROXY_RUNTIME_CONFIG_PATH")
        try:
            with os.fdopen(fd, "w", encoding="utf-8-sig") as f:
                json.dump(
                    {
                        "server": {"port": 4894},
                        "providers": {
                            "alpha": {
                                "base_url": "https://alpha.example",
                                "keys": ["alpha-key"],
                            }
                        },
                    },
                    f,
                )
            os.environ["PROXY_CONFIG_PATH"] = path
            os.environ["PROXY_RUNTIME_CONFIG_PATH"] = runtime_path
            cfg = load_config()
        finally:
            self.restore_env("PROXY_CONFIG_PATH", old_path)
            self.restore_env("PROXY_RUNTIME_CONFIG_PATH", old_runtime_path)
            try:
                os.unlink(path)
            except OSError:
                pass
            try:
                os.unlink(runtime_path)
            except OSError:
                pass

        self.assertEqual(cfg["server"]["port"], 4894)
        self.assertIn("alpha", cfg["providers"])

    def test_legacy_format_paths_map_to_formats(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "beta": {
                        "base_url": "https://beta.example",
                        "chat_completions_path": "chat",
                        "responses_path": "responses",
                        "anthropic_messages_path": "/messages",
                        "keys": ["beta-key"],
                    }
                }
            }
        )

        provider = cfg["providers"]["beta"]

        self.assertEqual(provider["formats"]["chat_completions"], {"enabled": True, "path": "/chat"})
        self.assertEqual(provider["formats"]["responses"], {"enabled": True, "path": "/responses"})
        self.assertEqual(provider["formats"]["anthropic_messages"], {"enabled": True, "path": "/messages"})

    def test_declared_formats_are_normalized_without_adding_chat(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "gamma": {
                        "base_url": "https://gamma.example/api",
                        "formats": {
                            "responses": {"path": "v1/responses"},
                            "anthropic_messages": {"enabled": False, "path": "v1/messages"},
                        },
                        "keys": ["gamma-key"],
                    }
                }
            }
        )

        provider = cfg["providers"]["gamma"]

        self.assertFalse(provider["formats"]["chat_completions"]["enabled"])
        self.assertTrue(provider["formats"]["responses"]["enabled"])
        self.assertEqual(provider["formats"]["responses"]["path"], "/v1/responses")
        self.assertFalse(provider["formats"]["anthropic_messages"]["enabled"])
        self.assertEqual(provider["formats"]["anthropic_messages"]["path"], "/v1/messages")

    def test_base_url_can_infer_non_chat_provider_formats(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "deepseek": {
                        "base_url": "https://api.deepseek.com/anthropic",
                        "keys": ["deepseek-key"],
                    },
                    "rawchat": {
                        "base_url": "https://rawchat.cn/codex",
                        "keys": ["rawchat-key"],
                    },
                }
            }
        )

        deepseek = cfg["providers"]["deepseek"]
        rawchat = cfg["providers"]["rawchat"]

        self.assertTrue(deepseek["formats"]["anthropic_messages"]["enabled"])
        self.assertEqual(deepseek["formats"]["anthropic_messages"]["path"], "/v1/messages")
        self.assertFalse(deepseek["formats"]["chat_completions"]["enabled"])

        self.assertTrue(rawchat["formats"]["responses"]["enabled"])
        self.assertEqual(rawchat["formats"]["responses"]["path"], "/v1/responses")
        self.assertFalse(rawchat["formats"]["chat_completions"]["enabled"])

    def test_full_responses_url_is_split_into_base_and_format_path(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "delta": {
                        "base_url": "https://delta.example/proxy/v1/responses",
                        "keys": ["delta-key"],
                    }
                }
            }
        )

        provider = cfg["providers"]["delta"]

        self.assertEqual(provider["base_url"], "https://delta.example/proxy")
        self.assertTrue(provider["formats"]["responses"]["enabled"])
        self.assertEqual(provider["formats"]["responses"]["path"], "/v1/responses")

    def test_default_retry_failure_policies_are_present(self):
        cfg = self.load_from_temp_config(
            {
                "providers": {
                    "alpha": {
                        "base_url": "https://alpha.example",
                        "keys": ["alpha-key"],
                    }
                }
            }
        )

        policies = cfg["retry"]["failure_policies"]

        self.assertEqual(cfg["retry"]["same_key_retries"], 1)
        self.assertEqual(cfg["retry"]["key_failure_ladder_s"], [10, 60, 3600])
        self.assertEqual(policies["key_invalid"]["cooldown_scope"], "key")
        self.assertTrue(policies["key_invalid"]["disables_key"])
        self.assertEqual(policies["quota_or_balance"]["cooldown_scope"], "key")
        self.assertGreaterEqual(policies["quota_or_balance"]["cooldown_s"], 1800)
        self.assertEqual(policies["network_error"]["cooldown_scope"], "key")
        self.assertEqual(policies["provider_compat"]["cooldown_scope"], "none")
        self.assertEqual(policies["empty_visible_output"]["cooldown_scope"], "none")

    def test_retry_failure_policy_config_overrides_default_entry(self):
        cfg = self.load_from_temp_config(
            {
                "retry": {
                    "failure_policies": {
                        "server_error": {"cooldown_scope": "provider", "provider_cooldown_s": 20}
                    }
                },
                "providers": {
                    "alpha": {
                        "base_url": "https://alpha.example",
                        "keys": ["alpha-key"],
                    }
                },
            }
        )

        self.assertEqual(cfg["retry"]["failure_policies"]["server_error"]["cooldown_scope"], "provider")
        self.assertEqual(cfg["retry"]["failure_policies"]["server_error"]["provider_cooldown_s"], 20)
        self.assertEqual(cfg["retry"]["failure_policies"]["network_error"]["cooldown_scope"], "key")


    def test_format_output_token_field_survives_normalization(self):
        cfg = _normalize_config({
            "providers": {
                "p": {
                    "base_url": "https://example.test",
                    "keys": ["k"],
                    "formats": {
                        "chat_completions": {
                            "enabled": True,
                            "path": "/v1/chat/completions",
                            "parameters": {"output_token_field": "max_completion_tokens"},
                        }
                    },
                }
            }
        })
        entry = cfg["providers"]["p"]["formats"]["chat_completions"]
        self.assertEqual(entry["parameters"]["output_token_field"], "max_completion_tokens")


    def test_invalid_format_output_token_field_is_rejected(self):
        with self.assertRaises(ValueError):
            _normalize_config({"providers": {"p": {"base_url": "https://example.test", "keys": ["k"], "formats": {"responses": {"enabled": True, "parameters": {"output_token_field": "max_tokens"}}}}}})


if __name__ == "__main__":
    unittest.main()
