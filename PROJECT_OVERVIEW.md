# Project Overview & Architecture Guide

> This document is the primary onboarding guide for developers new to the project.
> It explains the architecture, module responsibilities, data flow, and key design
> decisions so you can become productive without reading every source file.

## What Is This Project?

A Python-based **format-aware LLM API proxy** that sits between LLM clients (Cherry Studio, Claude Code, OpenAI SDK, etc.) and multiple upstream LLM providers. It accepts three API formats — OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages — and can convert between any pair when the best available provider uses a different format than the client requested.

### Core Value Proposition

1. **One endpoint, many providers** — Clients talk to one URL; the proxy routes to the best provider.
2. **Format freedom** — Send Anthropic format to an OpenAI-only provider, or vice versa.
3. **Resilience** — Automatic failover across providers and keys with cooldown policies.
4. **Observability** — Full request history, per-attempt traces, cost estimation.
5. **Zero-restart config** — Dashboard edits go to a runtime overlay; `config.json` is never rewritten.

---

## Architecture at a Glance

```
                         ┌─────────────────────────────────────────┐
                         │              sse2json.py                 │
                         │  (HTTP server + request dispatch)       │
                         └──────────┬──────────────┬───────────────┘
                                    │              │
                    ┌───────────────▼──┐   ┌───────▼──────────┐
                    │ request_routes.py │   │  admin_routes.py  │
                    │ (path → format)   │   │  (Admin API)      │
                    └────────┬──────────┘   └────────┬──────────┘
                             │                       │
                    ┌────────▼──────────────────────▼──────────┐
                    │              router.py                     │
                    │  (provider/key selection, failover,        │
                    │   cooldown, health scores)                 │
                    └────────┬──────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │     upstream_client.py       │
              │  (HTTP client, streaming)    │
              └──────────────┬──────────────┘
                             │
            ┌────────────────▼────────────────────┐
            │     stream_adapters.py               │
            │     protocol_adapters.py             │
            │     format_adapters.py               │
            │  (6 stream converters + pass-through │
            │   + non-streaming conversion)        │
            └────────────────┬────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │   observability.py           │
              │   history_store.py           │
              │   audit_store.py             │
              │  (metrics, SQLite, audit)    │
              └──────────────────────────────┘
```

---

## Module Map

### Core Pipeline

| Module | Lines | Responsibility | Key Classes/Functions |
| --- | --- | --- | --- |
| `sse2json.py` | ~3,500 | Main entry point. HTTP server, request dispatch, streaming/non-streaming handlers for all three client formats. | `ProxyHandler`, `RuntimeContext`, `_request_runtime()` |
| `request_routes.py` | ~90 | Classifies incoming HTTP paths into format families (chat/responses/anthropic/dashboard/admin). | `Route`, `classify_get()`, `classify_post()` |
| `router.py` | ~1,200 | Provider + key selection with 5 modes (priority_failover, round_robin, weighted_rr, random, auto). Maintains per-key and per-provider cooldown state. | `UpstreamRouter`, `Attempt`, `_KeyState`, `_ProviderState` |
| `upstream_client.py` | ~480 | HTTP client wrapping urllib3. Opens streaming and non-streaming connections to upstream providers. Manages read timeouts. | `OpenAIUpstreamClient`, `HTTPResponseLineWrapper`, `set_response_read_timeout()` |
| `scheduler_policy.py` | ~480 | Retry/cooldown policy engine. Maps error types to cooldown scopes and durations. | `RetryDecision`, `should_downgrade_tool_choice()` |

### Format Conversion

