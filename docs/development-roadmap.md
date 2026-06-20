# Development Roadmap

## Recent Refactoring Updates (2026-06-15)

* **Dashboard Engineering Refactor**: Migrated the 251KB monolith dashboard/app.js into a Vite-based build pipeline (dashboard_src). The code is currently bundled without minification to ensure existing UI unit tests (which assert raw code substrings) continue to pass. This provides a safe foundation for future component splitting.
* **Admin API Extraction**: Decoupled the God Object (sse2json.py) by extracting all _resp_admin_* routing methods (~700 lines) into dmin_routes.py via an AdminRoutesMixin. Local context constraints (like _request_filter_payload) were safely preserved and all 190+ test cases pass cleanly.

## Purpose

This document describes the target architecture and follow-up development plan for the proxy.

The proxy is not just a path forwarder. It should become a format-aware, model-aware, provider-aware routing system.

The main priorities are:

1. Three-format conversion.
2. Model merging and provider capability discovery.
3. Provider/key routing, rotation, retry, cooldown, and concurrency handling.
4. Runtime observability and configuration control.
5. Web console.

The web console is intentionally later, but its data and control interfaces should be reserved early so the core modules do not need to be redesigned.

## Confirmed Decisions

- `/v1` is the Chat Completions namespace.
- `/openai` is the Responses namespace.
- `/anthropic` is the Anthropic Messages namespace.
- `/openai/v1/chat/completions` is not the primary Chat Completions route.
- Legacy `/v1/messages` stays only as short-term migration support.
- Prefer providers that natively support the client-requested format.
- If the client format and upstream format are the same, pass through without format conversion.
- Model aliases are global by default; namespace overrides can be added later.
- Full request/response bodies are not recorded by default. Debug mode may capture them.
- Metrics start with in-memory counters/ring buffer plus lightweight SQLite request history for dashboard queries.
- Runtime config changes should write to an overlay config, not directly mutate the base config.
- Admin APIs require an admin key.
- Full API keys are never returned by status/admin APIs.
- Web console MVP is stdlib-only static HTML/CSS/JS served by the proxy; keep richer UI/UX work and long-term analytics behind the Admin API contract.

## Current Project State

The project currently has these useful module boundaries:

| Module | Current role |
| --- | --- |
| `sse2json.py` | HTTP server, request dispatch, retry orchestration |
| `request_routes.py` | Path classification |
| `format_adapters.py` | Central non-streaming format conversion registry |
| `protocol_adapters.py` | Anthropic Messages <-> OpenAI Chat Completions JSON conversion |
| `stream_adapters.py` | OpenAI SSE -> Anthropic SSE conversion and raw SSE relay |
| `model_registry.py` | Model fetching, conservative union list, provider capability snapshots |
| `scheduler_policy.py` | Retry/error classification and scheduling policy snapshot |
| `router.py` | Provider/key selection, cooldown, retry state |
| `upstream_client.py` | HTTP transport to upstream providers |
| `config_loader.py` | Config loading, environment overlays, provider normalization |
| `observability.py` | In-memory request metrics, attempt counters, recent request ring buffer |
| `tests/` | Standard-library unit tests |

Current test status:

- Syntax compilation passes.
- `python -m unittest discover -s tests` passes.
- Current suite has 170 tests.

Current important gaps:

- `/openai/v1/responses` non-streaming is implemented for native Responses upstream and Chat Completions fallback conversion.
- Non-streaming `3 x 3` format matrix is wired through `format_adapters.py`: three same-format pass-through paths and six cross-format conversion paths.
- Responses streaming supports native Responses pass-through and Chat Completions SSE -> Responses SSE fallback.
- `/anthropic/v1/messages` supports native Anthropic upstream pass-through and Chat Completions fallback conversion.
- `/v1/chat/completions` non-streaming supports native Chat Completions, Responses fallback, and Anthropic Messages fallback.
- Streaming fallback is wired for all three client formats and all three upstream formats: three same-format pass-through paths plus six cross-format event adapters. Unsupported or malformed provider-specific event extensions still fail explicitly instead of silently degrading.
- Provider model capability discovery records runtime snapshots, filters route attempts conservatively, and can be refreshed through the admin API.
- Tool conversion covers common non-streaming agent flows plus Chat Completions SSE tool-call deltas to Anthropic/Responses, Anthropic SSE tool-use deltas to Chat/Responses, and Responses SSE function-call deltas to Chat/Anthropic. Hosted tools, multimodal tool payloads, and provider-specific stream extensions are not yet full compatibility targets.
- Lightweight metrics, recent request records/query APIs, provider/key snapshots, routing policy snapshots, failure reason breakdowns, model capability admin APIs, runtime provider/key controls, chart-oriented time buckets, runtime overlay config editing, and the first Web console MVP exist.

Real upstream sanity check on 2026-06-09:

- `/v1/chat/completions` -> opencode Chat Completions succeeded with `claude-3-5-sonnet-20241022` mapped to `deepseek-v4-flash`.
- `/anthropic/v1/messages` -> deepseek Anthropic Messages succeeded with `claude-3-5-sonnet-20241022` mapped to `deepseek-v4-flash`.
- `/openai/v1/responses` -> rawchat Responses succeeded with direct model `gpt-5.5`.
- `/openai/v1/responses` with `claude-3-5-sonnet-20241022` previously failed at rawchat because the alias resolved to `deepseek-v4-flash`, which rawchat does not support. The model capability phase now prevents this after successful union discovery by filtering rawchat out for that canonical model.

Real upstream compatibility smoke on 2026-06-09:

