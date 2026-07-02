# Bug And Performance Optimization Plan

Date: 2026-06-11

## Purpose

This document turns recent external reviews plus local code inspection into an actionable bug and performance backlog.

The proxy already has a working three-format routing and conversion baseline:

- Client `/v1/*` means Chat Completions.
- Client `/openai/v1/responses` means OpenAI Responses.
- Client `/anthropic/v1/messages` means Anthropic Messages.
- Providers declare or infer their upstream format.
- Same-format attempts are preferred and bypass conversion where possible.
- Cross-format JSON and common SSE conversions are implemented.
- Routing, retry, cooldown, request history, diagnostics, Admin API, and dashboard are in place.

The next round of work should not rewrite the whole proxy. It should harden stream edge cases, make observability cheaper under load, and improve strict-client protocol compatibility.

## Review Method

Each item below is classified as:

| Classification | Meaning |
| --- | --- |
| Confirmed | The issue exists in current code or is a credible production risk. |
| Partially confirmed | The direction is valid, but the review overstated the impact or named the wrong root cause. |
| Not accepted | The claim conflicts with current code or protocol behavior; do not implement it as stated. |

## Priority Summary

| Priority | Work item | Classification | Main files |
| --- | --- | --- | --- |
| P0 | Bound and harden stream prefetch before client headers are sent | Confirmed | `stream_adapters.py`, `sse2json.py` |
| P0 | Treat more client disconnect variants as client-side 499, not stream/provider failure | Partially confirmed | `sse2json.py`, `stream_adapters.py` |
| P1 | Move SQLite history writes off request threads | Confirmed | `observability.py`, `history_store.py` |
| P1 | Centralize upstream response socket timeout handling | Partially confirmed | `upstream_client.py`, `stream_adapters.py` |
| P1 | Improve Responses SSE strict-client compatibility | Partially confirmed | `stream_adapters.py`, tests |
| P1 | Emit Responses-compatible reasoning deltas in converted streams | Confirmed | `stream_adapters.py`, `protocol_adapters.py`, tests |
| P1 | Harden Anthropic block ordering when converting from Chat/Responses streams | Confirmed | `stream_adapters.py`, tests |
| P1 | Harden model-aware provider filtering and safe model-id normalization | Confirmed | `model_registry.py`, `router.py`, tests |
| P1 | Fix key-fatal continuation, quota cooldown, and key-aware provider availability | Confirmed | `sse2json.py`, `scheduler_policy.py`, `router.py`, `proxy_utils.py`, tests |
| P1 | Add configurable format-aware routing balance policy | Confirmed optimization | `router.py`, `config_loader.py`, `dashboard/`, tests |
| P2 | Add configurable stream buffering limits | Confirmed | `stream_adapters.py`, `config_loader.py` |
| P2 | Add configurable SSE flush policy | Confirmed | `stream_adapters.py`, `config_loader.py` |
| P2 | Evaluate HTTP connection pooling transport | Confirmed, larger refactor | `upstream_client.py`, tests |

## Second Review Pass (2026-06-11, code-verified)

The items below were added after a second review pass. Each was verified by reading
the current source, not just trusting an external summary. Two widely-claimed
"plaintext key leak" findings were **downgraded** after verification (see the
"Suggestions Not To Implement As Stated" section), because the audit layer and the
HTTP layer already sanitize. Verification status is recorded per item.

| Priority | Work item | Classification | Main files |
| --- | --- | --- | --- |
| P1 | Harden admin auth: constant-time compare + drop `?admin_key=` query auth | Confirmed (code-verified) | `sse2json.py` |
| P1 | Bound client request body size before reading | Confirmed (sub-agent) | `sse2json.py` |
| P1 | Close non-stream and failed-stream upstream responses explicitly | Confirmed (code-verified non-stream; sub-agent stream) | `upstream_client.py`, `sse2json.py` |
| P1 | Make runtime config hot-swap atomic across worker threads | Confirmed (sub-agent) | `sse2json.py`, `config_manager.py` |
| P2 | Cache proxy openers; stop rebuilding per request | Confirmed (code-verified) | `upstream_client.py` |
| P2 | Serialize `runtime_config.json` writes to prevent lost updates | Confirmed (sub-agent) | `config_manager.py` |
| P2 | Tolerant SSE field parsing (no-space `data:`, trailing whitespace) | DONE 2026-06-11 | `stream_adapters.py` |
| P2 | Bind to `127.0.0.1` by default or warn on `0.0.0.0` | DONE 2026-06-11 | `sse2json.py` |
| P2 | Move diagnostic-log disk I/O out of the lock | Confirmed (sub-agent) | `sse2json.py` |
| P2 | Preserve partial usage when a stream is interrupted | Confirmed (sub-agent) | `stream_adapters.py` |

## P1. Key-Fatal Continuation, Quota Cooldown, And Key Availability

### Current Behavior

The scheduler policy already described HTTP 401/403 as key-scoped failures that should cool or disable only the current key while allowing later candidates. The request handlers, however, also stopped when `decision.retryable` was false. Since `key_invalid` is not retryable for the same key, this accidentally stopped all later provider/key attempts.

HTTP 402 quota/balance failures were also classified as ordinary `server_error`, which only uses a short default key cooldown. A provider with insufficient balance could therefore be retried repeatedly after a short interval.

Provider runtime availability in the Admin snapshot only reflected provider-level cooldown/runtime flags. It did not account for whether any key under that provider was usable.

