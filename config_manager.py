#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import copy
import errno
import json
import os
import re
import tempfile
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Optional, Tuple

from config_loader import SUPPORTED_FORMATS, _deep_merge, _normalize_config
from proxy_utils import key_value, normalize_key_entries, normalize_key_entry, normalize_proxy_config, proxy_display
from router import PROVIDER_SELECT_MODES, FORMAT_PREFERENCE_MODES, _hash_key_short, _mask_key
from scheduler_policy import MAX_CONFIGURED_COOLDOWN_S, MAX_PROVIDER_COOLDOWN_S, VALID_COOLDOWN_SCOPES


class ConfigValidationError(ValueError):
    pass


_FAILURE_ERROR_TYPES = (
    "key_invalid",
    "rate_limited",
    "quota_or_balance",
    "server_error",
    "network_error",
    "provider_compat",
    "empty_visible_output",
    "client_error",
    "unknown",
)


def default_overlay_path() -> str:
    configured = os.environ.get("PROXY_RUNTIME_CONFIG_PATH")
    if configured:
        return configured
    return os.path.join(os.path.dirname(__file__), "runtime_config.json")


class RuntimeConfigManager:
    def __init__(self, base_config: Dict[str, Any], *, overlay_path: Optional[str] = None):
        self.overlay_path = overlay_path or default_overlay_path()
        self.base_config = copy.deepcopy(base_config or {})
        self.overlay = self._read_overlay()
        self.config = self._normalized_merged()
        # Process-level lock that serializes the full read-modify-write-persist
        # sequence in _commit_overlay. Without this, two concurrent admin
        # mutations can each start from the same prior overlay snapshot and the
        # second write silently overwrites the first (lost update). The
        # temp-file + os.replace pattern in _write_overlay makes a single write
        # crash-safe, but does not prevent this lost-update class.
        self._commit_lock = threading.RLock()

    @contextmanager
    def _locked_overlay(self):
        """Context manager that serializes the full read-modify-write cycle.

        Yields a fresh deep copy of the current overlay. On clean exit the
        (possibly mutated) overlay is pruned, persisted, and self.overlay /
        self.config are updated. On exception, no commit occurs.
        """
        with self._commit_lock:
            overlay = copy.deepcopy(self.overlay)
            yield overlay
            overlay = self._prune_overlay_tombstones(overlay)
            self._write_overlay(overlay)
            self.overlay = overlay
            self.config = self._normalized_merged()

    def snapshot(self) -> Dict[str, Any]:
        return self._config_view(self.config)

    def overlay_snapshot(self) -> Dict[str, Any]:
        return {
            "overlay_path": self.overlay_path,
            "has_overlay": bool(self.overlay),
            "overlay": self._safe_fragment(self.overlay),
        }

    def preview_overlay(self, overlay: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if overlay is None:
            overlay = self.overlay
        if not isinstance(overlay, dict):
            raise ConfigValidationError("overlay must be an object")
        cfg = self._normalized_config_for_overlay(overlay)
        return {
            "valid": True,
            "overlay_path": self.overlay_path,
            "has_overlay": bool(overlay),
            "overlay": self._safe_fragment(overlay),
            "config": self._config_view(cfg, has_overlay=bool(overlay)),
        }

    def clear_overlay(self) -> Dict[str, Any]:
        with self._commit_lock:
            backup_path = ""
            if os.path.exists(self.overlay_path):
                backup_path = f"{self.overlay_path}.bak.{int(time.time())}"
                try:
                    os.replace(self.overlay_path, backup_path)
                except OSError as e:
                    if e.errno not in (errno.EBUSY, errno.EXDEV):
                        raise
                    self._copy_file(self.overlay_path, backup_path)
                    with open(self.overlay_path, "w", encoding="utf-8") as f:
                        f.write("{}\n")
                        f.flush()
                        os.fsync(f.fileno())
            self.overlay = {}
            self.config = self._normalized_merged()
            return {"backup_path": backup_path, "config": self.config}

    def _config_view(self, cfg: Dict[str, Any], *, has_overlay: Optional[bool] = None) -> Dict[str, Any]:
        return {
            "overlay_path": self.overlay_path,
            "has_overlay": bool(self.overlay) if has_overlay is None else bool(has_overlay),
            "server": self._server_view(cfg.get("server") or {}),
            "routing": copy.deepcopy(cfg.get("routing") or {}),
            "retry": copy.deepcopy(cfg.get("retry") or {}),
            "models": self._models_view(cfg.get("models") or {}),
            "proxy": copy.deepcopy(cfg.get("proxy") or {}),
            "providers": {
                name: self._provider_view(pcfg)
                for name, pcfg in (cfg.get("providers") or {}).items()
                if isinstance(pcfg, dict)
            },
        }

    def add_provider(self, name: str, provider_cfg: Dict[str, Any]) -> Dict[str, Any]:
        self._validate_provider_name(name)
        if name in (self.config.get("providers") or {}):
            raise ConfigValidationError(f"provider already exists: {name}")
        clean = self._validate_provider_config(provider_cfg, require_keys=True)
        # If no explicit priority was set, auto-assign one that places the new
        # provider below all existing providers (lowest priority) so it does
        # not accidentally intercept traffic from configured providers.
        if "priority" not in clean:
            existing_priorities = []
            for _name, _pcfg in (self.config.get("providers") or {}).items():
                if _name == name:
                    continue
                try:
                    existing_priorities.append(int((_pcfg or {}).get("priority", 0) or 0))
                except (TypeError, ValueError):
                    pass
            if existing_priorities:
                clean["priority"] = min(existing_priorities) - 1
            else:
                clean["priority"] = 0
        with self._locked_overlay() as overlay:
            providers = overlay.setdefault("providers", {})
            providers[name] = clean
            routing = overlay.setdefault("routing", {})
            pool = list(routing.get("default_provider_pool") or (self.config.get("routing") or {}).get("default_provider_pool") or [])
            if name not in pool:
                pool.append(name)
            routing["default_provider_pool"] = pool
        return self.config

    def update_provider(self, name: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._require_provider(name)
        clean = self._validate_provider_patch(patch)
        with self._locked_overlay() as overlay:
            current = self._overlay_provider_base(name)
            overlay.setdefault("providers", {})[name] = _deep_merge(current, clean)
        return self.config

    def delete_provider(self, name: str) -> Dict[str, Any]:
        self._require_provider(name)
        with self._locked_overlay() as overlay:
            providers = overlay.setdefault("providers", {})
            if name in (self.base_config.get("providers") or {}):
                providers[name] = None
            else:
                providers.pop(name, None)

            routing = overlay.setdefault("routing", {})
            pool_source = routing.get("default_provider_pool")
            if pool_source is None:
                pool_source = (self.config.get("routing") or {}).get("default_provider_pool") or []
            routing["default_provider_pool"] = [
                p for p in (str(item).strip() for item in pool_source or []) if p and p != name
            ]

            models = overlay.setdefault("models", {})
            if not isinstance(models, dict):
                models = {}
                overlay["models"] = models
            self._remove_provider_from_routes(models, name)
            self._remove_provider_map_entry(models, name, "provider_model_map")
            self._remove_provider_map_entry(models, name, "provider_model_capabilities")
            self._remove_provider_map_entry(models, name, "provider_model_disabled")
        return self.config

    def add_key(self, provider: str, key: str, proxy: Any = "") -> Dict[str, Any]:
        self._require_provider(provider)
        key = str(key or "").strip()
        if not key:
            raise ConfigValidationError("key is required")
        with self._locked_overlay() as overlay:
            current = self._overlay_provider_base(provider)
            keys = list(current.get("keys") or [])
            key_entry = normalize_key_entry({"key": key, "proxy": proxy} if proxy else key)
            if not key_entry:
                raise ConfigValidationError("key is required")
            keys.append(key_entry)
            current["keys"] = keys
            overlay.setdefault("providers", {})[provider] = current
        return self.config

    def update_key(self, provider: str, key_index: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._require_provider(provider)
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("key patch must be a non-empty object")
        allowed = {"proxy"}
        for field in patch.keys():
            if field not in allowed:
                raise ConfigValidationError(f"unsupported key field: {field}")

        with self._locked_overlay() as overlay:
            current = self._overlay_provider_base(provider)
            keys = list(current.get("keys") or [])
            if key_index < 0 or key_index >= len(keys):
                raise ConfigValidationError(f"unknown key: {provider}/{key_index}")

            raw_key = key_value(keys[key_index])
            if not raw_key:
                raise ConfigValidationError(f"invalid key: {provider}/{key_index}")
            proxy = normalize_proxy_config(patch.get("proxy"))
            keys[key_index] = {"key": raw_key, "proxy": proxy} if proxy else raw_key
            current["keys"] = keys
            overlay.setdefault("providers", {})[provider] = current
        return self.config

    def delete_key(self, provider: str, key_index: int) -> Dict[str, Any]:
        self._require_provider(provider)
        with self._locked_overlay() as overlay:
            current = self._overlay_provider_base(provider)
            keys = list(current.get("keys") or [])
            delete_pos = key_index
            if key_index < 0 or key_index >= len(keys):
                delete_pos = -1
                for idx, entry in enumerate(keys):
                    if isinstance(entry, dict) and int(entry.get("index", -1)) == key_index:
                        delete_pos = idx
                        break
            if delete_pos < 0 or delete_pos >= len(keys):
                raise ConfigValidationError(f"unknown key: {provider}/{key_index}")
            keys.pop(delete_pos)
            current["keys"] = keys
            overlay.setdefault("providers", {})[provider] = current
        return self.config

    def update_global_proxy(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(patch, dict) or "proxy" not in patch:
            raise ConfigValidationError("proxy patch must include proxy")
        with self._locked_overlay() as overlay:
            overlay["proxy"] = normalize_proxy_config(patch.get("proxy"))
        return self.config

    # ------------------------------------------------------------------
    # Health monitor configuration
    # ------------------------------------------------------------------
    _HEALTH_MONITOR_DEFAULTS = {
        "idle_check_enabled": True,
        "idle_check_interval_recent_s": 30,
        "idle_check_interval_medium_s": 60,
        "idle_check_interval_long_s": 300,
        "idle_check_interval_deep_min_s": 3 * 3600,
        "idle_check_interval_deep_max_s": 6 * 3600,
        "patrol_check_enabled": True,
        "patrol_interval_min_s": 3600,
        "patrol_interval_max_s": 3 * 3600,
        "patrol_delay_s": 3,
        "patrol_delay_jitter_s": 2,
        "patrol_first_byte_timeout_s": 15,
    }

    def update_health_monitor(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("health_monitor patch must be a non-empty object")
        allowed = set(self._HEALTH_MONITOR_DEFAULTS.keys())
        clean: Dict[str, Any] = {}
        for key, value in patch.items():
            if key not in allowed:
                raise ConfigValidationError(f"unsupported health_monitor field: {key}")
            if key in ("idle_check_enabled", "patrol_check_enabled"):
                clean[key] = bool(value)
            elif key in ("idle_check_interval_deep_min_s", "idle_check_interval_deep_max_s",
                         "patrol_interval_min_s", "patrol_interval_max_s"):
                clean[key] = self._bounded_int(value, key, 60, 86400)
            elif key == "patrol_first_byte_timeout_s":
                clean[key] = self._bounded_int(value, key, 1, 120)
            elif key == "patrol_delay_jitter_s":
                clean[key] = self._bounded_int(value, key, 0, 30)
            else:
                clean[key] = self._bounded_int(value, key, 1, 3600)
        # Validate min <= max for deep interval
        dmin = clean.get("idle_check_interval_deep_min_s")
        dmax = clean.get("idle_check_interval_deep_max_s")
        if dmin is not None and dmax is not None and dmin > dmax:
            raise ConfigValidationError("idle_check_interval_deep_min_s must be <= idle_check_interval_deep_max_s")
        pmin = clean.get("patrol_interval_min_s")
        pmax = clean.get("patrol_interval_max_s")
        if pmin is not None and pmax is not None and pmin > pmax:
            raise ConfigValidationError("patrol_interval_min_s must be <= patrol_interval_max_s")
        with self._locked_overlay() as overlay:
            current = copy.deepcopy(overlay.get("health_monitor") or self.config.get("health_monitor") or {})
            overlay["health_monitor"] = _deep_merge(current, clean)
        return self.config

    def update_format(self, provider: str, fmt: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._require_provider(provider)
        fmt = str(fmt or "")
        if fmt not in SUPPORTED_FORMATS:
            raise ConfigValidationError(f"unsupported format: {fmt}")
        clean = {}
        if "enabled" in (patch or {}):
            clean["enabled"] = bool(patch.get("enabled"))
        if "path" in (patch or {}):
            path = str(patch.get("path") or "").strip()
            if not path:
                raise ConfigValidationError("format path cannot be empty")
            if not path.startswith("/"):
                path = "/" + path
            clean["path"] = path
        if not clean:
            raise ConfigValidationError("empty format patch")

        with self._locked_overlay() as overlay:
            current = self._overlay_provider_base(provider)
            formats = current.setdefault("formats", {})
            formats[fmt] = _deep_merge(formats.get(fmt) or {}, clean)
            overlay.setdefault("providers", {})[provider] = current
        return self.config

    def update_routing(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        clean = self._validate_routing_patch(patch)
        with self._locked_overlay() as overlay:
            current = copy.deepcopy(overlay.get("routing") or self.config.get("routing") or {})
            overlay["routing"] = _deep_merge(current, clean)
        return self.config

    def update_retry(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        clean = self._validate_retry_patch(patch)
        with self._locked_overlay() as overlay:
            current = copy.deepcopy(overlay.get("retry") or self.config.get("retry") or {})
            overlay["retry"] = _deep_merge(current, clean)
        return self.config

    def update_failure_policy(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        error_type, policy = self._validate_failure_policy_patch(patch)
        with self._locked_overlay() as overlay:
            retry = copy.deepcopy(overlay.get("retry") or {})
            policies = retry.setdefault("failure_policies", {})
            if not isinstance(policies, dict):
                policies = {}
            existing = ((self.config.get("retry") or {}).get("failure_policies") or {}).get(error_type) or {}
            policies[error_type] = _deep_merge(copy.deepcopy(existing), policy)
            retry["failure_policies"] = policies
            overlay["retry"] = retry
        return self.config

    def update_model_route(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        model, route = self._validate_model_route_patch(patch)
        with self._locked_overlay() as overlay:
            models = overlay.setdefault("models", {})
            if not isinstance(models, dict):
                models = {}
                overlay["models"] = models
            routes = models.setdefault("routes", {})
            if not isinstance(routes, dict):
                routes = {}
            routes[model] = route
            models["routes"] = routes
        return self.config

    def delete_model_route(self, model: str) -> Dict[str, Any]:
        model_id = self._validate_model_id(model)
        with self._locked_overlay() as overlay:
            models = overlay.setdefault("models", {})
            if not isinstance(models, dict):
                models = {}
                overlay["models"] = models
            routes = models.setdefault("routes", {})
            if not isinstance(routes, dict):
                routes = {}
            routes.pop(model_id, None)

            base_routes = ((self.base_config.get("models") or {}).get("routes") or {})
            if isinstance(base_routes, dict) and model_id in base_routes:
                routes[model_id] = None
            models["routes"] = routes
        return self.config

    def update_provider_model_disabled(self, provider: str, model: str, disabled: bool) -> Dict[str, Any]:
        self._require_provider(provider)
        model_id = self._validate_model_id(model)
        with self._locked_overlay() as overlay:
            models = overlay.setdefault("models", {})
            if not isinstance(models, dict):
                models = {}
                overlay["models"] = models
            disabled_map = copy.deepcopy((self.config.get("models") or {}).get("provider_model_disabled") or {})
            if not isinstance(disabled_map, dict):
                disabled_map = {}
            provider_map = copy.deepcopy(disabled_map.get(provider) or {})
            if not isinstance(provider_map, dict):
                provider_map = {}
            if disabled:
                provider_map[model_id] = True
            else:
                provider_map.pop(model_id, None)
            if provider_map:
                disabled_map[provider] = provider_map
            else:
                disabled_map.pop(provider, None)
            models["provider_model_disabled"] = disabled_map
        return self.config

    def update_provider_models_disabled(self, provider: str, model_states: Dict[str, bool]) -> Dict[str, Any]:
        self._require_provider(provider)
        if not isinstance(model_states, dict):
            raise ConfigValidationError("models must be an object")
        with self._locked_overlay() as overlay:
            models = overlay.setdefault("models", {})
            if not isinstance(models, dict):
                models = {}
                overlay["models"] = models
            disabled_map = copy.deepcopy((self.config.get("models") or {}).get("provider_model_disabled") or {})
            if not isinstance(disabled_map, dict):
                disabled_map = {}
            provider_map = copy.deepcopy(disabled_map.get(provider) or {})
            if not isinstance(provider_map, dict):
                provider_map = {}
            for model, disabled in model_states.items():
                model_id = self._validate_model_id(model)
                if disabled:
                    provider_map[model_id] = True
                else:
                    provider_map.pop(model_id, None)
            if provider_map:
                disabled_map[provider] = provider_map
            else:
                disabled_map.pop(provider, None)
            models["provider_model_disabled"] = disabled_map
        return self.config

    def update_provider_model_mapping(
        self,
        provider: str,
        *,
        model: str,
        raw_model: str = "",
        old_model: str = "",
    ) -> Dict[str, Any]:
        self._require_provider(provider)
        new_model = self._validate_model_id(model) if str(model or "").strip() else ""
        old_model_id = self._validate_model_id(old_model) if str(old_model or "").strip() else ""
        raw_model_id = self._validate_model_id(raw_model) if str(raw_model or "").strip() else ""
        if new_model and not raw_model_id:
            raise ConfigValidationError("raw_model is required")
        if not new_model and not old_model_id:
            raise ConfigValidationError("model or old_model is required")

        with self._locked_overlay() as overlay:
            models = overlay.setdefault("models", {})
            if not isinstance(models, dict):
                models = {}
                overlay["models"] = models

            # Read the overlay's own provider_model_map (NOT the merged config).
            # This ensures we only carry forward the user's explicit overrides;
            # base-config entries are handled via tombstones so they don't
            # "resurrect" after being renamed or deleted.
            overlay_maps = models.get("provider_model_map")
            if not isinstance(overlay_maps, dict):
                overlay_maps = {}
            overlay_map = copy.deepcopy(overlay_maps.get(provider) or {})
            if not isinstance(overlay_map, dict):
                overlay_map = {}

            # Determine which old_model entries exist in base config so we can
            # tombstone them instead of merely popping (which would let the base
            # entry reappear after _deep_merge).
            base_maps = (self.base_config.get("models") or {}).get("provider_model_map") or {}
            base_map = base_maps.get(provider) if isinstance(base_maps, dict) else None
            base_map = base_map if isinstance(base_map, dict) else {}

            if old_model_id and old_model_id != new_model:
                if old_model_id in base_map:
                    overlay_map[old_model_id] = None  # tombstone
                else:
                    overlay_map.pop(old_model_id, None)
            if new_model:
                overlay_map[new_model] = raw_model_id
            elif old_model_id:
                if old_model_id in base_map:
                    overlay_map[old_model_id] = None  # tombstone
                else:
                    overlay_map.pop(old_model_id, None)

            if overlay_map:
                overlay_maps[provider] = overlay_map
            else:
                overlay_maps.pop(provider, None)
            models["provider_model_map"] = overlay_maps
        return self.config

    def _remove_provider_from_routes(self, overlay_models: Dict[str, Any], provider: str) -> None:
        routes = copy.deepcopy(overlay_models.get("routes") or (self.config.get("models") or {}).get("routes") or {})
        if not isinstance(routes, dict):
            return
        for model, route in list(routes.items()):
            if not isinstance(route, dict):
                continue
            providers = []
            changed = False
            for item in route.get("providers") or []:
                item_name = item if isinstance(item, str) else (item or {}).get("name")
                if str(item_name or "") == provider:
                    changed = True
                    continue
                providers.append(copy.deepcopy(item))
            if changed:
                if providers:
                    route = copy.deepcopy(route)
                    route["providers"] = providers
                    routes[model] = route
                else:
                    routes[model] = None
        overlay_models["routes"] = routes

    def _remove_provider_map_entry(self, overlay_models: Dict[str, Any], provider: str, field: str) -> None:
        source = copy.deepcopy(overlay_models.get(field) or (self.config.get("models") or {}).get(field) or {})
        if not isinstance(source, dict) or provider not in source:
            return
        if provider in ((self.base_config.get("models") or {}).get(field) or {}):
            source[provider] = None
        else:
            source.pop(provider, None)
        overlay_models[field] = source

    def reload(self, base_config: Dict[str, Any]) -> Dict[str, Any]:
        # Serialize against concurrent _locked_overlay / _commit_overlay
        # mutations. Without this lock, a concurrent admin mutation could
        # read a half-rebuilt config (base_config swapped but overlay/config
        # still stale). RLock allows nested re-entry from already-held
        # commit-lock contexts.
        with self._commit_lock:
            self.base_config = copy.deepcopy(base_config or {})
            self.overlay = self._read_overlay()
            self.config = self._normalized_merged()
            return self.config

    def _overlay_provider_base(self, provider: str) -> Dict[str, Any]:
        return copy.deepcopy(((self.config.get("providers") or {}).get(provider) or {}))

    def _require_provider(self, provider: str) -> None:
        self._validate_provider_name(provider)
        if provider not in (self.config.get("providers") or {}):
            raise ConfigValidationError(f"unknown provider: {provider}")

    @staticmethod
    def _validate_provider_name(name: str) -> None:
        value = str(name or "")
        if not value or len(value) > 80:
            raise ConfigValidationError(f"invalid provider name: {name}")
        for ch in value:
            if ch in "_.-":
                continue
            if ch.isalnum():
                continue
            raise ConfigValidationError(f"invalid provider name: {name}")

    def _validate_provider_config(self, provider_cfg: Dict[str, Any], *, require_keys: bool) -> Dict[str, Any]:
        if not isinstance(provider_cfg, dict):
            raise ConfigValidationError("provider config must be an object")
        clean = self._validate_provider_patch(provider_cfg)
        if not clean.get("base_url"):
            raise ConfigValidationError("provider base_url is required")
        if require_keys and not clean.get("keys"):
            raise ConfigValidationError("provider keys are required")
        return clean

    @staticmethod
    def _validate_provider_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("provider patch must be a non-empty object")
        allowed = {
            "base_url",
            "models_path",
            "enabled",
            "keys",
            "proxy",
            "headers",
            "formats",
            "chat_completions_path",
            "responses_path",
            "anthropic_messages_path",
            "forward_client_headers",
            "user_agent",
            "force_reasoning_content",
            "force_anthropic_thinking",
            "assume_supports_unknown_models",
            "pricing",
            "priority",
            "static_models",
            "skip_idle_probe",
            "skip_patrol_probe",
        }
        clean: Dict[str, Any] = {}
        for key, value in patch.items():
            if key not in allowed:
                raise ConfigValidationError(f"unsupported provider field: {key}")
            clean[key] = copy.deepcopy(value)
        # Coerce skip_probe flags to booleans.
        if "skip_idle_probe" in clean:
            clean["skip_idle_probe"] = bool(clean["skip_idle_probe"])
        if "skip_patrol_probe" in clean:
            clean["skip_patrol_probe"] = bool(clean["skip_patrol_probe"])
        if "base_url" in clean and not str(clean.get("base_url") or "").strip():
            raise ConfigValidationError("base_url cannot be empty")
        if "user_agent" in clean:
            clean["user_agent"] = str(clean.get("user_agent") or "").strip()
        if "keys" in clean:
            keys = clean.get("keys")
            if not isinstance(keys, (str, list)):
                raise ConfigValidationError("keys must be a list")
            keys = normalize_key_entries(keys)
            if not keys:
                raise ConfigValidationError("keys cannot be empty")
            clean["keys"] = keys
        if "formats" in clean:
            formats = clean.get("formats")
            if not isinstance(formats, dict):
                raise ConfigValidationError("formats must be an object")
            for fmt in formats.keys():
                if fmt not in SUPPORTED_FORMATS:
                    raise ConfigValidationError(f"unsupported format: {fmt}")
        for bool_field in ("enabled", "force_reasoning_content", "force_anthropic_thinking", "assume_supports_unknown_models"):
            if bool_field in clean:
                clean[bool_field] = bool(clean.get(bool_field))
        if "pricing" in clean and not isinstance(clean.get("pricing"), dict):
            raise ConfigValidationError("pricing must be an object")
        if "priority" in clean:
            clean["priority"] = RuntimeConfigManager._bounded_int(clean.get("priority"), "priority", -1000, 1000)
        if "static_models" in clean:
            sm = clean.get("static_models")
            if sm is None:
                pass  # allow clearing
            elif isinstance(sm, list):
                seen = set()
                out = []
                for m in sm:
                    value = str(m).strip()
                    if not value or value in seen:
                        continue
                    seen.add(value)
                    out.append(value)
                clean["static_models"] = out
            elif isinstance(sm, str):
                seen = set()
                out = []
                for m in sm.split(","):
                    value = m.strip()
                    if not value or value in seen:
                        continue
                    seen.add(value)
                    out.append(value)
                clean["static_models"] = out
            else:
                raise ConfigValidationError("static_models must be a list of model id strings")
        return clean

    def _validate_routing_patch(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("routing patch must be a non-empty object")
        allowed = {
            "default_provider_pool",
            "provider_select",
            "format_preference",
            "max_attempts",
            "connect_timeout_s",
            "read_timeout_s",
            "first_token_timeout_s",
        }
        clean: Dict[str, Any] = {}
        for key, value in patch.items():
            if key not in allowed:
                raise ConfigValidationError(f"unsupported routing field: {key}")
            if key == "default_provider_pool":
                clean[key] = self._provider_pool(value)
            elif key == "provider_select":
                mode = str(value or "").strip()
                if mode not in PROVIDER_SELECT_MODES:
                    raise ConfigValidationError(f"unsupported provider_select: {mode}")
                clean[key] = mode
            elif key == "format_preference":
                mode = str(value or "").strip()
                if mode not in FORMAT_PREFERENCE_MODES:
                    raise ConfigValidationError(f"unsupported format_preference: {mode}")
                clean[key] = mode
            elif key == "max_attempts":
                clean[key] = self._bounded_int(value, key, 1, 50)
            elif key == "first_token_timeout_s":
                clean[key] = self._bounded_int(value, key, 0, 600)
            else:
                clean[key] = self._bounded_int(value, key, 1, 3600)
        return clean

    def _validate_retry_patch(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("retry patch must be a non-empty object")
        allowed = {"retryable_status", "key_fatal_status", "respect_retry_after", "cooldown_s", "key_failure_ladder_s", "same_key_retries"}
        clean: Dict[str, Any] = {}
        for key, value in patch.items():
            if key not in allowed:
                raise ConfigValidationError(f"unsupported retry field: {key}")
            if key in ("retryable_status", "key_fatal_status"):
                clean[key] = self._status_list(value, key)
            elif key == "respect_retry_after":
                clean[key] = bool(value)
            elif key == "same_key_retries":
                clean[key] = self._bounded_int(value, "same_key_retries", 0, 3)
            elif key == "key_failure_ladder_s":
                if not isinstance(value, list) or not value:
                    raise ConfigValidationError("key_failure_ladder_s must be a non-empty list")
                clean[key] = [self._bounded_int(item, "key_failure_ladder_s", 0, MAX_CONFIGURED_COOLDOWN_S) for item in value]
            elif key == "cooldown_s":
                if not isinstance(value, dict) or not value:
                    raise ConfigValidationError("cooldown_s must be a non-empty object")
                cooldowns = {}
                for name, seconds in value.items():
                    if name not in ("rate_limit", "server_error", "network_error", "key_invalid", "quota_or_balance"):
                        raise ConfigValidationError(f"unsupported cooldown field: {name}")
                    cooldowns[name] = self._bounded_int(seconds, f"cooldown_s.{name}", 0, 86400)
                clean[key] = cooldowns
        return clean

    def _validate_model_route_patch(self, patch: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("model route patch must be a non-empty object")
        allowed = {"model", "providers", "provider_select"}
        for key in patch.keys():
            if key not in allowed:
                raise ConfigValidationError(f"unsupported model route field: {key}")

        model = self._validate_model_id(patch.get("model"))
        providers = self._route_provider_items(patch.get("providers"))
        provider_select = str(patch.get("provider_select") or "priority_failover").strip()
        if provider_select not in PROVIDER_SELECT_MODES:
            raise ConfigValidationError(f"unsupported provider_select: {provider_select}")
        return model, {"providers": providers, "provider_select": provider_select}

    @staticmethod
    def _validate_model_id(model: Any) -> str:
        model_id = str(model or "").strip()
        if not model_id:
            raise ConfigValidationError("model is required")
        if len(model_id) > 256:
            raise ConfigValidationError("model is too long")
        if any(ord(ch) < 32 for ch in model_id):
            raise ConfigValidationError("model contains control characters")
        return model_id

    def _route_provider_items(self, value: Any) -> list:
        if isinstance(value, str):
            raw_items = [x.strip() for x in value.split(",")]
        elif isinstance(value, list):
            raw_items = value
        else:
            raise ConfigValidationError("providers must be a list or comma-separated string")

        out = []
        seen = set()
        for item in raw_items:
            if item in (None, ""):
                continue
            if isinstance(item, str):
                name, weight, priority = self._parse_route_provider_text(item)
            elif isinstance(item, dict):
                name = str(item.get("name") or "").strip()
                weight = item.get("weight", 1)
                priority = item.get("priority") if "priority" in item else None
            else:
                raise ConfigValidationError("route provider must be a string or object")

            self._require_provider(name)
            if name in seen:
                raise ConfigValidationError(f"duplicate route provider: {name}")
            seen.add(name)
            entry = {"name": name, "weight": self._bounded_int(weight, f"providers.{name}.weight", 1, 100)}
            if priority is not None:
                entry["priority"] = self._bounded_int(priority, f"providers.{name}.priority", -1000, 1000)
            out.append(entry)

        if not out:
            raise ConfigValidationError("providers cannot be empty")
        return out

    @staticmethod
    def _parse_route_provider_text(value: str) -> Tuple[str, Any, Optional[Any]]:
        text = str(value or "").strip()
        if not text:
            return "", 1, None
        if ":" not in text:
            return text, 1, None
        parts = [part.strip() for part in text.split(":")]
        if len(parts) == 2:
            name, weight = parts
            return name, weight, None
        name = parts[0]
        weight = parts[1] if parts[1] else 1
        priority = ":".join(parts[2:]).strip()
        return name, weight, priority if priority else None

    def _validate_failure_policy_patch(self, patch: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("failure policy patch must be a non-empty object")
        allowed = {"error_type", "cooldown_scope", "cooldown_s", "provider_cooldown_s", "disables_key"}
        for key in patch.keys():
            if key not in allowed:
                raise ConfigValidationError(f"unsupported failure policy field: {key}")

        error_type = str(patch.get("error_type") or "").strip()
        if error_type not in _FAILURE_ERROR_TYPES:
            raise ConfigValidationError(f"unsupported error_type: {error_type}")

        existing_policy = (((self.config.get("retry") or {}).get("failure_policies") or {}).get(error_type) or {})
        clean: Dict[str, Any] = {}
        scope = str(patch.get("cooldown_scope") or "").strip()
        if not scope:
            scope = str(existing_policy.get("cooldown_scope") or "key")
        if scope not in VALID_COOLDOWN_SCOPES:
            raise ConfigValidationError(f"unsupported cooldown_scope: {scope}")
        clean["cooldown_scope"] = scope

        if "cooldown_s" in patch:
            clean["cooldown_s"] = self._bounded_int(patch.get("cooldown_s"), "cooldown_s", 0, MAX_CONFIGURED_COOLDOWN_S)
        if "provider_cooldown_s" in patch:
            clean["provider_cooldown_s"] = self._bounded_int(
                patch.get("provider_cooldown_s"),
                "provider_cooldown_s",
                0,
                MAX_PROVIDER_COOLDOWN_S,
            )
        if "disables_key" in patch:
            clean["disables_key"] = bool(patch.get("disables_key"))

        clean.setdefault("cooldown_s", self._bounded_int(existing_policy.get("cooldown_s") or 0, "cooldown_s", 0, MAX_CONFIGURED_COOLDOWN_S))
        clean.setdefault(
            "provider_cooldown_s",
            self._bounded_int(existing_policy.get("provider_cooldown_s") or 0, "provider_cooldown_s", 0, MAX_PROVIDER_COOLDOWN_S),
        )
        clean.setdefault("disables_key", bool(existing_policy.get("disables_key", False)))
        if scope == "none":
            clean["cooldown_s"] = 0
            clean["provider_cooldown_s"] = 0
            clean["disables_key"] = False
        elif scope == "provider":
            clean["cooldown_s"] = 0
            clean["disables_key"] = False
            if clean["provider_cooldown_s"] <= 0:
                clean["provider_cooldown_s"] = 1
        elif scope == "key":
            clean["provider_cooldown_s"] = 0
        elif scope == "key_provider" and clean["provider_cooldown_s"] <= 0:
            clean["provider_cooldown_s"] = min(max(1, int(clean.get("cooldown_s") or 1)), 30)
        return error_type, clean

    def _provider_pool(self, value: Any) -> list:
        if isinstance(value, str):
            items = [x.strip() for x in value.split(",")]
        elif isinstance(value, list):
            items = [str(x).strip() for x in value]
        else:
            raise ConfigValidationError("default_provider_pool must be a list or comma-separated string")
        out = []
        for name in items:
            if not name:
                continue
            self._validate_provider_name(name)
            if name not in out:
                out.append(name)
        if not out:
            raise ConfigValidationError("default_provider_pool cannot be empty")
        return out

    @staticmethod
    def _status_list(value: Any, field: str) -> list:
        if isinstance(value, str):
            raw = [x.strip() for x in value.split(",")]
        elif isinstance(value, list):
            raw = value
        else:
            raise ConfigValidationError(f"{field} must be a list or comma-separated string")
        out = []
        for item in raw:
            if item == "":
                continue
            try:
                status = int(item)
            except Exception:
                raise ConfigValidationError(f"{field} contains non-integer status: {item}") from None
            if status < 100 or status > 599:
                raise ConfigValidationError(f"{field} contains invalid status: {status}")
            if status not in out:
                out.append(status)
        if not out:
            raise ConfigValidationError(f"{field} cannot be empty")
        return out

    @staticmethod
    def _bounded_int(value: Any, field: str, min_value: int, max_value: int) -> int:
        try:
            out = int(value)
        except Exception:
            raise ConfigValidationError(f"{field} must be an integer") from None
        if out < min_value or out > max_value:
            raise ConfigValidationError(f"{field} must be between {min_value} and {max_value}")
        return out

    def _read_overlay(self) -> Dict[str, Any]:
        if not os.path.exists(self.overlay_path):
            return {}
        try:
            with open(self.overlay_path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _normalized_merged(self) -> Dict[str, Any]:
        return self._normalized_config_for_overlay(self.overlay)

    def _normalized_config_for_overlay(self, overlay: Dict[str, Any]) -> Dict[str, Any]:
        merged = _deep_merge(copy.deepcopy(self.base_config), overlay)
        normalized = _normalize_config(merged)
        providers = normalized.get("providers") or {}
        if isinstance(providers, dict):
            for provider in [name for name, value in providers.items() if value is None]:
                providers.pop(provider, None)
        routes = ((normalized.get("models") or {}).get("routes") or {})
        if isinstance(routes, dict):
            for model in [name for name, route in routes.items() if route is None]:
                routes.pop(model, None)
        models = normalized.get("models") or {}
        if isinstance(models, dict):
            for field in ("provider_model_map", "provider_model_capabilities", "provider_model_disabled"):
                entries = models.get(field) or {}
                if isinstance(entries, dict):
                    for provider in [name for name, value in entries.items() if value is None]:
                        entries.pop(provider, None)
                    # Also remove individual None tombstones inside each provider's map
                    if field == "provider_model_map":
                        for prov_name, prov_map in entries.items():
                            if isinstance(prov_map, dict):
                                for key in [k for k, v in prov_map.items() if v is None]:
                                    prov_map.pop(key, None)
        return normalized

    def _commit_overlay(self, overlay: Dict[str, Any]) -> Dict[str, Any]:
        """Legacy commit — persists a pre-built overlay dict.

        Prefer _locked_overlay() for new code, as it serializes the full
        read-modify-write cycle and prevents lost updates under concurrency.
        """
        with self._commit_lock:
            overlay = self._prune_overlay_tombstones(copy.deepcopy(overlay))
            self._write_overlay(overlay)
            self.overlay = overlay
            self.config = self._normalized_merged()
            return self.config

    def compact_overlay(self) -> Dict[str, Any]:
        with self._locked_overlay():
            pass
        return self.config

    def _prune_overlay_tombstones(self, overlay: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(overlay, dict):
            return {}

        providers = overlay.get("providers")
        if isinstance(providers, dict):
            base_providers = self.base_config.get("providers") or {}
            for provider in [name for name, value in providers.items() if value is None and name not in base_providers]:
                providers.pop(provider, None)
            if not providers:
                overlay.pop("providers", None)

        models = overlay.get("models")
        if isinstance(models, dict):
            routes = models.get("routes")
            if isinstance(routes, dict):
                base_routes = (self.base_config.get("models") or {}).get("routes") or {}
                for model in [name for name, value in routes.items() if value is None and name not in base_routes]:
                    routes.pop(model, None)
                if not routes:
                    models.pop("routes", None)

            for field in ("provider_model_map", "provider_model_capabilities", "provider_model_disabled"):
                entries = models.get(field)
                if not isinstance(entries, dict):
                    continue
                base_entries = (self.base_config.get("models") or {}).get(field) or {}
                for provider in [name for name, value in entries.items() if value is None and name not in base_entries]:
                    entries.pop(provider, None)
                if not entries:
                    models.pop(field, None)

            if not models:
                overlay.pop("models", None)

        return overlay

    def _write_overlay(self, overlay: Dict[str, Any]) -> None:
        directory = os.path.dirname(os.path.abspath(self.overlay_path)) or "."
        os.makedirs(directory, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix=".runtime_config.", suffix=".tmp", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(overlay, f, ensure_ascii=False, indent=2)
                f.write("\n")
            for attempt in range(5):
                try:
                    os.replace(tmp_path, self.overlay_path)
                    break
                except OSError as e:
                    if e.errno in (errno.EBUSY, errno.EXDEV):
                        self._write_overlay_in_place(tmp_path)
                        break
                    if attempt == 4:
                        raise
                    import time
                    time.sleep(0.1)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    def _write_overlay_in_place(self, tmp_path: str) -> None:
        """Fallback for Docker single-file bind mounts where rename returns EBUSY."""
        data = self._read_text(tmp_path)
        with open(self.overlay_path, "w", encoding="utf-8") as dst:
            dst.write(data)
            dst.flush()
            os.fsync(dst.fileno())

    @staticmethod
    def _read_text(path: str) -> str:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    @classmethod
    def _copy_file(cls, src_path: str, dst_path: str) -> None:
        data = cls._read_text(src_path)
        with open(dst_path, "w", encoding="utf-8") as dst:
            dst.write(data)
            dst.flush()
            os.fsync(dst.fileno())

    @staticmethod
    def _server_view(server: Dict[str, Any]) -> Dict[str, Any]:
        view = copy.deepcopy(server)
        if view.get("admin_key"):
            view["admin_key"] = "***"
        return view

    @staticmethod
    def _models_view(models: Dict[str, Any]) -> Dict[str, Any]:
        view = copy.deepcopy(models)
        view.pop("provider_model_capabilities", None)
        view.pop("models_union_snapshot", None)
        view.setdefault("routes", {})
        view.setdefault("provider_model_map", {})
        view.setdefault("provider_model_disabled", {})
        return view

    @staticmethod
    def _provider_view(pcfg: Dict[str, Any]) -> Dict[str, Any]:
        view = copy.deepcopy(pcfg)
        view["proxy"] = proxy_display(pcfg.get("proxy"))
        keys = []
        for idx, key in enumerate(pcfg.get("keys") or []):
            key_s = key_value(key)
            keys.append(
                {
                    "index": idx,
                    "key_id": _hash_key_short(key_s),
                    "masked": _mask_key(key_s),
                    "proxy": proxy_display(key.get("proxy") if isinstance(key, dict) else {}),
                }
            )
        view["keys"] = keys
        return view

    @classmethod
    def _safe_fragment(cls, value: Any, field_name: str = "") -> Any:
        sensitive = {"key", "keys", "api_key", "apikey", "admin_key", "authorization", "x-admin-key", "bearer"}
        if field_name.lower() in sensitive:
            if isinstance(value, list):
                return [cls._safe_key_entry(v) for v in value]
            if isinstance(value, dict):
                return cls._safe_key_entry(value)
            return cls._safe_secret(str(value))
        if isinstance(value, dict):
            return {str(k): cls._safe_fragment(v, str(k)) for k, v in value.items()}
        if isinstance(value, list):
            return [cls._safe_fragment(v, field_name) for v in value]
        if isinstance(value, str) and (value.startswith("sk-") or value.lower().startswith("bearer ")):
            return cls._safe_secret(value)
        return copy.deepcopy(value)

    @staticmethod
    def _safe_secret(value: str) -> str:
        return _mask_key(str(value), prefix=6, suffix=4)

    @classmethod
    def _safe_key_entry(cls, value: Any) -> Any:
        if isinstance(value, dict):
            out = copy.deepcopy(value)
            raw_key = key_value(value)
            out.pop("api_key", None)
            out["key"] = cls._safe_secret(raw_key)
            if "proxy" in out:
                out["proxy"] = copy.deepcopy(value.get("proxy") or {})
            return out
        return cls._safe_secret(str(value))
