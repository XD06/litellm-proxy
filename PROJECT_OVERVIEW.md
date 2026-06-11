# Project Overview

This project is a Python proxy for routing one client API format to multiple upstream LLM providers that may expose different API formats.

The core idea: the client chooses the output API shape by path, while each provider declares the upstream format it supports. The proxy then prefers same-format pass-through for speed and only converts when a fallback provider uses a different format.

## Current Client Contract

Client-facing routes are intentionally fixed:

| Client URL | Client format |
| --- | --- |
| `/v1/chat/completions` or `/v1/*` Chat path | OpenAI Chat Completions |
| `/openai/v1/responses` | OpenAI Responses |
| `/anthropic/v1/messages` | Anthropic Messages |

Do not treat `/v1` as a generic OpenAI namespace. In this project, `/v1` is the Chat Completions client surface only. Anthropic clients must use `/anthropic/v1/messages`.

## Provider Format Selection

Provider format selection is already implemented.

Preferred path:

1. The user declares provider format capability in `providers.<name>.formats`.
2. The router prefers providers that natively support the client-requested format.
3. If client format equals upstream format, the proxy pass-through path is used and the conversion layer is skipped.
4. If native providers are unavailable or fail before a response starts, the router can try a different upstream format if a conversion path exists.

Fallback path:

- If `formats` is omitted, `config_loader.py` infers provider format from legacy fields and URL hints.
- Full endpoint URLs are split into `base_url` plus the matching format path when possible.
- UI Add Provider now has explicit choices for Chat Completions, Responses, Anthropic Messages, plus `Auto infer from URL`.
- Existing providers can edit each format's `enabled` and `path` fields from the dashboard.

## Runtime Configuration

Main config files:

| File | Purpose |
| --- | --- |
| `config.json` | Local real config. Ignored by git. Contains real provider keys and admin key. Do not print it. |
| `config.example.json` | Minimal JSON example. |
| `config.example.jsonc` | Commented reference config. |
| `runtime_config.json` | Runtime overlay written by Admin API and the Web console. Ignored by git. |

Runtime config precedence is `config.json` → `runtime_config.json` → environment variables. `runtime_config.json` is not a replacement for `config.json`; it stores online edits and deletion tombstones. Tombstones are retained only when they are still needed to hide base-config entries.

Current intended provider roles:

| Provider | Upstream format | Known models |
| --- | --- | --- |
| `opencode` | OpenAI Chat Completions | `deepseek-v4-flash`, `deepseek-v4-pro` |
| `rawchat` | OpenAI Responses | `gpt-5.5` |
| `deepseek` | Anthropic Messages | `deepseek-v4-flash`, `deepseek-v4-pro` |

`config.json` should keep `routing.default_provider_pool`, `models.routes`, and `models.provider_model_map` limited to those active providers unless a new provider is intentionally added. `models.provider_model_map` is a provider-specific model-name override table, not a global allowlist.

## Request Flow

High-level flow:

```text
HTTP request
  -> request_routes.py classifies client format
  -> sse2json.py normalizes request and resolves model
  -> router.py selects provider + key + upstream_format
  -> same-format pass-through OR format_adapters/protocol_adapters conversion
  -> upstream_client.py sends provider request
  -> response or stream_adapters.py converts back to client format
  -> observability/history record attempt, first-byte latency, total duration, status, usage, masked key
```

Streaming follows the same routing idea but uses SSE adapters in `stream_adapters.py`. Once SSE bytes are sent to the client, transparent retry is intentionally not attempted.

## Module Map

| Area | Files |
| --- | --- |
| HTTP server, endpoint dispatch, Admin API | `sse2json.py` |
| Client path classification | `request_routes.py` |
| Provider/key/model/format routing | `router.py`, `model_registry.py` |
| Retry/cooldown policy | `scheduler_policy.py` |
| Non-streaming format conversion | `format_adapters.py`, `protocol_adapters.py` |
| Streaming conversion | `stream_adapters.py` |
| Upstream HTTP calls | `upstream_client.py` |
| Config loading and runtime overlay | `config_loader.py`, `config_manager.py` |
| Metrics, history, usage, audit | `observability.py`, `history_store.py`, `usage_accounting.py`, `audit_store.py`, `routing_explain.py` |
| Web console | `dashboard/index.html`, `dashboard/styles.css`, `dashboard/app.js` |
| Real upstream smoke tools | `tools/real_upstream_matrix.py`, `tools/real_stream_tool_smoke.py` |