Finally, comma-separated key strings were accepted as one raw key. A config entry such as `"key1,key2"` would be sent upstream as one invalid bearer token instead of two key entries.

### Fix Direction

- Request handlers should stop only when `decision.stop_attempts` is true. `key_invalid` should record the failed key and continue to later candidates before any client response is written.
- Add a dedicated `quota_or_balance` error type for HTTP 402, with a long default key cooldown.
- Keep provider availability true only when the provider is enabled, not cooled, and has at least one available key.
- Normalize comma-separated key strings into multiple keys during config load and runtime provider edits.
- Keep key-level cooldown semantics: a provider with multiple keys can remain available if at least one key is still usable.

### Acceptance Tests

- A 401 on attempt 1 is recorded as `key_invalid`, then attempt 2 can succeed.
- A 402 is recorded as `quota_or_balance` and applies a long key cooldown.
- A cooled key is skipped when another key on the same provider is available.
- A provider with all keys disabled/cooled reports `available=false`.
- Comma-separated string keys are split into separate key entries.

## P1. Model-Aware Provider Filtering And Safe Model Normalization

### Current Behavior

Provider model discovery records two separate data sets:

- `models.provider_model_capabilities`: automatic runtime snapshot from `/v1/models`.
- `models.provider_model_map`: manual provider-specific override from canonical model id to the real upstream model id.

Manual mappings have the highest priority. Automatic discovery now safely normalizes model ids by lowercasing, removing vendor path prefixes, and treating spaces/underscores as `-`. For example, `deepseek-ai/DeepSeek_V4 Flash` is treated as canonical `deepseek-v4-flash`, while the upstream request still uses the real id returned by the provider.

### Risk

The old unknown-model fallback was too broad. If one provider had a valid capability snapshot but another provider had no snapshot yet, the unknown provider could still enter the default pool when `assume_supports_unknown_models=true`. In real use, this allowed a provider such as `rawchat` to be selected for `deepseek-v4-flash` even though its discovered model list only contained `gpt-5.x` models.

This caused avoidable upstream failures and made the request detail look like a format-conversion problem when the real issue was model/provider eligibility.

### Fix Direction

- Keep `provider_model_map` as an explicit override, not a fuzzy matching table.
- Use safe automatic normalization for low-risk name differences:
  - case differences;
  - vendor prefix such as `vendor/model`;
  - spaces and underscores versus hyphens.
- Do not use arbitrary longest-substring or fuzzy matching because that can merge unrelated model names.
- Once any reliable capability snapshot is active, route only to providers that either:
  - explicitly map the canonical model in `provider_model_map`;
  - advertise the canonical model in `provider_model_capabilities`;
  - explicitly set provider-level `assume_supports_unknown_models=true`.
- Preserve tolerant startup behavior only when no reliable capability snapshot exists.

### Acceptance Tests

- `deepseek-ai/DeepSeek_V4 Flash` is exposed as canonical `deepseek-v4-flash` and resolves back to the provider's real model id.
- A provider with `gpt-5.5` capability is not selected for canonical `deepseek-v4-flash`.
- A provider with no capability snapshot is excluded once capability filtering is active unless it explicitly opts into unknown model support.
- Existing manual `provider_model_map` entries still override automatic discovery.

## P1. Configurable Format-Aware Routing Balance

### Current Behavior

The router currently uses a native-first format policy. For example, a client request to `/anthropic/v1/messages` first tries providers that can serve `anthropic_messages` for the requested canonical model. Providers that expose the same model through `chat_completions` or `responses` are placed in a fallback layer and normally run only after the native-format layer fails, has no usable keys, or is cooled down.

This is intentional for conversion safety and latency, but it means same-model providers in other formats do not participate in normal load distribution.

### Risk

Users may expect model-level routing weights to distribute traffic across all providers that can serve a model, regardless of provider format. Native-first routing can therefore make a provider such as `opencode` appear unused for Anthropic client traffic even though it supports the same model through Chat Completions.

The current behavior is safest, but it limits balancing, quota spreading, and provider comparison.

### Fix Direction

- Add a routing setting such as `format_preference`:
  - `native_first` default, current behavior.
  - `balanced` mixes native and cross-format candidates according to provider weights.
  - Optional later mode: `native_weighted`, where native providers receive a configurable bonus but fallback formats still participate.
- Expose the active policy in `/-/admin/routing` and the Routing Policy UI.
- Keep same-format pass-through as the default for safety.
- In balanced modes, still avoid retrying the same `provider + key_index + upstream_format` within one request.
- Record in request details whether a selected attempt was native or cross-format fallback.

### Acceptance Tests

- With `native_first`, Anthropic client requests choose `anthropic_messages` providers before Chat/Responses providers.
- With `balanced`, providers for the same model can rotate across different upstream formats.
- Provider weights still affect order in `weighted_rr`.
- Same candidate de-duplication remains enforced.
- Dashboard policy snapshot clearly shows the selected format preference.

## P0. Bound And Harden Stream Prefetch

### Current Behavior

`prefetch_initial_stream_lines()` starts a daemon thread to read until the first SSE `data: ` line before response headers are sent to the client. If the upstream connection never yields a valid data event, the main thread times out and closes the upstream object.

### Risk

This can still leave a background daemon thread blocked in `readline()` if the close does not wake the underlying socket promptly. It can also accumulate unlimited skipped lines when `preserve_skipped=True`.

This matters because prefetch runs before the client receives headers. A bad upstream or gateway can therefore consume threads without producing useful work.

