import json
import os
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch, MagicMock

import sse2json
import config_manager
from observability import ProxyObservability
from router import Attempt


class FakeRouter:
    def __init__(self):
        self.calls = []

    def iter_attempts(self, canonical_model, is_stream, request_id, client_headers=None, **kwargs):
        _ = canonical_model, is_stream, request_id, client_headers, kwargs
        yield Attempt(
            request_id=request_id,
            attempt_no=1,
            provider="alpha",
            key_index=0,
            key="raw-alpha-key",
            url="https://alpha.example/v1/chat/completions",
            headers={"Authorization": "Bearer raw-alpha-key"},
            provider_model="alpha-model",
            upstream_format="chat_completions",
        )

    def report_success(self, attempt):
        _ = attempt

    def report_failure(self, attempt, **kwargs):
        _ = attempt, kwargs

    def masked_key(self, key):
        _ = key
        return "masked"

    def snapshot(self):
        return {"providers": {"alpha": {"enabled": True, "keys": [{"index": 0, "key_id": "kid"}]}}}

    def set_provider_enabled(self, provider, enabled):
        self.calls.append(("set_provider_enabled", provider, enabled))
        return provider == "alpha"

    def clear_provider_cooldown(self, provider):
        self.calls.append(("clear_provider_cooldown", provider))
        return provider == "alpha"

    def set_key_enabled(self, provider, key_index, enabled):
        self.calls.append(("set_key_enabled", provider, key_index, enabled))
        return provider == "alpha" and key_index == 0

    def clear_key_state(self, provider, key_index=None):
        self.calls.append(("clear_key_state", provider, key_index))
        return provider == "alpha" and (key_index is None or key_index == 0)


