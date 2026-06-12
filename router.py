#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import random
import threading
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Generator, List, Optional, Tuple

import model_registry
import scheduler_policy
from proxy_utils import key_proxy, key_value, resolve_proxy_url


PROVIDER_SELECT_MODES = ("priority_failover", "round_robin", "weighted_rr", "random")


@dataclass(frozen=True)
class Attempt:
    request_id: str
    attempt_no: int
    provider: str
    key_index: int
    key: str
    url: str
    headers: Dict[str, str]
    provider_model: str
    upstream_format: str
    proxy_url: Optional[str] = None


@dataclass(frozen=True)
class _ProviderItem:
    name: str
    weight: int = 1
    priority: int = 0


@dataclass
class _KeyState:
    cooldown_until: float = 0.0
    disabled_until: float = 0.0
    fails: int = 0
    transient_fails: int = 0
    runtime_enabled: bool = True

    def available(self, now: float) -> bool:
        return self.runtime_enabled and now >= self.cooldown_until and now >= self.disabled_until


@dataclass
class _ProviderState:
    cooldown_until: float = 0.0
    rr_key: int = 0
    runtime_enabled: bool = True

    def available(self, now: float) -> bool:
        return self.runtime_enabled and now >= self.cooldown_until


def _mask_key(key: str, prefix: int = 6, suffix: int = 2) -> str:
    if not key:
        return ""
    if len(key) <= prefix + suffix:
        return key
    return f"{key[:prefix]}**{key[-suffix:]}"


def _hash_key_short(key: str) -> str:
    if not key:
        return ""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:10]


def parse_retry_after_seconds(v: Optional[str]) -> Optional[int]:
    """解析 Retry-After（秒数字符串 或 HTTP-date）。解析失败返回 None。"""
    if not v:
        return None
    v = v.strip()
    if not v:
        return None
    # seconds
    if v.isdigit():
        try:
            return int(v)
        except Exception:
            return None
    # HTTP-date
    try:
        dt = parsedate_to_datetime(v)
        now = time.time()
        secs = int(dt.timestamp() - now)
        return max(0, secs)
    except Exception:
        return None