### Fix Direction

- Add maximum prelude bounds:
  - `stream_prefetch_max_lines`, default `128`.
  - `stream_prefetch_max_bytes`, default `64 KiB`.
- If the first data event is not reached before either bound, close upstream and raise `socket.timeout` or a typed prefetch error.
- Prefer a synchronous deadline read when possible instead of spawning a new daemon thread per stream.
- If keeping the helper thread short term, make it impossible to buffer unbounded skipped lines.

**Additional fix on 2026-07-03:** `prefetch_initial_stream_lines` called
`_get_prefetch_pool()` (incrementing `_PREFETCH_POOL_USAGE_COUNT`) but never called
`_release_prefetch_pool()` to decrement it. The counter only increased, so the thread
pool was never recycled. Added `_release_prefetch_pool()` call in a `finally` block.

### Acceptance Tests

- Upstream with infinite comments or empty lines times out and closes without returning initial lines.
- Upstream with more than the configured skipped-line limit fails before client headers are sent.
- Native Anthropic/Responses streams with normal `event:` prelude still preserve initial lines.
- No raw provider key is written to diagnostic output.

## P0. Client Disconnect Classification

### Current Behavior

The main handlers already catch `BrokenPipeError`, `ConnectionResetError`, and `ConnectionAbortedError` after `response_started=True`, record status `499`, and do not call `ROUTER.report_failure()`.

So the external claim that normal `BrokenPipeError` cools a healthy provider is not accurate for current code.

### Remaining Risk

On Windows and some socket wrappers, a client disconnect can surface as generic `OSError` with `errno` or `winerror` values instead of one of the explicit exception classes. Those can fall into the generic stream error branch and become a `502` request record.

### Fix Direction

- Add helper such as `is_client_disconnect_error(exc)`.
- Treat these as client disconnects:
  - `BrokenPipeError`
  - `ConnectionResetError`
  - `ConnectionAbortedError`
  - `OSError` with common disconnect codes such as `errno.EPIPE`, `errno.ECONNRESET`, Windows `10053`, `10054`, `10058`.
- Record request end as `499`.
- Do not report provider/key failure.
- Do not attempt transparent retry after response bytes are sent.

### Acceptance Tests

- Simulated `BrokenPipeError` after stream headers records `499`.
- Simulated Windows-style `OSError(winerror=10054)` after stream headers records `499`.
- Provider/key cooldown counters do not change for client disconnects.

## P1. Async SQLite History Writes

### Current Behavior

`ProxyObservability.record_request_end()` updates in-memory counters and then calls `RequestHistoryStore.record_request()` synchronously. SQLite uses WAL and `synchronous=NORMAL`, but each request thread can still block on SQLite I/O and lock contention.

### Risk

Under high throughput, request latency can include history-write latency. A slow disk or locked SQLite writer should not slow provider response delivery.

### Fix Direction

- Add a single background writer thread for history records.
- Use a bounded queue, for example `history.queue_size`, default `1000`.
- On queue full, prefer dropping history records over blocking request threads. Keep in-memory counters intact.
- Keep `clear_history()` coordinated with the writer:
  - stop or drain pending writes before clearing;
  - clear SQLite;
  - clear in-memory recent/counters.
- Add explicit shutdown/drain helper for tests.

### Acceptance Tests

- `record_request_end()` returns even when the store writer is artificially slow.
- Queue full drops history records and increments a dropped-history counter.
- `/-/admin/requests/clear` leaves SQLite and in-memory request lists empty.
- Existing dashboard request list behavior remains unchanged.

## P1. Centralize Upstream Socket Timeout Handling

### Current Behavior

`upstream_client.py` and `stream_adapters.py` reach into `resp.fp.raw._sock` to reset read timeout after the first stream event.

### Risk

`resp.fp.raw._sock` is private implementation detail. It may not exist for every Python version, proxy wrapper, or TLS stack. The current try/except prevents crashes but can silently disable intended timeout behavior.

The multi-thread race concern is overstated because one upstream response is normally consumed by one request thread, but the private socket dependency is still fragile.

### Fix Direction

- Add one helper in `upstream_client.py`, for example `set_response_read_timeout(resp, timeout_s) -> bool`.
- Use it from all stream adapters.
- If it fails, write a safe diagnostic or debug log without raw keys.
- Keep current urllib transport for now.
- Evaluate `httpx` or another connection-pooling transport later as a separate migration.

### Acceptance Tests

- Helper returns `False` safely for response-like objects without `fp.raw._sock`.
- Existing stream tests pass.
- A fake response with a socket receives the expected timeout.

## P1. Responses SSE Strict-Client Compatibility

### Current Behavior

Chat/Anthropic streams converted to Responses emit core events such as:

- `response.created`
- `response.output_item.added`
- `response.content_part.added`
- `response.output_text.delta`
- `response.output_text.done`
- `response.output_item.done`
- `response.completed`

The `response.created` event currently has `output: []`.

### Clarification

`response.created` with an empty `output` is not itself a bug. OpenAI Responses streaming can start with an empty output array, and clients are expected to build state from subsequent events.

### Real Compatibility Gaps

Some strict clients may expect more complete Responses event shape:

- Stable `sequence_number` on stream events.
- More complete `response.failed` payloads.
- More complete `response.in_progress` / completion snapshots.
- Better representation of reasoning events instead of only putting reasoning into final `response.completed.output`.

### Fix Direction