class FakeClient:
    def request_json(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
        _ = url, headers, payload, proxy_url, remaining_timeout_s
        return {
            "id": "chatcmpl_1",
            "model": "alpha-model",
            "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
        }

    def fetch_models(self, base_url, models_path, headers, timeout_s=10, proxy_url=None):
        _ = models_path, headers, timeout_s, proxy_url
        if "beta.example" in str(base_url):
            return {"data": [{"id": "beta-model"}]}
        return {"data": [{"id": "alpha-model"}]}


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        self._original_audit = sse2json.AUDIT
        sse2json.AUDIT = sse2json.AdminAuditStore({"observability": {"audit": {"enabled": False}}})
        sse2json.OBSERVABILITY.reset()
        self.server = HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        sse2json.OBSERVABILITY.reset()
        sse2json.AUDIT = self._original_audit

    def get_json(self, path, headers=None):
        req = Request(self.base_url + path, headers=headers or {}, method="GET")
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except HTTPError as e:
            try:
                return e.code, json.loads(e.read())
            finally:
                e.close()

    def post_json(self, path, payload=None, headers=None):
        req = Request(
            self.base_url + path,
            data=json.dumps(payload or {}).encode("utf-8"),
            headers=headers or {"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except HTTPError as e:
            try:
                return e.code, json.loads(e.read())
            finally:
                e.close()

    def patch_json(self, path, payload=None, headers=None):
        req = Request(
            self.base_url + path,
            data=json.dumps(payload or {}).encode("utf-8"),
            headers=headers or {"Content-Type": "application/json"},
            method="PATCH",
        )
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except HTTPError as e:
            try:
                return e.code, json.loads(e.read())
            finally:
                e.close()

    def get_raw(self, path, headers=None):
        req = Request(self.base_url + path, headers=headers or {}, method="GET")
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except HTTPError as e:
            try:
                return e.code, dict(e.headers), e.read()
            finally:
                e.close()

    def temp_overlay_path(self):
        fd, path = tempfile.mkstemp(suffix=".runtime.json")
        os.close(fd)
        os.unlink(path)

        def cleanup():
            if os.path.exists(path):
                os.unlink(path)

        self.addCleanup(cleanup)
        return path

    @contextmanager
    def runtime_config(self, manager):
        originals = {
            "CONFIG": sse2json.CONFIG,
            "CONFIG_MANAGER": sse2json.CONFIG_MANAGER,
            "ROUTER": sse2json.ROUTER,
            "UPSTREAM_CLIENT": sse2json.UPSTREAM_CLIENT,
            "OBSERVABILITY": sse2json.OBSERVABILITY,
            "AUDIT": sse2json.AUDIT,
        }
        sse2json.CONFIG = manager.config
        sse2json.CONFIG_MANAGER = manager
        sse2json.AUDIT = sse2json.AdminAuditStore(manager.config)
        sse2json._refresh_model_mapping_globals()
        try:
            yield
        finally:
            for name, value in originals.items():
                setattr(sse2json, name, value)
            sse2json._refresh_model_mapping_globals()

    def test_admin_requires_configured_key(self):
        cfg = {"server": {"admin_key": ""}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            status, body = self.get_json("/-/admin/status")

        self.assertEqual(status, 403)
        self.assertEqual(body["error"]["message"], "admin auth required")

    def test_admin_status_is_lightweight_and_models_capabilities_are_separate(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "observability": {"recent_requests_limit": 10},
            "models": {
                "models_source": "union",
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 123,
                        "models": ["alpha-model"],
                        "canonical_map": {"alpha-model": "alpha-model"},
                        "formats": ["chat_completions"],
                    },
                    "ghost": {
                        "status": "pending",
                        "fetched_at": 456,
                        "models": ["ghost-model"],
                        "canonical_map": {"ghost-model": "ghost-model"},
                        "formats": ["chat_completions"],
                    }
                },
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                    "formats": {
                        "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                        "responses": {"enabled": False, "path": "/v1/responses"},
                        "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
                    },
                }
            },
        }
        router = sse2json.UpstreamRouter(cfg)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router):
            status, body = self.get_json("/-/admin/status", headers={"X-Admin-Key": "admin-secret"})
            models_status, models_body = self.get_json(
                "/-/admin/models/capabilities",
                headers={"X-Admin-Key": "admin-secret"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")
        self.assertIn("metrics", body)
        self.assertIn("router", body)
        self.assertIn("policy", body)
        self.assertNotIn("models", body)
        self.assertIn("rule_table", body["policy"])
        self.assertEqual(body["policy"]["failure_policies"]["empty_visible_output"]["cooldown_scope"], "none")
        self.assertEqual(models_status, 200)
        self.assertEqual(models_body["providers"]["alpha"]["status"], "ok")
        self.assertNotIn("ghost", models_body["providers"])
        self.assertNotIn("raw-alpha-key", json.dumps(body))
        self.assertNotIn("raw-alpha-key", json.dumps(models_body))

    def test_provider_activity_can_include_events_for_provider_cards(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "observability": {"recent_requests_limit": 10},
            "providers": {
                "alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True}
            },
            "models": {"disable_client_model_map": True, "provider_model_capabilities": {}},
        }
        obs = ProxyObservability(cfg)
        obs.record_request_start(
            "req-provider-activity",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="alpha-model",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_first_byte("req-provider-activity", 123)
        obs.record_attempt(
            "req-provider-activity",
            Attempt(
                request_id="req-provider-activity",
                attempt_no=1,
                provider="alpha",
                key_index=0,
                key="raw-alpha-key",
                url="https://alpha.example/v1/chat/completions",
                headers={},
                provider_model="alpha-model",
                upstream_format="chat_completions",
            ),
            outcome="success",
        )
        obs.record_request_end("req-provider-activity", status_code=200)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "OBSERVABILITY", obs):
            status, body = self.get_json(
                "/-/admin/provider-activity?include_events=1&limit=24",
                headers={"X-Admin-Key": "admin-secret"},
            )
            light_status, light_body = self.get_json(
                "/-/admin/provider-activity?limit=24",
                headers={"X-Admin-Key": "admin-secret"},
            )

        self.assertEqual(status, 200)
        self.assertIn("alpha", body["providers"])
        self.assertEqual(body["providers"]["alpha"]["total"], 1)
        self.assertEqual(body["providers"]["alpha"]["events"][0]["requestId"], "req-provider-activity")
        self.assertEqual(body["providers"]["alpha"]["events"][0]["tone"], "ok")
        self.assertEqual(light_status, 200)
        self.assertIn("alpha", light_body["providers"])
        self.assertNotIn("events", light_body["providers"]["alpha"])
        self.assertNotIn("raw-alpha-key", json.dumps(body))
        self.assertNotIn("raw-alpha-key", json.dumps(light_body))

    def test_admin_metrics_accepts_bearer_token(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            status, body = self.get_json(
                "/-/admin/metrics",
                headers={"Authorization": "Bearer admin-secret"},
            )

        self.assertEqual(status, 200)
        self.assertIn("counters", body)

    def test_proxy_test_requires_proxy_url(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with patch.object(sse2json, "CONFIG", cfg):
            status, body = self.post_json("/-/admin/proxy/test", {"proxy": ""}, headers=headers)

        self.assertEqual(status, 200)
        self.assertFalse(body["result"]["ok"])
        self.assertIn("proxy is required", body["result"]["error"])

    def test_proxy_test_uses_proxy_manager(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}
        fake_response = MagicMock()
        fake_response.status = 204
        fake_manager = MagicMock()
        fake_manager.request.return_value = fake_response

        with patch.object(sse2json, "CONFIG", cfg), patch("urllib3.ProxyManager", return_value=fake_manager) as proxy_manager:
            status, body = self.post_json(
                "/-/admin/proxy/test",
                {"proxy": "http://127.0.0.1:7890", "target": "https://example.com/ping", "timeout_s": 2},
                headers=headers,
            )

        self.assertEqual(status, 200)
        self.assertTrue(body["result"]["ok"])
        self.assertEqual(body["result"]["status"], 204)
        proxy_manager.assert_called_once()
        fake_manager.request.assert_called_once_with("GET", "https://example.com/ping", preload_content=False)
        fake_response.release_conn.assert_called_once()

    def test_admin_query_auth_key_is_not_returned_as_filter(self):
        cfg = {"server": {"admin_key": "admin-secret", "allow_query_admin_key": True}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            status, body = self.get_json("/-/admin/requests?admin_key=admin-secret&provider=alpha")

        self.assertEqual(status, 200)
        self.assertEqual(body["filters"], {"provider": "alpha"})
        self.assertNotIn("admin-secret", json.dumps(body))

    def test_admin_query_auth_disabled_by_default(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            status, _ = self.get_json("/-/admin/requests?admin_key=admin-secret&provider=alpha")

        self.assertEqual(status, 403)

    def test_admin_routing_returns_router_and_policy(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"max_attempts": 3, "connect_timeout_s": 1, "read_timeout_s": 2},
            "retry": {
                "retryable_status": [429, 500],
                "key_fatal_status": [401],
                "failure_policies": {
                    "server_error": {"cooldown_scope": "provider", "provider_cooldown_s": 20}
                },
            },
            "providers": {},
            "models": {},
        }

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", FakeRouter()):
            status, body = self.get_json("/-/admin/routing", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(status, 200)
        self.assertIn("router", body)
        self.assertEqual(body["policy"]["max_attempts"], 3)
        self.assertIn("400_404_model_not_found", body["policy"]["rules"])
        self.assertIn("failure_policies", body["policy"])
        self.assertEqual(body["policy"]["failure_policies"]["server_error"]["cooldown_scope"], "provider")
        self.assertEqual(body["policy"]["failure_policies"]["server_error"]["provider_cooldown_s"], 20)
        self.assertTrue(any(rule["match"] == "HTTP 200 empty visible output" for rule in body["policy"]["rule_table"]))

    def test_admin_mutations_require_auth_and_do_not_execute(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}
        router = FakeRouter()

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router):
            status, body = self.post_json("/-/admin/providers/alpha/disable")

        self.assertEqual(status, 403)
        self.assertEqual(body["error"]["message"], "admin auth required")
        self.assertEqual(router.calls, [])

    def test_admin_can_disable_enable_provider_and_clear_cooldown(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "providers": {"alpha": {"keys": ["raw-alpha-key"], "enabled": True}},
            "models": {},
        }
        router = FakeRouter()
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router):
            disable_status, disable_body = self.post_json("/-/admin/providers/alpha/disable", headers=headers)
            enable_status, enable_body = self.post_json("/-/admin/providers/alpha/enable", headers=headers)
            clear_status, clear_body = self.post_json("/-/admin/providers/alpha/cooldown/clear", headers=headers)
            missing_status, missing_body = self.post_json("/-/admin/providers/missing/disable", headers=headers)

        self.assertEqual(disable_status, 200)
        self.assertEqual(disable_body["action"], "provider_disabled")
        self.assertIn("router", disable_body)
        self.assertEqual(enable_status, 200)
        self.assertEqual(enable_body["action"], "provider_enabled")
        self.assertEqual(clear_status, 200)
        self.assertEqual(clear_body["action"], "provider_cooldown_cleared")
        self.assertEqual(missing_status, 404)
        self.assertIn("unknown provider", missing_body["error"]["message"])
        self.assertNotIn("raw-alpha-key", json.dumps([disable_body, enable_body, clear_body, missing_body]))

    def test_admin_can_disable_enable_key_and_clear_state(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "providers": {"alpha": {"keys": ["raw-alpha-key"], "enabled": True}},
            "models": {},
        }
        router = FakeRouter()
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router):
            disable_status, disable_body = self.post_json("/-/admin/providers/alpha/keys/0/disable", headers=headers)
            enable_status, enable_body = self.post_json("/-/admin/providers/alpha/keys/0/enable", headers=headers)
            clear_status, clear_body = self.post_json("/-/admin/providers/alpha/keys/0/state/clear", headers=headers)
            bad_status, bad_body = self.post_json("/-/admin/providers/alpha/keys/9/disable", headers=headers)

        self.assertEqual(disable_status, 200)
        self.assertEqual(disable_body["action"], "key_disabled")
        self.assertEqual(enable_status, 200)
        self.assertEqual(enable_body["action"], "key_enabled")
        self.assertEqual(clear_status, 200)
        self.assertEqual(clear_body["action"], "key_state_cleared")
        self.assertEqual(bad_status, 404)
        self.assertIn("unknown key", bad_body["error"]["message"])
        self.assertNotIn("raw-alpha-key", json.dumps([disable_body, enable_body, clear_body, bad_body]))

    def test_admin_models_refresh_clears_cache_and_fetches_models(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"provider_model_capabilities": {}},
            "providers": {
                "alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True}
            },
        }
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        def fake_fetch_models():
            cfg["models"]["provider_model_capabilities"] = {
                "alpha": {
                    "status": "ok",
                    "fetched_at": 456,
                    "models": ["alpha-model"],
                    "canonical_map": {"alpha-model": "alpha-model"},
                    "formats": ["chat_completions"],
                }
            }
            return {"data": [{"id": "alpha-model"}]}

        # When MODEL_DISCOVERY_QUEUE is available, refresh is async (non-blocking).
        mock_queue = MagicMock()
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "MODEL_DISCOVERY_QUEUE", mock_queue
        ), patch.object(sse2json, "_enabled_provider_names", return_value=["alpha"]), patch.object(
            sse2json, "_mark_provider_models_pending"
        ) as mock_pending:
            status, body = self.post_json("/-/admin/models/refresh", headers=headers)

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "models_refreshed")
        # Async: all providers enqueued for background discovery
        mock_queue.enqueue_all.assert_called_once_with(force=True)
        mock_pending.assert_called_once_with("alpha")

    def test_admin_provider_models_refresh_refreshes_one_provider(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"provider_model_capabilities": {}},
            "providers": {"alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True}},
        }
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        # Async refresh: the endpoint enqueues to the discovery queue instead
        # of blocking on upstream I/O.  The provider is marked "pending" and
        # the queue fetches in the background.
        mock_queue = MagicMock()
        with patch.object(sse2json, "CONFIG", cfg), patch.object(
            sse2json, "MODEL_DISCOVERY_QUEUE", mock_queue
        ):
            status, body = self.post_json("/-/admin/providers/alpha/models/refresh", headers=headers)

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "provider_models_refreshed")
        self.assertEqual(body["provider"], "alpha")
        # Provider should be marked pending (async refresh in progress)
        self.assertEqual(body["models"]["providers"]["alpha"]["status"], "pending")
        # Discovery queue was enqueued with force=True
        mock_queue.enqueue.assert_called_once_with("alpha", force=True)

    def test_admin_provider_models_refresh_unknown_provider(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"provider_model_capabilities": {}},
            "providers": {},
        }
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}
        with patch.object(sse2json, "CONFIG", cfg):
            status, body = self.post_json("/-/admin/providers/missing/models/refresh", headers=headers)

        self.assertEqual(status, 404)
        self.assertIn("unknown provider", body["error"]["message"])

    def test_admin_provider_models_disabled_updates_config(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {
                "models_source": "union",
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 456,
                        "models": ["alpha/raw"],
                        "canonical_map": {"alpha-model": "alpha/raw"},
                        "formats": ["chat_completions"],
                    }
                },
            },
            "providers": {"alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True}},
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager):
            status, body = self.patch_json(
                "/-/admin/providers/alpha/models/disabled",
                {"models": {"alpha-model": True}},
                headers=headers,
            )
            models_status, models_body = self.get_json("/v1/models")

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "provider_models_disabled_updated")
        self.assertTrue(manager.config["models"]["provider_model_disabled"]["alpha"]["alpha-model"])
        self.assertEqual(models_status, 200)
        self.assertNotIn("alpha-model", [m["id"] for m in models_body["data"]])

    def test_admin_provider_model_mapping_renames_auto_model(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {
                "models_source": "union",
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 456,
                        "models": ["alpha/raw"],
                        "canonical_map": {"alpha-model": "alpha/raw"},
                        "formats": ["chat_completions"],
                    }
                },
            },
            "providers": {"alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True}},
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager):
            status, body = self.patch_json(
                "/-/admin/providers/alpha/models/map",
                {"old_model": "alpha-model", "model": "client-alpha", "raw_model": "alpha/raw"},
                headers=headers,
            )
            models_status, models_body = self.get_json("/v1/models")

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "provider_model_mapping_updated")
        self.assertEqual(manager.config["models"]["provider_model_map"]["alpha"]["client-alpha"], "alpha/raw")
        self.assertEqual(models_status, 200)
        model_ids = [m["id"] for m in models_body["data"]]
        self.assertIn("client-alpha", model_ids)
        self.assertNotIn("alpha-model", model_ids)

    def test_client_models_uses_saved_capabilities_without_upstream_fetch(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {
                "models_source": "union",
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "fetched_at": 456,
                        "models": ["alpha/raw"],
                        "canonical_map": {"alpha-model": "alpha/raw"},
                        "formats": ["chat_completions"],
                    }
                },
            },
            "providers": {"alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True}},
        }
        router = sse2json.UpstreamRouter(cfg)
        sse2json.model_registry.clear_cache()

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router), patch.object(
            sse2json, "fetch_upstream_models", side_effect=AssertionError("client /v1/models must not fetch upstream")
        ):
            status, body = self.get_json("/v1/models")

        self.assertEqual(status, 200)
        self.assertEqual([m["id"] for m in body["data"]], ["alpha-model"])

    def test_metrics_record_successful_proxy_request(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True},
            "observability": {"recent_requests_limit": 10},
            "providers": {"alpha": {"pricing": {"input_per_million": 1.0, "output_per_million": 2.0}}},
            "routing": {"connect_timeout_s": 1, "read_timeout_s": 1, "max_attempts": 1},
        }
        obs = ProxyObservability(cfg)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", FakeRouter()), patch.object(
            sse2json, "UPSTREAM_CLIENT", FakeClient()
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.post_json(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )
            metrics_status, metrics = self.get_json("/-/admin/metrics", headers={"X-Admin-Key": "admin-secret"})
            # /-/admin/metrics is the lightweight poll payload (no recent_requests);
            # /-/admin/metrics/full carries the full ring for the requests view.
            full_status, full_metrics = self.get_json("/-/admin/metrics/full", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(status, 200)
        self.assertEqual(body["choices"][0]["message"]["content"], "ok")
        self.assertEqual(metrics_status, 200)
        self.assertEqual(full_status, 200)
        self.assertEqual(metrics["counters"]["requests_total"], 1)
        self.assertEqual(metrics["counters"]["requests_success"], 1)
        self.assertEqual(metrics["counters"]["attempts_success"], 1)
        self.assertEqual(metrics["counters"]["request_failure_rate"], 0.0)
        self.assertEqual(metrics["counters"]["attempt_failure_rate"], 0.0)
        self.assertEqual(metrics["failure_summary"]["failed_attempts"], 0)
        self.assertEqual(metrics["counters"]["usage"]["input_tokens"], 4)
        self.assertEqual(metrics["counters"]["usage"]["output_tokens"], 6)
        self.assertEqual(metrics["counters"]["usage"]["total_tokens"], 10)
        self.assertAlmostEqual(metrics["counters"]["usage"]["cost_usd"], 0.000016)
        # The lightweight metrics payload intentionally omits recent_requests.
        self.assertNotIn("recent_requests", metrics)
        self.assertEqual(full_metrics["recent_requests"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertAlmostEqual(full_metrics["recent_requests"][0]["cost_usd"], 0.000016)
        self.assertEqual(full_metrics["recent_requests"][0]["attempts"][0]["provider"], "alpha")
        self.assertEqual(full_metrics["recent_requests"][0]["attempts"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(full_metrics["recent_requests"][0]["attempts"][0]["key_masked"], "raw-al**-key")
        self.assertNotIn("raw-alpha-key", json.dumps(full_metrics))

    def test_admin_requests_list_detail_and_timeseries(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True},
            "observability": {"recent_requests_limit": 10},
            "providers": {"alpha": {"pricing": {"input_per_million": 1.0, "output_per_million": 2.0}}},
            "routing": {"connect_timeout_s": 1, "read_timeout_s": 1, "max_attempts": 1},
        }
        headers = {"X-Admin-Key": "admin-secret"}
        obs = ProxyObservability(cfg)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", FakeRouter()), patch.object(
            sse2json, "UPSTREAM_CLIENT", FakeClient()
        ), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(sse2json, "DISABLE_MAP", True):
            status, body = self.post_json(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )
            self.assertEqual(status, 200)
            _ = body
            list_status, listed = self.get_json("/-/admin/requests?provider=alpha&status=success", headers=headers)
            request_id = listed["items"][0]["request_id"]
            detail_status, detail = self.get_json(f"/-/admin/requests/{request_id}", headers=headers)
            series_status, series = self.get_json("/-/admin/metrics/timeseries?bucket_s=60&buckets=1", headers=headers)

        self.assertEqual(list_status, 200)
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["filters"]["provider"], "alpha")
        self.assertEqual(listed["items"][0]["providers"], ["alpha"])
        self.assertEqual(listed["items"][0]["attempt_outcomes"], ["success"])
        self.assertEqual(listed["items"][0]["status"], "success")
        self.assertEqual(listed["items"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(detail_status, 200)
        self.assertEqual(detail["state"], "finished")
        self.assertEqual(detail["request_id"], request_id)
        self.assertEqual(detail["attempts"][0]["provider"], "alpha")
        self.assertEqual(detail["attempts"][0]["usage"], {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})
        self.assertEqual(detail["attempts"][0]["key_masked"], "raw-al**-key")
        self.assertEqual(series_status, 200)
        self.assertEqual(series["source"], "memory")
        self.assertEqual(series["buckets"][0]["requests"], 1)
        self.assertEqual(series["buckets"][0]["usage"]["total_tokens"], 10)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["usage"]["output_tokens"], 6)
        self.assertEqual(series["buckets"][0]["duration_ms_count"], 1)
        self.assertEqual(series["buckets"][0]["by_provider"]["alpha"]["success"], 1)
        self.assertNotIn("raw-alpha-key", json.dumps([listed, detail, series]))

    def test_admin_requests_can_use_sqlite_history(self):
        db_path = self.temp_overlay_path() + ".sqlite3"
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True},
            "observability": {
                "recent_requests_limit": 10,
                "history": {"enabled": True, "path": db_path, "retention_days": 30, "sync_mode": True},
            },
            "providers": {"alpha": {"pricing": {"input_per_million": 1.0, "output_per_million": 2.0}}},
            "routing": {"connect_timeout_s": 1, "read_timeout_s": 1, "max_attempts": 1},
        }
        headers = {"X-Admin-Key": "admin-secret"}
        obs = ProxyObservability(cfg)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(
            sse2json, "ROUTER", FakeRouter()
        ), patch.object(sse2json, "UPSTREAM_CLIENT", FakeClient()), patch.object(sse2json, "DISABLE_MAP", True):
            status, _body = self.post_json(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )
            list_status, listed = self.get_json("/-/admin/requests?provider=alpha&status=success", headers=headers)
            request_id = listed["items"][0]["request_id"]
            detail_status, detail = self.get_json(f"/-/admin/requests/{request_id}", headers=headers)
            series_status, series = self.get_json("/-/admin/metrics/timeseries?bucket_s=60&buckets=1", headers=headers)

        self.assertEqual(status, 200)
        self.assertEqual(list_status, 200)
        self.assertEqual(listed["source"], "sqlite")
        self.assertEqual(listed["total"], 1)
        self.assertEqual(detail_status, 200)
        self.assertEqual(detail["state"], "finished")
        self.assertEqual(detail["attempts"][0]["key_masked"], "raw-al**-key")
        self.assertEqual(series_status, 200)
        self.assertEqual(series["source"], "sqlite")
        self.assertEqual(series["buckets"][0]["requests"], 1)
        self.assertEqual(listed["items"][0]["usage"]["total_tokens"], 10)
        self.assertEqual(detail["usage"]["input_tokens"], 4)
        self.assertEqual(series["buckets"][0]["usage"]["output_tokens"], 6)
        self.assertNotIn("raw-alpha-key", json.dumps([listed, detail, series]))

    def test_admin_can_clear_request_history_and_diagnostics(self):
        db_path = self.temp_overlay_path() + ".sqlite3"
        diagnostics_path = self.temp_overlay_path() + ".jsonl"
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True},
            "observability": {
                "recent_requests_limit": 10,
                "history": {"enabled": True, "path": db_path, "retention_days": 30, "sync_mode": True},
                "diagnostics": {"enabled": True, "path": diagnostics_path},
            },
            "providers": {"alpha": {"pricing": {"input_per_million": 1.0, "output_per_million": 2.0}}},
            "routing": {"connect_timeout_s": 1, "read_timeout_s": 1, "max_attempts": 1},
        }
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}
        obs = ProxyObservability(cfg)
        with open(diagnostics_path, "w", encoding="utf-8") as f:
            f.write('{"request_id":"old"}\n')

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "OBSERVABILITY", obs), patch.object(
            sse2json, "ROUTER", FakeRouter()
        ), patch.object(sse2json, "UPSTREAM_CLIENT", FakeClient()), patch.object(sse2json, "DISABLE_MAP", True):
            status, _body = self.post_json(
                "/v1/chat/completions",
                {"model": "client-model", "messages": [{"role": "user", "content": "hello"}]},
            )
            before_status, before = self.get_json("/-/admin/requests", headers={"X-Admin-Key": "admin-secret"})
            bad_status, bad_body = self.post_json(
                "/-/admin/requests/clear",
                {"confirm": "wrong"},
                headers=headers,
            )
            clear_status, cleared = self.post_json(
                "/-/admin/requests/clear",
                {"confirm": "clear_request_history", "include_diagnostics": True},
                headers=headers,
            )
            after_status, after = self.get_json("/-/admin/requests", headers={"X-Admin-Key": "admin-secret"})
            metrics_status, metrics = self.get_json("/-/admin/metrics", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(status, 200)
        self.assertEqual(before_status, 200)
        self.assertEqual(before["total"], 1)
        self.assertEqual(bad_status, 400)
        self.assertIn("clear_request_history", bad_body["error"]["message"])
        self.assertEqual(clear_status, 200)
        self.assertEqual(cleared["action"], "request_history_cleared")
        self.assertEqual(cleared["history"]["requests_deleted"], 1)
        self.assertTrue(cleared["diagnostics"]["cleared"])
        self.assertEqual(after_status, 200)
        self.assertEqual(after["total"], 0)
        self.assertEqual(metrics_status, 200)
        self.assertEqual(metrics["counters"]["requests_total"], 0)
        with open(diagnostics_path, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "")

    def test_admin_can_delete_selected_request_records(self):
        db_path = self.temp_overlay_path() + ".sqlite3"
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True},
            "observability": {
                "recent_requests_limit": 10,
                "history": {"enabled": True, "path": db_path, "retention_days": 30, "sync_mode": True},
            },
            "providers": {},
        }
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}
        obs = ProxyObservability(cfg)
        for rid in ("req-keep", "req-delete"):
            obs.record_request_start(
                rid,
                client_format="chat_completions",
                endpoint="chat_completions",
                model=rid,
                stream=False,
                path="/v1/chat/completions",
            )
            obs.record_attempt(
                rid,
                Attempt(
                    request_id=rid,
                    attempt_no=1,
                    provider="alpha",
                    key_index=0,
                    key="raw-alpha-key",
                    url="https://alpha.example/v1/chat/completions",
                    headers={"Authorization": "Bearer raw-alpha-key"},
                    provider_model="alpha-model",
                    upstream_format="chat_completions",
                ),
                outcome="success",
            )
            obs.record_request_end(rid, status_code=200)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "OBSERVABILITY", obs):
            bad_status, bad_body = self.post_json(
                "/-/admin/requests/delete",
                {"confirm": "wrong", "request_ids": ["req-delete"]},
                headers=headers,
            )
            delete_status, deleted = self.post_json(
                "/-/admin/requests/delete",
                {"confirm": "delete_request_records", "request_ids": ["req-delete", "missing"]},
                headers=headers,
            )
            list_status, listed = self.get_json("/-/admin/requests", headers={"X-Admin-Key": "admin-secret"})
            missing_status, _missing = self.get_json("/-/admin/requests/req-delete", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(bad_status, 400)
        self.assertIn("delete_request_records", bad_body["error"]["message"])
        self.assertEqual(delete_status, 200)
        self.assertEqual(deleted["action"], "request_records_deleted")
        self.assertEqual(deleted["history"]["requests_deleted"], 1)
        self.assertEqual(deleted["memory"]["recent_requests_deleted"], 1)
        self.assertEqual(list_status, 200)
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["request_id"], "req-keep")
        self.assertEqual(missing_status, 404)

    def test_admin_can_delete_matching_request_records(self):
        db_path = self.temp_overlay_path() + ".sqlite3"
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True},
            "observability": {
                "recent_requests_limit": 10,
                "history": {"enabled": True, "path": db_path, "retention_days": 30, "sync_mode": True},
            },
            "providers": {},
        }
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}
        obs = ProxyObservability(cfg)
        for rid, provider, status_code in (
            ("req-keep", "alpha", 200),
            ("req-delete", "beta", 502),
            ("req-beta-ok", "beta", 200),
        ):
            obs.record_request_start(
                rid,
                client_format="chat_completions",
                endpoint="chat_completions",
                model=rid,
                stream=False,
                path="/v1/chat/completions",
            )
            obs.record_attempt(
                rid,
                Attempt(
                    request_id=rid,
                    attempt_no=1,
                    provider=provider,
                    key_index=0,
                    key="raw-alpha-key",
                    url="https://alpha.example/v1/chat/completions",
                    headers={"Authorization": "Bearer raw-alpha-key"},
                    provider_model="alpha-model",
                    upstream_format="chat_completions",
                ),
                outcome="success" if status_code < 400 else "failed",
                error_type="" if status_code < 400 else "server_error",
                http_status=None if status_code < 400 else 502,
            )
            obs.record_request_end(rid, status_code=status_code)

        before_total = obs.snapshot()["counters"]["requests_total"]
        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "OBSERVABILITY", obs):
            bad_status, bad_body = self.post_json(
                "/-/admin/requests/delete-matching",
                {"confirm": "delete_matching_request_records", "filters": {}},
                headers=headers,
            )
            delete_status, deleted = self.post_json(
                "/-/admin/requests/delete-matching",
                {"confirm": "delete_matching_request_records", "filters": {"provider": "beta", "status": "failed"}},
                headers=headers,
            )
            list_status, listed = self.get_json("/-/admin/requests", headers={"X-Admin-Key": "admin-secret"})
            metrics_status, metrics = self.get_json("/-/admin/metrics", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(bad_status, 400)
        self.assertIn("at least one filter", bad_body["error"]["message"])
        self.assertEqual(delete_status, 200)
        self.assertEqual(deleted["action"], "request_matching_records_deleted")
        self.assertEqual(deleted["history"]["requests_deleted"], 1)
        self.assertEqual(deleted["memory"]["recent_requests_deleted"], 1)
        self.assertEqual(list_status, 200)
        self.assertEqual(listed["total"], 2)
        self.assertCountEqual([item["request_id"] for item in listed["items"]], ["req-beta-ok", "req-keep"])
        self.assertEqual(metrics_status, 200)
        self.assertEqual(metrics["counters"]["requests_total"], before_total)

    def test_admin_request_detail_returns_404_for_missing_request(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            status, body = self.get_json("/-/admin/requests/missing", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(status, 404)
        self.assertIn("unknown request", body["error"]["message"])

    def test_admin_config_view_and_mutations_update_runtime_config(self):
        audit_path = self.temp_overlay_path()
        cfg = {
            "server": {"admin_key": "admin-secret", "max_workers": 5},
            "routing": {"default_provider_pool": ["alpha"]},
            "models": {"disable_client_model_map": True, "provider_model_capabilities": {}},
            "observability": {"audit": {"path": audit_path, "max_records": 200}},
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager):
            view_status, view = self.get_json("/-/admin/config", headers={"X-Admin-Key": "admin-secret"})
            add_status, add_body = self.post_json(
                "/-/admin/providers",
                {
                    "name": "beta",
                    "base_url": "https://beta.example/codex",
                    "keys": ["beta-secret-key"],
                },
                headers=headers,
            )
            patch_status, patch_body = self.patch_json(
                "/-/admin/providers/beta",
                {"enabled": False, "proxy": "http://127.0.0.1:8002"},
                headers=headers,
            )
            global_proxy_status, global_proxy_body = self.patch_json(
                "/-/admin/proxy",
                {"proxy": "http://127.0.0.1:7000"},
                headers=headers,
            )
            key_status, key_body = self.post_json(
                "/-/admin/providers/beta/keys",
                {"key": "beta-second-secret", "proxy": "http://127.0.0.1:9000"},
                headers=headers,
            )
            key_patch_status, key_patch_body = self.patch_json(
                "/-/admin/providers/beta/keys/0",
                {"proxy": "http://127.0.0.1:8500"},
                headers=headers,
            )
            key_delete_bad_status, key_delete_bad_body = self.post_json(
                "/-/admin/providers/beta/keys/0/delete",
                {"confirm": "wrong"},
                headers=headers,
            )
            key_delete_status, key_delete_body = self.post_json(
                "/-/admin/providers/beta/keys/0/delete",
                {"confirm": "delete_key"},
                headers=headers,
            )
            fmt_status, fmt_body = self.patch_json(
                "/-/admin/providers/beta/formats/anthropic_messages",
                {"enabled": True, "path": "v1/messages"},
                headers=headers,
            )
            routing_status, routing_body = self.patch_json(
                "/-/admin/routing",
                {"max_attempts": 3, "provider_select": "random", "connect_timeout_s": 4},
                headers=headers,
            )
            retry_status, retry_body = self.patch_json(
                "/-/admin/retry",
                {
                    "retryable_status": "429,500,502",
                    "respect_retry_after": False,
                    "same_key_retries": 1,
                    "key_failure_ladder_s": [10, 60, 3600],
                    "cooldown_s": {"rate_limit": 12, "quota_or_balance": 7200},
                },
                headers=headers,
            )
            failure_policy_status, failure_policy_body = self.patch_json(
                "/-/admin/retry/failure-policies",
                {
                    "error_type": "server_error",
                    "cooldown_scope": "provider",
                    "cooldown_s": 99,
                    "provider_cooldown_s": 25,
                    "disables_key": True,
                },
                headers=headers,
            )
            route_status, route_body = self.patch_json(
                "/-/admin/models/routes",
                {
                    "model": "deepseek-v4-flash",
                    "providers": "alpha:1, beta:2",
                    "provider_select": "weighted_rr",
                },
                headers=headers,
            )
            route_delete_status, route_delete_body = self.post_json(
                "/-/admin/models/routes/delete",
                {"model": "deepseek-v4-flash"},
                headers=headers,
            )
            provider_delete_status, provider_delete_body = self.post_json(
                "/-/admin/providers/beta/delete",
                {"confirm": "delete_provider"},
                headers=headers,
            )
            audit_status, audit_body = self.get_json("/-/admin/audit?limit=20", headers={"X-Admin-Key": "admin-secret"})

        self.assertEqual(view_status, 200)
        self.assertEqual(view["server"]["admin_key"], "***")
        self.assertIn("retry", view)
        self.assertNotIn("raw-alpha-key", json.dumps(view))
        self.assertEqual(add_status, 200)
        self.assertEqual(add_body["action"], "provider_added")
        self.assertEqual(patch_status, 200)
        self.assertEqual(patch_body["action"], "provider_updated")
        self.assertEqual(global_proxy_status, 200)
        self.assertEqual(global_proxy_body["action"], "global_proxy_updated")
        self.assertEqual(key_status, 200)
        self.assertEqual(key_body["action"], "key_added")
        self.assertEqual(key_patch_status, 200)
        self.assertEqual(key_patch_body["action"], "key_updated")
        self.assertEqual(key_delete_bad_status, 400)
        self.assertIn("delete_key", key_delete_bad_body["error"]["message"])
        self.assertEqual(key_delete_status, 200)
        self.assertEqual(key_delete_body["action"], "key_deleted")
        self.assertEqual(len(key_delete_body["config"]["providers"]["beta"]["keys"]), 1)
        self.assertEqual(key_delete_body["config"]["providers"]["beta"]["keys"][0]["index"], 0)
        self.assertEqual(fmt_status, 200)
        self.assertEqual(fmt_body["action"], "format_updated")
        self.assertEqual(routing_status, 200)
        self.assertEqual(routing_body["action"], "routing_updated")
        self.assertEqual(retry_status, 200)
        self.assertEqual(retry_body["action"], "retry_updated")
        self.assertEqual(failure_policy_status, 200)
        self.assertEqual(failure_policy_body["action"], "failure_policy_updated")
        self.assertEqual(
            failure_policy_body["config"]["retry"]["failure_policies"]["server_error"],
            {
                "cooldown_scope": "provider",
                "cooldown_s": 0,
                "provider_cooldown_s": 25,
                "disables_key": False,
            },
        )
        self.assertEqual(route_status, 200)
        self.assertEqual(route_body["action"], "model_route_updated")
        self.assertEqual(
            route_body["config"]["models"]["routes"]["deepseek-v4-flash"]["providers"],
            [{"name": "alpha", "weight": 1}, {"name": "beta", "weight": 2}],
        )
        self.assertEqual(route_delete_status, 200)
        self.assertEqual(route_delete_body["action"], "model_route_deleted")
        self.assertNotIn("deepseek-v4-flash", route_delete_body["config"]["models"]["routes"])
        self.assertEqual(provider_delete_status, 200)
        self.assertEqual(provider_delete_body["action"], "provider_deleted")
        self.assertNotIn("beta", provider_delete_body["config"]["providers"])
        self.assertNotIn("beta", manager.config["providers"])
        self.assertEqual(manager.config["proxy"]["https"], "http://127.0.0.1:7000")
        self.assertEqual(manager.config["routing"]["max_attempts"], 3)
        self.assertEqual(manager.config["retry"]["retryable_status"], [429, 500, 502])
        self.assertFalse(manager.config["retry"]["respect_retry_after"])
        self.assertEqual(manager.config["retry"]["same_key_retries"], 1)
        self.assertEqual(manager.config["retry"]["key_failure_ladder_s"], [10, 60, 3600])
        self.assertEqual(manager.config["retry"]["cooldown_s"]["rate_limit"], 12)
        self.assertEqual(manager.config["retry"]["cooldown_s"]["quota_or_balance"], 7200)
        self.assertEqual(manager.config["retry"]["failure_policies"]["server_error"]["cooldown_scope"], "provider")
        self.assertNotIn(
            "beta-secret-key",
            json.dumps(
                [
                    add_body,
                    patch_body,
                    global_proxy_body,
                    key_body,
                    key_patch_body,
                    key_delete_bad_body,
                    key_delete_body,
                    fmt_body,
                    routing_body,
                    retry_body,
                    failure_policy_body,
                    route_body,
                    route_delete_body,
                    provider_delete_body,
                ]
            ),
        )
        self.assertEqual(audit_status, 200)
        audit_actions = [item["action"] for item in audit_body["items"]]
        self.assertIn("provider_added", audit_actions)
        self.assertIn("provider_updated", audit_actions)
        self.assertIn("global_proxy_updated", audit_actions)
        self.assertIn("key_added", audit_actions)
        self.assertIn("key_updated", audit_actions)
        self.assertIn("key_deleted", audit_actions)
        self.assertIn("format_updated", audit_actions)
        self.assertIn("routing_updated", audit_actions)
        self.assertIn("retry_updated", audit_actions)
        self.assertIn("failure_policy_updated", audit_actions)
        self.assertIn("model_route_updated", audit_actions)
        self.assertIn("model_route_deleted", audit_actions)
        self.assertIn("provider_deleted", audit_actions)
        self.assertNotIn("beta-secret-key", json.dumps(audit_body))
        self.assertNotIn("beta-second-secret", json.dumps(audit_body))

    def test_admin_provider_format_patch_does_not_force_model_discovery(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"models_source": "union", "provider_model_capabilities": {}},
            "providers": {
                "beta": {
                    "base_url": "https://beta.example",
                    "keys": ["beta-secret-key"],
                    "formats": {
                        "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                    },
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}
        refresh_calls = []

        def fake_refresh(provider=None, *, force=False):
            refresh_calls.append((provider, force))

        with self.runtime_config(manager), patch.object(sse2json, "_refresh_models_after_config_change", fake_refresh):
            status, body = self.patch_json(
                "/-/admin/providers/beta/formats/chat_completions",
                {"path": "v1/chat"},
                headers=headers,
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "format_updated")
        self.assertEqual(refresh_calls, [("beta", False)])
        self.assertEqual(manager.config["providers"]["beta"]["formats"]["chat_completions"]["path"], "/v1/chat")

    def test_admin_delete_key_accepts_sparse_display_index(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"default_provider_pool": ["modelscope"]},
            "models": {"disable_client_model_map": True},
            "providers": {
                "modelscope": {
                    "base_url": "https://modelscope.example",
                    "keys": [
                        {"index": 0, "key": "ms-first-secret"},
                        {"index": 2, "key": "ms-third-secret"},
                    ],
                    "enabled": True,
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager):
            status, body = self.post_json(
                "/-/admin/providers/modelscope/keys/2/delete",
                {"confirm": "delete_key"},
                headers=headers,
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "key_deleted")
        self.assertEqual(len(body["config"]["providers"]["modelscope"]["keys"]), 1)
        self.assertEqual(body["config"]["providers"]["modelscope"]["keys"][0]["masked"], "ms-fir**et")

    def test_add_provider_clears_model_cache_and_refreshes_union_capabilities(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"default_provider_pool": ["alpha"], "max_attempts": 4},
            "models": {
                "disable_client_model_map": True,
                "models_source": "union",
                "provider_model_capabilities": {},
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "models_path": "/v1/models",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager), patch.object(sse2json, "OpenAIUpstreamClient", lambda _cfg: FakeClient()):
            sse2json._apply_runtime_config(manager.config)
            sse2json.fetch_provider_models("alpha")
            before_status, before = self.get_json("/v1/models")
            add_status, add_body = self.post_json(
                "/-/admin/providers",
                {
                    "name": "beta",
                    "base_url": "https://beta.example/v1",
                    "models_path": "/v1/models",
                    "keys": ["beta-secret-key"],
                    "priority": 25,
                    "formats": {
                        "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                        "responses": {"enabled": False, "path": "/v1/responses"},
                        "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
                    },
                },
                headers=headers,
            )
            after_status, after = self.get_json("/v1/models")
            for _ in range(20):
                if "beta-model" in [m["id"] for m in after["data"]]:
                    break
                time.sleep(0.05)
                after_status, after = self.get_json("/v1/models")

        self.assertEqual(before_status, 200)
        self.assertEqual([m["id"] for m in before["data"]], ["alpha-model"])
        self.assertEqual(add_status, 200)
        self.assertEqual(add_body["action"], "provider_added")
        self.assertEqual(add_body["config"]["providers"]["beta"]["priority"], 25)
        self.assertEqual(after_status, 200)
        self.assertIn("beta-model", [m["id"] for m in after["data"]])
        self.assertEqual(manager.config["models"]["provider_model_capabilities"]["beta"]["status"], "ok")
        self.assertNotIn("beta-secret-key", json.dumps([add_body, after, manager.config["models"]["provider_model_capabilities"]]))

    def test_add_provider_marks_capability_pending_until_background_refresh_completes(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"default_provider_pool": ["alpha"], "max_attempts": 4},
            "models": {
                "disable_client_model_map": True,
                "models_source": "union",
                "provider_model_capabilities": {},
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "models_path": "/v1/models",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())

        # Gate the background fetch so we can observe the pending window.
        gate = threading.Event()

        def gated_fetch(config, router, client, *, format_provider=None, only_provider=None):
            gate.wait(timeout=5)
            return real_fetch(
                config, router, client, format_provider=format_provider, only_provider=only_provider,
            )

        real_fetch = sse2json.model_registry.fetch_upstream_models

        with self.runtime_config(manager), patch.object(sse2json, "OpenAIUpstreamClient", lambda _cfg: FakeClient()):
            sse2json._apply_runtime_config(manager.config)
            # Add a second provider so _refresh_models_after_config_change(force=True)
            # launches the background discovery thread for it.
            manager.add_provider(
                "beta",
                {
                    "base_url": "https://beta.example/v1",
                    "models_path": "/v1/models",
                    "keys": ["beta-secret-key"],
                    "priority": 25,
                    "formats": {
                        "chat_completions": {"enabled": True, "path": "/v1/chat/completions"},
                        "responses": {"enabled": False, "path": "/v1/responses"},
                        "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
                    },
                },
            )
            sse2json._apply_runtime_config(manager.config)

            with patch.object(sse2json.model_registry, "fetch_upstream_models", side_effect=gated_fetch):
                sse2json._refresh_models_after_config_change("beta", force=True)

                # While the background thread is gated, beta must read as "pending".
                snapshot = sse2json._model_capabilities_snapshot()
                beta_cap = snapshot["providers"].get("beta", {})
                self.assertEqual(beta_cap.get("status"), "pending")

                # Release the gate so the background refresh can finish.
                gate.set()
                # Poll until the snapshot flips to a terminal status.
                for _ in range(60):
                    snapshot = sse2json._model_capabilities_snapshot()
                    beta_cap = snapshot["providers"].get("beta", {})
                    if beta_cap.get("status") in ("ok", "error"):
                        break
                    time.sleep(0.05)
                self.assertEqual(beta_cap.get("status"), "ok")

    def test_mark_provider_models_pending_preserves_existing_models(self):
        # A re-refresh must not wipe a previously discovered model list while pending.
        caps = {
            "alpha": {
                "status": "ok",
                "fetched_at": 100,
                "models": ["alpha-model"],
                "canonical_map": {"alpha-model": "alpha-model"},
                "formats": ["chat_completions"],
                "error": "old error",
            }
        }
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"models_source": "union", "provider_model_capabilities": caps},
            "providers": {"alpha": {"base_url": "https://alpha.example", "keys": ["k"], "enabled": True}},
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        with self.runtime_config(manager):
            sse2json._mark_provider_models_pending("alpha")
            entry = sse2json.CONFIG["models"]["provider_model_capabilities"]["alpha"]
            self.assertEqual(entry["status"], "pending")
            # Existing data preserved so a failed refresh still shows last-known models.
            self.assertEqual(entry["models"], ["alpha-model"])
            self.assertEqual(entry["canonical_map"], {"alpha-model": "alpha-model"})
            self.assertEqual(entry["formats"], ["chat_completions"])
            # Stale error from the previous run is carried through.
            self.assertEqual(entry["error"], "old error")

    def test_delete_provider_requires_confirmation(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"default_provider_pool": ["alpha", "beta"]},
            "models": {"disable_client_model_map": True, "provider_model_capabilities": {}},
            "providers": {
                "alpha": {"base_url": "https://alpha.example", "keys": ["raw-alpha-key"], "enabled": True},
                "beta": {"base_url": "https://beta.example", "keys": ["beta-secret-key"], "enabled": True},
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager):
            bad_status, bad_body = self.post_json(
                "/-/admin/providers/beta/delete",
                {"confirm": "wrong"},
                headers=headers,
            )
            ok_status, ok_body = self.post_json(
                "/-/admin/providers/beta/delete",
                {"confirm": "delete_provider"},
                headers=headers,
            )

        self.assertEqual(bad_status, 400)
        self.assertIn("confirm", bad_body["error"]["message"])
        self.assertEqual(ok_status, 200)
        self.assertEqual(ok_body["action"], "provider_deleted")
        self.assertNotIn("beta", manager.config["providers"])
        self.assertEqual(manager.config["routing"]["default_provider_pool"], ["alpha"])
        self.assertNotIn("beta-secret-key", json.dumps([bad_body, ok_body]))

    def test_admin_config_reload_rebuilds_runtime_objects(self):
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "models": {"disable_client_model_map": True, "provider_model_capabilities": {}},
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with self.runtime_config(manager):
            status, body = self.post_json("/-/admin/config/reload", headers=headers)

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "config_reloaded")
        self.assertIn("config", body)
        self.assertNotIn("raw-alpha-key", json.dumps(body))

    def test_admin_config_overlay_export_validate_and_clear(self):
        overlay_path = self.temp_overlay_path()
        with open(overlay_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "providers": {"alpha": {"keys": ["overlay-alpha-secret"], "enabled": False}},
                    "routing": {"max_attempts": 2},
                },
                f,
            )
        cfg = {
            "server": {"admin_key": "admin-secret"},
            "routing": {"max_attempts": 6},
            "models": {"disable_client_model_map": True, "provider_model_capabilities": {}},
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                }
            },
        }
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=overlay_path)
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        backup_path = ""
        with self.runtime_config(manager):
            overlay_status, overlay_body = self.get_json("/-/admin/config/overlay", headers={"X-Admin-Key": "admin-secret"})
            preview_status, preview_body = self.post_json("/-/admin/config/overlay/validate", headers=headers)
            custom_preview_status, custom_preview_body = self.post_json(
                "/-/admin/config/overlay/validate",
                {"overlay": {"routing": {"max_attempts": 4}}},
                headers=headers,
            )
            bad_clear_status, bad_clear_body = self.post_json(
                "/-/admin/config/overlay/clear",
                {"confirm": "wrong"},
                headers=headers,
            )
            clear_status, clear_body = self.post_json(
                "/-/admin/config/overlay/clear",
                {"confirm": "clear_runtime_overlay"},
                headers=headers,
            )
            backup_path = clear_body.get("backup_path") or ""

        if backup_path:
            self.addCleanup(lambda: os.path.exists(backup_path) and os.unlink(backup_path))

        self.assertEqual(overlay_status, 200)
        self.assertTrue(overlay_body["has_overlay"])
        self.assertNotIn("overlay-alpha-secret", json.dumps(overlay_body))
        self.assertEqual(preview_status, 200)
        self.assertEqual(preview_body["preview"]["config"]["routing"]["max_attempts"], 2)
        self.assertEqual(custom_preview_status, 200)
        self.assertEqual(custom_preview_body["preview"]["config"]["routing"]["max_attempts"], 4)
        self.assertEqual(manager.config["routing"]["max_attempts"], 6)
        self.assertEqual(bad_clear_status, 400)
        self.assertIn("confirm", bad_clear_body["error"]["message"])
        self.assertEqual(clear_status, 200)
        self.assertEqual(clear_body["action"], "config_overlay_cleared")
        self.assertFalse(clear_body["config"]["has_overlay"])
        self.assertTrue(backup_path and os.path.exists(backup_path))
        self.assertFalse(os.path.exists(overlay_path))
        self.assertNotIn("raw-alpha-key", json.dumps([overlay_body, preview_body, custom_preview_body, clear_body]))

    def test_admin_config_mutation_reports_validation_errors(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}
        manager = config_manager.RuntimeConfigManager(cfg, overlay_path=self.temp_overlay_path())
        headers = {"Content-Type": "application/json", "X-Admin-Key": "admin-secret"}

        with patch.object(sse2json, "CONFIG", manager.config), patch.object(sse2json, "CONFIG_MANAGER", manager):
            status, body = self.post_json(
                "/-/admin/providers",
                {"name": "bad/name", "base_url": "https://bad.example", "keys": ["k"]},
                headers=headers,
            )

        self.assertEqual(status, 400)
        self.assertIn("invalid provider name", body["error"]["message"])

    def test_dashboard_assets_are_served_without_exposing_admin_data(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            root_status, root_headers, root_body = self.get_raw("/")
            html_status, html_headers, html_body = self.get_raw("/-/dashboard")
            css_status, css_headers, css_body = self.get_raw("/-/dashboard/styles.css")
            js_status, js_headers, js_body = self.get_raw("/-/dashboard/app.js")
            admin_status, admin_body = self.get_json("/-/admin/status")

        self.assertEqual(root_status, 200)
        self.assertIn("text/html", root_headers.get("Content-Type", ""))
        self.assertIn(b"loginGate", root_body)
        self.assertEqual(html_status, 200)
        self.assertIn("text/html", html_headers.get("Content-Type", ""))
        self.assertIn(b"Proxy Console", html_body)
        self.assertIn(b'class="is-auth-checking"', html_body)
        self.assertIn(b'id="authChecking"', html_body)
        self.assertIn(b"loginGate", html_body)
        self.assertIn(b'<section id="loginGate" class="login-gate" hidden>', html_body)
        self.assertIn(b'id="sectionNav"', html_body)
        self.assertIn(b'id="mobileNavActions"', html_body)
        self.assertNotIn(b"adminKeyInput", html_body)
        self.assertNotIn(b"saveKeyButton", html_body)
        self.assertIn(b"modelCapabilities", html_body)
        self.assertNotIn(b"refreshModelsButton", html_body)
        self.assertIn(b"overlaySafety", html_body)
        self.assertIn(b"clearOverlayButton", html_body)
        self.assertNotIn(b"admin-secret", html_body)
        self.assertEqual(css_status, 200)
        self.assertIn("text/css", css_headers.get("Content-Type", ""))
        self.assertIn(b":root", css_body)
        self.assertIn(b".mobile-settings-section .nav", css_body)
        self.assertEqual(js_status, 200)
        self.assertIn("javascript", js_headers.get("Content-Type", ""))
        self.assertIn(b"fetch", js_body)
        self.assertIn(b"openConsoleWithKey", js_body)
        self.assertIn(b"await validateAdminKey(key)", js_body)
        self.assertIn(b"async function init()", js_body)
        self.assertIn(b'moveNodeTo("sectionNav", "mobileNavActions")', js_body)
        self.assertIn(b'restoreNode("sectionNav")', js_body)
        self.assertIn(b"openProviderEditors", js_body)
        self.assertIn(b"proxyConsoleView", js_body)
        self.assertNotIn(b"adminKeyInput", js_body)
        self.assertNotIn(b"saveKeyButton", js_body)
        self.assertIn(b"key_masked || attempt.key_id", js_body)
        self.assertIn(b"renderModelCapabilities", js_body)
        self.assertNotIn(b"latency-bar", js_body)
        self.assertNotIn(b"latency-area", js_body)
        self.assertNotIn(b"volume-bar", js_body)
        self.assertEqual(admin_status, 403)
        self.assertEqual(admin_body["error"]["message"], "admin auth required")

    def test_dashboard_blocks_unknown_assets_and_path_traversal(self):
        cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}

        with patch.object(sse2json, "CONFIG", cfg):
            missing_status, missing_body = self.get_json("/-/dashboard/missing.js")
            traversal_status, traversal_body = self.get_json("/-/dashboard/../config.json")

        self.assertEqual(missing_status, 404)
        self.assertIn("unknown dashboard asset", missing_body["error"]["message"])
        self.assertEqual(traversal_status, 404)
        self.assertIn("unknown dashboard asset", traversal_body["error"]["message"])

    def _probe_cfg(self, *, fmt="chat_completions"):
        return {
            "server": {"admin_key": "admin-secret"},
            "routing": {},
            "models": {
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "models": ["alpha-model", "chosen-model"],
                        "canonical_map": {"alpha-model": "alpha-model", "chosen-model": "provider-chosen-model"},
                        "formats": [fmt],
                    }
                },
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                    "formats": {
                        "chat_completions": {"enabled": fmt == "chat_completions", "path": "/v1/chat/completions"},
                        "responses": {"enabled": fmt == "responses", "path": "/v1/responses"},
                        "anthropic_messages": {"enabled": fmt == "anthropic_messages", "path": "/v1/messages"},
                    },
                }
            },
        }

    def test_key_probe_success(self):
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        captured = {}

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                captured["url"] = url
                captured["payload"] = payload
                return {"id": "x", "choices": [{"message": {"content": "ok"}}]}, 42

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router), patch.object(sse2json, "UPSTREAM_CLIENT", OkClient()):
            status, body = self.post_json(
                "/-/admin/providers/alpha/keys/0/test",
                {"model": "chosen-model"},
                headers={"Content-Type": "application/json", "X-Admin-Key": "admin-secret"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["action"], "key_probed")
        self.assertTrue(body["result"]["ok"])
        self.assertEqual(body["result"]["format"], "chat_completions")
        self.assertEqual(body["result"]["latency_ms"], 42)
        self.assertTrue(captured["url"].endswith("/v1/chat/completions"))
        self.assertEqual(captured["payload"]["model"], "provider-chosen-model")
        self.assertEqual(body["result"]["model"], "chosen-model")
        self.assertEqual(body["result"]["requested_model"], "chosen-model")
        self.assertEqual(body["result"]["upstream_model"], "provider-chosen-model")

    def test_key_probe_concurrent_duplicates_share_one_upstream_request(self):
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"recent_requests_limit": 20}})
        started = threading.Event()
        release = threading.Event()
        call_count = 0
        call_lock = threading.Lock()

        class SlowClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                nonlocal call_count
                with call_lock:
                    call_count += 1
                started.set()
                release.wait(timeout=5)
                return {"id": "x", "choices": [{"message": {"content": "ok"}}]}, 42

        def run_probe(results, index):
            results[index] = sse2json.probe_provider_key("alpha", 0, model="chosen-model")

        with sse2json._KEY_PROBE_LOCK:
            sse2json._KEY_PROBE_INFLIGHT.clear()

        results = [None] * 6
        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router), patch.object(
            sse2json, "UPSTREAM_CLIENT", SlowClient()
        ), patch.object(sse2json, "OBSERVABILITY", obs):
            threads = [threading.Thread(target=run_probe, args=(results, i)) for i in range(len(results))]
            for thread in threads:
                thread.start()
            self.assertTrue(started.wait(timeout=2))
            time.sleep(0.05)
            release.set()
            for thread in threads:
                thread.join(timeout=2)

        self.assertEqual(call_count, 1)
        self.assertTrue(all(result and result["ok"] for result in results))
        self.assertGreaterEqual(sum(1 for result in results if result.get("deduped")), 1)
        snap = obs.snapshot()
        self.assertEqual(snap["counters"]["requests_total"], 1)
        self.assertEqual(len(snap["recent_requests"]), 1)

    def test_key_probe_uses_provider_supported_format(self):
        cfg = self._probe_cfg(fmt="anthropic_messages")
        router = sse2json.UpstreamRouter(cfg)
        captured = {}

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                captured["url"] = url
                captured["payload"] = payload
                return {"id": "x"}, 5

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router), patch.object(sse2json, "UPSTREAM_CLIENT", OkClient()):
            status, body = self.post_json(
                "/-/admin/providers/alpha/keys/0/test",
                headers={"Content-Type": "application/json", "X-Admin-Key": "admin-secret"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(body["result"]["format"], "anthropic_messages")
        self.assertTrue(captured["url"].endswith("/v1/messages"))
        self.assertIn("max_tokens", captured["payload"])

    def test_key_probe_http_error_classified_and_no_cooldown(self):
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)

        class FailClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                raise HTTPError(url, 401, "unauthorized", {}, None)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router), patch.object(sse2json, "UPSTREAM_CLIENT", FailClient()):
            status, body = self.post_json(
                "/-/admin/providers/alpha/keys/0/test",
                headers={"Content-Type": "application/json", "X-Admin-Key": "admin-secret"},
            )

        self.assertEqual(status, 200)
        self.assertFalse(body["result"]["ok"])
        self.assertEqual(body["result"]["http_status"], 401)
        self.assertEqual(body["result"]["error_type"], "key_invalid")
        ks = router._keys_state.get(("alpha", 0))
        self.assertEqual(ks.fails, 0)
        self.assertEqual(ks.cooldown_until, 0.0)

    def test_key_probe_requires_admin_auth(self):
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)

        with patch.object(sse2json, "CONFIG", cfg), patch.object(sse2json, "ROUTER", router):
            status, body = self.post_json("/-/admin/providers/alpha/keys/0/test")

        self.assertEqual(status, 403)

    def test_idle_probe_prefers_recent_success_model_and_records_event(self):
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})
        obs.record_request_start(
            "r1",
            client_format="chat_completions",
            endpoint="chat_completions",
            model="chosen-model",
            stream=False,
            path="/v1/chat/completions",
        )
        obs.record_attempt(
            "r1",
            Attempt(
                request_id="r1",
                attempt_no=1,
                provider="alpha",
                key_index=0,
                key="raw-alpha-key",
                url="https://alpha.example/v1/chat/completions",
                headers={},
                provider_model="provider-chosen-model",
                upstream_format="chat_completions",
            ),
            outcome="success",
            first_byte_ms=33,
        )
        obs.record_request_end("r1", status_code=200)
        captured = {}

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                captured["payload"] = payload
                return {"id": "x"}, 44

        rt = sse2json.RuntimeContext(cfg, router, OkClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertTrue(healthy)
        self.assertEqual(captured["payload"]["model"], "provider-chosen-model")
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "success")
        self.assertEqual(probes["last"]["model"], "provider-chosen-model")
        self.assertEqual(probes["last"]["model_source"], "recent_success")
        self.assertEqual(obs.snapshot_lite()["counters"]["requests_total"], 1)

    def test_idle_probe_fallback_client_error_is_observed_without_cooldown(self):
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class FailClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                raise HTTPError(url, 404, "not found", {}, None)

        rt = sse2json.RuntimeContext(cfg, router, FailClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "failed")
        self.assertEqual(probes["last"]["error_type"], "client_error")
        self.assertEqual(probes["last"]["action"], "observed_only")
        ks = router._keys_state.get(("alpha", 0))
        self.assertIsNotNone(ks)
        self.assertEqual(ks.fails, 0)
        self.assertEqual(ks.cooldown_until, 0.0)