- 18 real requests returned HTTP 200 through the proxy: 5 Chat Completions client requests, 6 Anthropic Messages client requests, and 7 Responses client requests.
- Provider attempts stayed within the approved budget: opencode 8 attempt records, deepseek 8 attempt records, rawchat 4 attempt records. Two records were compatibility retry attempts, not extra final failures.
- Native paths passed: opencode Chat Completions with `deepseek-v4-flash`, deepseek Anthropic Messages with `deepseek-v4-flash`, and rawchat Responses with `gpt-5.5`.
- Cross-format JSON paths passed at HTTP/routing level, including Chat <- Responses, Anthropic <- Responses, Chat <- Anthropic, Responses <- Anthropic, and Anthropic <- Chat.
- Forced tool-choice requests against opencode and deepseek now recover: upstream first returns `Thinking mode does not support this tool_choice`, the proxy records `provider_compat` / `tool_choice_auto_retry`, downgrades `tool_choice` to auto once, and the same provider succeeds without cooling the key.
- Provider/path-specific behavior: DeepSeek Anthropic native with `deepseek-v4-flash` returned visible text at `1024` output tokens, while opencode Chat Completions upstream can return HTTP 200 with empty `message.content`, non-empty `reasoning_content`, and `finish_reason=length`. Non-streaming proxy paths now detect this `empty_visible_output` condition after conversion and switch to the next provider without cooling the key.
- Unit coverage now includes Chat Completions, Responses, and Anthropic client formats retrying past a reasoning-only length cutoff, plus router coverage that `empty_visible_output` records a failed attempt without key cooldown.
- Post-implementation real smoke: one `/v1/chat/completions` request for `deepseek-v4-flash` first hit opencode Chat Completions, triggered `EMPTY VISIBLE OUTPUT`, retried deepseek Anthropic Messages, and returned HTTP 200 with visible text. This used one client request and stayed inside the approved real-call budget.

## Target Module Architecture

### 1. API Gateway

Purpose:

- Parse the client path.
- Determine the client-facing target format.
- Build a request intent.
- Never perform provider selection or format conversion directly.

Target concepts:

```text
ClientIntent:
  request_id
  client_format
  endpoint_kind
  model
  stream
  raw_body
  headers
```

Target client formats:

```text
chat_completions
responses
anthropic_messages
```

Target endpoint kinds:

```text
generate
models
count_tokens
health
admin
```

Target namespace semantics:

| Client path/base | Client format |
| --- | --- |
| `/v1` | Chat Completions |
| `/openai` | Responses |
| `/anthropic` | Anthropic Messages |

Legacy `/v1/messages` may remain during migration, but it is not a permanent semantic target.

`/openai/v1/chat/completions` should be rejected, redirected by documentation only, or guarded behind an explicit compatibility flag. It should not be the normal Chat Completions route.

### 2. Format Conversion Core

Purpose:

- Convert requests, responses, and streaming events between the three canonical formats.
- Stay independent from provider keys, retry logic, config files, and HTTP server concerns.

Canonical formats:

```text
chat_completions
responses
anthropic_messages
```

Target interface:

```text
convert_request(from_format, to_format, request)
convert_response(from_format, to_format, response)
convert_stream(from_format, to_format, upstream_events)
```

The initial implementation can still use Chat Completions as the practical hub:

```text
Anthropic Messages -> Chat Completions -> Anthropic Messages
Responses -> Chat Completions -> Responses
Chat Completions -> Chat Completions
```

But the module boundary should not force every conversion to be pairwise forever.

Same-format behavior:

- `chat_completions -> chat_completions`: pass through.
- `responses -> responses`: pass through.
- `anthropic_messages -> anthropic_messages`: pass through.

Pass-through still allows model alias resolution, provider model mapping, URL selection, auth header injection, proxy selection, and request accounting. It should not rewrite the protocol payload unnecessarily.

Important conversion concerns:

- Text content.
- System prompts.
- Tool definitions.
- Tool calls.
- Tool results.
- Tool call history across turns.
- Consecutive tool result grouping.
- Thinking/reasoning content.
- Stop reasons.
- Usage/token accounting.
- Streaming event mapping.
- Partial tool-call arguments.

Current non-streaming tool compatibility target:

- Preserve native-format tool payloads when client and upstream formats match.
- Convert common function/tool definitions between Chat, Responses, and Anthropic.
- Convert assistant tool calls/function calls/tool uses.
- Convert tool result/function call output blocks.
- Preserve the common agent loop: user -> assistant tool call -> tool result -> next assistant response.
- Group consecutive Chat `tool` messages into one Anthropic user message with multiple `tool_result` blocks.
- Group consecutive Responses `function_call` items into one Anthropic assistant message with multiple `tool_use` blocks.
- Preserve Responses `reasoning` output as Chat `reasoning_content` and Anthropic `thinking`; preserve Chat `reasoning_content` as a Responses `reasoning` output item.
- Cover Chat SSE tool-call argument deltas to Anthropic `input_json_delta` and Responses function-call argument deltas with unit tests.

This is not yet full compatibility for all multimodal tool payloads, hosted tools, every native Responses/Anthropic stream event shape, or provider-specific extensions.

Current streaming compatibility boundary:

- Chat client streams allow native Chat Completions pass-through, Responses SSE -> Chat Completions SSE, or Anthropic Messages SSE -> Chat Completions SSE.
- Responses client streams allow native Responses pass-through, Chat Completions SSE -> Responses SSE, or Anthropic Messages SSE -> Responses SSE.
- Anthropic client streams allow native Anthropic pass-through, Chat Completions SSE -> Anthropic SSE, or Responses SSE -> Anthropic SSE.
- If a streaming request has no upstream with an implemented stream path, the proxy returns 501 before starting SSE. This keeps retries and dashboard failure records explicit, and avoids buffering an unsupported stream format.

### 3. Provider and Model Registry

Purpose:

- Know which providers exist.
- Know which models each provider supports.
- Know which formats each provider supports.
- Merge equivalent models into canonical model IDs.
- Provide router candidates.

Target provider config shape:

```jsonc
{
  "providers": {
    "example": {
      "base_url": "https://api.example.com",
      "enabled": true,
      "keys": [
        "...",
        { "key": "...", "proxy": "http://127.0.0.1:9000" }
      ],
      "proxy": "http://127.0.0.1:8000",
      "formats": {
        "chat_completions": {
          "enabled": true,
          "path": "/v1/chat/completions"
        },
        "responses": {
          "enabled": false,
          "path": "/v1/responses"
        },
        "anthropic_messages": {
          "enabled": false,
          "path": "/v1/messages"
        }
      }
    }
  }
}
```

Backward compatibility:

- If `formats` is missing, treat the provider as Chat Completions-compatible.
- Existing `chat_completions_path` should map into `formats.chat_completions.path`.
- Existing `responses_path` and `anthropic_messages_path` map into their matching `formats` entries.
- Full endpoint URLs such as `/v1/responses` or `/anthropic/v1/messages` are split into `base_url` plus a format path.
- Base URLs containing `anthropic`, `responses`, `response`, or `codex` are used as lightweight format hints when `formats` is omitted.

The registry should produce candidates shaped like:

```text
ProviderCapability:
  provider
  canonical_model
  provider_model
  upstream_format
  url_path
  enabled
```

Current implementation notes:

- `provider_model_map` is manual and has the highest priority.
- Automatic discovery writes provider-level `models.provider_model_capabilities` and a local `models.models_union_snapshot`. `GET /v1/models` reads this local snapshot only; upstream `/v1/models` discovery happens during startup background discovery, provider add/edit events, and explicit refresh actions.
- Conservative model normalization allows exact lowercase IDs and `vendor/model` suffix matching.
- Substring guessing is intentionally avoided; `v4-flash` is not automatically treated as `deepseek-v4-flash`.
- Model discovery first tries `provider.base_url + models_path`; if `base_url` includes a path and that fails, it tries the origin root plus `models_path`. This supports providers whose generation API is path-prefixed while models are listed at the root `/v1/models`. Discovery snapshots use stale-while-revalidate semantics: refresh failures keep last-known-good model data available for `/v1/models`, while deleted/disabled providers are removed from the union.
- `models.assume_supports_unknown_models` defaults to `true` so startup is tolerant when discovery fails. It can be set to `false` for stricter routing.

### 4. Routing and Scheduling Engine

Purpose:

- Select attempts from provider/model/format candidates.
- Rotate providers and keys.
- Apply weights, cooldowns, retries, and timeout budgets.
- Stay independent from JSON conversion details.

Target attempt shape:

```text
Attempt:
  request_id
  attempt_no
  provider
  key_index
  key
  canonical_model
  provider_model
  upstream_format
  url
  headers
  proxy_url
```

Selection should consider:

- Provider enabled state.
- Key availability.
- Model support.
- Upstream format support.
- Native-format preference.
- Fallback conversion availability.
- Provider weights.
- Key/provider cooldown state.
- Request-local candidate de-duplication: the same `provider + key_index + upstream_format` should not be tried twice in one client request. `max_attempts` is an upper bound; it does not force duplicate calls after all distinct candidates are exhausted.

Native-format preference:

1. Try providers that support the client-requested format directly.
2. If native providers are unavailable or fail before response start, try providers that support another format with an available conversion path.
3. If the selected attempt's `upstream_format` equals the client format, skip conversion.

### 5. Transport Layer

Purpose:

- Send upstream HTTP requests.
- Open upstream SSE streams.
- Apply timeout and proxy settings.
- Return parsed JSON or stream handles.

It should not know:

- Client path semantics.
- Model alias rules.
- Provider rotation rules.
- Format conversion rules.

### 6. Observability and Metrics Store

Purpose:

- Record every request and every upstream attempt.
- Produce aggregate statistics for the future console.
- Provide failure details for debugging.

This should be a core module before the web UI exists.

Target concepts:

```text
RequestRecord:
  request_id
  started_at
  finished_at
  client_format
  endpoint_kind
  stream
  requested_model
  canonical_model
  final_status
  stop_reason
  error_message
  input_tokens
  output_tokens
  first_byte_ms
  duration_ms
  body_capture_mode
```

```text
AttemptRecord:
  request_id
  attempt_no
  provider
  key_id
  upstream_format
  provider_model
  status
  http_status
  error_type
  error_message
  retry_after_s
  first_byte_ms
  duration_ms
```

Default body policy:

- Do not record full request or response bodies by default.
- Record metadata, route, model, provider, status, first-byte latency, total duration, token usage, and error reason.
- In debug mode, allow full body capture for troubleshooting.
- Full body capture should be clearly marked in records and should be easy to disable.

Aggregate metrics:

- Total requests.
- Success count.
- Failure count.
- Success rate.
- Requests by client format.
- Requests by provider.
- Requests by model.
- Requests by upstream format.
- Average/p50/p95 first-byte latency and total duration.
- Retry count.
- Failure reasons.
- Token usage.
- Streaming vs non-streaming count.