- Introduce a small Responses SSE event builder that:
  - increments `sequence_number`;
  - keeps consistent `response_id`, item IDs, output indices, and status;
  - emits complete enough failure/completion payloads.
- Add tests that parse event order and verify monotonic sequence numbers.
- Do not force `response.created.output` to include not-yet-created output items.

### Acceptance Tests

- Converted Chat -> Responses stream has monotonic `sequence_number`.
- Converted Anthropic -> Responses stream has monotonic `sequence_number`.
- Failure event includes a usable response object with `status: failed` and an error field.
- Existing clients still receive text/tool deltas in the same order.

## P1. Responses Reasoning Visibility For Converted Streams

Status: completed on 2026-06-11 for the common converted stream paths. Chat -> Responses and Anthropic -> Responses now emit `response.reasoning_summary_text.delta` and `response.reasoning_summary_text.done` while preserving the final completed `reasoning` output item.

Related compatibility fix: completed on 2026-06-11 for DeepSeek Anthropic upstream continuity. When a request is converted to `anthropic_messages` for the built-in `deepseek` provider, or any provider with `force_anthropic_thinking=true`, assistant history entries that have visible content but no `thinking` block receive a minimal placeholder thinking block. This prevents avoidable `content[].thinking must be passed back` / `thinking_content_required` failures before provider fallback.

Related compatibility fix: completed on 2026-06-11 for DeepSeek Chat/OpenAI-compatible upstream continuity. When a request is converted to `chat_completions` for the built-in `deepseek` provider, the built-in `opencode` provider, or any provider with `force_reasoning_content=true`, assistant history entries that have visible content but no `reasoning_content` receive a minimal placeholder `reasoning_content: "."`. This is intentionally provider/capability scoped, not a global rule for every OpenAI-compatible upstream.

### Current Behavior

When a client calls `/openai/v1/responses` and the chosen upstream is Chat Completions or Anthropic Messages, the proxy can capture upstream reasoning:

- Chat Completions `reasoning_content`, `reasoning`, or `thinking` deltas.
- Anthropic Messages `thinking_delta` blocks.

Before this fix, converted Responses SSE exposed reasoning mainly by adding a `reasoning` output item and putting the accumulated text into the final `response.output_item.done` / `response.completed` payload. Many clients render live reasoning only from dedicated Responses reasoning events such as `response.reasoning_summary_text.delta` / `.done` or raw reasoning text delta events. As a result, clients could show the visible answer normally but omit the thinking/reasoning panel.

### Risk

The proxy appears to “lose thinking” even when the upstream provided it. This reduces debuggability for agent clients and makes converted Responses behavior look weaker than native provider behavior.

### Fix Direction

- For Chat -> Responses SSE:
  - when `reasoning_content` / `reasoning` / `thinking` deltas arrive, emit Responses-compatible reasoning delta events in addition to the final `reasoning` output item.
- For Anthropic -> Responses SSE:
  - when `thinking_delta` arrives, emit the same Responses-compatible reasoning delta events.
- Emit matching done events before the reasoning output item is completed.
- Keep the final `output` reasoning item for non-stream consumers and history.
- Avoid exposing raw chain-of-thought beyond what the upstream already returns through its public thinking/reasoning channel; treat this as provider-output passthrough/summary compatibility, not a new model-internal CoT feature.

### Acceptance Tests

- Chat -> Responses stream with `reasoning_content` emits `response.reasoning_summary_text.delta`, `response.reasoning_summary_text.done`, and a completed reasoning item.
- Anthropic -> Responses stream with `thinking_delta` emits `response.reasoning_summary_text.delta`, `response.reasoning_summary_text.done`, and a completed reasoning item.
- The visible text stream remains unchanged.
- Non-streaming Chat/Anthropic -> Responses responses still include `output` reasoning items when upstream includes reasoning.

## P1. Anthropic Block Ordering Hardening

### Current Behavior

When converting Chat Completions SSE to Anthropic Messages SSE, the adapter assumes the common generation order:

```text
thinking -> text -> tool_use
```

This matches most provider behavior, but the state machine is less robust if upstream sends reasoning after text has already started, or interleaves reasoning and tool calls in unusual order.

### Clarification

`content_block_start` with `{"type": "thinking", "thinking": "", "signature": ""}` is not automatically invalid. Anthropic streaming examples use empty `thinking` at block start and then append `thinking_delta`.

The bigger risk is ordering and signature fidelity:

- Anthropic-native thinking often includes `signature_delta`.
- Reasoning synthesized from Chat/Responses does not have a real Anthropic signature.
- Strict Anthropic clients may care about block order and thinking continuity.

### Fix Direction

- Make non-native reasoning-to-Anthropic behavior configurable:
  - `thinking_mode: "thinking"` for current behavior.
  - `thinking_mode: "text"` to expose reasoning as ordinary text or tagged text for strict clients.
  - possibly `thinking_mode: "drop"` for clients that cannot handle thinking blocks.
- Harden state transitions:
  - never reopen a thinking block after text/tool has started unless explicitly allowed;
  - if late reasoning appears, route it according to config rather than creating invalid block order;
  - ensure content block indices are monotonic and never reused.

### Acceptance Tests

- Chat SSE with reasoning then text still emits Anthropic thinking then text.
- Chat SSE with text then late reasoning does not reuse a block index.
- Configured `thinking_mode="text"` emits valid text-only Anthropic blocks.
- Tool-use deltas remain valid after text/reasoning handling.

## P2. Stream Buffer Limits

### Current Behavior