class IdleProbeAdvancedTests(unittest.TestCase):
    """Tests for idle probe cooldown clearing, network errors, and config param."""

    def _probe_cfg(self, *, fmt="chat_completions"):
        return {
            "server": {"admin_key": "admin-secret"},
            "routing": {},
            "models": {
                "provider_model_capabilities": {
                    "alpha": {
                        "status": "ok",
                        "models": ["alpha-model"],
                        "canonical_map": {"alpha-model": "alpha-model"},
                        "formats": [fmt],
                    }
                },
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["raw-alpha-key"],
                    "enabled": True,
                    "formats": {
                        "chat_completions": {"enabled": fmt == "chat_completions", "path": "/v1/chat/completions"},
                        "responses": {"enabled": fmt == "responses", "path": "/v1/responses"},
                        "anthropic_messages": {"enabled": fmt == "anthropic_messages", "path": "/v1/messages"},
                    },
                }
            },
        }

    def test_idle_probe_success_clears_provider_cooldown(self):
        """A successful probe should clear any existing provider cooldown."""
        import time as _time
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        # Put provider in cooldown manually
        router._providers_state["alpha"].cooldown_until = _time.time() + 300

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                return {"id": "x"}, 42

        rt = sse2json.RuntimeContext(cfg, router, OkClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertTrue(healthy)
        # Cooldown should be cleared
        ps = router._providers_state.get("alpha")
        self.assertIsNotNone(ps)
        self.assertEqual(ps.cooldown_until, 0.0)

        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "success")
        self.assertEqual(probes["last"]["action"], "cleared_provider_cooldown")

    def test_idle_probe_network_error_triggers_key_cooldown(self):
        """A network error during probe should trigger key cooldown via report_failure."""
        import socket as _socket
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class NetErrorClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                raise _socket.timeout("connection timed out")

        rt = sse2json.RuntimeContext(cfg, router, NetErrorClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "failed")
        self.assertEqual(probes["last"]["error_type"], "network_error")
        self.assertEqual(probes["last"]["action"], "reported_failure")

        # Key should have a cooldown set by report_failure
        ks = router._keys_state.get(("alpha", 0))
        self.assertIsNotNone(ks)
        self.assertGreater(ks.cooldown_until, 0.0)

    def test_idle_probe_server_error_triggers_cooldown(self):
        """A 5xx server error during probe should trigger key cooldown."""
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class ServerErrorClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                raise HTTPError(url, 503, "Service Unavailable", {}, None)

        rt = sse2json.RuntimeContext(cfg, router, ServerErrorClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "failed")
        self.assertEqual(probes["last"]["error_type"], "server_error")
        self.assertEqual(probes["last"]["http_status"], 503)

    def test_idle_probe_key_invalid_triggers_long_cooldown(self):
        """A 401 error during probe should trigger key_invalid with long cooldown."""
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class KeyInvalidClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                raise HTTPError(url, 401, "Unauthorized", {}, None)

        rt = sse2json.RuntimeContext(cfg, router, KeyInvalidClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["error_type"], "key_invalid")
        self.assertEqual(probes["last"]["http_status"], 401)

        # Key should be disabled (key_invalid disables key)
        ks = router._keys_state.get(("alpha", 0))
        self.assertIsNotNone(ks)
        self.assertGreater(ks.cooldown_until, 0.0)

    def test_pick_probe_model_uses_config_parameter(self):
        """_pick_probe_model_with_source should use the config parameter,
        not the module-level CONFIG, when both have different model maps."""
        # Create a config with a specific model map
        cfg = {
            "models": {
                "provider_model_map": {
                    "alpha": {"cfg-model": "cfg-model"},
                },
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["key"],
                }
            },
        }

        # Create a different CONFIG that would give a different model
        diff_cfg = {
            "models": {
                "provider_model_map": {
                    "alpha": {"diff-model": "diff-model"},
                },
            },
            "providers": {
                "alpha": {
                    "base_url": "https://alpha.example",
                    "keys": ["key"],
                }
            },
        }

        with patch.object(sse2json, "CONFIG", diff_cfg):
            # When config=cfg is passed, should use cfg's manual_map
            model, source = sse2json._pick_probe_model_with_source("alpha", config=cfg)
            self.assertEqual(model, "cfg-model")
            self.assertEqual(source, "manual_map")

            # When no config is passed, should fall back to CONFIG (diff_cfg)
            model, source = sse2json._pick_probe_model_with_source("alpha")
            self.assertEqual(model, "diff-model")
            self.assertEqual(source, "manual_map")

    def test_build_probe_plan_with_recent_model(self):
        """_build_probe_plan should list model-supporting providers first,
        then remaining providers with their own models."""
        cfg = {
            "models": {
                "provider_model_map": {
                    "alpha": {"shared-model": "alpha-shared", "alpha-only": "alpha-only"},
                    "beta": {"shared-model": "beta-shared", "beta-only": "beta-only"},
                    "gamma": {"gamma-only": "gamma-only"},
                },
            },
            "providers": {
                "alpha": {"priority": 100, "base_url": "https://alpha.example", "keys": ["key"]},
                "beta": {"priority": 50, "base_url": "https://beta.example", "keys": ["key"]},
                "gamma": {"priority": 10, "base_url": "https://gamma.example", "keys": ["key"]},
            },
        }
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        # Mock: beta recently used "shared-model"
        with patch.object(obs, 'latest_successful_model_for_provider') as mock_latest:
            def side_effect(provider):
                if provider == "beta":
                    return "shared-model"
                return None
            mock_latest.side_effect = side_effect

            plan = sse2json._build_probe_plan(obs, cfg, router)

            # Phase 1: alpha and beta support shared-model, in priority order
            self.assertEqual(len(plan), 3)
            self.assertEqual(plan[0][0], "alpha")   # highest priority, supports shared-model
            self.assertEqual(plan[0][1], "shared-model")
            self.assertEqual(plan[0][2], "recent_success_global")
            self.assertEqual(plan[1][0], "beta")    # next priority, supports shared-model
            self.assertEqual(plan[1][1], "shared-model")
            self.assertEqual(plan[1][2], "recent_success_global")
            # Phase 2: gamma doesn't support shared-model, uses its own
            self.assertEqual(plan[2][0], "gamma")
            self.assertEqual(plan[2][1], "gamma-only")
            self.assertTrue(plan[2][2].startswith("fallback_"))

    def test_build_probe_plan_no_recent_model(self):
        """_build_probe_plan with no recent model should list all providers
        in priority order with their own default models."""
        cfg = {
            "models": {
                "provider_model_map": {
                    "alpha": {"alpha-model": "alpha-model"},
                    "beta": {"beta-model": "beta-model"},
                },
            },
            "providers": {
                "alpha": {"priority": 100, "base_url": "https://alpha.example", "keys": ["key"]},
                "beta": {"priority": 50, "base_url": "https://beta.example", "keys": ["key"]},
            },
        }
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        with patch.object(obs, 'latest_successful_model_for_provider') as mock_latest:
            mock_latest.return_value = None

            plan = sse2json._build_probe_plan(obs, cfg, router)

            self.assertEqual(len(plan), 2)
            self.assertEqual(plan[0][0], "alpha")
            self.assertEqual(plan[0][1], "alpha-model")
            self.assertTrue(plan[0][2].startswith("no_recent_"))
            self.assertEqual(plan[1][0], "beta")
            self.assertEqual(plan[1][1], "beta-model")
            self.assertTrue(plan[1][2].startswith("no_recent_"))

    def test_build_probe_plan_no_provider_supports_recent_model(self):
        """When no provider supports the recent model, all providers should
        be listed with their own default models."""
        cfg = {
            "models": {
                "provider_model_map": {
                    "alpha": {"alpha-model": "alpha-model"},
                    "beta": {"beta-model": "beta-model"},
                },
            },
            "providers": {
                "alpha": {"priority": 100, "base_url": "https://alpha.example", "keys": ["key"]},
                "beta": {"priority": 50, "base_url": "https://beta.example", "keys": ["key"]},
            },
        }
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        with patch.object(obs, 'latest_successful_model_for_provider') as mock_latest:
            mock_latest.return_value = "nonexistent-model"

            plan = sse2json._build_probe_plan(obs, cfg, router)

            # No provider supports "nonexistent-model", so all go to Phase 2
            self.assertEqual(len(plan), 2)
            self.assertEqual(plan[0][0], "alpha")
            self.assertEqual(plan[0][1], "alpha-model")
            self.assertTrue(plan[0][2].startswith("fallback_"))
            self.assertEqual(plan[1][0], "beta")
            self.assertEqual(plan[1][1], "beta-model")
            self.assertTrue(plan[1][2].startswith("fallback_"))

    def test_idle_probe_skips_disabled_provider(self):
        """A disabled provider should be skipped and recorded as 'skipped'."""
        cfg = self._probe_cfg()
        cfg["providers"]["alpha"]["enabled"] = False
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                return {"id": "x"}, 1

        rt = sse2json.RuntimeContext(cfg, router, OkClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertFalse(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["outcome"], "skipped")
        self.assertEqual(probes["last"]["reason"], "provider disabled")

    def test_probe_event_carries_idle_tier_and_next_probe(self):
        """Probe events should include idle_tier and next_probe_in_s when
        passed from _idle_health_check_round."""
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                return {"id": "x"}, 42

        rt = sse2json.RuntimeContext(cfg, router, OkClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(
                rt, "alpha",
                idle_tier="recent",
                next_probe_in_s=30,
            )

        self.assertTrue(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertEqual(probes["last"]["idle_tier"], "recent")
        self.assertEqual(probes["last"]["next_probe_in_s"], 30)

    def test_probe_event_without_tier_still_works(self):
        """When idle_tier is not passed (e.g. manual key-test endpoint),
        probe events should not have the field — backward compatible."""
        cfg = self._probe_cfg()
        router = sse2json.UpstreamRouter(cfg)
        obs = ProxyObservability({"observability": {"history": {"enabled": False}}})

        class OkClient:
            def request_json_with_timing(self, url, headers, payload, *, proxy_url=None, remaining_timeout_s=None):
                return {"id": "x"}, 42

        rt = sse2json.RuntimeContext(cfg, router, OkClient(), obs, sse2json.AUDIT)
        with patch.object(sse2json, "CONFIG", cfg):
            healthy = sse2json._idle_probe_one_provider(rt, "alpha")

        self.assertTrue(healthy)
        probes = obs.health_probe_summary("alpha")
        self.assertNotIn("idle_tier", probes["last"])
        self.assertNotIn("next_probe_in_s", probes["last"])

    def test_idle_tier_info_returns_correct_tier_names(self):
        """_idle_tier_info should return correct tier name and interval."""
        # Cold start
        tier, interval = sse2json._idle_tier_info(0.0, 1000.0)
        self.assertEqual(tier, "cold_start")
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_INITIAL_S)

        # Recent (< 2 min)
        now = 10000.0
        tier, interval = sse2json._idle_tier_info(now - 60, now)
        self.assertEqual(tier, "recent")
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_RECENT_S)

        # Medium (2-10 min)
        tier, interval = sse2json._idle_tier_info(now - 300, now)
        self.assertEqual(tier, "medium")
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_MEDIUM_S)

        # Long (10-30 min)
        tier, interval = sse2json._idle_tier_info(now - 900, now)
        self.assertEqual(tier, "long")
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_LONG_S)

        # Deep (30+ min)
        tier, interval = sse2json._idle_tier_info(now - 2400, now)
        self.assertEqual(tier, "deep")
        self.assertGreaterEqual(interval, sse2json._IDLE_CHECK_INTERVAL_DEEP_S[0])
        self.assertLessEqual(interval, sse2json._IDLE_CHECK_INTERVAL_DEEP_S[1])


