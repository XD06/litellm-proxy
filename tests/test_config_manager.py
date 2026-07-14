import json
import errno
import os
import tempfile
import threading
import unittest
from unittest.mock import patch

import config_manager
from config_loader import load_base_config, load_config


def base_config():
    return {
        "server": {"admin_key": "admin-secret"},
        "routing": {"default_provider_pool": ["alpha"], "max_attempts": 6, "connect_timeout_s": 30},
        "retry": {
            "retryable_status": [429, 500],
            "key_fatal_status": [401, 403],
            "respect_retry_after": True,
            "cooldown_s": {
                "rate_limit": 30,
                "server_error": 10,
                "network_error": 10,
                "key_invalid": 3600,
            },
        },
        "models": {"provider_model_capabilities": {}},
        "providers": {
            "alpha": {
                "base_url": "https://alpha.example",
                "keys": ["alpha-secret-key"],
                "enabled": True,
                "formats": {
                    "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                    "responses": {"enabled": False, "path": "/v1/responses"},
                    "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
                },
            }
        },
    }


class ConfigManagerTests(unittest.TestCase):
    def temp_paths(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        config_path = os.path.join(tmp.name, "config.json")
        overlay_path = os.path.join(tmp.name, "runtime_config.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(base_config(), f)
        return config_path, overlay_path

    def test_snapshot_revision_increases_after_committed_mutation(self):
        _config_path, overlay_path = self.temp_paths()
        manager = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        before = manager.snapshot()["revision"]
        epoch = manager.snapshot()["revision_epoch_ms"]
        manager.update_provider("alpha", {"skip_idle_probe": True})
        after = manager.snapshot()["revision"]

        self.assertGreater(after, before)
        self.assertEqual(manager.snapshot()["revision_epoch_ms"], epoch)

    def test_load_config_applies_runtime_overlay_before_env(self):
        config_path, overlay_path = self.temp_paths()
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "providers": {
                        "alpha": {"enabled": False},
                        "beta": {
                            "base_url": "https://beta.example/v1",
                            "keys": ["beta-secret-key"],
                        },
                    },
                    "server": {"admin_key": "runtime-admin"},
                    "routing": {"default_provider_pool": ["beta"]},
                },
                f,
            )

        old_config = os.environ.get("PROXY_CONFIG_PATH")
        old_overlay = os.environ.get("PROXY_RUNTIME_CONFIG_PATH")
        old_admin = os.environ.get("PROXY_ADMIN_KEY")
        try:
            os.environ["PROXY_CONFIG_PATH"] = config_path
            os.environ["PROXY_RUNTIME_CONFIG_PATH"] = overlay_path
            os.environ["PROXY_ADMIN_KEY"] = "env-admin"
            cfg = load_config()
        finally:
            self.restore_env("PROXY_CONFIG_PATH", old_config)
            self.restore_env("PROXY_RUNTIME_CONFIG_PATH", old_overlay)
            self.restore_env("PROXY_ADMIN_KEY", old_admin)

        self.assertFalse(cfg["providers"]["alpha"]["enabled"])
        self.assertEqual(cfg["providers"]["beta"]["base_url"], "https://beta.example")
        self.assertTrue(cfg["providers"]["beta"]["formats"]["chat_completions"]["enabled"])
        self.assertEqual(cfg["routing"]["default_provider_pool"], ["beta"])
        self.assertEqual(cfg["server"]["admin_key"], "env-admin")

    def test_load_base_config_excludes_runtime_overlay(self):
        config_path, overlay_path = self.temp_paths()
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "providers": {
                        "beta": {
                            "base_url": "https://beta.example/v1",
                            "keys": ["beta-secret-key"],
                        },
                    },
                    "routing": {"default_provider_pool": ["beta"]},
                },
                f,
            )

        old_config = os.environ.get("PROXY_CONFIG_PATH")
        old_overlay = os.environ.get("PROXY_RUNTIME_CONFIG_PATH")
        try:
            os.environ["PROXY_CONFIG_PATH"] = config_path
            os.environ["PROXY_RUNTIME_CONFIG_PATH"] = overlay_path
            base = load_base_config()
            merged = load_config()
        finally:
            self.restore_env("PROXY_CONFIG_PATH", old_config)
            self.restore_env("PROXY_RUNTIME_CONFIG_PATH", old_overlay)

        self.assertNotIn("beta", base["providers"])
        self.assertEqual(base["routing"]["default_provider_pool"], ["alpha"])
        self.assertIn("beta", merged["providers"])
        self.assertEqual(merged["routing"]["default_provider_pool"], ["beta"])

    def test_config_view_masks_keys_and_reports_overlay_path(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        view = mgr.snapshot()

        self.assertEqual(view["overlay_path"], overlay_path)
        self.assertEqual(view["retry"]["cooldown_s"]["rate_limit"], 30)
        self.assertTrue(view["providers"]["alpha"]["keys"][0]["key_id"])
        self.assertIn("masked", view["providers"]["alpha"]["keys"][0])
        self.assertNotIn("alpha-secret-key", json.dumps(view))

    def test_overlay_snapshot_preview_and_clear_are_safe(self):
        _config_path, overlay_path = self.temp_paths()
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "providers": {
                        "alpha": {"keys": ["overlay-alpha-secret"], "enabled": False},
                    },
                    "routing": {"max_attempts": 2},
                },
                f,
            )
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        overlay_view = mgr.overlay_snapshot()
        self.assertTrue(overlay_view["has_overlay"])
        self.assertNotIn("overlay-alpha-secret", json.dumps(overlay_view))
        self.assertIn("overla**cret", json.dumps(overlay_view))

        preview = mgr.preview_overlay({"routing": {"max_attempts": 4}})
        self.assertTrue(preview["valid"])
        self.assertEqual(preview["config"]["routing"]["max_attempts"], 4)
        self.assertEqual(mgr.config["routing"]["max_attempts"], 2)

        cleared = mgr.clear_overlay()
        self.assertFalse(mgr.overlay)
        self.assertEqual(mgr.config["routing"]["max_attempts"], 6)
        self.assertIn(".bak.", cleared["backup_path"])
        self.assertTrue(os.path.exists(cleared["backup_path"]))
        self.assertFalse(os.path.exists(overlay_path))

    def test_add_provider_without_priority_is_highest_priority(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["providers"]["alpha"]["priority"] = 10
        cfg["providers"]["beta"] = {
            "base_url": "https://beta.example",
            "keys": ["beta-secret-key"],
            "enabled": True,
            "priority": 3,
        }
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        updated = mgr.add_provider(
            "new-provider",
            {"base_url": "https://new.example", "keys": ["new-secret-key"], "enabled": True},
        )

        self.assertEqual(updated["providers"]["new-provider"]["priority"], 11)

    def test_add_provider_update_provider_key_and_format_write_overlay(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.add_provider(
            "beta",
            {
                "base_url": "https://beta.example/codex",
                "keys": ["beta-secret-key"],
                "enabled": True,
                "proxy": "http://127.0.0.1:8002",
            },
        )
        self.assertIn("beta", cfg["providers"])
        self.assertTrue(cfg["providers"]["beta"]["formats"]["responses"]["enabled"])

        cfg = mgr.update_provider(
            "beta",
            {
                "enabled": False,
                "proxy": "",
                "force_reasoning_content": True,
                "force_anthropic_thinking": True,
            },
        )
        self.assertFalse(cfg["providers"]["beta"]["enabled"])
        self.assertTrue(cfg["providers"]["beta"]["force_reasoning_content"])
        self.assertTrue(cfg["providers"]["beta"]["force_anthropic_thinking"])

        cfg = mgr.add_key("beta", "beta-second-secret")
        self.assertEqual(len(cfg["providers"]["beta"]["keys"]), 2)

        cfg = mgr.delete_key("beta", 0)
        self.assertEqual(cfg["providers"]["beta"]["keys"], ["beta-second-secret"])

        cfg = mgr.update_format("beta", "anthropic_messages", {"enabled": True, "path": "v1/messages"})
        self.assertTrue(cfg["providers"]["beta"]["formats"]["anthropic_messages"]["enabled"])
        self.assertEqual(cfg["providers"]["beta"]["formats"]["anthropic_messages"]["path"], "/v1/messages")

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay["providers"]["beta"]["keys"], ["beta-second-secret"])
        self.assertTrue(overlay["providers"]["beta"]["force_reasoning_content"])
        self.assertTrue(overlay["providers"]["beta"]["force_anthropic_thinking"])
        self.assertNotIn("alpha-secret-key", json.dumps(mgr.snapshot()))

    def test_write_overlay_falls_back_for_bind_mount_replace_busy(self):
        _config_path, overlay_path = self.temp_paths()
        with open(overlay_path, "w", encoding="utf-8") as f:
            f.write("{}\n")
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)
        busy_error = OSError(errno.EBUSY, "Device or resource busy")

        with patch("config_manager.os.replace", side_effect=busy_error):
            cfg = mgr.update_routing({"max_attempts": 3})

        self.assertEqual(cfg["routing"]["max_attempts"], 3)
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay["routing"]["max_attempts"], 3)

    def test_clear_overlay_falls_back_for_bind_mount_replace_busy(self):
        _config_path, overlay_path = self.temp_paths()
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump({"routing": {"max_attempts": 2}}, f)
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)
        busy_error = OSError(errno.EBUSY, "Device or resource busy")

        with patch("config_manager.os.replace", side_effect=busy_error):
            cleared = mgr.clear_overlay()

        self.assertEqual(mgr.config["routing"]["max_attempts"], 6)
        self.assertTrue(os.path.exists(cleared["backup_path"]))
        with open(cleared["backup_path"], "r", encoding="utf-8") as f:
            backup = json.load(f)
        self.assertEqual(backup["routing"]["max_attempts"], 2)
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay, {})

    def test_provider_name_accepts_unicode_letters_but_rejects_path_chars(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.add_provider(
            "商汤",
            {
                "base_url": "https://sense.example",
                "keys": ["sense-secret-key"],
                "enabled": True,
            },
        )

        self.assertIn("商汤", cfg["providers"])
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.add_provider("bad/name", {"base_url": "https://bad.example", "keys": ["k"]})

    def test_global_provider_and_key_proxy_updates_write_safe_overlay(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.update_global_proxy({"proxy": "http://127.0.0.1:7000"})
        self.assertEqual(
            cfg["proxy"],
            {"http": "http://127.0.0.1:7000", "https": "http://127.0.0.1:7000"},
        )

        cfg = mgr.update_provider("alpha", {"proxy": "http://127.0.0.1:8000"})
        self.assertEqual(
            cfg["providers"]["alpha"]["proxy"],
            {"http": "http://127.0.0.1:8000", "https": "http://127.0.0.1:8000"},
        )

        cfg = mgr.add_key("alpha", "alpha-second-secret", proxy="http://127.0.0.1:9000")
        self.assertEqual(cfg["providers"]["alpha"]["keys"][1]["key"], "alpha-second-secret")
        self.assertEqual(
            cfg["providers"]["alpha"]["keys"][1]["proxy"],
            {"http": "http://127.0.0.1:9000", "https": "http://127.0.0.1:9000"},
        )

        cfg = mgr.update_key("alpha", 0, {"proxy": "http://127.0.0.1:8500"})
        self.assertEqual(cfg["providers"]["alpha"]["keys"][0]["key"], "alpha-secret-key")
        self.assertEqual(
            cfg["providers"]["alpha"]["keys"][0]["proxy"],
            {"http": "http://127.0.0.1:8500", "https": "http://127.0.0.1:8500"},
        )

        snapshot = mgr.snapshot()
        self.assertEqual(snapshot["providers"]["alpha"]["proxy"], "http://127.0.0.1:8000")
        self.assertEqual(snapshot["providers"]["alpha"]["keys"][0]["proxy"], "http://127.0.0.1:8500")
        self.assertEqual(snapshot["providers"]["alpha"]["keys"][1]["proxy"], "http://127.0.0.1:9000")
        self.assertNotIn("alpha-secret-key", json.dumps(snapshot))
        self.assertNotIn("alpha-second-secret", json.dumps(snapshot))

        cfg = mgr.update_key("alpha", 0, {"proxy": ""})
        self.assertEqual(cfg["providers"]["alpha"]["keys"][0], "alpha-secret-key")

        cfg = mgr.delete_key("alpha", 1)
        self.assertEqual(len(cfg["providers"]["alpha"]["keys"]), 1)
        self.assertEqual(cfg["providers"]["alpha"]["keys"][0], "alpha-secret-key")

        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.delete_key("alpha", 9)

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay["proxy"]["https"], "http://127.0.0.1:7000")
        self.assertEqual(overlay["providers"]["alpha"]["proxy"]["https"], "http://127.0.0.1:8000")
        self.assertEqual(overlay["providers"]["alpha"]["keys"][0], "alpha-secret-key")
        self.assertEqual(len(overlay["providers"]["alpha"]["keys"]), 1)
        self.assertNotIn("alpha-second-secret", json.dumps(mgr.overlay_snapshot()))

    def test_key_model_map_survives_proxy_update_and_is_exposed_without_secret(self):
        _config_path, overlay_path = self.temp_paths()
        base = base_config()
        base["providers"]["alpha"]["keys"] = [
            {"key": "alpha-secret-key", "models": {"grok-4.3": "grok-4.3-high"}}
        ]
        mgr = config_manager.RuntimeConfigManager(base, overlay_path=overlay_path)

        cfg = mgr.update_key("alpha", 0, {"proxy": "http://127.0.0.1:8500"})
        self.assertEqual(cfg["providers"]["alpha"]["keys"][0]["models"], {"grok-4.3": "grok-4.3-high"})

        cfg = mgr.update_key("alpha", 0, {"models": {"grok-4.3": "grok-4.3-low"}})
        self.assertEqual(cfg["providers"]["alpha"]["keys"][0]["models"], {"grok-4.3": "grok-4.3-low"})
        snapshot = mgr.snapshot()
        self.assertEqual(snapshot["providers"]["alpha"]["keys"][0]["models"], {"grok-4.3": "grok-4.3-low"})
        self.assertNotIn("alpha-secret-key", json.dumps(snapshot))

    def test_empty_key_model_filter_is_not_persisted_with_proxy(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.update_key(
            "alpha",
            0,
            {"proxy": "http://127.0.0.1:8500", "models": {}},
        )

        self.assertEqual(cfg["providers"]["alpha"]["keys"][0]["key"], "alpha-secret-key")
        self.assertNotIn("models", cfg["providers"]["alpha"]["keys"][0])

    def test_provider_model_variants_are_priority_normalized(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.update_provider_model_variants(
            "alpha",
            model="grok-4.3",
            variants=[
                {"model": "grok-4.3-low", "priority": 10},
                {"model": "grok-4.3-high", "priority": 100},
            ],
        )

        self.assertEqual(
            cfg["models"]["provider_model_variants"]["alpha"]["grok-4.3"],
            [
                {"model": "grok-4.3-high", "priority": 100},
                {"model": "grok-4.3-low", "priority": 10},
            ],
        )

    def test_deleting_base_provider_model_variants_persists_tombstone(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["models"]["provider_model_variants"] = {
            "alpha": {
                "grok-4.3": [
                    {"model": "grok-4.3-high", "priority": 100},
                    {"model": "grok-4.3-low", "priority": 10},
                ]
            }
        }
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        updated = mgr.update_provider_model_variants("alpha", model="grok-4.3", variants=[])

        self.assertNotIn(
            "grok-4.3",
            (updated["models"].get("provider_model_variants") or {}).get("alpha", {}),
        )
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertIsNone(
            overlay["models"]["provider_model_variants"]["alpha"]["grok-4.3"]
        )
        reloaded = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)
        self.assertNotIn(
            "grok-4.3",
            (reloaded.config["models"].get("provider_model_variants") or {}).get("alpha", {}),
        )

    def test_enabling_base_disabled_model_persists_tombstone(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["models"]["provider_model_disabled"] = {"alpha": {"legacy-model": True}}
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        updated = mgr.update_provider_model_disabled("alpha", "legacy-model", False)

        self.assertNotIn(
            "legacy-model",
            (updated["models"].get("provider_model_disabled") or {}).get("alpha", {}),
        )
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertIsNone(
            overlay["models"]["provider_model_disabled"]["alpha"]["legacy-model"]
        )
        reloaded = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)
        self.assertNotIn(
            "legacy-model",
            (reloaded.config["models"].get("provider_model_disabled") or {}).get("alpha", {}),
        )

    def test_bulk_enabling_base_disabled_models_persists_tombstones(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["models"]["provider_model_disabled"] = {
            "alpha": {"legacy-a": True, "legacy-b": True}
        }
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        updated = mgr.update_provider_models_disabled(
            "alpha",
            {"legacy-a": False, "legacy-b": False},
        )

        self.assertEqual(
            (updated["models"].get("provider_model_disabled") or {}).get("alpha", {}),
            {},
        )
        reloaded = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)
        self.assertEqual(
            (reloaded.config["models"].get("provider_model_disabled") or {}).get("alpha", {}),
            {},
        )

    def test_delete_key_accepts_display_index_from_sparse_key_entries(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["providers"]["alpha"]["keys"] = [
            {"index": 0, "key": "alpha-first-secret"},
            {"index": 2, "key": "alpha-third-secret"},
        ]
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        updated = mgr.delete_key("alpha", 2)

        self.assertEqual(len(updated["providers"]["alpha"]["keys"]), 1)
        self.assertEqual(updated["providers"]["alpha"]["keys"][0]["key"], "alpha-first-secret")

    def test_update_routing_and_retry_write_overlay(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.update_routing(
            {
                "default_provider_pool": "alpha,beta,alpha",
                "provider_select": "priority_failover",
                "max_attempts": 3,
                "connect_timeout_s": 5,
                "read_timeout_s": 60,
                "first_token_timeout_s": 2,
            }
        )
        self.assertEqual(cfg["routing"]["default_provider_pool"], ["alpha", "beta"])
        self.assertEqual(cfg["routing"]["provider_select"], "priority_failover")
        self.assertEqual(cfg["routing"]["max_attempts"], 3)

        cfg = mgr.update_retry(
            {
                "retryable_status": "429,500,502",
                "key_fatal_status": [401],
                "respect_retry_after": False,
                "same_key_retries": 1,
                "key_failure_ladder_s": [10, 60, 3600],
                "cooldown_s": {"rate_limit": 12, "server_error": 4, "quota_or_balance": 7200},
            }
        )
        self.assertEqual(cfg["retry"]["retryable_status"], [429, 500, 502])
        self.assertEqual(cfg["retry"]["key_fatal_status"], [401])
        self.assertFalse(cfg["retry"]["respect_retry_after"])
        self.assertEqual(cfg["retry"]["same_key_retries"], 1)
        self.assertEqual(cfg["retry"]["key_failure_ladder_s"], [10, 60, 3600])
        self.assertEqual(cfg["retry"]["cooldown_s"]["rate_limit"], 12)
        self.assertEqual(cfg["retry"]["cooldown_s"]["network_error"], 10)
        self.assertEqual(cfg["retry"]["cooldown_s"]["quota_or_balance"], 7200)

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay["routing"]["max_attempts"], 3)
        self.assertEqual(overlay["retry"]["cooldown_s"]["server_error"], 4)
        self.assertEqual(overlay["retry"]["same_key_retries"], 1)
        self.assertEqual(overlay["retry"]["key_failure_ladder_s"], [10, 60, 3600])

    def test_update_provider_model_mapping_writes_overlay(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.update_provider_model_mapping(
            "alpha",
            old_model="auto-alpha",
            model="client-alpha",
            raw_model="vendor/alpha",
        )

        self.assertEqual(cfg["models"]["provider_model_map"]["alpha"]["client-alpha"], "vendor/alpha")
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay["models"]["provider_model_map"]["alpha"]["client-alpha"], "vendor/alpha")

        cfg = mgr.update_provider_model_mapping(
            "alpha",
            old_model="client-alpha",
            model="",
            raw_model="vendor/alpha",
        )

        self.assertNotIn("alpha", cfg["models"].get("provider_model_map") or {})

    def test_update_provider_model_mapping_allows_multiple_canonical_for_same_raw(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)
        mgr.update_provider_model_mapping(
            "alpha",
            old_model="auto-alpha",
            model="client-alpha",
            raw_model="vendor/alpha",
        )

        cfg = mgr.update_provider_model_mapping(
            "alpha",
            model="renamed-alpha",
            raw_model="vendor/alpha",
        )

        pmap = cfg["models"]["provider_model_map"]["alpha"]
        self.assertEqual(pmap["client-alpha"], "vendor/alpha")
        self.assertEqual(pmap["renamed-alpha"], "vendor/alpha")

    def test_update_provider_model_mapping_tombstones_base_config_entry(self):
        """When renaming a mapping that exists in base config, the old name
        must be tombstoned (None) in the overlay so it doesn't resurrect
        on the next _deep_merge."""
        _config_path, overlay_path = self.temp_paths()
        base = base_config()
        base["models"]["provider_model_map"] = {
            "alpha": {"old-name": "vendor/alpha"}
        }
        mgr = config_manager.RuntimeConfigManager(base, overlay_path=overlay_path)

        cfg = mgr.update_provider_model_mapping(
            "alpha",
            old_model="old-name",
            model="new-name",
            raw_model="vendor/alpha",
        )

        # Merged config should have new-name but NOT old-name
        pmap = cfg["models"]["provider_model_map"]["alpha"]
        self.assertEqual(pmap["new-name"], "vendor/alpha")
        self.assertNotIn("old-name", pmap)

        # Overlay should have a tombstone for old-name
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        overlay_pmap = overlay["models"]["provider_model_map"]["alpha"]
        self.assertIsNone(overlay_pmap["old-name"])
        self.assertEqual(overlay_pmap["new-name"], "vendor/alpha")

    def test_update_failure_policy_write_overlay(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        cfg = mgr.update_failure_policy(
            {
                "error_type": "server_error",
                "cooldown_scope": "provider",
                "cooldown_s": 99,
                "provider_cooldown_s": 25,
                "disables_key": True,
            }
        )
        policy = cfg["retry"]["failure_policies"]["server_error"]
        self.assertEqual(policy["cooldown_scope"], "provider")
        self.assertEqual(policy["cooldown_s"], 0)
        self.assertEqual(policy["provider_cooldown_s"], 25)
        self.assertFalse(policy["disables_key"])

        cfg = mgr.update_failure_policy(
            {
                "error_type": "network_error",
                "cooldown_scope": "key_provider",
                "cooldown_s": 12,
                "provider_cooldown_s": 0,
                "disables_key": False,
            }
        )
        policy = cfg["retry"]["failure_policies"]["network_error"]
        self.assertEqual(policy["cooldown_scope"], "key_provider")
        self.assertEqual(policy["cooldown_s"], 12)
        self.assertEqual(policy["provider_cooldown_s"], 12)

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertEqual(overlay["retry"]["failure_policies"]["server_error"]["provider_cooldown_s"], 25)
        self.assertEqual(overlay["retry"]["failure_policies"]["network_error"]["cooldown_s"], 12)

    def test_update_and_delete_model_route_write_overlay(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["providers"]["beta"] = {
            "base_url": "https://beta.example",
            "keys": ["beta-secret-key"],
            "enabled": True,
        }
        cfg["models"]["routes"] = {
            "base-model": {
                "providers": [{"name": "alpha", "weight": 1}],
                "provider_select": "round_robin",
            }
        }
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        updated = mgr.update_model_route(
            {
                "model": "deepseek-v4-flash",
                "providers": "alpha:2:40, beta",
                "provider_select": "priority_failover",
            }
        )
        route = updated["models"]["routes"]["deepseek-v4-flash"]
        self.assertEqual(
            route,
            {
                "providers": [{"name": "alpha", "weight": 2, "priority": 40}, {"name": "beta", "weight": 1}],
                "provider_select": "priority_failover",
            },
        )

        updated = mgr.update_model_route(
            {
                "model": "gpt-5.5",
                "providers": [{"name": "beta", "weight": 3, "priority": 25}],
                "provider_select": "priority_failover",
            }
        )
        self.assertEqual(updated["models"]["routes"]["gpt-5.5"]["providers"][0]["weight"], 3)
        self.assertEqual(updated["models"]["routes"]["gpt-5.5"]["providers"][0]["priority"], 25)
        self.assertEqual(updated["models"]["routes"]["gpt-5.5"]["provider_select"], "priority_failover")

        deleted = mgr.delete_model_route("base-model")
        self.assertNotIn("base-model", deleted["models"]["routes"])

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertIsNone(overlay["models"]["routes"]["base-model"])
        self.assertEqual(overlay["models"]["routes"]["deepseek-v4-flash"]["provider_select"], "priority_failover")

    def test_delete_provider_cleans_routes_pool_and_model_metadata(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["routing"]["default_provider_pool"] = ["alpha", "beta"]
        cfg["providers"]["beta"] = {
            "base_url": "https://beta.example",
            "keys": ["beta-secret-key"],
            "enabled": True,
        }
        cfg["models"]["routes"] = {
            "shared-model": {
                "providers": [{"name": "alpha", "weight": 1}, {"name": "beta", "weight": 2}],
                "provider_select": "weighted_rr",
            },
            "beta-only": {
                "providers": [{"name": "beta", "weight": 1}],
                "provider_select": "round_robin",
            },
        }
        cfg["models"]["provider_model_map"] = {"beta": {"shared-model": "beta-model"}}
        cfg["models"]["provider_model_disabled"] = {"beta": {"shared-model": True}}
        cfg["models"]["provider_model_capabilities"] = {
            "beta": {
                "status": "ok",
                "models": ["shared-model"],
                "canonical_map": {"shared-model": "beta-model"},
            }
        }
        cfg["models"]["provider_key_model_capabilities"] = {
            "beta": {"fingerprint": {"status": "ok", "models": ["beta-model"]}}
        }
        cfg["models"]["provider_model_variants"] = {
            "beta": {"shared-model": [{"model": "beta-model", "priority": 10}]}
        }
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        deleted = mgr.delete_provider("beta")

        self.assertNotIn("beta", deleted["providers"])
        self.assertEqual(deleted["routing"]["default_provider_pool"], ["alpha"])
        self.assertEqual(
            deleted["models"]["routes"]["shared-model"]["providers"],
            [{"name": "alpha", "weight": 1}],
        )
        self.assertNotIn("beta-only", deleted["models"]["routes"])
        self.assertNotIn("beta", deleted["models"]["provider_model_map"])
        self.assertNotIn("beta", deleted["models"]["provider_model_capabilities"])
        self.assertNotIn("beta", deleted["models"]["provider_model_disabled"])
        self.assertNotIn("beta", deleted["models"]["provider_key_model_capabilities"])
        self.assertNotIn("beta", deleted["models"]["provider_model_variants"])

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertIsNone(overlay["providers"]["beta"])
        self.assertIsNone(overlay["models"]["routes"]["beta-only"])
        self.assertIsNone(overlay["models"]["provider_model_map"]["beta"])
        self.assertIsNone(overlay["models"]["provider_model_capabilities"]["beta"])
        self.assertIsNone(overlay["models"]["provider_model_disabled"]["beta"])
        self.assertIsNone(overlay["models"]["provider_key_model_capabilities"]["beta"])
        self.assertIsNone(overlay["models"]["provider_model_variants"]["beta"])

    def test_delete_overlay_only_provider_removes_overlay_entry(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)
        mgr.add_provider("beta", {"base_url": "https://beta.example", "keys": ["beta-secret-key"]})

        deleted = mgr.delete_provider("beta")

        self.assertNotIn("beta", deleted["providers"])
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertNotIn("beta", overlay.get("providers") or {})

    def test_compact_overlay_prunes_stale_tombstones_only(self):
        _config_path, overlay_path = self.temp_paths()
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "providers": {"alpha": None, "modelscope": None},
                    "models": {
                        "routes": {"old-model": None},
                        "provider_model_map": {"ghost": None},
                        "provider_model_capabilities": {"ghost": None},
                    },
                },
                f,
            )
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        mgr.compact_overlay()

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertIsNone(overlay["providers"]["alpha"])
        self.assertNotIn("modelscope", overlay.get("providers") or {})
        self.assertNotIn("routes", overlay.get("models") or {})
        self.assertNotIn("provider_model_map", overlay.get("models") or {})
        self.assertNotIn("provider_model_capabilities", overlay.get("models") or {})

    def test_compact_overlay_removes_legacy_capability_snapshots(self):
        _config_path, overlay_path = self.temp_paths()
        cfg = base_config()
        cfg["models"]["provider_model_capabilities"] = {
            "alpha": {"status": "ok", "fetched_at": 10, "models": ["base-model"]}
        }
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "models": {
                        "provider_model_capabilities": {
                            "alpha": None,
                            "legacy": {"status": "ok", "fetched_at": 1, "models": ["old-model"]},
                        },
                        "provider_key_model_capabilities": {
                            "legacy": {"old-key": {"status": "ok", "models": ["old-model"]}}
                        },
                        "models_union_snapshot": {"status": "ok", "model_ids": ["old-model"]},
                    }
                },
                f,
            )
        mgr = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)

        mgr.compact_overlay()

        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        models = overlay.get("models") or {}
        self.assertEqual(models.get("provider_model_capabilities"), {"alpha": None})
        self.assertNotIn("provider_key_model_capabilities", models)
        self.assertNotIn("models_union_snapshot", models)

    def test_rejects_invalid_provider_updates(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.add_provider("bad/name", {"base_url": "https://bad.example", "keys": ["k"]})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.add_provider("missing_keys", {"base_url": "https://bad.example"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_format("alpha", "unknown_format", {"enabled": True})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_routing({"provider_select": "sticky"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_routing({"max_attempts": 0})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_retry({"retryable_status": "abc"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_retry({"cooldown_s": {"unknown": 1}})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_failure_policy({"error_type": "unknown_new", "cooldown_scope": "key"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_failure_policy({"error_type": "server_error", "cooldown_scope": "sticky"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_failure_policy({"error_type": "server_error", "cooldown_scope": "key", "cooldown_s": 86401})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_failure_policy({"error_type": "server_error", "cooldown_scope": "provider", "provider_cooldown_s": 301})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_model_route({"model": "m", "providers": "missing:1"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_model_route({"model": "m", "providers": "alpha:0"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_model_route({"model": "m", "providers": "alpha:1, alpha:2"})
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_model_route({"model": "m", "providers": "alpha", "provider_select": "sticky"})

    def test_concurrent_overlay_commits_no_lost_update(self):
        """Two threads concurrently mutate the overlay via _commit_overlay.

        Without the commit lock, both threads start from the same overlay
        snapshot and the second writer silently overwrites the first (lost
        update). With the lock, all mutations are serialized and persisted.
        """
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)

        # Each thread adds a distinct provider via the public API, which goes
        # through _commit_overlay internally.
        def add_provider(name):
            mgr.add_provider(name, {"base_url": f"https://{name}.example", "keys": [f"{name}-key"]})

        threads = [threading.Thread(target=add_provider, args=(name,))
                   for name in ("beta", "gamma", "delta")]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # All three providers must be present in the in-memory config.
        cfg = mgr.snapshot()
        self.assertIn("beta", cfg["providers"])
        self.assertIn("gamma", cfg["providers"])
        self.assertIn("delta", cfg["providers"])

        # All three must also be persisted to disk (no lost write).
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = json.load(f)
        self.assertIn("beta", overlay["providers"])
        self.assertIn("gamma", overlay["providers"])
        self.assertIn("delta", overlay["providers"])

    @staticmethod
    def restore_env(name, value):
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value


    def test_update_format_validates_output_token_field(self):
        _config_path, overlay_path = self.temp_paths()
        mgr = config_manager.RuntimeConfigManager(base_config(), overlay_path=overlay_path)
        cfg = mgr.update_format("alpha", "chat_completions", {"parameters": {"output_token_field": "max_completion_tokens"}})
        self.assertEqual(cfg["providers"]["alpha"]["formats"]["chat_completions"]["parameters"]["output_token_field"], "max_completion_tokens")
        with self.assertRaises(config_manager.ConfigValidationError):
            mgr.update_format("alpha", "responses", {"parameters": {"output_token_field": "max_tokens"}})


if __name__ == "__main__":
    unittest.main()