Storage recommendation:

- Phase 1: in-memory ring buffer plus counters.
- Phase 2: lightweight SQLite request history for persisted request/detail/chart queries.
- Phase 3: richer SQLite-backed analytics once token/usage fields are consistently recorded.

SQLite is the local history backend because it supports request detail lookup, filtering, and chart data without adding an external service.

### 7. Runtime Config Manager

Purpose:

- Allow configuration changes without restarting.
- Validate changes before applying.
- Persist changes safely.

Future console operations:

- Add provider.
- Enable/disable provider.
- Update provider base URL.
- Update provider supported formats and paths.
- Add/remove/update keys.
- Add/update global, provider, and key-level proxy.
- Update weights.
- Update model routes.
- Update timeouts.
- Update debug logging.

Rules:

- Never expose full keys in status responses.
- Store and display masked keys or key IDs.
- Validate provider config before applying.
- Apply config atomically in memory.
- Persist runtime edits to an overlay config such as `runtime_config.json`.
- Merge order should be defaults -> base `config.json` -> runtime overlay -> environment overrides.
- Persist overlay changes using safe write/replace.
- Keep a rollback copy if possible.

### 8. Admin API

Purpose:

- Provide stable backend endpoints for the future web console.
- Keep web UI separate from core routing internals.
- Require an admin key for all admin endpoints.

Reserved local admin API shape:

```text
GET  /-/admin/overview
GET  /-/admin/metrics
GET  /-/admin/metrics/timeseries
GET  /-/admin/requests
GET  /-/admin/requests/{request_id}
GET  /-/admin/providers
POST /-/admin/providers
PATCH /-/admin/providers/{provider}
GET  /-/admin/providers/{provider}
POST /-/admin/providers/{provider}/keys
DELETE /-/admin/providers/{provider}/keys/{key_id}
PATCH /-/admin/providers/{provider}/formats/{format}
GET  /-/admin/models
GET  /-/admin/config
PATCH /-/admin/config
POST /-/admin/config/reload
POST /-/admin/providers/{provider}/enable
POST /-/admin/providers/{provider}/disable
POST /-/admin/providers/{provider}/cooldown/clear
POST /-/admin/providers/{provider}/keys/{index}/enable
POST /-/admin/providers/{provider}/keys/{index}/disable
POST /-/admin/providers/{provider}/keys/{index}/state/clear
POST /-/admin/models/refresh
```

The console should call these APIs. It should not import router/config modules directly.

Authentication:

- Use an admin key from config or environment.
- Accept it via header and optionally query string for local debugging.
- Never expose this key in the web UI or API responses.

### 9. Web Console

Purpose:

- Provide visual status and control.

Dashboard views:

- Overview: request totals, success/failure, first-byte latency, token usage.
- Providers: enabled state, key count, cooldowns, supported formats, proxy status.
- Models: canonical models, provider mappings, format availability.
- Requests: recent request list, filters, detail drill-down.
- Failures: failure reasons grouped by provider/model/status.
- Config: simple provider/key/proxy/format editing.

First version scope:

- Overview.
- Requests.
- Providers.
- Config.

Detailed UI/UX decisions are deferred until the web console phase. The backend should expose clean data for charts and tables first.

Charts:

- Requests over time.
- Success/failure over time.
- Provider distribution.
- Model distribution.
- First-byte latency trend.
- Failure reason breakdown.

Web UI should be built after:

- Metrics store exists.
- Admin API exists.
- Runtime config manager exists.

## Main Request Flow

Target flow:

```text
HTTP request
  -> API Gateway classifies client format
  -> build ClientIntent
  -> Model Registry resolves canonical model
  -> Registry finds provider/model/format candidates
  -> Router yields Attempts
  -> Format Conversion Core converts client request to attempt.upstream_format
  -> Transport sends upstream request
  -> Format Conversion Core converts upstream response/events to client format
  -> Observability records request and attempts
  -> HTTP response
```

## Development Phases

### Phase 1: Correct route semantics

- Make `/v1/chat/completions` the Chat Completions entry.
- Make `/anthropic/v1/messages` the Anthropic Messages entry.
- Keep `/v1/messages` only as legacy migration support.
- Keep `/openai/v1/responses` reserved for Responses.
- Remove `/openai/v1/chat/completions` from the normal route contract, or put it behind an explicit compatibility flag.

Status: completed for the current route contract. `/v1/chat/completions` dispatches to Chat Completions handling, `/anthropic/v1/messages` dispatches to Anthropic handling, `/openai/v1/responses` dispatches to Responses handling, and `/openai/v1/chat/completions` returns 404.

### Phase 2: Provider format capabilities

- Add `formats` to config normalization.
- Preserve current config compatibility.
- Add `upstream_format` to `Attempt`.
- Make provider filtering format-aware.
- Add tests for format-aware routing.

Status: completed for normalization and router selection. The router now receives `client_format` and `allowed_upstream_formats`, prefers same-format providers, and returns `Attempt.upstream_format` plus a format-specific URL. Native Responses and Anthropic request execution are now wired for the supported request/stream paths.

### Phase 3: Adapter registry

- Introduce a central adapter registry.
- Move current Anthropic/Chat conversion under explicit adapters.
- Add interfaces for request, response, and stream conversion.
- Keep existing behavior passing tests.

### Phase 4: Responses non-streaming

- Implement Responses request -> Chat Completions request.
- Implement Chat Completions response -> Responses response.
- Wire `/openai/v1/responses` non-streaming.
- Add fixture tests.

