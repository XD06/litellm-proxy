import hmac
import json
import re
import traceback
import urllib.parse
from typing import Optional

# Process-level cache for the model-pricing batch endpoint. Keyed on the raw
# "models" query string; value is {"ts", "payload"}. See the endpoint handler
# for why this is critical (unknown-model fuzzy resolves were 8-16s per poll).
_MODEL_PRICING_CACHE: dict = {}

class AdminRoutesMixin:
    def _admin_authorized(self) -> bool:
        import sse2json as sse
        _admin_key = sse._admin_key
        _allow_query_admin_key = sse._allow_query_admin_key
        expected = _admin_key()
        if not expected:
            return False
        supplied = self.headers.get("X-Admin-Key") or ""
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            supplied = auth.split(" ", 1)[1].strip()
        if not supplied and _allow_query_admin_key():
            try:
                from urllib.parse import parse_qs, urlparse

                qs = parse_qs(urlparse(self.path).query or "")
                supplied = (qs.get("admin_key") or [""])[0]
            except Exception:
                supplied = ""
        if not supplied:
            return False
        return hmac.compare_digest(str(supplied), expected)

    def _audit_admin_event(
        self,
        action: str,
        *,
        target: str = "",
        detail: Optional[dict] = None,
        status: str = "success",
        error: str = "",
    ) -> None:
        import sse2json as sse
        AUDIT = sse.AUDIT
        try:
            source_ip = ""
            if isinstance(getattr(self, "client_address", None), tuple) and self.client_address:
                source_ip = str(self.client_address[0])
            AUDIT.record(
                action,
                target=target,
                status=status,
                detail=detail or {},
                error=error,
                source_ip=source_ip,
                path=str(getattr(self, "path", "") or ""),
            )
        except Exception:
            pass

    def _resp_admin(self, endpoint: str):
        import sse2json as sse
        CONFIG_MANAGER = sse.CONFIG_MANAGER
        OBSERVABILITY = sse.OBSERVABILITY
        AUDIT = sse.AUDIT
        ROUTER = sse.ROUTER
        CONFIG = sse.CONFIG
        scheduler_policy = sse.scheduler_policy
        model_registry = sse.model_registry
        load_base_config = sse.load_base_config
        _refresh_models_after_config_change = sse._refresh_models_after_config_change
        _apply_runtime_config = sse._apply_runtime_config
        _clear_diagnostic_log = sse._clear_diagnostic_log
        fetch_provider_models = sse.fetch_provider_models
        probe_provider_key = sse.probe_provider_key
        fetch_upstream_models = sse.fetch_upstream_models
        _model_capabilities_snapshot = sse._model_capabilities_snapshot
        _save_router_state = sse._save_router_state
        ConfigValidationError = sse.ConfigValidationError
        _request_filter_payload = sse._request_filter_payload

        if not self._admin_authorized():
            return self._resp_json({"error": {"message": "admin auth required"}}, 403)
        if endpoint == "status":
            history_dropped = 0
            try:
                history_dropped = int(OBSERVABILITY._history.dropped_count())
            except Exception:
                pass
            # Include zero-config and provider-preset info so the dashboard
            # can render its guided onboarding experience.
            from config_loader import PROVIDER_ENV_PRESETS, ZERO_CONFIG_ACTIVE
            return self._resp_json(
                {
                    "status": "ok",
                    "metrics": OBSERVABILITY.snapshot_lite(),
                    "router": ROUTER.snapshot(),
                    "policy": scheduler_policy.policy_snapshot(CONFIG),
                    "history_dropped": history_dropped,
                    "zero_config": bool(ZERO_CONFIG_ACTIVE),
                    "provider_presets": [
                        {
                            "env_var": env_var,
                            "name": preset["name"],
                            "base_url": preset["base_url"],
                            "formats": list(preset.get("formats", {}).keys()),
                            "priority": preset.get("priority", 0),
                        }
                        for env_var, preset in PROVIDER_ENV_PRESETS.items()
                    ],
                }
            )
        if endpoint == "metrics":
            # Lightweight poll payload: counters + failure_summary + active,
            # without the heavy recent_requests array. Use metrics/full when
            # the raw recent request ring is needed (requests view, export).
            return self._resp_json(OBSERVABILITY.snapshot_lite())
        if endpoint == "metrics/full":
            return self._resp_json(OBSERVABILITY.snapshot())
        if endpoint == "provider-activity":
            # Default: aggregate stats only (no per-event list). The events
            # list is only needed by the provider drawer's recent-activity
            # panel, so it is fetched on demand per provider via
            # provider-activity/{name} instead of on every 5s poll.
            params = self._query_params()
            include_events = str(params.get("include_events", "")).lower() in ("1", "true", "yes")
            return self._resp_json(
                {
                    "providers": OBSERVABILITY.provider_activity_summary(
                        limit=int(params.get("limit", 60) or 60),
                        include_events=include_events,
                    )
                }
            )
        if endpoint.startswith("provider-activity/"):
            # Single-provider recent activity with the full event list, for the
            # provider drawer. Bounded to one provider so the payload stays
            # small even when many providers have activity.
            name = endpoint.split("/", 1)[1]
            params = self._query_params()
            entry = OBSERVABILITY.provider_activity_for(
                name, limit=int(params.get("limit", 60) or 60)
            )
            return self._resp_json({"provider": name, "activity": entry})
        if endpoint == "health/scores":
            # Per-provider health scores (0–100) combining success rate,
            # latency, key availability, and cooldown state. Used by the
            # dashboard's failover health overview widget.
            router_snap = ROUTER.snapshot()
            scores = OBSERVABILITY.provider_health_scores(router_snapshot=router_snap)
            # Feed scores back to the router for auto routing mode.
            ROUTER.update_health_scores(scores)
            return self._resp_json(scores)
        if endpoint == "routing":
            return self._resp_json(
                {
                    "router": ROUTER.snapshot(),
                    "policy": scheduler_policy.policy_snapshot(CONFIG),
                }
            )
        if endpoint == "models/capabilities":
            return self._resp_json(_model_capabilities_snapshot())
        if endpoint == "models/discovery-status":
            return self._resp_json(sse._discovery_status())
        if endpoint == "config":
            return self._resp_json(CONFIG_MANAGER.snapshot())
        if endpoint == "config/overlay":
            return self._resp_json(CONFIG_MANAGER.overlay_snapshot())
        if endpoint == "audit":
            params = self._query_params()
            return self._resp_json(AUDIT.list(limit=params.get("limit", 50)))
        if endpoint == "requests":
            filters = self._query_params()
            limit = filters.pop("limit", 50)
            offset = filters.pop("offset", 0)
            return self._resp_json(OBSERVABILITY.list_requests(filters=filters, limit=limit, offset=offset))
        if endpoint.startswith("requests/"):
            request_id = endpoint.split("/", 1)[1]
            detail = OBSERVABILITY.get_request(request_id)
            if detail is None:
                return self._resp_json({"error": {"message": f"unknown request: {request_id}"}}, 404)
            return self._resp_json(detail)
        if endpoint == "metrics/timeseries":
            params = self._query_params()
            return self._resp_json(
                OBSERVABILITY.timeseries(
                    bucket_s=params.get("bucket_s", 60),
                    buckets=params.get("buckets", 30),
                )
            )
        if endpoint == "model-pricing":
            # Batch read-only pricing lookup from the local AA cache. NEVER
            # triggers a network fetch (unlike model-summary/{slug}), so it is
            # safe to call from the dashboard on every status poll. Models not
            # in the cache simply return no pricing.
            params = self._query_params()
            requested = str(params.get("models") or "").strip()
            # Process-level TTL cache keyed on the sorted candidate set. The
            # dashboard polls this every ~5s with a nearly-identical model list,
            # and resolving unknown models via the fuzzy AA index is O(n) each
            # (~80ms * 100+ unknowns = 8-16s per call). Caching the resolved
            # payload for a short window keeps the poll cheap and stops these
            # expensive calls from saturating the worker pool under tab switches.
            import time as _time
            cache_ttl = 30
            now = _time.time()
            cache_key = requested
            cached_entry = _MODEL_PRICING_CACHE.get(cache_key)
            if cached_entry and (now - cached_entry["ts"]) < cache_ttl:
                return self._resp_json(cached_entry["payload"])
            try:
                from artificial_analysis_api import aa
                # Ensure the in-memory slug index is populated from the local
                # model_index.json. Without this, _index.resolve() always
                # returns None because resolve() does not lazy-load. This is a
                # pure local file read, no network.
                try:
                    aa._index.load_local()
                except Exception:
                    pass
                pricing_by_model = {}
                # Build the candidate model set: either the caller-supplied
                # comma-separated list, or every slug that has a cached file.
                # Cap the candidate count so a single dashboard poll cannot
                # trigger hundreds of O(n) fuzzy resolves for unknown models.
                MAX_PRICING_CANDIDATES = 80
                if requested:
                    candidates = [m.strip() for m in requested.split(",") if m.strip()][:MAX_PRICING_CANDIDATES]
                    truncated = len([m for m in requested.split(",") if m.strip()]) > MAX_PRICING_CANDIDATES
                else:
                    candidates = []
                    try:
                        for slug in (aa._cache.list_slugs() if hasattr(aa._cache, "list_slugs") else []):
                            candidates.append(slug)
                    except Exception:
                        pass
                    truncated = False

                # Build a fast reverse-lookup index ONCE instead of calling
                # _index.resolve() per candidate (which rebuilds name_to_slug
                # and runs O(n) fuzzy matching every time). For 200 candidates
                # this cuts the endpoint from ~6s to a few ms.
                models_map = getattr(aa._index, "_models", {}) or {}
                fast_lookup = {}  # normalized_key -> slug
                for slug, short_name in models_map.items():
                    for k in (slug, slug.lower(), short_name, short_name.lower() if short_name else ""):
                        if k and k not in fast_lookup:
                            fast_lookup[k] = slug

                def fast_resolve(query):
                    q = (query or "").strip().lower()
                    if not q:
                        return None
                    if q in fast_lookup:
                        return fast_lookup[q]
                    # Try last path segment (e.g. "Pro/Qwen/Qwen3-32B" -> "Qwen3-32B").
                    last = re.split(r"[/\s]+", q)[-1]
                    if last != q and last in fast_lookup:
                        return fast_lookup[last]
                    # Normalized form of the full query (separators -> dash).
                    norm = re.sub(r"[^a-z0-9]+", "-", q).strip("-")
                    if norm and norm in fast_lookup:
                        return fast_lookup[norm]
                    # Normalized form of the last segment alone (e.g.
                    # "Pro/deepseek-ai/DeepSeek-V3.2" -> last="DeepSeek-V3.2"
                    # -> norm="deepseek-v3-2").
                    last_norm = re.sub(r"[^a-z0-9]+", "-", last).strip("-")
                    if last_norm and last_norm != norm and last_norm in fast_lookup:
                        return fast_lookup[last_norm]
                    # Unknown to the local index: do NOT fall back to the full
                    # fuzzy resolver here. That path is O(n) per call (~80ms)
                    # and for non-chat models (embeddings, vision, TTS) that are
                    # absent from the AA index it wasted 8-16s per poll. The
                    # resolver is still used by the explicit model-summary flow.
                    return None

                for model in candidates:
                    try:
                        slug = fast_resolve(model)
                        if not slug:
                            pricing_by_model[model] = {"available": False, "reason": "unresolved"}
                            continue
                        cached = aa._cache.get(slug)
                        if isinstance(cached, dict) and isinstance(cached.get("pricing"), dict):
                            p = cached["pricing"]
                            entry = {
                                "available": True,
                                "slug": slug,
                                "input": p.get("input"),
                                "output": p.get("output"),
                                "cache_hit": p.get("cache_hit"),
                                "blended_per_million": (cached.get("price_blended") or {}).get("price_per_1m_tokens"),
                            }
                            # Index under BOTH the queried name and the slug, so
                            # the frontend can look up pricing by either the raw
                            # union id (e.g. "Pro/Qwen/Qwen3-32B") or the display
                            # label / slug (e.g. "Qwen3-32B" / "qwen3-32b-instruct").
                            pricing_by_model[model] = entry
                            if slug and slug not in pricing_by_model:
                                pricing_by_model[slug] = entry
                        else:
                            pricing_by_model[model] = {"available": False, "reason": "not_cached", "slug": slug}
                    except Exception:
                        pricing_by_model[model] = {"available": False, "reason": "error"}
                payload = {"pricing": pricing_by_model}
                if truncated:
                    payload["truncated"] = True
                # Store in the TTL cache. Bound the cache size to avoid unbounded
                # growth if many distinct model sets are queried over time.
                _MODEL_PRICING_CACHE[cache_key] = {"ts": now, "payload": payload}
                if len(_MODEL_PRICING_CACHE) > 64:
                    # Evict the oldest entries by timestamp.
                    for k, _v in sorted(_MODEL_PRICING_CACHE.items(), key=lambda kv: kv[1]["ts"])[: len(_MODEL_PRICING_CACHE) - 64]:
                        _MODEL_PRICING_CACHE.pop(k, None)
                return self._resp_json(payload)
            except Exception as e:
                return self._resp_json({"error": {"message": str(e)}}, 500)
        if endpoint.startswith("model-summary/"):
            from urllib.parse import unquote
            model_slug = unquote(endpoint.split("/", 1)[1])
            params = self._query_params()
            refresh = params.get("refresh") == "true"
            proxy = params.get("proxy")
            try:
                from artificial_analysis_api import aa
                result = aa.get(model_slug, proxy=proxy, refresh=refresh)
                return self._resp_json(result)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return self._resp_json({"error": str(e)}, 500)
        return self._resp_json({"error": {"message": f"unknown admin endpoint: {endpoint}"}}, 404)

    def _query_params(self) -> dict:
        try:
            from urllib.parse import parse_qs, urlparse

            qs = parse_qs(urlparse(self.path).query or "")
            return {
                str(k): str((v or [""])[0])
                for k, v in qs.items()
                if str(k).lower() != "admin_key"
            }
        except Exception:
            return {}

    def _resp_admin_mutation(self, endpoint: str):
        import sse2json as sse
        CONFIG_MANAGER = sse.CONFIG_MANAGER
        OBSERVABILITY = sse.OBSERVABILITY
        AUDIT = sse.AUDIT
        ROUTER = sse.ROUTER
        CONFIG = sse.CONFIG
        scheduler_policy = sse.scheduler_policy
        model_registry = sse.model_registry
        load_base_config = sse.load_base_config
        _refresh_models_after_config_change = sse._refresh_models_after_config_change
        _apply_runtime_config = sse._apply_runtime_config
        _clear_diagnostic_log = sse._clear_diagnostic_log
        fetch_provider_models = sse.fetch_provider_models
        probe_provider_key = sse.probe_provider_key
        fetch_upstream_models = sse.fetch_upstream_models
        _model_capabilities_snapshot = sse._model_capabilities_snapshot
        _save_router_state = sse._save_router_state
        ConfigValidationError = sse.ConfigValidationError
        _request_filter_payload = sse._request_filter_payload

        if not self._admin_authorized():
            return self._resp_json({"error": {"message": "admin auth required"}}, 403)

        from urllib.parse import unquote
        parts = [unquote(p) for p in str(endpoint or "").strip("/").split("/") if p]
        body = None
        if parts == ["requests", "clear"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "clear_request_history":
                self._audit_admin_event(
                    "request_history_clear_failed",
                    target="requests",
                    status="failed",
                    error="confirmation required",
                )
                return self._resp_json({"error": {"message": "confirm must be clear_request_history"}}, 400)
            result = OBSERVABILITY.clear_history()
            if bool((body or {}).get("include_diagnostics", True)):
                result["diagnostics"] = _clear_diagnostic_log()
            self._audit_admin_event(
                "request_history_cleared",
                target="requests",
                detail={
                    "history_requests_deleted": (result.get("history") or {}).get("requests_deleted", 0),
                    "diagnostics_cleared": bool((result.get("diagnostics") or {}).get("cleared")),
                },
            )
            return self._resp_json({"action": "request_history_cleared", **result})

        if parts == ["requests", "delete"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "delete_request_records":
                self._audit_admin_event(
                    "request_records_delete_failed",
                    target="requests",
                    status="failed",
                    error="confirmation required",
                )
                return self._resp_json({"error": {"message": "confirm must be delete_request_records"}}, 400)
            request_ids = (body or {}).get("request_ids")
            if not isinstance(request_ids, list):
                return self._resp_json({"error": {"message": "request_ids must be a list"}}, 400)
            result = OBSERVABILITY.delete_requests(request_ids)
            self._audit_admin_event(
                "request_records_deleted",
                target="requests",
                detail={
                    "requested": len(request_ids),
                    "history_requests_deleted": (result.get("history") or {}).get("requests_deleted", 0),
                    "memory_recent_deleted": (result.get("memory") or {}).get("recent_requests_deleted", 0),
                },
            )
            return self._resp_json({"action": "request_records_deleted", **result})

        if parts == ["requests", "delete-matching"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "delete_matching_request_records":
                self._audit_admin_event(
                    "request_matching_delete_failed",
                    target="requests",
                    status="failed",
                    error="confirmation required",
                )
                return self._resp_json({"error": {"message": "confirm must be delete_matching_request_records"}}, 400)
            filters = _request_filter_payload((body or {}).get("filters") or {})
            if not filters:
                return self._resp_json({"error": {"message": "at least one filter is required"}}, 400)
            result = OBSERVABILITY.delete_matching_requests(filters)
            history_error = (result.get("history") or {}).get("error")
            if history_error:
                return self._resp_json({"error": {"message": str(history_error)}}, 400)
            self._audit_admin_event(
                "request_matching_records_deleted",
                target="requests",
                detail={
                    "filters": filters,
                    "history_requests_deleted": (result.get("history") or {}).get("requests_deleted", 0),
                    "memory_recent_deleted": (result.get("memory") or {}).get("recent_requests_deleted", 0),
                },
            )
            return self._resp_json({"action": "request_matching_records_deleted", "filters": filters, **result})

        if parts == ["models", "routes", "delete"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            try:
                model = str((body or {}).get("model") or "").strip()
                CONFIG_MANAGER.delete_model_route(model)
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("model_route_deleted", target=model, detail={"model": model})
                return self._resp_json({"action": "model_route_deleted", "model": model, "config": CONFIG_MANAGER.snapshot()})
            except ConfigValidationError as e:
                self._audit_admin_event(
                    "model_route_delete_failed",
                    target=str((body or {}).get("model") or ""),
                    status="failed",
                    detail=body or {},
                    error=str(e),
                )
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["models", "refresh"]:
            model_registry.clear_cache()
            fetch_upstream_models()
            _save_router_state()
            self._audit_admin_event("models_refreshed", target="models")
            return self._resp_json({"action": "models_refreshed", "models": _model_capabilities_snapshot()})

        if parts == ["config", "reload"]:
            try:
                CONFIG_MANAGER.reload(load_base_config(apply_env=False))
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("config_reloaded", target="config")
                return self._resp_json({"action": "config_reloaded", "config": CONFIG_MANAGER.snapshot()})
            except ConfigValidationError as e:
                self._audit_admin_event("config_reload_failed", target="config", status="failed", error=str(e))
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["config", "overlay", "validate"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            try:
                overlay = (body or {}).get("overlay")
                preview = CONFIG_MANAGER.preview_overlay(overlay if overlay is not None else None)
                self._audit_admin_event("config_overlay_validated", target="config/overlay", detail={"has_overlay": preview.get("has_overlay")})
                return self._resp_json({"action": "config_overlay_validated", "preview": preview})
            except ConfigValidationError as e:
                self._audit_admin_event("config_overlay_validate_failed", target="config/overlay", status="failed", error=str(e))
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["config", "overlay", "clear"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            confirm = str((body or {}).get("confirm") or "").strip()
            if confirm != "clear_runtime_overlay":
                self._audit_admin_event("config_overlay_clear_failed", target="config/overlay", status="failed", error="confirmation required")
                return self._resp_json({"error": {"message": "confirm must be clear_runtime_overlay"}}, 400)
            result = CONFIG_MANAGER.clear_overlay()
            _apply_runtime_config(CONFIG_MANAGER.config)
            self._audit_admin_event("config_overlay_cleared", target="config/overlay", detail={"backup_path": result.get("backup_path") or ""})
            return self._resp_json(
                {
                    "action": "config_overlay_cleared",
                    "backup_path": result.get("backup_path") or "",
                    "config": CONFIG_MANAGER.snapshot(),
                }
            )

        if parts == ["config", "overlay", "compact"]:
            try:
                result = CONFIG_MANAGER.compact_overlay()
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("config_overlay_compacted", target="config/overlay")
                return self._resp_json(
                    {
                        "action": "config_overlay_compacted",
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )
            except ConfigValidationError as e:
                self._audit_admin_event("config_overlay_compact_failed", target="config/overlay", status="failed", error=str(e))
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if parts == ["models", "infer-mapping"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            model = str((body or {}).get("model") or "").strip()
            if not model:
                return self._resp_json({"error": {"message": "model is required"}}, 400)
            auto_apply = bool((body or {}).get("auto_apply", False))
            matches = model_registry.find_providers_for_model(CONFIG, model)
            if auto_apply and matches:
                for entry in matches:
                    provider = entry["provider"]
                    raw_model = entry["raw_model"]
                    CONFIG_MANAGER.update_provider_model_mapping(
                        provider,
                        model=model,
                        raw_model=raw_model,
                        old_model="",
                    )
                model_registry.clear_cache()
                model_registry.rebuild_models_union_snapshot(CONFIG_MANAGER.config, ROUTER)
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event(
                    "model_mapping_auto_inferred",
                    target=model,
                    detail={"matches": matches, "auto_applied": True},
                )
                return self._resp_json({
                    "action": "model_mapping_inferred",
                    "model": model,
                    "matches": matches,
                    "auto_applied": True,
                    "config": CONFIG_MANAGER.snapshot(),
                })
            self._audit_admin_event(
                "model_mapping_inferred",
                target=model,
                detail={"matches": matches, "auto_applied": False},
            )
            return self._resp_json({
                "action": "model_mapping_inferred",
                "model": model,
                "matches": matches,
                "auto_applied": False,
            })

        if parts == ["providers"]:
            body = self._read_json_body()
            if isinstance(body, tuple):
                return self._resp_json(body[0], body[1])
            try:
                provider = str((body or {}).get("name") or "").strip()
                provider_cfg = {k: v for k, v in (body or {}).items() if k != "name"}
                CONFIG_MANAGER.add_provider(provider, provider_cfg)
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=True)
                self._audit_admin_event("provider_added", target=provider, detail=provider_cfg)
                return self._resp_json({"action": "provider_added", "provider": provider, "config": CONFIG_MANAGER.snapshot()})
            except ConfigValidationError as e:
                self._audit_admin_event(
                    "provider_add_failed",
                    target=str((body or {}).get("name") or ""),
                    status="failed",
                    error=str(e),
                )
                return self._resp_json({"error": {"message": str(e)}}, 400)

        if len(parts) >= 3 and parts[0] == "providers":
            provider = parts[1]
            if len(parts) == 4 and parts[2] == "models" and parts[3] == "refresh":
                if provider not in (CONFIG.get("providers") or {}):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                model_registry.clear_cache(provider)
                fetch_provider_models(provider)
                _save_router_state()
                self._audit_admin_event("provider_models_refreshed", target=f"{provider}/models")
                return self._resp_json(
                    {
                        "action": "provider_models_refreshed",
                        "provider": provider,
                        "models": _model_capabilities_snapshot(),
                    }
                )

            if len(parts) == 3 and parts[2] == "keys":
                body = self._read_json_body()
                if isinstance(body, tuple):
                    return self._resp_json(body[0], body[1])
                try:
                    CONFIG_MANAGER.add_key(provider, (body or {}).get("key") or "", (body or {}).get("proxy") or "")
                    _apply_runtime_config(CONFIG_MANAGER.config)
                    _refresh_models_after_config_change(provider, force=True)
                    self._audit_admin_event("key_added", target=f"{provider}/keys", detail={"key": (body or {}).get("key") or "", "proxy": (body or {}).get("proxy") or ""})
                    return self._resp_json({"action": "key_added", "provider": provider, "config": CONFIG_MANAGER.snapshot()})
                except ConfigValidationError as e:
                    self._audit_admin_event("key_add_failed", target=f"{provider}/keys", status="failed", error=str(e))
                    return self._resp_json({"error": {"message": str(e)}}, 400)

            if len(parts) == 3 and parts[2] == "delete":
                body = self._read_json_body()
                if isinstance(body, tuple):
                    return self._resp_json(body[0], body[1])
                confirm = str((body or {}).get("confirm") or "").strip()
                if confirm != "delete_provider":
                    self._audit_admin_event(
                        "provider_delete_failed",
                        target=provider,
                        status="failed",
                        error="confirmation required",
                    )
                    return self._resp_json({"error": {"message": "confirm must be delete_provider"}}, 400)
                try:
                    CONFIG_MANAGER.delete_provider(provider)
                    _apply_runtime_config(CONFIG_MANAGER.config)
                    _refresh_models_after_config_change()
                    self._audit_admin_event("provider_deleted", target=provider)
                    return self._resp_json({"action": "provider_deleted", "provider": provider, "config": CONFIG_MANAGER.snapshot()})
                except ConfigValidationError as e:
                    self._audit_admin_event("provider_delete_failed", target=provider, status="failed", error=str(e))
                    return self._resp_json({"error": {"message": str(e)}}, 400)

            if len(parts) == 3 and parts[2] in ("enable", "disable"):
                enabled = parts[2] == "enable"
                if not ROUTER.set_provider_enabled(provider, enabled):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                _save_router_state()
                self._audit_admin_event("provider_enabled" if enabled else "provider_disabled", target=provider)
                return self._resp_json(
                    {
                        "action": "provider_enabled" if enabled else "provider_disabled",
                        "provider": provider,
                        "router": ROUTER.snapshot(),
                    }
                )

            if len(parts) == 4 and parts[2] == "cooldown" and parts[3] == "clear":
                if not ROUTER.clear_provider_cooldown(provider):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                _save_router_state()
                self._audit_admin_event("provider_cooldown_cleared", target=provider)
                return self._resp_json(
                    {
                        "action": "provider_cooldown_cleared",
                        "provider": provider,
                        "router": ROUTER.snapshot(),
                    }
                )

            if len(parts) >= 5 and parts[2] == "keys":
                try:
                    key_index = int(parts[3])
                except Exception:
                    return self._resp_json({"error": {"message": f"invalid key index: {parts[3]}"}}, 400)

                if len(parts) == 5 and parts[4] in ("enable", "disable"):
                    enabled = parts[4] == "enable"
                    if not ROUTER.set_key_enabled(provider, key_index, enabled):
                        return self._resp_json(
                            {"error": {"message": f"unknown key: {provider}/{key_index}"}},
                            404,
                        )
                    _save_router_state()
                    self._audit_admin_event(
                        "key_enabled" if enabled else "key_disabled",
                        target=f"{provider}/keys/{key_index}",
                    )
                    return self._resp_json(
                        {
                            "action": "key_enabled" if enabled else "key_disabled",
                            "provider": provider,
                            "key_index": key_index,
                            "router": ROUTER.snapshot(),
                        }
                    )

                if len(parts) == 5 and parts[4] == "delete":
                    body = self._read_json_body()
                    if isinstance(body, tuple):
                        return self._resp_json(body[0], body[1])
                    confirm = str((body or {}).get("confirm") or "").strip()
                    if confirm != "delete_key":
                        self._audit_admin_event(
                            "key_delete_failed",
                            target=f"{provider}/keys/{key_index}",
                            status="failed",
                            error="confirmation required",
                        )
                        return self._resp_json({"error": {"message": "confirm must be delete_key"}}, 400)
                    try:
                        CONFIG_MANAGER.delete_key(provider, key_index)
                        _apply_runtime_config(CONFIG_MANAGER.config)
                        _refresh_models_after_config_change(provider, force=True)
                        self._audit_admin_event("key_deleted", target=f"{provider}/keys/{key_index}")
                        return self._resp_json(
                            {
                                "action": "key_deleted",
                                "provider": provider,
                                "key_index": key_index,
                                "config": CONFIG_MANAGER.snapshot(),
                            }
                        )
                    except ConfigValidationError as e:
                        self._audit_admin_event(
                            "key_delete_failed",
                            target=f"{provider}/keys/{key_index}",
                            status="failed",
                            error=str(e),
                        )
                        return self._resp_json({"error": {"message": str(e)}}, 400)

                if len(parts) == 6 and parts[4] == "state" and parts[5] == "clear":
                    if not ROUTER.clear_key_state(provider, key_index):
                        return self._resp_json(
                            {"error": {"message": f"unknown key: {provider}/{key_index}"}},
                            404,
                        )
                    _save_router_state()
                    self._audit_admin_event("key_state_cleared", target=f"{provider}/keys/{key_index}")
                    return self._resp_json(
                        {
                            "action": "key_state_cleared",
                            "provider": provider,
                            "key_index": key_index,
                            "router": ROUTER.snapshot(),
                        }
                    )

                if len(parts) == 5 and parts[4] == "test":
                    body = self._read_json_body()
                    if isinstance(body, tuple):
                        return self._resp_json(body[0], body[1])
                    probe_model = str((body or {}).get("model") or "").strip()
                    result = probe_provider_key(provider, key_index, model=probe_model)
                    self._audit_admin_event(
                        "key_probed",
                        target=f"{provider}/keys/{key_index}",
                        status="ok" if result.get("ok") else "failed",
                        detail={
                            "ok": bool(result.get("ok")),
                            "format": result.get("format"),
                            "model": result.get("model"),
                            "requested_model": probe_model,
                            "error_type": result.get("error_type"),
                        },
                    )
                    return self._resp_json(
                        {
                            "action": "key_probed",
                            "provider": provider,
                            "key_index": key_index,
                            "result": result,
                        }
                    )

        return self._resp_json({"error": {"message": f"unknown admin endpoint: {endpoint}"}}, 404)

    def _resp_admin_patch(self, endpoint: str):
        import sse2json as sse
        CONFIG_MANAGER = sse.CONFIG_MANAGER
        OBSERVABILITY = sse.OBSERVABILITY
        AUDIT = sse.AUDIT
        ROUTER = sse.ROUTER
        CONFIG = sse.CONFIG
        scheduler_policy = sse.scheduler_policy
        model_registry = sse.model_registry
        load_base_config = sse.load_base_config
        _refresh_models_after_config_change = sse._refresh_models_after_config_change
        _apply_runtime_config = sse._apply_runtime_config
        _clear_diagnostic_log = sse._clear_diagnostic_log
        fetch_provider_models = sse.fetch_provider_models
        probe_provider_key = sse.probe_provider_key
        fetch_upstream_models = sse.fetch_upstream_models
        _model_capabilities_snapshot = sse._model_capabilities_snapshot
        _save_router_state = sse._save_router_state
        ConfigValidationError = sse.ConfigValidationError
        _request_filter_payload = sse._request_filter_payload

        if not self._admin_authorized():
            return self._resp_json({"error": {"message": "admin auth required"}}, 403)

        from urllib.parse import unquote
        parts = [unquote(p) for p in str(endpoint or "").strip("/").split("/") if p]
        body = self._read_json_body()
        if isinstance(body, tuple):
            return self._resp_json(body[0], body[1])

        try:
            if parts == ["routing"]:
                CONFIG_MANAGER.update_routing(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("routing_updated", target="routing", detail=body or {})
                return self._resp_json({"action": "routing_updated", "config": CONFIG_MANAGER.snapshot()})

            if parts == ["retry"]:
                CONFIG_MANAGER.update_retry(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("retry_updated", target="retry", detail=body or {})
                return self._resp_json({"action": "retry_updated", "config": CONFIG_MANAGER.snapshot()})

            if parts == ["retry", "failure-policies"]:
                CONFIG_MANAGER.update_failure_policy(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                error_type = str((body or {}).get("error_type") or "").strip()
                self._audit_admin_event("failure_policy_updated", target=error_type, detail=body or {})
                return self._resp_json({"action": "failure_policy_updated", "error_type": error_type, "config": CONFIG_MANAGER.snapshot()})

            if parts == ["models", "routes"]:
                CONFIG_MANAGER.update_model_route(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                model = str((body or {}).get("model") or "").strip()
                self._audit_admin_event("model_route_updated", target=model, detail=body or {})
                return self._resp_json({"action": "model_route_updated", "model": model, "config": CONFIG_MANAGER.snapshot()})

            if len(parts) == 4 and parts[0] == "providers" and parts[2] == "models" and parts[3] == "disabled":
                provider = parts[1]
                models = (body or {}).get("models") or {}
                CONFIG_MANAGER.update_provider_models_disabled(provider, models)
                model_registry.clear_cache()
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("provider_models_disabled_updated", target=f"{provider}/models", detail={"models": models})
                return self._resp_json({"action": "provider_models_disabled_updated", "provider": provider, "config": CONFIG_MANAGER.snapshot()})

            if len(parts) == 5 and parts[0] == "providers" and parts[2] == "models" and parts[4] == "disabled":
                provider = parts[1]
                model = parts[3]
                disabled = bool((body or {}).get("disabled"))
                CONFIG_MANAGER.update_provider_model_disabled(provider, model, disabled)
                model_registry.clear_cache()
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event(
                    "provider_model_disabled_updated",
                    target=f"{provider}/models/{model}",
                    detail={"model": model, "disabled": disabled},
                )
                return self._resp_json(
                    {
                        "action": "provider_model_disabled_updated",
                        "provider": provider,
                        "model": model,
                        "disabled": disabled,
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )

            if len(parts) == 4 and parts[0] == "providers" and parts[2] == "models" and parts[3] == "map":
                provider = parts[1]
                model = str((body or {}).get("model") or "").strip()
                raw_model = str((body or {}).get("raw_model") or "").strip()
                old_model = str((body or {}).get("old_model") or "").strip()
                CONFIG_MANAGER.update_provider_model_mapping(
                    provider,
                    model=model,
                    raw_model=raw_model,
                    old_model=old_model,
                )
                model_registry.clear_cache()
                model_registry.rebuild_models_union_snapshot(CONFIG_MANAGER.config, ROUTER)
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event(
                    "provider_model_mapping_updated",
                    target=f"{provider}/models/{model or old_model}",
                    detail={"model": model, "raw_model": raw_model, "old_model": old_model},
                )
                return self._resp_json(
                    {
                        "action": "provider_model_mapping_updated",
                        "provider": provider,
                        "model": model,
                        "raw_model": raw_model,
                        "old_model": old_model,
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )

            if parts == ["proxy"]:
                CONFIG_MANAGER.update_global_proxy(body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                self._audit_admin_event("global_proxy_updated", target="proxy", detail=body or {})
                return self._resp_json({"action": "global_proxy_updated", "config": CONFIG_MANAGER.snapshot()})

            # --- Hot-reload endpoints (lightweight, no full config rebuild) ---
            if len(parts) == 3 and parts[0] == "providers" and parts[2] == "priority":
                provider = parts[1]
                if provider not in (CONFIG.get("providers") or {}):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                priority = int((body or {}).get("priority", 0))
                ROUTER.update_provider_priority(provider, priority)
                self._audit_admin_event("provider_priority_hot_updated", target=f"{provider}/priority", detail={"priority": priority})
                return self._resp_json({"action": "provider_priority_updated", "provider": provider, "priority": priority, "hot_reload": True})

            if len(parts) == 3 and parts[0] == "providers" and parts[2] == "weight":
                provider = parts[1]
                if provider not in (CONFIG.get("providers") or {}):
                    return self._resp_json({"error": {"message": f"unknown provider: {provider}"}}, 404)
                weight = max(1, int((body or {}).get("weight", 1)))
                ROUTER.update_provider_weight(provider, weight)
                self._audit_admin_event("provider_weight_hot_updated", target=f"{provider}/weight", detail={"weight": weight})
                return self._resp_json({"action": "provider_weight_updated", "provider": provider, "weight": weight, "hot_reload": True})

            if len(parts) == 2 and parts[0] == "providers":
                provider = parts[1]
                CONFIG_MANAGER.update_provider(provider, body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=True)
                self._audit_admin_event("provider_updated", target=provider, detail=body or {})
                return self._resp_json({"action": "provider_updated", "provider": provider, "config": CONFIG_MANAGER.snapshot()})

            if len(parts) == 4 and parts[0] == "providers" and parts[2] == "keys":
                provider = parts[1]
                try:
                    key_index = int(parts[3])
                except Exception:
                    return self._resp_json({"error": {"message": f"invalid key index: {parts[3]}"}}, 400)
                CONFIG_MANAGER.update_key(provider, key_index, body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=True)
                self._audit_admin_event("key_updated", target=f"{provider}/keys/{key_index}", detail=body or {})
                return self._resp_json(
                    {
                        "action": "key_updated",
                        "provider": provider,
                        "key_index": key_index,
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )

            if len(parts) == 4 and parts[0] == "providers" and parts[2] == "formats":
                provider = parts[1]
                fmt = parts[3]
                CONFIG_MANAGER.update_format(provider, fmt, body or {})
                _apply_runtime_config(CONFIG_MANAGER.config)
                _refresh_models_after_config_change(provider, force=False)
                self._audit_admin_event("format_updated", target=f"{provider}/formats/{fmt}", detail=body or {})
                return self._resp_json(
                    {
                        "action": "format_updated",
                        "provider": provider,
                        "format": fmt,
                        "config": CONFIG_MANAGER.snapshot(),
                    }
                )
        except ConfigValidationError as e:
            self._audit_admin_event(
                "admin_patch_failed",
                target="/".join(parts),
                status="failed",
                detail=body or {},
                error=str(e),
            )
            return self._resp_json({"error": {"message": str(e)}}, 400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._audit_admin_event(
                "admin_patch_error",
                target="/".join(parts),
                status="failed",
                detail=body or {},
                error=str(e),
            )
            return self._resp_json({"error": {"message": f"Internal Server Error: {str(e)}"}}, 500)

        return self._resp_json({"error": {"message": f"unknown admin endpoint: {endpoint}"}}, 404)

