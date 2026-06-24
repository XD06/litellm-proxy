import unittest

import model_registry


class FakeRouter:
    def __init__(self, provider="alpha"):
        self.provider = provider

    def first_healthy_key(self, provider):
        return f"{provider}-key"

    def first_healthy_provider(self):
        return self.provider


class FakeRouterWithKeyEntry(FakeRouter):
    def __init__(self, entry, provider="alpha"):
        super().__init__(provider)
        self.entry = entry

    def first_healthy_key_entry(self, provider):
        return 0, self.entry


class FakeUpstreamClient:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def fetch_models(self, base_url, models_path, headers, timeout_s=10, proxy_url=None):
        self.calls.append(
            {
                "base_url": base_url,
                "models_path": models_path,
                "headers": headers,
                "timeout_s": timeout_s,
                "proxy_url": proxy_url,
            }
        )
        response = self.responses.get(base_url)
        if isinstance(response, Exception):
            raise response
        return response


def registry_config(models_source="union"):
    return {
        "models": {
            "models_source": models_source,
            "provider_model_map": {},
            "provider_model_capabilities": {},
        },
        "providers": {
            "alpha": {
                "base_url": "https://alpha.example",
                "models_path": "/v1/models",
                "keys": ["alpha-key"],
                "enabled": True,
            },
            "beta": {
                "base_url": "https://beta.example",
                "models_path": "/v1/models",
                "keys": ["beta-key"],
                "enabled": True,
            },
        },
        "proxy": {},
    }