Stream adapters keep accumulated `content_buf`, `reasoning_buf`, and tool argument buffers so they can emit final completed objects and usage-friendly summaries.

### Risk

Long generations and many concurrent streams can accumulate significant memory. Tool arguments generally need full accumulation to produce valid final tool calls, but assistant text and reasoning buffers are mostly for final summaries and observability.

### Fix Direction

- Add configurable text/reasoning buffer limits:
  - `stream_max_text_buffer_bytes`
  - `stream_max_reasoning_buffer_bytes`
- Continue forwarding all stream deltas to the client.
- When final summary buffers exceed the limit, truncate final retained buffers and mark them as truncated.
- Do not truncate tool argument buffers unless a separate safety limit is exceeded, because invalid tool JSON can break clients.

### Acceptance Tests

- Long text stream forwards all deltas but returns a truncated final summary object.
- Truncation metadata is present.
- Tool call arguments still complete correctly below the tool buffer limit.

## P2. Configurable SSE Flush Policy

### Current Behavior

Most converted SSE paths call `wfile.flush()` after each meaningful delta.

### Tradeoff

This favors low latency and interactive feel. It is not inherently wrong.

Under high concurrency, per-delta flush increases system calls and CPU overhead. A micro-batching option can improve throughput while slightly increasing token latency.

### Fix Direction

- Keep current immediate flush as default.
- Add optional config:
  - `stream_flush_interval_ms`, default `0`.
  - `stream_flush_bytes`, default `0`.
- Implement through a small writer wrapper rather than changing every adapter manually.

### Acceptance Tests

- Default behavior flushes per delta as today.
- Batched mode flushes on interval or byte threshold.
- Final event always flushes.
- Tests use fake writer to count flush calls.

## P2. HTTP Connection Pooling Transport

### Current Behavior

The proxy uses standard-library `urllib.request`.

### Risk

`urllib` is simple and dependency-free, but it does not provide robust connection pooling for high-concurrency upstream usage. Repeated TLS handshakes and many `TIME_WAIT` sockets can become a bottleneck.

### Fix Direction

Do not mix this with small bug fixes. Treat it as a transport migration:

- Evaluate `httpx` sync client first.
- Preserve per-attempt proxy selection:
  - key proxy > provider proxy > global proxy > direct.
- Preserve streaming semantics.
- Preserve timeout semantics:
  - connect timeout;
  - first stream event timeout;
  - read timeout;
  - total remaining request budget.
- Preserve current HTTP error classification.

### Acceptance Tests

- Same unit suite passes with both transports if a feature flag is added.
- Real upstream smoke passes for native and converted non-streaming paths.
- Real stream smoke passes for all three client formats.
- Proxy behavior remains safe when proxy URL is unset or set per key.

## P1. Harden Admin Authentication

Status: completed on 2026-06-11. `_admin_authorized` now uses
`hmac.compare_digest` for constant-time comparison, and `?admin_key=` query-string
auth is gated behind `server.allow_query_admin_key` (default `false`). The dashboard is
unaffected because it always sends the `X-Admin-Key` header. Tests:
`test_admin_query_auth_key_is_not_returned_as_filter` (opt-in path) and new
`test_admin_query_auth_disabled_by_default`.

### Current Behavior

`_admin_authorized()` in `sse2json.py:911-927` resolves the expected admin key from
`server.admin_key`, then compares the supplied value with `str(supplied) == expected`.
The supplied value can come from the `X-Admin-Key` header, an `Authorization: Bearer`
header, or the `admin_key` URL query parameter (`sse2json.py:920-924`).

### Risk

- `==` on secrets is not constant-time. It is a weak timing side channel. In a
  high-noise HTTP context the practical exploitability is low, but `hmac.compare_digest`
  is the correct primitive and costs nothing.
- Accepting the admin key via `?admin_key=` means the secret can land in reverse-proxy
  access logs, gateway logs, and browser history. The audit store already strips the
  query string from the recorded `path` (`audit_store.py:55`), which confirms the query
  string is considered sensitive, yet query-string auth still feeds it in elsewhere.
- The dashboard intentionally supports `?admin_key=` for local testing
  (`PROJECT_OVERVIEW.md:100`), so removal must stay behind a config switch rather than a
  hard break.

### Fix Direction

- Compare with `hmac.compare_digest(str(supplied), expected)`.
- Gate `?admin_key=` query auth behind an explicit opt-in such as
  `server.allow_query_admin_key` (default `false`), keeping header auth as the norm.
- Do not log the supplied admin key on failure.

### Acceptance Tests

- A correct key in `X-Admin-Key` and in `Authorization: Bearer` both authorize.
- Query-string auth is rejected when the opt-in flag is off and accepted when on.
- Auth comparison uses a constant-time primitive (assert via patching/spy).

## P1. Bound Client Request Body Size

Status: completed on 2026-06-11. Added `_max_request_body_bytes()`
(`server.max_request_body_bytes`, default 32 MiB, 0 disables) and a shared
`_read_body_bounded()` handler method. All three body-read paths (`_read_json_body`,
`count_tokens`, main POST) now parse `Content-Length` defensively (400 on malformed) and
reject oversize bodies with 413 before reading. Tests: `test_oversize_body_rejected_with_413`,
`test_body_within_limit_passes`.

### Current Behavior

Request handlers read the client body using the client-declared `Content-Length` with
no upper bound, for example `length = int(...); self.rfile.read(length)`
(`sse2json.py:1396-1401`) and the JSON body reader (`sse2json.py:1915-1935`). Some of
these `int(Content-Length)` parses also sit outside a `try`, so a malformed header
raises before the main handler `try` and drops the connection abnormally.