## Web Console

The dashboard is served from `/` and `/-/dashboard`.

Current capabilities:

- Dedicated admin-key login gate.
- `?admin_key=...` can bypass the login gate for local testing.
- Overview metrics, first-byte latency chart, usage chart, provider health, recent failures.
- Request list/detail with attempt timeline, upstream format, masked key, token usage, cost fields.
- Provider enable/disable, key state controls, model capabilities refresh.
- Provider config editing: base URL, global/provider/key proxy, enabled state, keys, format enabled/path.
- Add Provider with explicit upstream format selection or auto inference.
- Routing Policy and Failure Policies editors.
- Config overlay validation/export/clear.
- Audit trail for admin mutations.

Static HTML/JS never includes raw admin or provider keys. Admin API responses must keep keys masked.

## Runtime Data

`tmp/` is runtime-only and ignored:

| File | Purpose |
| --- | --- |
| `tmp/proxy_history.sqlite3*` | Request history and time-series source for dashboard. |
| `tmp/admin_audit.jsonl` | Admin mutation audit log. |
| `tmp/proxy-live-latest.*.log` | Current local process stdout/stderr logs. |

To start a clean real-use session, stop the service, delete the history/audit files, then restart. Admin status checks and dashboard reads do not create model-provider request records.

## Testing

Standard verification:

```powershell
python -m unittest discover -s tests
python -m py_compile stream_adapters.py sse2json.py protocol_adapters.py format_adapters.py request_routes.py config_loader.py config_manager.py tools\real_stream_tool_smoke.py
node --check dashboard\app.js
```

Real upstream tools are opt-in and consume provider quota only with `--run`:

```powershell
python tools\real_upstream_matrix.py --max-cases 3
python tools\real_upstream_matrix.py --run --max-cases 3 --output tmp\real_upstream_matrix.json
python tools\real_stream_tool_smoke.py --run --base-url http://127.0.0.1:4894 --output tmp\real_stream_tool_smoke.json
```

## Performance Notes

Current performance-friendly behavior:

- Native same-format providers are preferred.
- Same-format requests skip JSON protocol conversion where possible.
- Request-local candidate de-duplication avoids retrying the same `provider + key_index + upstream_format`.
- SQLite history stores metadata, not full request bodies.
- Streaming conversion avoids buffering full output for supported paths.
- Chat-upstream fallback can fill missing assistant `reasoning_content` for providers that require it (`force_reasoning_content=true`, plus the built-in `opencode` path), avoiding avoidable DeepSeek thinking-mode compatibility failures.

Good next optimization areas:

- Use `docs/bug-optimization-plan.md` as the current bug/performance hardening backlog.
- Make provider setup even more guided so users rarely rely on format inference.
- Add provider capability cache visibility and refresh timing in the dashboard.
- Review HTTP connection reuse and timeout defaults for high concurrency.
- Keep conversion tests focused on real failed cases instead of trying to overfit every provider-private extension upfront.

## Where To Start

For route or format bugs:

1. Read `docs/format-routing-plan.md`.
2. Check `request_routes.py`, then the relevant handler in `sse2json.py`.
3. For non-streaming conversion, inspect `format_adapters.py` and `protocol_adapters.py`.
4. For streaming conversion, inspect `stream_adapters.py`.
5. Add/adjust tests under `tests/test_*proxy.py`, `tests/test_format_adapters.py`, or `tests/test_stream_adapters.py`.

For provider selection or retry bugs:

1. Start with `router.py`.
2. Check `scheduler_policy.py`.
3. Verify observability expectations in `observability.py` and `history_store.py`.

For dashboard bugs:

1. Start with `dashboard/app.js`.
2. Use Admin API tests in `tests/test_admin_api.py`.
3. Keep login/auth behavior conservative: do not render the console until admin status validation succeeds.

For config changes:

1. Start with `config_loader.py` for normalization and inference.
2. Use `config_manager.py` for Admin API mutations and overlay persistence.
3. Keep `config.example.jsonc`, `README.md`, and this overview in sync.
