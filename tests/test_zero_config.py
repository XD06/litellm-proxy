"""Tests for zero-config startup: environment variable → provider auto-detection."""
import json
import os
import tempfile
import unittest

from config_loader import (
    PROVIDER_ENV_PRESETS,
    ZERO_CONFIG_ACTIVE,
    _is_placeholder_key,
    _has_real_providers,
    generate_config_from_env,
    load_base_config,
    load_config,
)


class PlaceholderKeyTests(unittest.TestCase):
    def test_empty_string_is_placeholder(self):
        self.assertTrue(_is_placeholder_key(""))

    def test_your_key_is_placeholder(self):
        self.assertTrue(_is_placeholder_key("your key"))
        self.assertTrue(_is_placeholder_key("your-key"))
        self.assertTrue(_is_placeholder_key("YOUR_KEY"))

    def test_real_key_is_not_placeholder(self):
        self.assertFalse(_is_placeholder_key("sk-abc123"))


class HasRealProvidersTests(unittest.TestCase):
    def test_default_config_has_no_real_providers(self):
        from config_loader import _default_config
        cfg = _default_config()
        self.assertFalse(_has_real_providers(cfg))

    def test_config_with_real_key_has_providers(self):
        cfg = {"providers": {"alpha": {"keys": ["sk-real"]}}}
        self.assertTrue(_has_real_providers(cfg))

    def test_config_with_placeholder_only(self):
        cfg = {"providers": {"default": {"keys": ["your key"]}}}
        self.assertFalse(_has_real_providers(cfg))

    def test_config_with_dict_key_entries(self):
        cfg = {"providers": {"alpha": {"keys": [{"key": "sk-real"}]}}}
        self.assertTrue(_has_real_providers(cfg))

    def test_empty_providers(self):
        cfg = {"providers": {}}
        self.assertFalse(_has_real_providers(cfg))


class GenerateConfigFromEnvTests(unittest.TestCase):
    def setUp(self):
        self._saved = {}
        for key in PROVIDER_ENV_PRESETS:
            if key in os.environ:
                self._saved[key] = os.environ.pop(key)

    def tearDown(self):
        for key in PROVIDER_ENV_PRESETS:
            os.environ.pop(key, None)
        for key, val in self._saved.items():
            os.environ[key] = val

    def test_no_env_vars_returns_empty(self):
        result = generate_config_from_env()
        self.assertEqual(result, {})

    def test_single_provider_detected(self):
        os.environ["OPENAI_API_KEY"] = "sk-test-openai"
        result = generate_config_from_env()
        self.assertIn("providers", result)
        self.assertIn("openai", result["providers"])
        self.assertEqual(result["providers"]["openai"]["keys"], ["sk-test-openai"])
        self.assertEqual(result["providers"]["openai"]["base_url"], "https://api.openai.com")
        self.assertIn("routing", result)
        self.assertIn("openai", result["routing"]["default_provider_pool"])

    def test_multiple_providers_detected(self):
        os.environ["OPENAI_API_KEY"] = "sk-openai"
        os.environ["ANTHROPIC_API_KEY"] = "sk-anthropic"
        os.environ["DEEPSEEK_API_KEY"] = "sk-deepseek"
        result = generate_config_from_env()
        names = list(result["providers"].keys())
        # OpenAI and Anthropic have priority 10, DeepSeek has 8.
        # OpenAI should come before DeepSeek.
        self.assertLess(names.index("openai"), names.index("deepseek"))
        self.assertLess(names.index("anthropic"), names.index("deepseek"))
        self.assertEqual(len(names), 3)

    def test_anthropic_format_set(self):
        os.environ["ANTHROPIC_API_KEY"] = "sk-anthropic"
        result = generate_config_from_env()
        provider = result["providers"]["anthropic"]
        formats = provider.get("formats", {})
        self.assertTrue(formats.get("anthropic_messages", {}).get("enabled"))
        self.assertFalse(formats.get("chat_completions", {}).get("enabled", False))

    def test_openai_formats_set(self):
        os.environ["OPENAI_API_KEY"] = "sk-openai"
        result = generate_config_from_env()
        provider = result["providers"]["openai"]
        formats = provider.get("formats", {})
        self.assertTrue(formats.get("chat_completions", {}).get("enabled"))
        self.assertTrue(formats.get("responses", {}).get("enabled"))

    def test_priority_is_set(self):
        os.environ["OPENAI_API_KEY"] = "sk-openai"
        result = generate_config_from_env()
        self.assertEqual(result["providers"]["openai"]["priority"], 10)

    def test_empty_env_var_ignored(self):
        os.environ["OPENAI_API_KEY"] = ""
        result = generate_config_from_env()
        self.assertEqual(result, {})

    def test_whitespace_only_env_var_ignored(self):
        os.environ["OPENAI_API_KEY"] = "   "
        result = generate_config_from_env()
        self.assertEqual(result, {})

    def test_all_preset_env_vars_have_unique_names(self):
        names = [preset["name"] for preset in PROVIDER_ENV_PRESETS.values()]
        self.assertEqual(len(names), len(set(names)))

    def test_all_preset_base_urls_are_non_empty(self):
        for preset in PROVIDER_ENV_PRESETS.values():
            self.assertTrue(preset["base_url"].startswith("https://"))


class ZeroConfigIntegrationTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = {}
        for key in PROVIDER_ENV_PRESETS:
            if key in os.environ:
                self._saved_env[key] = os.environ.pop(key)
        self._old_config_path = os.environ.get("PROXY_CONFIG_PATH")
        self._old_runtime_path = os.environ.get("PROXY_RUNTIME_CONFIG_PATH")
        self._temp_files = []

    def tearDown(self):
        for key in PROVIDER_ENV_PRESETS:
            os.environ.pop(key, None)
        for key, val in self._saved_env.items():
            os.environ[key] = val
        if self._old_config_path is None:
            os.environ.pop("PROXY_CONFIG_PATH", None)
        else:
            os.environ["PROXY_CONFIG_PATH"] = self._old_config_path
        if self._old_runtime_path is None:
            os.environ.pop("PROXY_RUNTIME_CONFIG_PATH", None)
        else:
            os.environ["PROXY_RUNTIME_CONFIG_PATH"] = self._old_runtime_path
        for path in self._temp_files:
            try:
                os.unlink(path)
            except OSError:
                pass

    def unused_path(self):
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        os.unlink(path)
        return path

    def test_zero_config_activates_when_no_config_file(self):
        """When no config.json exists and env vars are set, zero-config kicks in."""
        os.environ["PROXY_CONFIG_PATH"] = self.unused_path()
        os.environ["PROXY_RUNTIME_CONFIG_PATH"] = self.unused_path()
        os.environ["OPENAI_API_KEY"] = "sk-test"
        cfg = load_base_config(apply_env=False)
        import config_loader
        self.assertTrue(config_loader.ZERO_CONFIG_ACTIVE)
        self.assertIn("openai", cfg["providers"])
        self.assertNotIn("default", cfg["providers"])

    def test_zero_config_not_active_when_config_has_real_providers(self):
        """When config.json has real providers, zero-config does not activate."""
        fd, path = tempfile.mkstemp(suffix=".json")
        self._temp_files.append(path)
        with os.fdopen(fd, "w") as f:
            json.dump({"providers": {"alpha": {"base_url": "https://alpha.example", "keys": ["real-key"]}}}, f)
        os.environ["PROXY_CONFIG_PATH"] = path
        os.environ["PROXY_RUNTIME_CONFIG_PATH"] = self.unused_path()
        os.environ["OPENAI_API_KEY"] = "sk-test"
        cfg = load_base_config(apply_env=False)
        import config_loader
        self.assertFalse(config_loader.ZERO_CONFIG_ACTIVE)
        self.assertIn("alpha", cfg["providers"])
        self.assertNotIn("openai", cfg["providers"])

    def test_zero_config_not_active_when_no_env_vars(self):
        """When no env vars are set, zero-config does not activate."""
        os.environ["PROXY_CONFIG_PATH"] = self.unused_path()
        os.environ["PROXY_RUNTIME_CONFIG_PATH"] = self.unused_path()
        cfg = load_base_config(apply_env=False)
        import config_loader
        self.assertFalse(config_loader.ZERO_CONFIG_ACTIVE)

    def test_zero_config_providers_have_correct_formats(self):
        os.environ["PROXY_CONFIG_PATH"] = self.unused_path()
        os.environ["PROXY_RUNTIME_CONFIG_PATH"] = self.unused_path()
        os.environ["ANTHROPIC_API_KEY"] = "sk-anthropic"
        cfg = load_base_config(apply_env=False)
        provider = cfg["providers"]["anthropic"]
        self.assertTrue(provider["formats"]["anthropic_messages"]["enabled"])
        self.assertFalse(provider["formats"]["chat_completions"]["enabled"])

    def test_zero_config_pool_order_by_priority(self):
        os.environ["PROXY_CONFIG_PATH"] = self.unused_path()
        os.environ["PROXY_RUNTIME_CONFIG_PATH"] = self.unused_path()
        os.environ["DEEPSEEK_API_KEY"] = "sk-ds"
        os.environ["OPENAI_API_KEY"] = "sk-oai"
        cfg = load_base_config(apply_env=False)
        pool = cfg["routing"]["default_provider_pool"]
        # OpenAI (priority 10) should come before DeepSeek (priority 8)
        self.assertLess(pool.index("openai"), pool.index("deepseek"))


if __name__ == "__main__":
    unittest.main()