class IdleCheckIntervalTests(unittest.TestCase):
    """Tests for _idle_check_interval_s adaptive cadence logic."""

    def test_cold_start_returns_short_initial_delay(self):
        """When last_finished_at is 0.0 (no request ever completed), the
        interval should be the short initial delay, NOT 3-6 hours."""
        interval = sse2json._idle_check_interval_s(0.0, 1000.0)
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_INITIAL_S)
        self.assertLessEqual(interval, 60)

    def test_recent_activity_returns_30s(self):
        """Last request finished < 2 min ago → 30s cadence."""
        now = 10000.0
        last_finished = now - 60  # 1 min ago
        interval = sse2json._idle_check_interval_s(last_finished, now)
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_RECENT_S)

    def test_medium_idle_returns_60s(self):
        """Last request finished 2-10 min ago → 60s cadence."""
        now = 10000.0
        last_finished = now - 300  # 5 min ago
        interval = sse2json._idle_check_interval_s(last_finished, now)
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_MEDIUM_S)

    def test_long_idle_returns_300s(self):
        """Last request finished 10-30 min ago → 300s cadence."""
        now = 10000.0
        last_finished = now - 900  # 15 min ago
        interval = sse2json._idle_check_interval_s(last_finished, now)
        self.assertEqual(interval, sse2json._IDLE_CHECK_INTERVAL_LONG_S)

    def test_deep_idle_returns_3_to_6_hours(self):
        """Last request finished 30+ min ago → 3-6h random cadence."""
        now = 10000.0
        last_finished = now - 2400  # 40 min ago
        interval = sse2json._idle_check_interval_s(last_finished, now)
        self.assertGreaterEqual(interval, sse2json._IDLE_CHECK_INTERVAL_DEEP_S[0])
        self.assertLessEqual(interval, sse2json._IDLE_CHECK_INTERVAL_DEEP_S[1])

    def test_cold_start_not_hours(self):
        """Regression: cold start must NOT return 3-6 hours."""
        interval = sse2json._idle_check_interval_s(0.0, 1000.0)
        self.assertLess(interval, 3600, "Cold start interval should be under 1 hour")