Status: completed for basic text and function-tool flows. Same-format Responses upstream attempts are passed through without protocol conversion, and Chat Completions upstream attempts are converted back to Responses.

### Phase 5: Responses streaming

- Implement Chat Completions SSE -> Responses SSE.
- Keep unsupported stream conversions returning 501.
- Add stream fixture tests.

Status: completed for Chat Completions SSE -> Responses SSE. `/openai/v1/responses` stream requests can now use native Responses upstreams or Chat Completions upstream fallback. Anthropic stream fallback to Responses is still unsupported.

### Phase 5.5: Native Anthropic upstream

- Prefer native Anthropic Messages providers for `/anthropic/v1/messages`.
- Pass same-format Anthropic requests/responses through without protocol conversion.
- Keep Chat Completions fallback for Anthropic clients.

Status: completed for JSON responses and native stream pass-through.

### Phase 5.5.1: Stream support boundaries

- Keep stream attempts limited to explicitly implemented event mappings.
- Return 501 for unsupported stream conversion paths before sending SSE headers.
- Cover Chat, Responses, and Anthropic stream no-candidate cases with proxy tests.

Status: completed for the current compatibility target. Chat, Responses, and Anthropic stream clients each allow all three upstream formats, with same-format pass-through and cross-format event adapters for the six non-native combinations.

### Phase 5.6: Chat Completions fallback through other formats

- Convert Chat Completions requests to Responses requests and Anthropic Messages requests.
- Convert Responses and Anthropic Messages JSON responses back to Chat Completions.
- Keep Chat Completions streaming constrained to native Chat upstream until stream adapters exist.

Status: completed for non-streaming text and common function-tool basics, including assistant tool calls, function call outputs/tool results, and consecutive Chat tool-result grouping for Anthropic.

### Phase 5.6.1: Non-streaming format adapter registry

- Add one central registry for non-streaming request/response conversion.
- Explicitly support all nine client/upstream format combinations.
- Treat same-format combinations as pass-through.
- Compose the two missing cross-format pairs through Chat Completions as an internal hub:
  - Responses -> Anthropic Messages.
  - Anthropic Messages -> Responses.

Status: completed for non-streaming text and common function-tool basics.

### Phase 5.7: Provider model discovery and mapping

- Fetch model lists from every enabled provider without exposing keys.
- Normalize provider model lists by provider.
- Keep provider-specific model IDs separate unless there is a proven alias relationship.
- Filter route attempts by the selected upstream provider's actual model support.
- Add admin-visible model capability data for the future console.

Status: completed as the baseline runtime snapshot and router filtering layer. Admin status/capability APIs and explicit refresh endpoint are available.

### Phase 6: Observability core

- Add request and attempt records.
- Add counters and aggregate metrics.
- Add in-memory recent request ring buffer.
- Add debug-only full body capture.
- Add optional SQLite persistence for chart/history data.

Status: baseline completed. `observability.py` records request totals, success/failure counts, attempt totals, failure rates, per-format/model/provider/status aggregates, active requests, and a bounded recent request ring buffer. `history_store.py` adds optional SQLite persistence for finished request metadata, attempt chains, masked key/debug fields, request list/detail queries, and chart-oriented time buckets. Full request bodies remain debug-only and are not written to history.

Scheduler and failure metrics now include `by_error_type`, `by_failure_reason`, attempt `http_status`, provider/format failure summaries, and per-provider failure rates. `GET /-/admin/requests` can filter by provider, request status, request status code, client format, endpoint, model, upstream format, error type, failure reason, and attempt HTTP status. When `observability.history.enabled` is true these queries use SQLite first and fall back to memory if unavailable; responses expose `source` as `sqlite` or `memory`.

Routing explainability is now a derived observability layer in `routing_explain.py`. Request list items include `routing_summary` for direct success, recovered fallback, failed, or no-attempt outcomes. Request detail enriches each attempt with `routing_explanation.selected`, `result`, `next_step`, and a semantic tone. The fields are derived at read time, so old SQLite history can be explained without schema migration.

Token and cost accounting baseline is now implemented. Non-streaming Chat Completions, Responses, and Anthropic Messages success paths normalize upstream/client `usage` into `input_tokens`, `output_tokens`, and `total_tokens` at request and attempt level. Converted streaming paths that produce a completed response object also record usage. Native Chat Completions, Responses, and Anthropic SSE pass-through now remains byte-for-byte pass-through while best-effort parsing usage events in the background; this depends on the upstream provider actually emitting usage events. `history_store.py` migrates existing SQLite history tables with token/cost columns automatically. Cost estimation is optional and uses provider `pricing.input_per_million` / `pricing.output_per_million` or per-model overrides; no supplier prices are hard-coded.

### Phase 7: Runtime config manager

- Add validated config update APIs at module level.
- Add runtime overlay config.
- Add atomic overlay persistence.
- Add masked key handling.
- Add provider/key/proxy update tests.

Status: baseline completed. `config_manager.py` writes validated provider/key/format edits to `runtime_config.json` using atomic replace, and `config_loader.py` merges base `config.json` plus runtime overlay plus environment overrides. Full API keys are masked in config views. Provider/key enable-disable remains a separate process-local runtime control, while provider edits, key additions, and format edits persist through the overlay.

### Phase 8: Admin API

- Add `/-/admin/*` endpoints.
- Expose metrics, request details, providers, models, and config.
- Keep APIs JSON-first.

Status: baseline completed for read-only and runtime-control APIs:

- `GET /-/admin/status`
- `GET /-/admin/metrics`
- `GET /-/admin/metrics/timeseries`
- `GET /-/admin/requests`
- `GET /-/admin/requests/{request_id}`
- `GET /-/admin/routing`
- `GET /-/admin/models/capabilities`
- `GET /-/admin/config`
- `GET /-/admin/config/overlay`
- `POST /-/admin/providers`
- `PATCH /-/admin/providers/{provider}`
- `POST /-/admin/providers/{provider}/keys`
- `PATCH /-/admin/providers/{provider}/formats/{format}`
- `PATCH /-/admin/routing`
- `PATCH /-/admin/retry`
- `PATCH /-/admin/retry/failure-policies`
- `PATCH /-/admin/models/routes`
- `POST /-/admin/models/routes/delete`
- `GET /-/admin/audit`
- `POST /-/admin/config/reload`
- `POST /-/admin/config/overlay/validate`
- `POST /-/admin/config/overlay/clear`
- `POST /-/admin/providers/{provider}/enable`
- `POST /-/admin/providers/{provider}/disable`
- `POST /-/admin/providers/{provider}/cooldown/clear`
- `POST /-/admin/providers/{provider}/keys/{index}/enable`
- `POST /-/admin/providers/{provider}/keys/{index}/disable`
- `POST /-/admin/providers/{provider}/keys/{index}/state/clear`
- `POST /-/admin/models/refresh`

Admin auth supports `X-Admin-Key`, `Authorization: Bearer ...`, and `?admin_key=...`. Full API keys are not returned; router status exposes key index and short key hash only.

Admin mutation audit status:

- `AdminAuditStore` writes lightweight JSONL records to `observability.audit.path` (default `tmp/admin_audit.jsonl`) and caps retained records with `observability.audit.max_records`.
- `GET /-/admin/audit` returns recent mutation records with time, action, target, source IP, request path, status, error, and sanitized detail.
- Provider keys and admin keys are masked before writing audit data or returning API responses.
- Model route changes are recorded as `model_route_updated` and `model_route_deleted`; failed delete validation records `model_route_delete_failed`.
- Failure policy changes are recorded as `failure_policy_updated` with sanitized detail.
- Overlay safety actions are recorded as `config_overlay_validated`, `config_overlay_validate_failed`, `config_overlay_cleared`, or `config_overlay_clear_failed`.

Metrics contract status:

- `GET /-/admin/metrics` returns `counters`, `failure_summary`, `recent_requests`, and `active_requests`.
- `counters` includes request/attempt totals, success/failure counts, `request_failure_rate`, `attempt_failure_rate`, request status distribution, attempt HTTP status distribution, provider aggregates, error types, failure reasons, `usage` totals, provider usage totals, and model usage totals.
- `failure_summary` is derived from recent request records and groups failed attempts by provider, upstream format, HTTP status, error type, and failure reason.
- `GET /-/admin/metrics/timeseries` returns chart buckets with request success/failure counts, first-byte latency aggregates (`first_byte_ms_count/total/avg/min/max`), total-duration aggregates (`duration_ms_count/total/avg/min/max`), token/cost totals, provider/model usage totals, provider, upstream format, status, error type, failure reason, and attempt HTTP status breakdowns. It prefers SQLite history and falls back to the in-memory recent ring.
- `GET /-/admin/requests` returns summarized records with `providers`, `upstream_formats`, `error_types`, `failure_reasons`, `attempt_http_statuses`, `attempt_outcomes`, `usage`, `cost_usd`, and `routing_summary` for filtering and table display.
- Request attempt detail includes `key_index`, `key_masked`, short `key_id`, `usage`, `cost_usd`, and `routing_explanation` for debugging without exposing raw provider keys.

Scheduler policy contract status:

- `scheduler_policy.RetryDecision` now carries `error_type`, `retryable`, `reason`, `stop_attempts`, `cooldown_scope`, `cooldown_s`, and `disables_key`.
- `router.report_failure` uses `scheduler_policy.failure_policy_for_error_type`, so runtime cooldown behavior and admin-visible policy data share one source.
- `retry.failure_policies` can override per-error cooldown behavior using `cooldown_scope`, `cooldown_s`, `provider_cooldown_s`, and `disables_key`.
- Invalid policy values are handled defensively: unsupported scopes are ignored, negative cooldowns are clamped to zero, provider cooldowns are capped, and `none` scope always clears cooldown/disable behavior.
- HTTP 429 still respects upstream `Retry-After` before configured `rate_limited.cooldown_s` when `respect_retry_after` is enabled.
- `GET /-/admin/status` and `GET /-/admin/routing` expose `policy.failure_policies` keyed by `error_type`.
- `policy.rule_table` exposes machine-readable scenario rows for HTTP 401/403, 429, 402, model-not-found 400/404, provider-compat 400/404, generic 400/404, 422, 5xx, transport errors, non-streaming empty visible output, request-local duplicate candidate skipping, and already-started streams.
- `router.iter_attempts` now skips repeated candidates within the same client request. This prevents a single-key provider from being retried again only because `routing.max_attempts` is larger than the number of distinct available candidates, while still allowing the same provider to appear again with a different key.
- `routing.provider_select` is implemented in router ordering. The default is now `priority_failover`: providers are ordered by descending `priority`, same-provider keys are treated as ordered fallbacks instead of a success-path rotation pool, and lower-priority providers are used only after the preferred provider/key candidates are unavailable or fail retryably. Each new request starts again from the highest-priority provider's first available key unless that key is cooled down or disabled. Legacy distribution modes remain available: `round_robin` rotates providers without weight expansion, `weighted_rr` expands route weights before rotating, and `random` uses a request-id-seeded stable shuffle. Model-specific routes can override the global mode with `models.routes.{model}.provider_select`; route provider `priority` overrides provider-level priority.