### Risk

A single request that declares a very large `Content-Length` forces a large in-memory
read. Under the multi-threaded server this multiplies across concurrent connections and
can exhaust memory. Malformed length headers can also produce inconsistent error paths.

### Fix Direction

- Add a configurable maximum request body size, for example
  `server.max_request_body_bytes`, with a sane default.
- Reject oversize declared lengths with HTTP `413` before reading.
- Parse `Content-Length` defensively in every entry path and return `400` on malformed
  values instead of letting the exception escape the handler.

### Acceptance Tests

- A request declaring a body over the limit gets `413` and is not buffered.
- A malformed `Content-Length` gets a clean `400`, not a dropped connection.
- Normal-size requests are unaffected.

## P1. Close Upstream Responses On Every Path

Status: completed on 2026-06-11.
- Non-stream reads (`request_json`, `request_json_with_timing`, `fetch_models` in
  `upstream_client.py`) now use `contextlib.closing` so the socket is released even if
  `json.loads` raises.
- All three streaming handlers in `sse2json.py` initialize `upstream_conn = None` and
  added a `finally: _close_upstream_conn(upstream_conn)` to the per-attempt try, so a
  stream attempt that fails or `continue`s before client headers closes the upstream
  before retrying. `_close_upstream_conn` is a best-effort helper safe on `None`.
- Fixed a related pre-existing leak: `_http_error_details` read the `HTTPError` body but
  never closed it, leaving an open socket until GC. It now closes the error object after
  reading. Verified with `python -W error::ResourceWarning -m unittest discover -s tests`
  (the HTTPError ResourceWarning is gone; remaining sqlite warnings are the separate P1
  async-writer item).

### Current Behavior

The non-stream client opens an upstream response and reads it without an explicit close:
`resp = opener.open(...); raw = resp.read(); return json.loads(raw)`
(`upstream_client.py:61-63` and `78-81`). For streams, the handlers open
`upstream_conn` (e.g. `sse2json.py:1517/1736/2047`) but do not wrap the prefetch/relay
work in `try/finally` to guarantee close when an attempt errors or `continue`s to the
next candidate.

### Risk

`urllib` responses hold a socket. Without explicit close on the error/early-return path,
sockets are released only when the garbage collector runs. Under load and during
provider failover (where attempts are abandoned mid-flight), this leaks connections and
file descriptors, compounding the lack of connection pooling already tracked as a P2
transport item.

### Fix Direction

- Close non-stream responses in a `finally` (or `with closing(...)`).
- Wrap stream prefetch and relay so `upstream_conn` is closed on any exception or when
  moving to the next attempt before bytes are sent to the client.
- Coordinate with the P1 socket-timeout helper so a hung upstream is both timed out and
  closed.

### Acceptance Tests

- A non-stream request that raises during `json.loads` still closes the upstream socket.
- A stream attempt that fails before client headers closes the upstream before retrying.
- No file-descriptor growth across repeated failing attempts in a stress test.

## P1. Atomic Runtime Config Hot-Swap

**Status: completed on 2026-07-03.** The `RuntimeContext` bundle (`sse2json.py`)
was introduced earlier to swap all five globals (`CONFIG`, `ROUTER`, `UPSTREAM_CLIENT`,
`OBSERVABILITY`, `AUDIT`) as one atomic reference. However, module-level helper
functions (`_record_failed_attempt`, `_record_upstream_http_failure`,
`_record_transport_failure`, `_record_proxy_exception`, `_record_stream_interrupted`,
`_record_empty_visible_output_failure`, `_request_json_once_with_timing`,
`_request_raw_once_with_timing`, `_open_stream_with_compat_retry`) were still reading
the module globals directly instead of the request's captured snapshot. During a
hot-reload, these helpers could use a **new** router/observability instance while the
request's attempt was created by the **old** router, causing `report_failure` to
update the wrong `_keys_state` and `record_attempt` to write to the wrong
observability instance.

**Fix:** Added thread-local runtime storage (`_request_rt` / `_set_request_rt` /
`_current_rt`). The three request handlers (`_proxy_openai_chat_completions`,
`_proxy_responses`, `_proxy_anthropic_messages`) now call `_set_request_rt(rt)` at
entry. All helper functions use `_current_rt()` instead of globals, falling back to
`_request_runtime()` when no thread-local is set (admin/background paths).

Additionally fixed:
- `_chat_upstream_requires_reasoning_content` and `_anthropic_upstream_requires_thinking`
  now use `_current_rt().config` instead of global `CONFIG`.
- `resolve_model` now reads `client_model_map` / `disable_client_model_map` directly
  from the provided config when available, falling back to global `MODEL_MAP` /
  `DISABLE_MAP` for test compatibility.
- `_stream_flush_policy`, `_classify_http_error`, `_is_retryable_http`,
  `_same_key_retries_for_transient_errors`, `_is_same_key_retryable_http`, and
  `_stream_prefetch_bounds` now use `_current_rt().config`.

Tests: 459 passed.

## P2. Cache Proxy Openers

Status: completed on 2026-06-11. `_opener_for` now caches openers in a
thread-safe dict keyed by normalized `proxy_url` (double-checked locking). Direct
requests still reuse the single empty-`ProxyHandler` default opener, so environment
proxy variables are never consulted. Tests: `tests/test_upstream_client.py`.