| Module | Lines | Responsibility |
| --- | --- | --- |
| `stream_adapters.py` | ~2,450 | 6 SSE stream converters (chat↔responses, chat↔anthropic, responses↔anthropic), `relay_sse_stream` pass-through, `BufferedSSEWriter` for batched flushing, `prefetch_initial_stream_lines` for pre-header validation. |
| `protocol_adapters.py` | ~1,800 | Non-streaming request/response conversion between all three formats. |
| `format_adapters.py` | ~90 | Thin dispatch layer that routes format pairs to the correct protocol_adapter function. |
| `chat.py` | ~300 | Chat Completions-specific non-streaming request/response handlers. |
| `responses.py` | ~300 | OpenAI Responses-specific non-streaming request/response handlers. |

### Configuration

| Module | Lines | Responsibility |
| --- | --- | --- |
| `config_loader.py` | ~680 | Loads `config.json`, normalizes legacy fields, infers provider formats from URLs, applies env overlays, supports zero-config mode. |
| `config_manager.py` | ~1,050 | `RuntimeConfigManager` — manages the runtime overlay with RLock-serialized commits, tombstone pruning, validation, and atomic file writes. |
| `proxy_utils.py` | ~250 | Shared utilities: key normalization, proxy resolution, key masking. |

### Observability

| Module | Lines | Responsibility |
| --- | --- | --- |
| `observability.py` | ~1,090 | In-memory metrics, active request tracking, first-byte latency, provider activity events, counter restoration from history on restart. |
| `history_store.py` | ~1,070 | SQLite-persisted request history with async write queue, retention pruning, counter rebuild. |
| `audit_store.py` | ~185 | JSONL audit log for admin mutations with sensitive field sanitization. |
| `routing_explain.py` | ~150 | Enriches request records with human-readable routing explanations. |
| `usage_accounting.py` | ~160 | Token usage normalization across formats, cost estimation from pricing config. |

### Model Management

| Module | Lines | Responsibility |
| --- | --- | --- |
| `model_registry.py` | ~1,000 | Model discovery, normalization, provider model mapping, capability caching, disabled model tracking. |
| `model_discovery_queue.py` | ~200 | Background queue for async provider model discovery. |

### Dashboard

| Module | Lines | Responsibility |
| --- | --- | --- |
| `dashboard_src/src/app.js` | ~7,275 | Main dashboard application (vanilla JS with morphdom, i18n, playground, provider/routing/config management). |
| `dashboard_src/src/api.js` | ~62 | API client functions (apiGet, apiPost, apiPatch with admin key auth). |
| `dashboard_src/src/styles.css` | ~10,840 | Dashboard styles. |
| `dashboard/` | (built) | Vite-built static assets served by the proxy. |

### Deployment

| File | Purpose |
| --- | --- |
| `Dockerfile` | Python 3.12-slim based image with gosu for privilege dropping. |
| `docker-compose.yml` | Single-service compose with health check, volume mounts for config/data/logs. |
| `docker-entrypoint.sh` | Creates directories, sets permissions, drops to `appuser`. |
| `deploy/nginx/litellm-proxy.conf` | Nginx reverse proxy config with SSE-friendly settings (buffering off, long timeouts). |
| `deploy/systemd/litellm-proxy.service` | systemd unit with security hardening (NoNewPrivileges, ProtectSystem, PrivateTmp). |

---

## Request Flow (Detailed)

### 1. Path Classification (`request_routes.py`)

Every HTTP request is classified by its URL path:

```
/v1/chat/completions          → family="chat_completions"
/v1/responses                 → family="responses"
/openai/v1/responses          → family="responses" (namespaced)
/anthropic/v1/messages        → family="anthropic"
/v1/messages                  → family="anthropic" (legacy)
/v1/models                    → family depends on namespace
/health                       → family="shared"
/-/admin/*                    → family="admin"
/ or /-/dashboard             → family="dashboard"
```

### 2. Request Normalization (`sse2json.py`)

The handler:
- Parses the request body as JSON
- Resolves the client model name → canonical model (via `client_model_map`)
- Determines if the request is streaming (`stream: true`)
- Captures a `RuntimeContext` snapshot via `_request_runtime()`

### 3. Provider Selection (`router.py`)