### Phase 9: Web console

- Build dashboard only after the admin API and metrics data are stable.
- Focus on operational clarity instead of decoration.

Status: baseline MVP completed. `/-/dashboard` serves a dependency-free operations console from `dashboard/index.html`, `dashboard/styles.css`, and `dashboard/app.js`. The current version includes Overview, Requests, Providers, Routing Policy, and Config views; native SVG/CSS charts for traffic, failures, first-byte latency, token/cost usage, and failure breakdowns; automatic refresh/pause; request filtering/detail drawer with masked key attempt details, token/cost fields, total-duration fields, and routing explanations; runtime provider/key controls; provider model capability viewing/refresh; inline provider config editing; common routing/retry tuning; Failure Policies editing; config reload; runtime overlay safety export/validate/clear; minimal provider creation; Model Routes editing; and Config-page audit trail for recent admin mutations. The static shell contains no runtime data or raw keys; all data/control calls still go through `/-/admin/*` with admin-key authentication.

Remaining Web console work:

- Add reset/export helpers for failure policy tuning.
- Add richer persisted analytics over SQLite, including time-range selection, export, and p50/p95 latency.
- Add confirmation flows and richer audit filtering/export for more sensitive config mutations.

## Testing Strategy

Do not use real upstream providers for core tests.

Test categories:

- Route classification tests.
- Format conversion fixture tests.
- Stream event conversion fixture tests.
- Provider format capability tests.
- Router attempt selection tests.
- Retry/cooldown tests.
- Metrics recording tests.
- Config update validation tests.
- Admin API handler tests with fake stores.

Real upstream tests should be manual or opt-in because they may consume keys and depend on external services.

## Near-Term Recommendation

The next implementation work should deepen the existing routing/config/control-plane foundation before adding larger Web console features.

Current queue:

1. Model Routes editor: completed. Safe Admin API endpoints and a Config-page form now edit `models.routes`, including provider weight/priority validation, per-model `provider_select`, edit/delete actions, and audit records. The text form accepts `provider:weight:priority`; the third segment is optional and overrides provider-level priority for that model route.
2. Full Failure Policies editor: completed. Routing Policy now edits `retry.failure_policies` per `error_type` without raw JSON, with cooldown scope/key cooldown/provider cooldown/disable key validation.
3. Provider Models/capabilities view: completed. Providers now show discovered model counts, model samples, canonical maps, formats, fetch status/errors, and a global refresh action backed by `POST /-/admin/models/refresh`.
4. Real upstream regression matrix: baseline completed. `tools/real_upstream_matrix.py` is opt-in (`--run` required), supports plain and tool-call scenarios across Chat Completions, Responses, and Anthropic Messages, and writes JSON reports without provider keys. `tools/real_stream_tool_smoke.py` is a separate opt-in smoke for stream tool-call cases and records only event/tool-call counts, argument delta counts, stop reasons, status, and duration. Bounded real smokes on 2026-06-10 passed the three client formats, cross-format plain cases, tool-call cases, and stream tool-call cases. The temporary report files were removed during project cleanup after their results were documented.
5. Config safety/rollback: completed baseline. Admin APIs expose masked overlay export, overlay validation preview, and confirmed overlay clear; clear moves the old overlay file to `.bak.<ts>` before rebuilding runtime objects. The Config page includes Overlay Safety controls.
6. Analytics/token/cost: completed baseline. `usage_accounting.py` normalizes usage and optional pricing-based cost estimation; observability/history/Admin APIs carry request and attempt token/cost fields; Overview shows token/cost metrics plus provider/model usage bars; Requests list/detail show token/cost values. Native Chat Completions, Responses, and Anthropic SSE pass-through parses usage events without changing the streamed bytes. A bounded real request on 2026-06-10 through `/v1/chat/completions` recorded `194` total tokens and verified dashboard rendering.
7. Dashboard entry/time-range UX: completed baseline. `/` now serves the dashboard shell, admin-key entry is a dedicated login gate instead of a topbar form, `?admin_key=...` still bypasses the gate for testing, Refresh/Pause live in the sidebar/mobile settings drawer, mobile navigation folds into the More settings drawer, and Overview time-range controls above the metric grid drive Traffic/Usage timeseries requests.
8. Tool-call/reasoning compatibility hardening: completed first pass. Tests now cover Responses parallel `function_call` items collapsing into one Anthropic assistant `tool_use` list, Responses `reasoning` output surviving through Chat and Anthropic conversions, Chat `reasoning_content` becoming a Responses `reasoning` output item, and Chat SSE tool-call argument deltas becoming Anthropic `input_json_delta`. Follow-up hardening on 2026-06-10 keeps Chat SSE `reasoning_content` when converting to Responses SSE, assigns distinct Responses `output_index` values when reasoning, text, and function calls appear in one stream, and maps Responses `response.reasoning_summary_text.delta` style events into Anthropic `thinking_delta` / Chat `reasoning_content`. Follow-up hardening on 2026-06-11 centralizes Chat-upstream `reasoning_content` compatibility: providers with `force_reasoning_content=true` and the built-in `opencode` path now receive a small placeholder for missing assistant `reasoning_content` across Chat, Responses, and Anthropic client fallback paths, preventing avoidable `thinking_content_required` failures before provider rotation. A later 2026-06-11 hardening extends the same provider-scoped Chat continuity to the built-in `deepseek` OpenAI-compatible path without making it a global OpenAI-compatible rule. The same 2026-06-11 pass also makes converted Chat/Anthropic -> Responses SSE emit `response.reasoning_summary_text.delta` and `.done` while retaining completed reasoning output items, improving thinking visibility in Responses clients. A later 2026-06-11 hardening adds DeepSeek Anthropic continuity: converted requests to the built-in `deepseek` provider, or providers with `force_anthropic_thinking=true`, receive a minimal assistant `thinking` block when history lacks one, avoiding `content[].thinking must be passed back` failures.
9. Stream support boundary hardening and full 3 x 3 stream fallback matrix: completed for common text/reasoning/tool-call event shapes. Unsupported stream combinations still return 501 before SSE starts only when no candidate exists; Chat, Responses, and Anthropic client stream tests cover no-supported-upstream cases. Responses stream clients can use native Anthropic Messages upstreams, including text deltas, thinking/reasoning summary retention, tool-use argument deltas, stop reason mapping, and usage accounting. Anthropic stream clients can use native Responses upstreams, including Responses reasoning summaries to `thinking`, output text deltas to `text_delta`, function-call arguments to `input_json_delta`, stop reason mapping, and usage accounting. Chat stream clients can use native Responses or Anthropic upstreams, including reasoning to `reasoning_content`, text deltas to `content`, function/tool calls to Chat `tool_calls`, finish reason mapping, and usage accounting. Bounded real stream smokes on 2026-06-10 covered Anthropic-to-Responses, Responses-to-Anthropic, Responses-to-Chat, and Anthropic-to-Chat stream fallback paths, including medium requests with Admin attempt/latency records. The temporary stream report files were removed during project cleanup after their results were documented.
10. Configuration and release checkpoint: completed baseline. `config.example.json` and `config.example.jsonc` now model the intended three-provider setup (`opencode` Chat Completions, `rawchat` Responses, `deepseek` Anthropic Messages), default to port `4894`, and include model routes for `deepseek-v4-flash`, `deepseek-v4-pro`, and `gpt-5.5`. `start_proxy_config.bat` uses `config.json` as the source of truth for the service port. Config reads now tolerate UTF-8 BOM via `utf-8-sig`, preventing Windows rewrites from silently falling back to default config. Local `4894` was restarted on latest code and Admin status verified. See `docs/release-checkpoint.md`.
11. Runtime provider add/edit hardening: completed on 2026-06-11. Runtime config changes now clear the in-memory model cache, mark affected provider capability snapshots pending/stale, and queue background discovery instead of making `GET /v1/models` wait on upstream calls. The client-facing model list is served from the persisted `models.models_union_snapshot`, rebuilt locally after provider discovery succeeds or relevant config changes remove/disable providers. Explicit `models.routes` still define preferred providers and weights, but providers discovered to support the same canonical model are appended as additional candidates instead of being permanently hidden by stale route lists. Provider names now accept Unicode letters/numbers plus `_`, `.`, and `-`, while still rejecting path/control characters. The dashboard Add Provider form keeps a stable form reference so a successful add no longer appears as `Cannot read properties of null (reading 'reset')`. Provider deletion is now available from the dashboard and Admin API with typed confirmation; deleting a provider also removes it from default pools, model routes, provider model maps, and capability snapshots, using overlay null markers when hiding a base-config provider.
12. Provider routing map hardening: completed on 2026-06-11. `models.provider_model_map` is treated as a provider-specific model-name override rather than a global allowlist. Existing manual mappings still win for that provider, automatic capability snapshots still filter providers that are known not to support a model, and newly added providers with unknown capability can participate when `assume_supports_unknown_models` is enabled. This prevents providers added from the console, such as OpenAI-compatible providers that have not yet produced a capability snapshot, from being hidden by stale mappings for older providers.
12a. Model-aware routing strictness: completed on 2026-06-11. Automatic model discovery now safely normalizes case, vendor prefixes, and space/underscore/hyphen variants, so `deepseek-ai/DeepSeek_V4 Flash` maps to canonical `deepseek-v4-flash` while preserving the real upstream id for provider requests. Once any reliable capability snapshot is active, providers without a matching discovered model are excluded by default unless that provider explicitly opts into `assume_supports_unknown_models=true`. This prevents a provider such as `rawchat`, whose capability snapshot only contains `gpt-5.x` models, from being selected for `deepseek-v4-flash`.
12b. Routing failure continuation and cooldown hardening: completed on 2026-06-11. HTTP 401/403 now disables or cools the failed key but no longer stops later provider/key attempts before a client response is written. HTTP 402 is now `quota_or_balance` with a long key cooldown instead of a short generic `server_error` cooldown. Provider availability in Admin snapshots now requires at least one usable key, and comma-separated key strings are normalized into separate keys so multi-key providers rotate correctly.
13. Runtime overlay cleanup and visibility: completed on 2026-06-11. Startup now keeps `config.json` as the base config, applies `runtime_config.json` as the console/Admin overlay, and applies environment variables last. Overlay tombstones are compacted so stale entries such as deleted overlay-only providers do not remain as `null`, while `null` markers are still retained when needed to hide base-config providers/routes/maps. The Config page now shows a Provider Model Map summary so provider-specific model-name overrides are visible without opening the raw JSON snapshot.

The next compatibility item is not another matrix cell, but hardening edge cases: provider-specific stream event variants, hosted tools, multimodal chunks, and malformed partial tool arguments. Failure-policy reset/export helpers remain useful but lower priority.