### Current Behavior

`OpenAIUpstreamClient` caches only the direct-connection opener in `__init__`
(`upstream_client.py:26`). `_opener_for(proxy_url)` rebuilds a fresh
`build_opener(ProxyHandler(...))` on every call when a proxy URL is present
(`upstream_client.py:33-34`).

### Risk

Every request routed through a proxy reconstructs its opener. This is wasted allocation
on the hot path and works against any future connection reuse, since a freshly built
opener cannot retain pooled connections.

### Fix Direction

- Cache openers keyed by normalized `proxy_url`.
- Keep the empty-`ProxyHandler` direct opener as the default (it already correctly
  prevents accidental use of system `HTTP_PROXY` env vars).
- Revisit together with the P2 connection-pooling transport migration.

### Acceptance Tests

- Two requests with the same proxy URL reuse one opener instance.
- Direct requests still never consult environment proxy variables.

## P2. Serialize runtime_config.json Writes

### Current Behavior

`_commit_overlay` (`config_manager.py:690-695`) performs a read-modify-write of the
in-memory overlay and then persists it. The persistence uses a temp file plus
`os.replace`, which makes a single write atomic, but the read-modify-write itself is not
guarded against concurrent admin requests.

### Risk

Two concurrent admin mutations can each start from the same prior overlay, and the
second write overwrites the first, silently losing an update. The single-write atomicity
of `os.replace` does not prevent this lost-update class.

### Fix Direction

- Serialize overlay commits with a process-level lock around the full
  read-modify-write-persist sequence.
- Keep the temp-file + `os.replace` pattern for crash safety.

### Acceptance Tests

- Two concurrent overlay mutations both survive (no lost update).
- A crash mid-write never leaves a half-written `runtime_config.json`.

## P2. Tolerant SSE Field Parsing

**Status: completed on 2026-06-11.** Added module-level helpers `sse_data_payload`,
`sse_event_name`, `is_sse_done` in `stream_adapters.py` (tolerant of `data:` with no
space and of trailing whitespace, per the SSE spec). Replaced all 8 brittle
`startswith("data: ")` / `line[6:]` / `== "data: [DONE]"` call sites
(`_usage_from_sse_line`, the prefetch reader, the two chat passthroughs, and the four
`event:`/`data:` conversion loops) to route through the helpers, preserving each call
site's control flow. New tests cover the helpers and a no-space `data:` usage relay;
`tests.test_stream_adapters` passes (20 tests).

### Current Behavior

Stream adapters detect data lines with `startswith("data: ")` (with a trailing space)
and slice with a hard-coded `line[6:]` across multiple paths in `stream_adapters.py`.
`[DONE]` is matched as the exact string `"data: [DONE]"`.

### Risk

The SSE spec allows `data:{...}` with no space, and permits trailing whitespace. Lines
in those shapes are silently dropped, which means lost tokens or a missed terminator for
strict or unusual upstreams.

### Fix Direction

- Parse SSE field by name: split on the first `:`, then strip a single optional leading
  space from the value, per the SSE spec.
- Match `[DONE]` after trimming, tolerating the no-space and trailing-whitespace variants.
- Keep same-format pass-through untouched where it already byte-copies upstream lines.

### Acceptance Tests

- `data:{...}` (no space) is parsed identically to `data: {...}`.
- `data: [DONE]\r` and `data:[DONE]` both terminate the stream.
- Existing well-formed streams are unchanged.

## P2. Default Bind Address

**Status: completed on 2026-06-11.** Added a configurable `server.host` (read at startup
into `HOST` in `sse2json.py`, default `0.0.0.0` to preserve existing LAN/container
deployments). The bind tuple now uses `(HOST, PORT)`, startup logs print the effective
bind host, and a clear `[proxy][WARN]` is emitted when bound to all interfaces
(`0.0.0.0`/`::`) noting the Admin API is network-reachable and protected only by the
admin key, with the hint to set `server.host` to `127.0.0.1`.

### Current Behavior

The server binds `("0.0.0.0", PORT)` (`sse2json.py:2284`), exposing both the proxy and
the Admin API on all interfaces, protected only by the admin key.

### Risk

On shared or multi-homed hosts this exposes the admin surface more broadly than many
local deployments expect. It is reasonable for container/LAN use but should be a
conscious choice.

### Fix Direction

- Make the bind host configurable (for example `server.host`).
- Default to `127.0.0.1`, or keep `0.0.0.0` but print a clear startup warning that the
  admin API is reachable from the network and depends solely on the admin key.

### Acceptance Tests

- Default bind host is configurable and documented.
- Startup logs clearly state the effective bind host and admin exposure.

## P2. Diagnostic Log Disk I/O Outside The Lock

### Current Behavior

Diagnostic logging holds `DIAGNOSTIC_LOG_LOCK` across `makedirs` + `open` + `write`
(`sse2json.py:389-391`).

### Risk

During a failure storm, every worker thread serializes on this lock while doing disk
I/O, so a slow disk turns logging into a global bottleneck exactly when many requests
are failing.

### Fix Direction

- Format the line outside the lock and keep only the append inside it, or
- Hand records to a bounded background log queue, mirroring the P1 async SQLite writer
  approach.

### Acceptance Tests

- Concurrent diagnostic writes do not serialize on disk I/O under a slow-disk simulation.
- Log ordering remains acceptable for debugging.

## P2. Preserve Partial Usage On Interrupted Streams

### Current Behavior