class UpstreamRouter:
    """
    负责：按模型选择 provider + key；维护 key/provider 冷却/禁用状态；提供 attempt 迭代器。

    设计原则：
    - 线程安全（HTTPServer 多线程）
    - attempt 的“可重试”边界由调用方控制（流式必须在写 SSE 前完成切换）
    """

    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        self._lock = threading.Lock()

        self._rr_model: Dict[str, int] = {}
        self._providers_state: Dict[str, _ProviderState] = {}
        self._keys_state: Dict[Tuple[str, int], _KeyState] = {}

        self._init_states()

    # ---------------------------------------------------------------------
    # public
    # ---------------------------------------------------------------------
    def iter_attempts(
        self,
        canonical_model: str,
        is_stream: bool,
        request_id: str,
        client_headers: Optional[Dict[str, str]] = None,
        *,
        client_format: str = "chat_completions",
        allowed_upstream_formats: Optional[List[str]] = None,
    ) -> Generator[Attempt, None, None]:
        """按 provider_select 选择 provider+key。

        默认 priority_failover 会先固定高优先级 provider，并在同一 provider 内轮换可用 key；
        round_robin/weighted_rr/random 保留跨 provider 分散流量的旧行为。

        client_headers: 客户端原始请求头，用于按 provider 配置透传特定 header。
        client_format: 客户端需要的目标格式，用于优先选择同格式上游。
        allowed_upstream_formats: 当前调用链已经支持的上游格式集合。"""
        max_attempts = int(self.cfg.get("routing", {}).get("max_attempts", 6))
        provider_order = self._select_provider_attempts(
            canonical_model,
            request_id=request_id,
            client_format=client_format,
            allowed_upstream_formats=allowed_upstream_formats,
        )

        attempt_no = 0
        prov_count = len(provider_order)
        if prov_count == 0:
            return

        current_prov_idx = 0
        scan_no = 0
        max_scans = max_attempts * max(1, prov_count) * 2
        seen_candidates = set()

        while attempt_no < max_attempts and scan_no < max_scans:
            # 如果当前 provider 索引超出范围，重新开始一轮
            if current_prov_idx >= prov_count:
                current_prov_idx = 0

            provider, upstream_format = provider_order[current_prov_idx]
            scan_no += 1
             
            sel = self._select_key(provider)
            if sel is None:
                # provider 无可用 key → 冷却 provider，切换到下一个
                self._cooldown_provider(provider, reason="no_key")
                current_prov_idx += 1
                continue

            key_index, key = sel
            candidate_id = (provider, key_index, upstream_format)
            if candidate_id in seen_candidates:
                current_prov_idx += 1
                continue

            seen_candidates.add(candidate_id)
            attempt_no += 1
            url, headers, provider_model, proxy_url = self._build_attempt_details(
                provider,
                canonical_model,
                key,
                key_index=key_index,
                upstream_format=upstream_format,
                client_headers=client_headers,
            )
             
            yield Attempt(
                request_id=request_id,
                attempt_no=attempt_no,
                provider=provider,
                key_index=key_index,
                key=key,
                url=url,
                headers=headers,
                provider_model=provider_model,
                upstream_format=upstream_format,
                proxy_url=proxy_url,
            )
            current_prov_idx += 1

    def report_success(self, attempt: Attempt) -> None:
        now = time.time()
        with self._lock:
            ks = self._keys_state.get((attempt.provider, attempt.key_index))
            if ks:
                ks.cooldown_until = 0.0
                ks.disabled_until = 0.0
                ks.fails = 0
                ks.transient_fails = 0
            ps = self._providers_state.get(attempt.provider)
            if ps:
                ps.cooldown_until = 0.0
        # 成功不需要额外行为
        _ = now

    def report_failure(
        self,
        attempt: Attempt,
        *,
        error_type: str,
        http_status: Optional[int] = None,
        retry_after_s: Optional[int] = None,
    ) -> None:
        """
        error_type: key_invalid | rate_limited | server_error | network_error | client_error | provider_compat | empty_visible_output | unknown
        """
        now = time.time()
        failure_policy = scheduler_policy.failure_policy_for_error_type(
            self.cfg,
            error_type,
            retry_after_s=retry_after_s,
        )
        cooldown_scope = str(failure_policy.get("cooldown_scope") or "key")
        cooldown_s = int(failure_policy.get("cooldown_s") or 0)
        disable_key = bool(failure_policy.get("disables_key", False))
        provider_cooldown_s = int(failure_policy.get("provider_cooldown_s") or 0)
        transient_key_failure = error_type in ("server_error", "network_error", "unknown") and cooldown_scope in ("key", "key_provider")

        with self._lock:
            ks = self._keys_state.setdefault((attempt.provider, attempt.key_index), _KeyState())
            ks.fails += 1
            if transient_key_failure and not disable_key:
                ks.transient_fails = int(getattr(ks, "transient_fails", 0)) + 1
                cooldown_s, disable_key = self._key_failure_ladder_decision(ks.transient_fails, cooldown_s)
            until = now + max(0, cooldown_s)
            if disable_key:
                ks.disabled_until = max(ks.disabled_until, until)
            else:
                ks.cooldown_until = max(ks.cooldown_until, until)

            # 429 is usually key/quota scoped. Do not cool down the whole provider,
            # otherwise providers with multiple keys will never get a chance to rotate.
            if provider_cooldown_s > 0 and http_status not in (400, 401, 403):
                ps = self._providers_state.setdefault(attempt.provider, _ProviderState())
                ps.cooldown_until = max(ps.cooldown_until, now + provider_cooldown_s)

    def _key_failure_ladder_decision(self, fail_count: int, fallback_cooldown_s: int) -> Tuple[int, bool]:
        """Return (cooldown seconds, disables_key) for retryable key-local failures.

        The default ladder is intentionally key-scoped: 10s -> 60s -> 3600s -> disabled.
        Other providers are only a per-request fallback; later requests can return to the
        high-priority provider once one of its keys becomes available again.
        """
        retry_cfg = self.cfg.get("retry") or {}
        raw_ladder = retry_cfg.get("key_failure_ladder_s")
        if raw_ladder is None:
            raw_ladder = retry_cfg.get("key_failure_ladder")
        ladder: List[int] = []
        if isinstance(raw_ladder, list):
            for item in raw_ladder:
                try:
                    seconds = int(item)
                except Exception:
                    continue
                if seconds >= 0:
                    ladder.append(min(seconds, 86400))
        if not ladder:
            ladder = [10, 60, 3600]

        if fail_count <= len(ladder):
            return ladder[fail_count - 1], False
        return max(int(fallback_cooldown_s or ladder[-1] or 3600), 3600), True

    def first_healthy_provider(self) -> Optional[str]:
        """用于 /v1/models：选择一个当前可用 provider。"""
        providers = list((self.cfg.get("providers") or {}).keys())
        now = time.time()
        with self._lock:
            for p in providers:
                pcfg = (self.cfg.get("providers") or {}).get(p) or {}
                if not pcfg.get("enabled", True):
                    continue
                ps = self._providers_state.get(p)
                if ps and not ps.available(now):
                    continue
                keys = (pcfg.get("keys") or [])
                for i, _k in enumerate(keys):
                    ks = self._keys_state.get((p, i))
                    if ks is None or ks.available(now):
                        return p
        return None

    def first_healthy_key(self, provider: str) -> Optional[str]:
        """返回某个 provider 当前可用的一把 key（用于 /v1/models 等非关键路径）。"""
        now = time.time()
        pcfg = (self.cfg.get("providers") or {}).get(provider) or {}
        keys = pcfg.get("keys") or []
        if not keys:
            return None
        with self._lock:
            for i, k in enumerate(keys):
                ks = self._keys_state.get((provider, i))
                if ks is None or ks.available(now):
                    return key_value(k)
        return None

    def first_healthy_key_entry(self, provider: str) -> Optional[Tuple[int, Any]]:
        """Return the first available key config entry without exposing it externally."""
        now = time.time()
        pcfg = (self.cfg.get("providers") or {}).get(provider) or {}
        keys = pcfg.get("keys") or []
        if not keys:
            return None
        with self._lock:
            for i, k in enumerate(keys):
                ks = self._keys_state.get((provider, i))
                if ks is None or ks.available(now):
                    return i, k
        return None

    def masked_key(self, key: str) -> str:
        mask_cfg = (self.cfg.get("observability") or {}).get("log_key_mask") or {}
        try:
            prefix = int(mask_cfg.get("prefix", 6))
            suffix = int(mask_cfg.get("suffix", 2))
        except Exception:
            prefix, suffix = 6, 2
        return _mask_key(key, prefix=prefix, suffix=suffix)

    def key_id(self, key: str) -> str:
        """用于日志/统计：返回短 hash（不依赖截断长度）。"""
        return _hash_key_short(key)

    def set_provider_enabled(self, provider: str, enabled: bool) -> bool:
        providers_cfg = self.cfg.get("providers") or {}
        if provider not in providers_cfg:
            return False
        with self._lock:
            ps = self._providers_state.setdefault(provider, _ProviderState())
            ps.runtime_enabled = bool(enabled)
            if enabled:
                ps.cooldown_until = 0.0
        return True

    def clear_provider_cooldown(self, provider: str) -> bool:
        providers_cfg = self.cfg.get("providers") or {}
        if provider not in providers_cfg:
            return False
        with self._lock:
            ps = self._providers_state.setdefault(provider, _ProviderState())
            ps.cooldown_until = 0.0
        return True

    def set_key_enabled(self, provider: str, key_index: int, enabled: bool) -> bool:
        providers_cfg = self.cfg.get("providers") or {}
        pcfg = providers_cfg.get(provider)
        if not pcfg:
            return False
        keys = pcfg.get("keys") or []
        if key_index < 0 or key_index >= len(keys):
            return False
        with self._lock:
            ks = self._keys_state.setdefault((provider, key_index), _KeyState())
            ks.runtime_enabled = bool(enabled)
            if enabled:
                ks.cooldown_until = 0.0
                ks.disabled_until = 0.0
        return True

    def clear_key_state(self, provider: str, key_index: Optional[int] = None) -> bool:
        providers_cfg = self.cfg.get("providers") or {}
        pcfg = providers_cfg.get(provider)
        if not pcfg:
            return False
        keys = pcfg.get("keys") or []
        if key_index is not None and (key_index < 0 or key_index >= len(keys)):
            return False

        indexes = range(len(keys)) if key_index is None else [key_index]
        with self._lock:
            for idx in indexes:
                ks = self._keys_state.setdefault((provider, idx), _KeyState())
                ks.cooldown_until = 0.0
                ks.disabled_until = 0.0
                ks.fails = 0
                ks.transient_fails = 0
        return True

    def snapshot(self) -> Dict[str, Any]:
        """Return provider/key runtime state without exposing raw API keys."""
        now = time.time()
        providers_cfg = self.cfg.get("providers") or {}
        with self._lock:
            providers: Dict[str, Any] = {}
            for provider, pcfg in providers_cfg.items():
                ps = self._providers_state.get(provider)
                keys = []
                for idx, key in enumerate(pcfg.get("keys") or []):
                    ks = self._keys_state.get((provider, idx))
                    key_s = key_value(key)
                    key_available = bool(ks is None or ks.available(now))
                    keys.append(
                        {
                            "index": idx,
                            "key_id": _hash_key_short(key_s),
                            "masked": _mask_key(key_s),
                            "proxy": resolve_proxy_url(key_proxy(key)) or "",
                            "available": key_available,
                            "runtime_enabled": bool(ks.runtime_enabled if ks else True),
                            "cooldown_remaining_s": max(0, int(((ks.cooldown_until if ks else 0.0) - now))),
                            "disabled_remaining_s": max(0, int(((ks.disabled_until if ks else 0.0) - now))),
                            "fails": int(ks.fails if ks else 0),
                            "transient_fails": int(getattr(ks, "transient_fails", 0) if ks else 0),
                        }
                    )
                config_enabled = bool((pcfg or {}).get("enabled", True))
                runtime_enabled = bool(ps.runtime_enabled if ps else True)
                provider_state_available = bool(ps is None or ps.available(now))
                available_key_count = sum(1 for item in keys if item.get("available"))
                providers[provider] = {
                    "enabled": config_enabled and runtime_enabled,
                    "config_enabled": config_enabled,
                    "runtime_enabled": runtime_enabled,
                    "available": config_enabled and runtime_enabled and provider_state_available and available_key_count > 0,
                    "cooldown_remaining_s": max(0, int(((ps.cooldown_until if ps else 0.0) - now))),
                    "key_count": len(keys),
                    "available_key_count": available_key_count,
                    "keys": keys,
                    "formats": self._provider_formats(provider),
                }
        return {"providers": providers}

    # ---------------------------------------------------------------------
    # internal
    # ---------------------------------------------------------------------
    def _init_states(self) -> None:
        with self._lock:
            for p, pcfg in (self.cfg.get("providers") or {}).items():
                self._providers_state.setdefault(p, _ProviderState())
                keys = pcfg.get("keys") or []
                for i in range(len(keys)):
                    self._keys_state.setdefault((p, i), _KeyState())

    def migrate_state_from(self, old_router: "UpstreamRouter") -> None:
        """从旧 router 迁移仍存在于新 CONFIG 的 provider/key 运行状态。

        热加载配置时调用：保留冷却/失败计数等运行时状态，仅丢弃已删除的
        provider 或越界的 key 索引。"""
        if old_router is None:
            return
        providers_cfg = self.cfg.get("providers") or {}
        with old_router._lock:
            old_providers = dict(old_router._providers_state)
            old_keys = dict(old_router._keys_state)
            old_rr = dict(old_router._rr_model)
        with self._lock:
            for p, ps in old_providers.items():
                if p in providers_cfg:
                    self._providers_state[p] = ps
            for (p, i), ks in old_keys.items():
                if p not in providers_cfg:
                    continue
                key_count = len((providers_cfg.get(p) or {}).get("keys") or [])
                if 0 <= i < key_count:
                    self._keys_state[(p, i)] = ks
            self._rr_model.update(old_rr)

    def dump_state(self) -> Dict[str, Any]:
        """序列化可持久化的运行时状态（不含原始 key 值）。"""
        now = time.time()
        with self._lock:
            providers = {}
            for p, ps in self._providers_state.items():
                providers[p] = {
                    "cooldown_remaining_s": max(0.0, ps.cooldown_until - now),
                    "runtime_enabled": ps.runtime_enabled,
                }
            keys = {}
            for (p, i), ks in self._keys_state.items():
                keys[f"{p}\x00{i}"] = {
                    "cooldown_remaining_s": max(0.0, ks.cooldown_until - now),
                    "disabled_remaining_s": max(0.0, ks.disabled_until - now),
                    "fails": ks.fails,
                    "transient_fails": int(getattr(ks, "transient_fails", 0)),
                    "runtime_enabled": ks.runtime_enabled,
                }
            return {
                "saved_at": now,
                "providers": providers,
                "keys": keys,
                "rr_model": dict(self._rr_model),
            }

    def load_state(self, state: Dict[str, Any]) -> None:
        """从 dump_state 结果恢复运行时状态，忽略不在当前 config 中的条目。"""
        if not isinstance(state, dict):
            return
        providers_cfg = self.cfg.get("providers") or {}
        now = time.time()
        saved_at = float(state.get("saved_at") or now)
        age = max(0.0, now - saved_at)

        with self._lock:
            for p, entry in (state.get("providers") or {}).items():
                if p not in providers_cfg:
                    continue
                ps = self._providers_state.setdefault(p, _ProviderState())
                remaining = max(0.0, float(entry.get("cooldown_remaining_s") or 0) - age)
                if remaining > 0:
                    ps.cooldown_until = now + remaining
                ps.runtime_enabled = bool(entry.get("runtime_enabled", True))

            for composite_key, entry in (state.get("keys") or {}).items():
                parts = composite_key.split("\x00", 1)
                if len(parts) != 2:
                    continue
                p, i_str = parts
                try:
                    i = int(i_str)
                except ValueError:
                    continue
                if p not in providers_cfg:
                    continue
                key_count = len((providers_cfg.get(p) or {}).get("keys") or [])
                if not (0 <= i < key_count):
                    continue
                ks = self._keys_state.setdefault((p, i), _KeyState())
                cooldown_rem = max(0.0, float(entry.get("cooldown_remaining_s") or 0) - age)
                disabled_rem = max(0.0, float(entry.get("disabled_remaining_s") or 0) - age)
                if cooldown_rem > 0:
                    ks.cooldown_until = now + cooldown_rem
                if disabled_rem > 0:
                    ks.disabled_until = now + disabled_rem
                ks.fails = int(entry.get("fails") or 0)
                ks.transient_fails = int(entry.get("transient_fails") or 0)
                ks.runtime_enabled = bool(entry.get("runtime_enabled", True))

            for model, idx in (state.get("rr_model") or {}).items():
                try:
                    self._rr_model[model] = int(idx)
                except Exception:
                    pass

    def _cooldown_provider(self, provider: str, reason: str) -> None:
        _ = reason
        with self._lock:
            ps = self._providers_state.setdefault(provider, _ProviderState())
            ps.cooldown_until = max(ps.cooldown_until, time.time() + 2.0)

    def _provider_priority(self, provider: str, override: Optional[Any] = None) -> int:
        if override is not None:
            try:
                return int(override)
            except Exception:
                return 0
        pcfg = (self.cfg.get("providers") or {}).get(provider) or {}
        try:
            return int(pcfg.get("priority", 0) or 0)
        except Exception:
            return 0

    def _select_provider_items(self, canonical_model: str) -> List[_ProviderItem]:
        routes = (self.cfg.get("models") or {}).get("routes") or {}
        route = routes.get(canonical_model) or {}
        providers_cfg = (self.cfg.get("providers") or {})

        provider_items: List[_ProviderItem] = []
        route_provider_names = set()
        if isinstance(route, dict) and route.get("providers"):
            for it in route.get("providers") or []:
                if isinstance(it, str):
                    name = str(it)
                    provider_items.append(_ProviderItem(name=name, weight=1, priority=self._provider_priority(name)))
                    route_provider_names.add(name)
                elif isinstance(it, dict) and it.get("name"):
                    name = str(it["name"])
                    provider_items.append(
                        _ProviderItem(
                            name=name,
                            weight=int(it.get("weight", 1) or 1),
                            priority=self._provider_priority(name, it.get("priority") if "priority" in it else None),
                        )
                    )
                    route_provider_names.add(name)
            capabilities = ((self.cfg.get("models") or {}).get("provider_model_capabilities") or {})
            for name, pcfg in providers_cfg.items():
                if name in route_provider_names:
                    continue
                if not (pcfg or {}).get("enabled", True):
                    continue
                cap = capabilities.get(name)
                canonical_map = (cap or {}).get("canonical_map") if isinstance(cap, dict) else {}
                lower_model = str(canonical_model or "").lower()
                if isinstance(cap, dict) and cap.get("status") == "ok" and (
                    canonical_model in (canonical_map or {}) or lower_model in (canonical_map or {})
                ):
                    provider_items.append(
                        _ProviderItem(name=str(name), weight=1, priority=self._provider_priority(str(name)))
                    )
        else:
            for name in (self.cfg.get("routing", {}).get("default_provider_pool") or []):
                provider_items.append(_ProviderItem(name=str(name), weight=1, priority=self._provider_priority(str(name))))
            seen = {item.name for item in provider_items}
            for name, pcfg in providers_cfg.items():
                if name in seen:
                    continue
                if not (pcfg or {}).get("enabled", True):
                    continue
                provider_items.append(_ProviderItem(name=str(name), weight=1, priority=self._provider_priority(str(name))))
                seen.add(str(name))

        now = time.time()
        models_cfg = self.cfg.get("models") or {}

        provider_capabilities = models_cfg.get("provider_model_capabilities") or {}
        assume_unknown_global = bool(models_cfg.get("assume_supports_unknown_models", True))
        auto_filter_active = False
        if canonical_model:
            for item in provider_items:
                n = item.name
                pcfg = providers_cfg.get(n) or {}
                if not pcfg or not pcfg.get("enabled", True):
                    continue
                cap = provider_capabilities.get(n)
                if isinstance(cap, dict) and cap.get("status") == "ok":
                    auto_filter_active = True
                    break
                if not bool(pcfg.get("assume_supports_unknown_models", assume_unknown_global)):
                    auto_filter_active = True
                    break

        with self._lock:
            filtered = []
            for item in provider_items:
                name = item.name
                pcfg = providers_cfg.get(name) or {}
                if not pcfg or not pcfg.get("enabled", True):
                    continue
                ps = self._providers_state.get(name)
                if ps and not ps.available(now):
                    continue
                if not model_registry.provider_supports_model(
                    self.cfg,
                    name,
                    canonical_model,
                    manual_filter_active=auto_filter_active,
                ):
                    continue
                filtered.append(_ProviderItem(name=name, weight=max(1, item.weight), priority=item.priority))

        if not filtered:
            if auto_filter_active:
                # 模型确实没有任何供应商支持 → 返回空，让上层报明确错误
                return []
            # provider_model_map 还没填充（首次启动）→ 回退到全部 enabled providers
            filtered = [
                _ProviderItem(name=item.name, weight=max(1, item.weight), priority=item.priority)
                for item in provider_items
                if (providers_cfg.get(item.name) or {}).get("enabled", True)
            ]

        return filtered

    def _select_provider_attempts(
        self,
        canonical_model: str,
        *,
        request_id: str,
        client_format: str,
        allowed_upstream_formats: Optional[List[str]],
    ) -> List[Tuple[str, str]]:
        allowed = [str(f) for f in (allowed_upstream_formats or [client_format or "chat_completions"]) if str(f)]
        if not allowed:
            allowed = ["chat_completions"]

        client_format = str(client_format or allowed[0])
        if client_format in allowed:
            format_order = [client_format] + [f for f in allowed if f != client_format]
        else:
            format_order = allowed

        provider_items = self._select_provider_items(canonical_model)
        provider_select = self._provider_select_mode(canonical_model)
        native: List[Tuple[str, int, int, str]] = []
        fallback: List[Tuple[str, int, int, str]] = []

        for item in provider_items:
            provider = item.name
            upstream_format = self._first_supported_format(provider, format_order)
            if not upstream_format:
                continue
            item = (provider, item.weight, item.priority, upstream_format)
            if upstream_format == client_format:
                native.append(item)
            else:
                fallback.append(item)

        selected: List[Tuple[str, str]] = []
        if native:
            rotation_key = f"{canonical_model}|native|{client_format}|{','.join(format_order)}"
            selected.extend(
                self._order_provider_format(
                    native,
                    rotation_key,
                    f"{request_id}|{rotation_key}",
                    provider_select,
                )
            )
        if fallback:
            rotation_key = f"{canonical_model}|fallback|{client_format}|{','.join(format_order)}"
            selected.extend(
                self._order_provider_format(
                    fallback,
                    rotation_key,
                    f"{request_id}|{rotation_key}",
                    provider_select,
                )
            )
        return selected

    def _expand_weighted(self, items: List[Tuple[str, int]], canonical_model: str) -> List[str]:
        expanded: List[str] = []
        for name, w in items:
            expanded.extend([name] * max(1, w))
        if not expanded:
            return []
        with self._lock:
            idx = self._rr_model.get(canonical_model, 0) % len(expanded)
            self._rr_model[canonical_model] = (idx + 1) % len(expanded)
        return expanded[idx:] + expanded[:idx]

    def _provider_select_mode(self, canonical_model: str) -> str:
        routes = (self.cfg.get("models") or {}).get("routes") or {}
        route = routes.get(canonical_model) or {}
        mode = ""
        if isinstance(route, dict):
            mode = str(route.get("provider_select") or "").strip()
        if not mode:
            mode = str((self.cfg.get("routing") or {}).get("provider_select") or "priority_failover").strip()
        if mode not in PROVIDER_SELECT_MODES:
            return "priority_failover"
        return mode

    def _order_provider_format(
        self,
        items: List[Tuple[str, int, int, str]],
        rotation_key: str,
        random_key: str,
        provider_select: str,
    ) -> List[Tuple[str, str]]:
        if provider_select == "priority_failover":
            ordered = sorted(enumerate(items), key=lambda entry: (-entry[1][2], entry[0]))
            expanded: List[Tuple[str, str]] = []
            providers_cfg = self.cfg.get("providers") or {}
            for _idx, (name, _w, _priority, upstream_format) in ordered:
                keys = (providers_cfg.get(name) or {}).get("keys") or []
                count = max(1, len(keys))
                expanded.extend([(name, upstream_format)] * count)
            return expanded

        expanded: List[Tuple[str, str]] = []
        for name, w, _priority, upstream_format in items:
            count = max(1, w) if provider_select == "weighted_rr" else 1
            expanded.extend([(name, upstream_format)] * count)
        if not expanded:
            return []
        if provider_select == "random":
            seed = int(hashlib.sha256(random_key.encode("utf-8")).hexdigest()[:16], 16)
            rng = random.Random(seed)
            rng.shuffle(expanded)
            return expanded
        with self._lock:
            idx = self._rr_model.get(rotation_key, 0) % len(expanded)
            self._rr_model[rotation_key] = (idx + 1) % len(expanded)
        return expanded[idx:] + expanded[:idx]

    def _select_key(self, provider: str) -> Optional[Tuple[int, str]]:
        now = time.time()
        providers_cfg = self.cfg.get("providers") or {}
        pcfg = providers_cfg.get(provider) or {}
        keys = pcfg.get("keys") or []
        if not keys:
            return None

        with self._lock:
            ps = self._providers_state.setdefault(provider, _ProviderState())
            if not ps.available(now):
                return None
            start = ps.rr_key % len(keys)
            ps.rr_key = (start + 1) % len(keys)

            for offset in range(len(keys)):
                i = (start + offset) % len(keys)
                ks = self._keys_state.setdefault((provider, i), _KeyState())
                if ks.available(now):
                    selected = key_value(keys[i])
                    if selected:
                        return i, selected
        return None

    def _provider_formats(self, provider: str) -> Dict[str, Dict[str, Any]]:
        pcfg = (self.cfg.get("providers") or {}).get(provider) or {}
        raw_formats = pcfg.get("formats")
        if isinstance(raw_formats, dict):
            return raw_formats
        chat_path = pcfg.get("chat_completions_path") or "/v1/chat/completions"
        if not str(chat_path).startswith("/"):
            chat_path = "/" + str(chat_path)
        return {
            "chat_completions": {"enabled": True, "path": str(chat_path)},
            "responses": {"enabled": False, "path": "/v1/responses"},
            "anthropic_messages": {"enabled": False, "path": "/v1/messages"},
        }

    def _first_supported_format(self, provider: str, format_order: List[str]) -> Optional[str]:
        formats = self._provider_formats(provider)
        for fmt in format_order:
            entry = formats.get(fmt) or {}
            if isinstance(entry, dict) and entry.get("enabled", False):
                return fmt
        return None

    def _format_path(self, provider: str, upstream_format: str) -> str:
        formats = self._provider_formats(provider)
        entry = formats.get(upstream_format) or {}
        path = entry.get("path") if isinstance(entry, dict) else None
        if not path and upstream_format == "chat_completions":
            path = ((self.cfg.get("providers") or {}).get(provider) or {}).get("chat_completions_path")
        if not path:
            defaults = {
                "chat_completions": "/v1/chat/completions",
                "responses": "/v1/responses",
                "anthropic_messages": "/v1/messages",
            }
            path = defaults.get(upstream_format, "/v1/chat/completions")
        if not str(path).startswith("/"):
            path = "/" + str(path)
        return str(path)

    def _build_attempt_details(
        self,
        provider: str,
        canonical_model: str,
        key: str,
        *,
        key_index: Optional[int] = None,
        upstream_format: str = "chat_completions",
        client_headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, Dict[str, str], str, Optional[str]]:
        """返回 (url, headers, provider_model, proxy_url)。
        proxy 优先级：key.proxy > provider.proxy > 全局 proxy > None（直连）。
        client_headers: 客户端原始请求头，按 provider 的 forward_client_headers 白名单透传。"""
        pcfg = (self.cfg.get("providers") or {}).get(provider) or {}
        base_url = (pcfg.get("base_url") or "").rstrip("/")
        url = base_url + self._format_path(provider, upstream_format)

        # 1. 静态配置头（provider.headers）
        headers = {}
        headers.update((pcfg.get("headers") or {}))

        # 2. 透传客户端请求头（按白名单 forward_client_headers）
        fwd_list = pcfg.get("forward_client_headers") or []
        if client_headers and isinstance(fwd_list, list):
            for hdr_name in fwd_list:
                hdr_key = str(hdr_name).lower()
                # 不覆盖已在静态 headers 中显式配置的值
                if hdr_key not in {k.lower() for k in headers}:
                    value = client_headers.get(hdr_name) or client_headers.get(hdr_name.title())
                    if value:
                        headers[hdr_name] = value

        headers["Content-Type"] = "application/json"
        headers["Authorization"] = f"Bearer {key}"
        # User-Agent 优先级：provider.user_agent > 客户端 User-Agent > provider.headers/default。
        # 先清理所有大小写变体，避免 urllib 最终发出重复/旧 UA。
        configured_ua = ""
        for header_name in list(headers.keys()):
            if str(header_name).lower() == "user-agent":
                configured_ua = configured_ua or str(headers.get(header_name) or "").strip()
                headers.pop(header_name, None)
        client_ua = None
        if client_headers:
            client_ua = (
                client_headers.get("User-Agent")
                or client_headers.get("user-agent")
            )
        provider_ua = str(pcfg.get("user_agent") or "").strip()
        if provider_ua:
            headers["User-Agent"] = provider_ua
        elif client_ua:
            headers["User-Agent"] = client_ua
        else:
            headers["User-Agent"] = configured_ua or "Mozilla/5.0"

        key_entry = None
        keys = pcfg.get("keys") or []
        if key_index is not None and 0 <= key_index < len(keys):
            key_entry = keys[key_index]
        proxy_url = resolve_proxy_url(key_proxy(key_entry), pcfg.get("proxy"), self.cfg.get("proxy"))

        provider_model = model_registry.resolve_provider_model(self.cfg, provider, canonical_model)
        return url, headers, provider_model, proxy_url