The router:
- Looks up model-specific routes in `models.routes`, falls back to `routing.default_provider_pool`
- Filters by provider availability (enabled, not in cooldown)
- Filters by format capability (does the provider support the client's format?)
- Selects provider + key based on the configured mode
- Deduplicates candidates (same provider + key_index + format won't be retried)
- Returns an `Attempt` dataclass with URL, headers, key, upstream_format

### 4. Upstream Call (`upstream_client.py`)

- For streaming: opens a connection, sets first-byte timeout, returns a `HTTPResponseLineWrapper`
- For non-streaming: sends request, reads full response, returns status + body
- The `HTTPResponseLineWrapper` wraps urllib3's response to provide `readline()` iteration with proper exception propagation (only `ValueError` is caught; network errors propagate)

### 5. Response Handling

**Same-format streaming (pass-through):**
- `relay_sse_stream()` forwards raw SSE bytes line-by-line
- Optionally scans for usage data in SSE lines
- On interruption: sends a format-appropriate terminal event (`[DONE]`, `message_stop`, or `response.failed`)

**Cross-format streaming (conversion):**
- One of 6 `stream_*_to_*()` functions transforms SSE events chunk-by-chunk
- Handles text deltas, reasoning/thinking blocks, tool calls
- Maintains block ordering (Anthropic requires thinking before text/tool)

**Non-streaming:**
- Same-format: validate JSON, forward (optionally re-serialize)
- Cross-format: `protocol_adapters.py` converts the full response body

### 6. Observability (`observability.py`, `history_store.py`)

Each request records:
- Request ID, timestamp, client format, model
- Per-attempt chain: provider, key (masked), upstream format, latency, status, error
- First-byte latency, total duration
- Token usage and estimated cost
- Routing explanation (which providers were tried and why)

History is written asynchronously via a queue to avoid blocking request threads.

---

## Runtime Context & Concurrency Safety

### The Problem

When config is hot-swapped (e.g., a provider is disabled via the dashboard), all running request threads and background tasks need to see a consistent view of the system — not a torn mix of old and new state.

### The Solution: `RuntimeContext`

```python
class RuntimeContext:
    __slots__ = ("config", "router", "upstream_client", "observability", "audit")
```

A single immutable bundle of all live runtime objects. The module-level `RUNTIME` global is the current snapshot. Config reload atomically swaps `RUNTIME` to a freshly-built `RuntimeContext`.

Request threads capture `RUNTIME` once via `_request_runtime()` at the start and use that snapshot for the entire request lifetime.

### Config Overlay: RLock-Serialized Commits

```python
@contextmanager
def _locked_overlay(self):
    with self._commit_lock:           # RLock
        overlay = copy.deepcopy(self.overlay)  # Copy
        yield overlay                  # Mutate
        overlay = self._prune_overlay_tombstones(overlay)  # Prune
        self._write_overlay(overlay)   # Persist (temp file + os.replace)
        self.overlay = overlay         # Swap
        self.config = self._normalized_merged()  # Re-merge
```

This prevents lost updates: two concurrent admin mutations each start from the same overlay, but the second write would silently overwrite the first without the lock.

### Stream Adapter Error Safety

All 6 stream adapters wrap their error-handling code in `try/except`:

```python
except Exception as e:
    err_text = f"[Stream interrupted: {type(e).__name__}]"
    print(f"[proxy] {err_text}: {str(e)[:200]}", flush=True)
    try:
        # Send graceful close event to client
        close_all_blocks()
        sse(...)
        wfile.flush()
    except Exception:
        pass  # Client already disconnected — that's OK
    return None  # Signal failure to caller
```

This ensures that if the client disconnects during the error-handling phase, the adapter returns `None` (failure) instead of raising a secondary exception.

---

## Configuration System

### Three-Layer Precedence

```
config.json (base) → runtime_config.json (overlay) → environment variables
```

- `config.json`: Read once at startup. Never written by the proxy.
- `runtime_config.json`: Written by Admin API / dashboard. Uses tombstones (`null` values) to "delete" base-config entries.
- Environment variables: Applied last, override everything.

### Tombstone Mechanism

When a user deletes a provider via the dashboard:
1. The overlay stores `{"providers": {"deleted_provider": null}}`
2. On merge, `null` values remove the corresponding base-config entry
3. If the base-config entry is later removed too, the tombstone is pruned (no longer needed)

### Zero-Config Mode

If no `config.json` exists, the proxy auto-detects providers from environment variables:
- `OPENAI_API_KEY` → creates an "openai" provider
- `DEEPSEEK_API_KEY` → creates a "deepseek" provider
- etc.

This allows `pip install litellm-proxy && litellm-proxy` to work with zero configuration.

---

## Testing

### Test Suite (459+ tests, 28 files)

| Category | Key Test Files |
| --- | --- |
| Routing & failover | `test_router.py`, `test_auto_routing.py`, `test_scheduler_policy.py` |
| Format conversion | `test_conversions.py`, `test_format_adapters.py`, `test_stream_adapters.py` |
| HTTP routing | `test_http_route_dispatch.py`, `test_request_routes.py` |
| Config | `test_config_loader.py`, `test_config_manager.py`, `test_zero_config.py`, `test_runtime_config_migration.py` |
| Proxy handlers | `test_chat_proxy.py`, `test_anthropic_proxy.py`, `test_responses_proxy.py` |
| Streaming | `test_stream_adapters.py`, `test_stream_interruption.py` |
| Admin API | `test_admin_api.py` |
| Observability | `test_observability.py`, `test_history_store.py`, `test_provider_activity.py` |
| Infrastructure | `test_upstream_client.py`, `test_timeout_budget.py`, `test_health_scores.py` |
| Models | `test_model_registry.py`, `test_model_inference.py`, `test_model_discovery_queue.py` |

### Running Tests

```bash
# Full suite
python -m pytest tests/ -q

# Specific module
python -m pytest tests/test_router.py -v

# Compile check
python -m py_compile sse2json.py config_loader.py config_manager.py router.py upstream_client.py stream_adapters.py
```

---

## Where To Start (For New Developers)

### Understanding the request flow

1. Read `request_routes.py` (90 lines) — understand how paths map to formats
2. Read the `do_POST` section of `sse2json.py` — see how requests are dispatched
3. Read `router.py` `select()` method — understand provider/key selection
4. Read `stream_adapters.py` `relay_sse_stream()` — understand the simplest streaming path

### For routing or retry bugs

1. Start with `router.py` — check `select()` and `report_failure()`
2. Check `scheduler_policy.py` — verify error classification and cooldown logic
3. Verify in `observability.py` — check what's recorded

### For format conversion bugs

1. Read `format_adapters.py` (90 lines) — see which conversion pair is selected
2. For streaming: inspect the relevant `stream_*_to_*()` function in `stream_adapters.py`
3. For non-streaming: inspect the relevant function in `protocol_adapters.py`
4. Add tests in `tests/test_stream_adapters.py` or `tests/test_conversions.py`

### For config bugs

1. Start with `config_loader.py` — understand normalization and inference
2. Use `config_manager.py` — check overlay merge and tombstone logic
3. Keep `config.example.jsonc`, `README.md`, and this overview in sync

### For dashboard bugs

1. Start with `dashboard_src/src/app.js` — the main application
2. Check `dashboard_src/src/api.js` — API client with admin key auth
3. Use Admin API tests in `tests/test_admin_api.py`
4. Always run `npm run build` after changes to sync `dashboard/`

### For deployment

1. Read `Dockerfile` and `docker-compose.yml` — container setup
2. Read `deploy/nginx/litellm-proxy.conf` — reverse proxy with SSE support
3. Read `deploy/systemd/litellm-proxy.service` — bare metal deployment
4. Full VPS migration: `docs/VPS_MIGRATION.md`