class ModelRegistryTests(unittest.TestCase):
    def setUp(self):
        model_registry.clear_cache()

    def tearDown(self):
        model_registry.clear_cache()

    def test_union_fetch_records_capabilities_without_mutating_provider_model_map(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_map"] = {"alpha": {"manual-model": "alpha-real"}}
        client = FakeUpstreamClient(
            {
                "https://alpha.example": {"data": [{"id": "deepseek-v4-flash"}]},
                "https://beta.example": {"data": [{"id": "v4-flash"}]},
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client)

        self.assertEqual([m["id"] for m in result["data"]], ["deepseek-v4-flash", "v4-flash"])
        self.assertEqual(model_registry.union_model_ids(), {"deepseek-v4-flash", "v4-flash"})
        self.assertEqual(cfg["models"]["provider_model_map"], {"alpha": {"manual-model": "alpha-real"}})

        caps = cfg["models"]["provider_model_capabilities"]
        self.assertEqual(caps["alpha"]["status"], "ok")
        self.assertEqual(caps["alpha"]["canonical_map"]["deepseek-v4-flash"], "deepseek-v4-flash")
        self.assertEqual(caps["beta"]["canonical_map"]["v4-flash"], "v4-flash")
        self.assertNotIn("deepseek-v4-flash", caps["beta"]["canonical_map"])

    def test_union_fetch_merges_safe_vendor_slash_ids(self):
        cfg = registry_config("union")
        client = FakeUpstreamClient(
            {
                "https://alpha.example": {"data": [{"id": "deepseek-v4-flash"}]},
                "https://beta.example": {"data": [{"id": "deepseek-ai/DeepSeek-V4-Flash"}]},
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client)

        self.assertEqual([m["id"] for m in result["data"]], ["deepseek-v4-flash"])
        self.assertEqual(
            cfg["models"]["provider_model_capabilities"]["beta"]["canonical_map"]["deepseek-v4-flash"],
            "deepseek-ai/DeepSeek-V4-Flash",
        )

    def test_union_fetch_normalizes_safe_case_and_separator_variants(self):
        cfg = registry_config("union")
        client = FakeUpstreamClient(
            {
                "https://alpha.example": {"data": [{"id": "deepseek-v4-flash"}]},
                "https://beta.example": {"data": [{"id": "deepseek-ai/DeepSeek_V4 Flash"}]},
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client)

        self.assertEqual([m["id"] for m in result["data"]], ["deepseek-v4-flash"])
        self.assertEqual(
            cfg["models"]["provider_model_capabilities"]["beta"]["canonical_map"]["deepseek-v4-flash"],
            "deepseek-ai/DeepSeek_V4 Flash",
        )

    def test_resolve_provider_model_prefers_manual_then_auto_capabilities(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_map"] = {"alpha": {"deepseek-v4-flash": "manual-alpha-model"}}
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["auto-alpha-model"],
                "canonical_map": {"deepseek-v4-flash": "auto-alpha-model"},
            },
            "beta": {
                "status": "ok",
                "models": ["deepseek-ai/DeepSeek-V4-Flash"],
                "canonical_map": {"deepseek-v4-flash": "deepseek-ai/DeepSeek-V4-Flash"},
            },
        }

        self.assertEqual(
            model_registry.resolve_provider_model(cfg, "alpha", "deepseek-v4-flash"),
            "manual-alpha-model",
        )
        self.assertEqual(
            model_registry.resolve_provider_model(cfg, "beta", "deepseek-v4-flash"),
            "deepseek-ai/DeepSeek-V4-Flash",
        )
        self.assertEqual(model_registry.resolve_provider_model(cfg, "beta", "unknown-model"), "unknown-model")

    def test_manual_provider_model_map_hides_auto_name_for_same_raw_model(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_map"] = {"alpha": {"client-alpha": "alpha/raw"}}
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["alpha/raw"],
                "canonical_map": {"auto-alpha": "alpha/raw"},
            },
        }

        payload = model_registry.rebuild_models_union_snapshot(cfg)
        ids = [item["id"] for item in payload["data"]]

        self.assertIn("client-alpha", ids)
        self.assertNotIn("auto-alpha", ids)
        self.assertTrue(model_registry.provider_supports_model(cfg, "alpha", "client-alpha"))
        self.assertFalse(model_registry.provider_supports_model(cfg, "alpha", "auto-alpha"))
        self.assertEqual(model_registry.resolve_provider_model(cfg, "alpha", "client-alpha"), "alpha/raw")

    def test_failed_union_fetch_records_error_without_exposing_keys(self):
        cfg = registry_config("union")
        client = FakeUpstreamClient(
            {
                "https://alpha.example": {"data": [{"id": "deepseek-v4-flash"}]},
                "https://beta.example": RuntimeError("network failed for beta-key"),
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client)

        self.assertEqual([m["id"] for m in result["data"]], ["deepseek-v4-flash"])
        beta_cap = cfg["models"]["provider_model_capabilities"]["beta"]
        self.assertEqual(beta_cap["status"], "error")
        self.assertNotIn("beta-key", beta_cap.get("error", ""))

    def test_models_fetch_falls_back_to_origin_when_base_url_has_path(self):
        cfg = registry_config("union")
        cfg["providers"]["alpha"]["base_url"] = "https://alpha.example/anthropic"
        client = FakeUpstreamClient(
            {
                "https://alpha.example/anthropic": None,
                "https://alpha.example": {"data": [{"id": "deepseek-v4-pro"}]},
                "https://beta.example": {"data": [{"id": "gpt-5.5"}]},
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client)

        self.assertIn("deepseek-v4-pro", [m["id"] for m in result["data"]])
        self.assertIn("gpt-5.5", [m["id"] for m in result["data"]])
        self.assertEqual(
            [c["base_url"] for c in client.calls if c["models_path"] == "/v1/models"][:2],
            ["https://alpha.example/anthropic", "https://alpha.example"],
        )

    def test_provider_refresh_records_only_selected_provider(self):
        cfg = registry_config("union")
        client = FakeUpstreamClient(
            {
                "https://alpha.example": {"data": [{"id": "alpha-model"}]},
                "https://beta.example": {"data": [{"id": "beta-model"}]},
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client, only_provider="alpha")

        self.assertEqual([m["id"] for m in result["data"]], ["alpha-model"])
        self.assertEqual([c["base_url"] for c in client.calls], ["https://alpha.example"])
        self.assertEqual(cfg["models"]["provider_model_capabilities"]["alpha"]["status"], "ok")
        self.assertNotIn("beta", cfg["models"]["provider_model_capabilities"])
        self.assertEqual(model_registry.union_model_ids(), {"alpha-model"})

    def test_provider_refresh_error_records_attempted_model_urls(self):
        cfg = registry_config("union")
        cfg["providers"]["alpha"]["base_url"] = "https://alpha.example/anthropic"
        client = FakeUpstreamClient(
            {
                "https://alpha.example/anthropic": RuntimeError("network failed for alpha-key"),
                "https://alpha.example": RuntimeError("HTTP 404"),
            }
        )

        model_registry.fetch_upstream_models(cfg, FakeRouter(), client, only_provider="alpha")

        cap = cfg["models"]["provider_model_capabilities"]["alpha"]
        self.assertEqual(cap["status"], "error")
        self.assertIn("https://alpha.example/anthropic/v1/models", cap["error"])
        self.assertIn("https://alpha.example/v1/models", cap["error"])
        self.assertNotIn("alpha-key", cap["error"])

    def test_static_models_fallback_records_live_fetch_error(self):
        cfg = registry_config("union")
        cfg["providers"]["alpha"]["base_url"] = "https://alpha.example/anthropic"
        cfg["providers"]["alpha"]["static_models"] = ["manual-model"]
        client = FakeUpstreamClient(
            {
                "https://alpha.example/anthropic": RuntimeError("network failed for alpha-key"),
                "https://alpha.example": RuntimeError("HTTP 404"),
            }
        )

        result = model_registry.fetch_upstream_models(cfg, FakeRouter(), client, only_provider="alpha")

        self.assertEqual([m["id"] for m in result["data"]], ["manual-model"])
        self.assertEqual(
            [c["base_url"] for c in client.calls],
            ["https://alpha.example/anthropic", "https://alpha.example"],
        )
        cap = cfg["models"]["provider_model_capabilities"]["alpha"]
        self.assertEqual(cap["status"], "ok")
        self.assertIn("using static_models fallback", cap["error"])
        self.assertIn("https://alpha.example/anthropic/v1/models", cap["error"])
        self.assertIn("https://alpha.example/v1/models", cap["error"])
        self.assertNotIn("alpha-key", cap["error"])

    def test_first_healthy_provider_fetches_and_caches_models(self):
        cfg = registry_config("first_healthy_provider")
        client = FakeUpstreamClient({"https://alpha.example": {"data": [{"id": "alpha-model"}]}})

        first = model_registry.fetch_upstream_models(cfg, FakeRouter("alpha"), client)
        second = model_registry.fetch_upstream_models(cfg, FakeRouter("alpha"), client)

        self.assertEqual(first["data"][0]["id"], "alpha-model")
        self.assertEqual(second["data"][0]["id"], "alpha-model")
        self.assertEqual(len(client.calls), 1)

    def test_models_from_capabilities_union_does_not_require_upstream_fetch(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["alpha/raw"],
                "canonical_map": {"alpha-model": "alpha/raw"},
                "formats": ["chat_completions"],
            },
            "beta": {
                "status": "ok",
                "models": ["beta/raw"],
                "canonical_map": {"beta-model": "beta/raw"},
                "formats": ["responses"],
            },
        }

        result = model_registry.models_from_capabilities(cfg, FakeRouter())

        self.assertEqual([m["id"] for m in result["data"]], ["alpha-model", "beta-model"])
        self.assertEqual(model_registry.union_model_ids(), {"alpha-model", "beta-model"})
        self.assertEqual(
            [m["id"] for m in cfg["models"]["models_union_snapshot"]["payload"]["data"]],
            ["alpha-model", "beta-model"],
        )

    def test_disabled_provider_model_is_excluded_only_for_that_provider(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["alpha/raw"],
                "canonical_map": {"shared-model": "alpha/raw"},
                "formats": ["chat_completions"],
            },
            "beta": {
                "status": "ok",
                "models": ["beta/raw"],
                "canonical_map": {"shared-model": "beta/raw"},
                "formats": ["chat_completions"],
            },
        }
        cfg["models"]["provider_model_disabled"] = {"alpha": {"shared-model": True}}

        result = model_registry.models_from_capabilities(cfg, FakeRouter())

        self.assertEqual([m["id"] for m in result["data"]], ["shared-model"])
        self.assertEqual(model_registry.union_model_ids(), {"shared-model"})

    def test_disabled_provider_model_removed_when_no_provider_remains(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "models": ["alpha/raw"],
                "canonical_map": {"shared-model": "alpha/raw"},
                "formats": ["chat_completions"],
            },
            "beta": {
                "status": "ok",
                "models": ["beta/raw"],
                "canonical_map": {"shared-model": "beta/raw"},
                "formats": ["chat_completions"],
            },
        }
        cfg["models"]["provider_model_disabled"] = {
            "alpha": {"shared-model": True},
            "beta": {"shared-model": True},
        }

        result = model_registry.models_from_capabilities(cfg, FakeRouter())

        self.assertNotIn("shared-model", [m["id"] for m in result["data"]])
        self.assertNotIn("shared-model", model_registry.union_model_ids())

    def test_models_from_capabilities_reads_current_persisted_union_snapshot(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "fetched_at": 123,
                "models": ["alpha/raw"],
                "canonical_map": {"alpha-model": "alpha/raw"},
                "formats": ["chat_completions"],
            }
        }
        first = model_registry.models_from_capabilities(cfg, FakeRouter())
        model_registry.clear_cache()

        second = model_registry.models_from_capabilities(cfg, FakeRouter())

        self.assertEqual([m["id"] for m in first["data"]], ["alpha-model"])
        self.assertEqual([m["id"] for m in second["data"]], ["alpha-model"])

    def test_provider_refresh_error_preserves_last_known_model_in_union_snapshot(self):
        cfg = registry_config("union")
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {
                "status": "ok",
                "fetched_at": 123,
                "models": ["alpha/raw"],
                "canonical_map": {"alpha-model": "alpha/raw"},
                "formats": ["chat_completions"],
            }
        }
        model_registry.rebuild_models_union_snapshot(cfg, FakeRouter())
        client = FakeUpstreamClient({"https://alpha.example": RuntimeError("network failed for alpha-key")})

        model_registry.fetch_upstream_models(cfg, FakeRouter(), client, only_provider="alpha")
        result = model_registry.models_from_capabilities(cfg, FakeRouter())

        self.assertEqual(cfg["models"]["provider_model_capabilities"]["alpha"]["status"], "error")
        self.assertEqual([m["id"] for m in result["data"]], ["alpha-model"])
        self.assertNotIn("alpha-key", cfg["models"]["provider_model_capabilities"]["alpha"]["error"])

    def test_models_from_capabilities_includes_configured_models(self):
        cfg = registry_config("union")
        cfg["providers"]["alpha"]["static_models"] = ["manual-alpha"]
        cfg["models"]["provider_model_map"] = {"beta": {"mapped-beta": "raw-beta"}}
        cfg["models"]["routes"] = {"routed-model": {"providers": ["alpha"]}}

        result = model_registry.models_from_capabilities(cfg, FakeRouter())

        self.assertEqual([m["id"] for m in result["data"]], ["manual-alpha", "mapped-beta", "routed-model"])

    def test_models_fetch_uses_key_proxy_before_provider_and_global_proxy(self):
        cfg = registry_config("union")
        cfg["proxy"] = "http://127.0.0.1:7000"
        cfg["providers"]["alpha"]["proxy"] = "http://127.0.0.1:8000"
        client = FakeUpstreamClient({"https://alpha.example": {"data": [{"id": "alpha-model"}]}})

        result = model_registry.fetch_upstream_models(
            cfg,
            FakeRouterWithKeyEntry({"key": "alpha-key-object", "proxy": "http://127.0.0.1:9000"}),
            client,
        )

        self.assertEqual(result["data"][0]["id"], "alpha-model")
        self.assertEqual(client.calls[0]["headers"]["Authorization"], "Bearer alpha-key-object")
        self.assertEqual(client.calls[0]["proxy_url"], "http://127.0.0.1:9000")

    def test_models_fetch_proxy_falls_back_to_provider_then_global(self):
        cfg = registry_config("union")
        cfg["proxy"] = "http://127.0.0.1:7000"
        cfg["providers"]["alpha"]["proxy"] = "http://127.0.0.1:8000"
        client = FakeUpstreamClient({"https://alpha.example": {"data": [{"id": "alpha-model"}]}})

        model_registry.fetch_upstream_models(cfg, FakeRouterWithKeyEntry("alpha-key-string"), client)
        self.assertEqual(client.calls[0]["proxy_url"], "http://127.0.0.1:8000")

        model_registry.clear_cache()
        cfg["providers"]["alpha"]["proxy"] = {}
        client = FakeUpstreamClient({"https://alpha.example": {"data": [{"id": "alpha-model"}]}})
        model_registry.fetch_upstream_models(cfg, FakeRouterWithKeyEntry("alpha-key-string"), client)
        self.assertEqual(client.calls[0]["proxy_url"], "http://127.0.0.1:7000")


if __name__ == "__main__":
    unittest.main()