On stream error paths the adapter can emit hard-coded `output_tokens: 0`
(`stream_adapters.py:357`), and usage is sometimes overwritten rather than merged when a
stream is cut short.

### Risk

A stream that produced tokens but was then interrupted reports zero output usage, which
undercounts accounting and history for partially delivered responses.

### Fix Direction

- Track running output token counts as deltas arrive and report the accumulated value on
  interruption instead of zero.
- Merge late usage frames into the running total rather than overwriting.

### Acceptance Tests

- An interrupted stream reports the tokens already produced, not zero.
- A normal completion still reports the upstream-provided final usage.

## Suggestions Not To Implement As Stated

### Do Not Replace SSE JSON Parsing With Regex

The review suggested using regex instead of `json.loads` for performance. Do not do this for cross-format conversion.

Reasons:

- Tool call arguments are escaped JSON fragments inside JSON strings.
- Unicode and escaped characters make regex extraction unsafe.
- Responses and Anthropic streams need event type, item IDs, output indices, usage, tool metadata, and error fields.
- Regex parsing would create subtle correctness bugs in exactly the agent/tool scenarios this proxy needs to support.

Acceptable alternatives:

- Same-format pass-through can avoid full conversion parsing where usage extraction is not required.
- Consider faster JSON libraries only if adding dependencies is acceptable.
- Reduce parsing only on measured hot paths.

### Do Not Treat `response.created.output=[]` As A Protocol Bug

Empty `output` on `response.created` is acceptable for Responses streaming. The output is built by later events. Improve event completeness instead of forcing speculative output items into `response.created`.

### Do Not Assume Normal Broken Pipe Currently Cools Providers

Current handlers already record common post-header client disconnects as `499` and do not report provider failure. The remaining work is to catch generic `OSError` disconnect variants.

### Do Not "Fix" Plaintext Keys In The Audit Log

A review flagged that `_audit_admin_event` writes raw keys / full provider configs to
the audit store (`sse2json.py:1144/1165/1345/1357`). This was **verified false**. The
audit store sanitizes before persisting: `AdminAuditStore.record` calls `_sanitize`
(`audit_store.py:56`), which masks any field named `key`/`keys`/`api_key`/`authorization`
/`admin_key`/`x-admin-key`/`bearer` and any string with an `sk-` or `bearer ` prefix
(`audit_store.py:15-24, 152-183`). The recorded `path` also has its query string stripped
(`audit_store.py:55`). Do not add a second masking layer in the handlers; if anything,
extend `SENSITIVE_FIELD_NAMES` (it omits `x-api-key`) rather than reworking the call sites.

### Do Not "Fix" Admin Responses Returning Raw Config

A review flagged that `config_manager.py` change methods (`clear_overlay:81`,
`reload:336`, `_commit_overlay:695`, and the add/update/delete helpers) return the raw
`self.config` including real keys, implying the Admin API leaks them. This was
**verified false at the HTTP boundary**. Every Admin response serializes
`CONFIG_MANAGER.snapshot()` / `_config_view`, which is the masked view
(`sse2json.py:979, 1060, 1082, 1115, 1127, 1145, 1166, 1189`). The raw dicts returned by
those methods are consumed internally, not sent to clients. Keep the masked-view
discipline at the HTTP layer; do not assume the internal return values are the response
shape. (Tightening the internal methods to return views anyway is acceptable defense in
depth, but it is not a leak fix and is not urgent.)

## Implementation Order

Recommended order:

1. P0 stream prefetch bounds.
2. P0 broader client disconnect detection.
3. P1 socket timeout helper.
4. P1 Anthropic block ordering hardening.
5. P1 Responses SSE event builder / sequence numbers.
6. P1 async SQLite writer.
7. P2 buffer limits and flush policy.
8. P2 optional HTTP transport migration.

This order keeps high-risk stream correctness fixes before larger performance refactors.

### Second-Pass Items Order

Fold the 2026-06-11 second-pass items in like this:

1. Admin auth hardening (constant-time compare, gate query-string auth) — cheap, do early.
2. Bound client request body size — cheap memory-safety win.
3. Close upstream responses on every path — pair with item 3 above (socket timeout helper).
4. Atomic runtime config hot-swap — do alongside the config work.
5. Remaining P2s (proxy opener cache, overlay write lock, tolerant SSE parsing, bind
   address, diagnostic-log I/O, partial-usage accounting) as capacity allows; the proxy
   opener cache should ride along with the P2 transport migration.

## Required Verification

Run after each item:

```powershell
python -m py_compile sse2json.py stream_adapters.py upstream_client.py observability.py history_store.py
python -m unittest discover -s tests
node --check dashboard\app.js
```

Run after stream adapter changes:

```powershell
python tools\real_stream_tool_smoke.py --run --base-url http://127.0.0.1:4894 --output tmp\real_stream_tool_smoke.json
```

Real upstream tests consume provider quota. Keep them for the end of a completed stream-related slice, not every small edit.

## Dashboard And API Notes

The dashboard should expose these future knobs only after backend behavior exists:

- Stream prefetch max lines/bytes.
- Stream flush interval/byte threshold.
- Stream buffer limits.
- History queue size and dropped-history counter.
- Transport type if a second transport is added.

Request detail should continue to show:

- provider/key/format attempt chain;
- masked key and key ID only;
- diagnostic stage;
- upstream error summary/type/code/param;
- final routing summary.

No new optimization should record full request bodies, full response bodies, or raw provider/admin keys by default.
