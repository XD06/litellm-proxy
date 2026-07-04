# Web Console UI Plan

## Implementation Status

Baseline MVP is implemented:

- `GET /-/dashboard` serves the static console shell.
- `dashboard/app.js` loads Admin API data dynamically with auto refresh and pause.
- Overview, Requests, Providers, Routing Policy, and Config views are wired.
- Traffic uses native SVG; failure breakdowns use CSS bars.
- Provider/key runtime controls call existing Admin mutation endpoints.
- Request rows open a detail drawer backed by `GET /-/admin/requests/{request_id}`.
- The shell can load without secrets; runtime data and mutations still require admin key on `/-/admin/*`.
- Config view now connects to existing config mutation endpoints for global proxy, provider base URL/proxy/enabled edits, adding provider keys with optional key-level proxy, key proxy updates, and per-format enabled/path settings. Edits write the runtime overlay through the backend; raw keys are never rendered back into the DOM.

UI/UX refinement pass is implemented:

- Modernized the operations-console surface with a stronger warm operations-console hierarchy, clear active navigation, higher-contrast panels, and deliberate metric cards.
- Traffic visualization now uses native SVG request bars plus a first-byte latency trend line in milliseconds. Total request duration remains available in Requests detail instead of driving the Overview latency chart.
- Usage visualization now shows lifetime token/cost metrics plus provider/model token bars from Admin API usage fields. Cost remains `$0` unless provider pricing is configured.
- Failure breakdown bars animate and inherit semantic colors from their message type.
- Request, policy, failure, provider, and format fields now use semantic chips and keyword highlighting.
- Keyword color mapping is data-driven: auth/key failures, rate limits/quota/cooldown, server errors/timeouts, network errors, provider compatibility/tool-choice/reasoning cutoff, success, and neutral format/status terms each get distinct visual treatment.
- Request attempt detail now displays a masked key in the Key ID row when `key_masked` is available, falling back to short `key_id`; it never displays the full upstream key.
- Requests now show route explainability from the Admin API: list rows include a compact route outcome summary, the detail drawer starts with a Routing Summary card, and each attempt explains selection, result, and why the proxy switched or stopped.
- Providers are rendered as provider cards with grouped runtime state, format routes, key cards, local runtime controls, and inline config editors for base URL, provider proxy, key proxy, enabled state, keys, and format paths. Auto refresh preserves open provider edit drawers and avoids rerendering a focused provider edit form.
- Routing Policy is rendered as rule/action cards instead of raw tables; nested policy decisions are normalized before display.

Minimalist/mobile refinement pass is implemented:

- Theme was revised toward a warm monochrome, flat operations-console style: off-white canvas, white surfaces, charcoal primary actions, readable borders, restrained shadows, and clear semantic states.
- Large gradients, dark code blocks, blue SaaS-style primary surfaces, and SVG glow/drop-shadow effects were removed.
- On mobile, global runtime controls and Requests filters collapse into a right-side `More settings` drawer instead of stacking all controls in the page.
- Mobile navigation folds into the right-side `More settings` drawer; the one-column shell now uses top-aligned grid rows so `<aside class="sidebar">` does not stretch into a large blank block on sparse views.
- Mobile density was tightened for brand, topbar, metrics, panel heads, charts, bars, tables, and the settings drawer while keeping desktop layout unchanged.
- Config provider editors are rendered as compact cards with masked key chips, proxy/base URL fields, add-key controls, global/provider/key proxy controls, and format rows for `chat_completions`, `responses`, and `anthropic_messages`.
- Config view is now a configuration workbench: summary metrics, add-provider form, provider summary cards that link to Providers for editing, and a collapsed masked raw JSON snapshot for debugging.

Validated through 2026-06-10:

- `python -m unittest discover -s tests` passed with 137 tests.
- `node --check dashboard/app.js` passed.
- Headless browser smoke passed at 1440x900 and 390x844: chart SVG rendered, all views switched, no console errors, no horizontal overflow.
- UI refinement smoke used a local fake provider at `127.0.0.1:9` to generate one non-real `network_error` request; no upstream supplier was called. Browser checks confirmed animated chart elements, colored chips, highlighted keywords, and no horizontal overflow at 1440x900 and 390x844.
- Mobile settings smoke passed at 390x844: Overview, Requests, Providers, Routing Policy, and Config switched without horizontal overflow; sidebar height stayed at its real compact height; `More settings` opened the runtime controls drawer; Requests showed filter controls inside the drawer.
- Config editor front/back smoke passed on a temporary local proxy instance: dashboard submitted `PATCH /-/admin/providers/{provider}`, `POST /-/admin/providers/{provider}/keys`, and `PATCH /-/admin/providers/{provider}/formats/{format}`; backend runtime overlay reflected proxy, key count, and format changes; raw test keys did not appear in the config API response or dashboard body.
- Mocked Admin API browser smoke passed at 390x844 for the same config edit flows without touching the real `config.json` or real supplier keys.
- Real-config read-only dashboard smoke passed on a temporary port with the real `config.json`: Admin metrics/status/routing/config/requests loaded, 3 providers and 3 config cards rendered, desktop/mobile had no horizontal overflow, and no raw-key pattern was present in the page/config response.
- Real-config traffic smoke passed with three controlled generation requests: `/v1/chat/completions` using `deepseek-v4-flash`, `/openai/v1/responses` using `gpt-5.5`, and `/anthropic/v1/messages` using `deepseek-v4-flash`. Dashboard metrics showed 3 successful requests, 4 attempts, 1 transparent failed attempt from `opencode` due to `empty_visible_output`, then successful fallback to `deepseek`. Anthropic response structure included a `thinking` block followed by a visible `text` block.
- Follow-up dashboard regression pass updated the traffic chart to line-only SVG series, persisted the active view through page reload via localStorage, preserved provider edit drawer open state across auto refresh, and changed Requests detail Key ID rendering to prefer `key_masked`.
- Traffic chart now falls back to `recent samples mode` when the current bucket window is empty but recent request records exist, so sparse historical samples still render as connected first-byte/request data instead of appearing like an empty chart.
- SQLite request history pass added persisted request/detail/timeseries data behind the existing Admin APIs; the dashboard labels chart/request data as `sqlite history` or `memory`.
- Routing explainability pass added derived `routing_summary` and per-attempt `routing_explanation` fields without SQLite schema changes. Browser validation at 1440x900 and 390x844 confirmed Requests Route summaries, Request Detail Routing Summary, per-attempt explanations, masked keys, and no horizontal overflow.
- Analytics/token/cost pass added Overview token/cost metric cards, provider/model Usage bars, Requests table Tokens/Cost columns, and Request Detail token/cost rows. Browser validation on 2026-06-10 at 1440x900 and 390x844 confirmed no horizontal overflow, no console errors, and no raw-key pattern in the DOM. A single bounded real Chat Completions request recorded `194` total tokens and rendered in Overview/Requests.
- Native streaming usage pass added best-effort usage parsing for native Chat Completions, Responses, and Anthropic SSE pass-through without changing streamed bytes. Unit coverage verifies raw SSE event preservation plus request/attempt/counter token totals for all three client formats.
- Login/navigation refinement moved admin-key entry out of the console topbar into a dedicated entry gate at `/` and `/-/dashboard`. `?admin_key=...` still enters directly. Refresh/Pause moved to the sidebar and folds into the mobile More settings drawer. Overview time-range controls now sit above the metric grid and drive the Admin timeseries bucket window for Traffic and Usage charts.
- Three-level proxy editing pass added global proxy fallback, provider proxy, and key-level proxy controls. Runtime request routing and `/v1/models` discovery both resolve proxy priority as `key.proxy > provider.proxy > global proxy > direct`; Admin API responses and dashboard DOM keep full keys masked.
- Verification on 2026-06-10: `python -m py_compile proxy_utils.py config_loader.py config_manager.py router.py model_registry.py audit_store.py sse2json.py upstream_client.py`, `node --check dashboard/app.js`, and `python -m unittest discover -s tests` passed with 183 tests.
- Traffic chart refinement keeps one shared time-axis chart while rendering successful/failed request volume and first-byte latency on separate scales. The current SVG uses soft request bars plus a first-byte area line, so future series can be added without crowding labels inside the graph.
- Overview metrics now use the selected time-range history for requests, success rate, attempt failure rate, tokens, and usage so top cards do not contradict the Traffic and Usage panels. Traffic chart labels are reduced to significant non-zero points, and the chart source badge avoids repeating the global time range.
- Overview color pass keeps the white/gray operations-console base while adding low-saturation semantic accents to metric cards, Traffic, Provider Health, Recent Failures, and Usage so the page has clearer contrast without becoming decorative.
- Requests view now uses a compact six-column summary table and server-side pagination at 10 records per page. The last column shows token total plus first-byte timing, while total duration stays in the request detail drawer. Full client/upstream/failure/cost/attempt details stay in the drawer opened from each row.
- Usage panel refinement removed the provider breakdown from Overview and now shows a compact Top models ranking ordered by call count. Each model uses one neutral calls bar, with token input/output kept as secondary text to avoid duplicated metrics and noisy colors. Overview token cards and Usage now share the same selected time-range usage total, and token counts compact to K/M units for larger values.
- Mobile navigation refinement moves the same `sectionNav` node into the More settings drawer at small widths and restores it to the sidebar on desktop, keeping one source of truth for active view state while removing the mobile horizontal tab rail from the main page.
- First-byte latency pass records `first_byte_ms` for streaming requests after the first valid upstream SSE event is prefetched and for non-streaming requests when upstream response headers return. SQLite history and in-memory buckets now aggregate both `first_byte_ms_*` and `duration_ms_*`; Overview uses first-byte latency, while Requests detail still keeps total duration. Provider key deletion now accepts sparse/display key indexes such as `/providers/modelscope/keys/2/delete`.
- Verification on 2026-06-11: `python -m py_compile observability.py history_store.py sse2json.py upstream_client.py config_manager.py proxy_utils.py router.py stream_adapters.py format_adapters.py protocol_adapters.py`, `node --check dashboard/app.js`, and `python -m unittest discover -s tests` passed with 213 tests.
- Fuzzy/partial search & bulk selection pass (2026-06-13):
  - Changed SQLite history queries and memory-based filtering to perform case-insensitive substring matching instead of exact matches on `model`, `provider`, `error_type`, `failure_reason`, and `http_status`.
  - Added a select-all-matching banner to the Requests table when the current filter's matching records count exceeds the page size and the user has selected all records on the current page.
  - Enabled one-click selection of all matching records across all pages, passing the active search filter parameters to the backend's `/delete-matching` API when deleting matching requests, keeping bulk actions robust and fast.
  - Added unit test case `test_fuzzy_filtering_on_requests` to `tests/test_history_store.py` and verified all tests pass.