class ModelPricingEndpointTests(unittest.TestCase):
    def setUp(self):
        self._original_audit = sse2json.AUDIT
        sse2json.AUDIT = sse2json.AdminAuditStore({"observability": {"audit": {"enabled": False}}})
        sse2json.OBSERVABILITY.reset()
        self.server = HTTPServer(("127.0.0.1", 0), sse2json.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.cfg = {"server": {"admin_key": "admin-secret"}, "providers": {}, "models": {}}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        sse2json.OBSERVABILITY.reset()
        sse2json.AUDIT = self._original_audit

    def _get(self, path):
        req = Request(self.base_url + path, headers={"X-Admin-Key": "admin-secret"}, method="GET")
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except HTTPError as e:
            try:
                return e.code, json.loads(e.read())
            finally:
                e.close()

    def test_model_pricing_returns_cached_prices_without_network(self):
        # Patch the aa singleton's index/cache to avoid touching real files.
        import artificial_analysis_api
        aa = artificial_analysis_api.aa
        # fast_resolve builds its lookup from _index._models; seed it so the
        # test model resolves without the slow per-query resolver.
        with patch.object(sse2json, "CONFIG", self.cfg), \
             patch.object(aa._index, "_models", {"deepseek-v4-flash": "DeepSeek V4 Flash"}), \
             patch.object(aa._index, "load_local", lambda: None), \
             patch.object(aa._cache, "get", side_effect=lambda slug: {"pricing": {"input": 0.14, "output": 0.28, "cache_hit": 0.014}} if slug == "deepseek-v4-flash" else None) as get_mock, \
             patch.object(aa._cache, "list_slugs", return_value=[]):
            status, body = self._get("/-/admin/model-pricing?models=deepseek-v4-flash,unknown-model")

        self.assertEqual(status, 200)
        pricing = body["pricing"]
        self.assertTrue(pricing["deepseek-v4-flash"]["available"])
        self.assertEqual(pricing["deepseek-v4-flash"]["input"], 0.14)
        self.assertEqual(pricing["deepseek-v4-flash"]["output"], 0.28)
        # unknown-model resolves to None -> available False
        self.assertFalse(pricing["unknown-model"]["available"])
        # cache.get is read-only, no network fetcher invoked.
        get_mock.assert_called()

    def test_model_pricing_requires_admin_auth(self):
        with patch.object(sse2json, "CONFIG", self.cfg):
            req = Request(self.base_url + "/-/admin/model-pricing", method="GET")
            try:
                urlopen(req, timeout=5)
                self.fail("expected auth failure")
            except HTTPError as e:
                self.assertIn(e.code, (401, 403))
                e.close()


if __name__ == "__main__":
    unittest.main()