## Design Read

This is an operations console for an API gateway, not a marketing page. The UI should feel modern, compact, reliable, and data-first. It should avoid decorative AI-style gradients, oversized hero sections, card-heavy landing-page composition, and ornamental copy.

## Visual Direction

- Theme: light-first warm monochrome interface with charcoal text/actions, off-white canvas, white surfaces, and muted pastel semantic status colors.
- Density: medium-high. Tables, filters, split panes, compact metrics, and mobile drawers are preferred over large empty cards.
- Shape: 8-12px radius for panels and controls, consistent across the app; small status chips can remain pill-shaped.
- Typography: system/native sans for UI, system monospace for IDs, providers, models, and status codes.
- Motion: subtle refresh/loading states, row selection, drawer transitions, and chart draw-in. No theatrical animation.
- Data visualization: simple inline charts and bars built with native SVG/CSS/JS so the project remains stdlib-only.

## MVP Navigation

### Overview

Purpose: answer "is the proxy healthy right now?"

Data:

- `GET /-/admin/metrics`
- `GET /-/admin/metrics/timeseries?bucket_s=60&buckets=30`
- `GET /-/admin/status`

UI:

- Request totals, success/failure rate, attempt failure rate.
- Token totals, input/output split, and optional estimated cost.
- Provider availability strip with key health counts.
- Time-series request volume, failure, and first-byte latency chart, with recent-sample fallback for sparse data outside the current bucket window.
- Compact Top models ranking with a single calls bar and secondary token input/output detail.
- First-byte latency trend and latest/average/max first-byte stats in milliseconds.
- Failure reason/error type distribution.
- Recent failed requests.

### Requests

Purpose: inspect individual calls and retry chains.

Data:

- `GET /-/admin/requests`
- `GET /-/admin/requests/{request_id}`

UI:

- Filter bar: status, provider, model, client format, upstream format, error type, failure reason, attempt HTTP status.
- Dense request table.
- Dense request table with Tokens and Cost columns.
- Detail drawer with attempts timeline, provider/model/format chain, masked key, short key id, usage, cost, error reason, status code, duration.

### Providers

Purpose: control runtime provider/key health.

Data:

- `GET /-/admin/status`
- `GET /-/admin/provider-activity`
- `GET /-/admin/provider-activity/{provider}`
- `POST /-/admin/providers/{provider}/enable`
- `POST /-/admin/providers/{provider}/disable`
- `POST /-/admin/providers/{provider}/cooldown/clear`
- `POST /-/admin/providers/{provider}/keys/{index}/enable`
- `POST /-/admin/providers/{provider}/keys/{index}/disable`
- `POST /-/admin/providers/{provider}/keys/{index}/state/clear`

UI:

- Provider cards default to a compact summary row: enabled/available state, runtime controls, keys, cooldown, fails, and enabled format count.
- Provider cards include a compact background health-probe summary. This shows the latest idle probe reason/model/action without putting internal probes into the Requests table.
- Per-provider detail drawers hold format routes, key cards, local key controls, background health-probe events, and inline config editing so dozens of providers can be scanned without page-length cards.
- Key cards include key hash, availability, cooldown, disabled time, fails, and local state controls when the provider detail drawer is opened.
- Runtime controls stay as compact action buttons.
- Model Capabilities panel with discovered model counts, a single merged model/mapping list, fetch status/errors, enabled formats, and a global refresh button.

### Routing Policy

Purpose: make retry/cooldown behavior explainable.

Data:

- `GET /-/admin/routing`
- `PATCH /-/admin/routing`
- `PATCH /-/admin/retry`
- `PATCH /-/admin/retry/failure-policies`

UI:

- Routing controls for provider pool, provider selection strategy, max attempts, and upstream timeout caps.
- Retry controls for retryable HTTP status classes, fatal key status classes, Retry-After handling, and base cooldown seconds.
- Failure policy forms for each `error_type`, covering cooldown scope, key cooldown, provider cooldown, and key disable behavior.
- Rule cards grouped by scenario.
- Failure policy cards by `error_type`.
- Cooldown scope, key disable behavior, provider cooldown seconds.

### Config

Purpose: provide safe entry points for common configuration edits.

Data:

- `GET /-/admin/config`
- `GET /-/admin/config/overlay`
- `GET /-/admin/audit`
- `POST /-/admin/providers`
- `PATCH /-/admin/providers/{provider}`
- `POST /-/admin/providers/{provider}/keys`
- `PATCH /-/admin/providers/{provider}/formats/{format}`
- `PATCH /-/admin/models/routes`
- `POST /-/admin/models/routes/delete`
- `POST /-/admin/config/reload`
- `POST /-/admin/config/overlay/validate`
- `POST /-/admin/config/overlay/clear`

UI:

- Config uses two independent columns instead of an equal-height grid: provider setup/editing in the main column, model routes/status/audit/advanced tools in the side column.
- Add Provider is the primary entry point with labeled provider name, base URL, API key, explicit upstream API format selection, provider proxy, optional initial key proxy, and masked-key note.
- Runtime Config is a compact masked provider/key/overlay/format status panel with a reload action.
- Overlay Safety is collapsed under Advanced overlay tools for masked overlay export, validation preview, and confirmed rollback/clear with backup path.
- Model Routes panel for `models.routes` upserts and deletes: model id, provider:weight list, per-model provider selection mode, edit/delete actions, and active-form preservation during refresh.
- Audit Trail panel with recent admin mutation action, target, source, status, and masked detail.
- Provider summary cards stay near Add Provider and link to Providers for editing base URL, provider proxy, key proxy, keys, and format path/enabled flags.
- Routing/retry summary links to Routing Policy for common tuning.
- Raw masked JSON is collapsed by default.
- No raw full-key display.

Near-term control-plane queue:

1. Model Routes editor: completed.
2. Full Failure Policies editor: completed.
3. Provider Models/capabilities view: completed.
4. Real upstream regression matrix: baseline completed with opt-in script and 3-call smoke.
5. Config safety/rollback: completed baseline.
6. Analytics/token/cost charts: completed baseline.

## Interaction Model

- Static assets served from `/-/dashboard`.
- Dashboard accepts admin key from:
  - `?admin_key=...`
  - local browser storage after user enters it
  - `X-Admin-Key` on API requests issued by the dashboard
- Static assets do not return runtime data or raw keys; all operational data and mutations stay behind Admin API authentication.
- Auto refresh interval defaults to 5 seconds and can be paused.
- Every panel has loading, empty, and error states.
- Mutating actions require a small confirmation state, then refresh affected data.
- Config-changing and runtime-control mutations are recorded in a lightweight audit trail with masked details.

## Implementation Scope

First implementation should be dependency-free:

- `dashboard/index.html`
- `dashboard/styles.css`
- `dashboard/app.js`
- Python handler serving `/dashboard` assets and preserving existing admin API behavior.

Charts should be native:

- Native SVG chart for request volume, failure volume, and first-byte latency time-series.
- Recent Failures table for concrete failed requests and failed attempts.
- Small status bars for provider/key health.
- Overview keeps Recent Failures as the single failure entry point and removes the duplicate aggregate Failures panel.

## Out of Scope for MVP

- Full visual theme switcher.
- Long-term persisted analytics.
- Complex form builder for all config fields.
- Drag/drop provider ordering.
- Multi-user auth, roles, or advanced audit workflows.
- React/Vite frontend build.
