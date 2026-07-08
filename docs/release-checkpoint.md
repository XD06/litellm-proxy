# Release Checkpoint

Date: 2026-07-08 (updated from 2026-07-03)

## Current Status

This checkpoint is a stable Python baseline for the proxy.

- Client `/v1/*` means OpenAI Chat Completions.
- Client `/openai/v1/responses` means OpenAI Responses.
- Client `/anthropic/v1/messages` means Anthropic Messages.
- Same-format upstream routes are relayed directly where possible.
- Cross-format request/response conversion is implemented for the common text, reasoning/thinking, tool call, and tool result flows.
- Streaming conversion covers the same three-format matrix for common SSE event shapes.
- Routing, retry, cooldown, provider/key rotation, request history, metrics, token accounting, and Admin API are in place.
- The dashboard can inspect requests, providers, routing policy, metrics, runtime config overlay, model routes, and audit records.
- The dashboard login gate validates the admin key before rendering the console, so wrong keys do not briefly expose the app and refreshes with a valid saved key show a neutral checking state instead of the login form.

### Changes since 2026-07-03

**6 bug fixes** (see `docs/fix-plan-2026-07-08.md`):

1. **(P0)** Routing stopped before all providers were tried — `stop_attempts=True` for non-fatal errors (`model_not_found`, `schema_or_client_error`, `not_retryable_status`) caused the attempt loop to break instead of trying the next provider. Also ensured `max_attempts >= prov_count` so every provider+key candidate gets a chance.
2. **(P1)** New provider without explicit priority could intercept traffic — `add_provider` now auto-assigns lowest priority when none is specified.
3. **(P1)** Client error message exposed internal provider details — simplified to "All upstream providers are currently unavailable" while detailed errors go to server logs only.
4. **(P2)** Frontend `form.priority_tip` i18n said wrong priority direction — corrected to "higher number = higher priority".
5. **(P2)** Frontend `pm.higher_first` Chinese translation was inverted — corrected from "越小越优先" to "越大越优先".
6. **(P2)** Add Provider form lacked clipboard auto-fill — added "Paste & Auto-fill" button, paste detection, and provider preset chips.

### Changes since 2026-06-25

**7 bug fixes** (see `docs/fix-plan-2026-07-03.md`):

1. **(P0)** CLI arguments (`--host`, `--port`, `--config`, etc.) were never effective because `if __name__ == "__main__"` duplicated `main()` logic instead of calling it.
2. **(P1)** Module-level helper functions (`_record_*`, compat retry) used global `ROUTER`/`OBSERVABILITY`/`UPSTREAM_CLIENT` instead of the request's runtime snapshot, causing torn state during config hot-reload. Added thread-local runtime storage (`_request_rt` / `_set_request_rt` / `_current_rt`).
3. **(P1)** `_chat_upstream_requires_reasoning_content` and `_anthropic_upstream_requires_thinking` used global `CONFIG` instead of runtime snapshot.
4. **(P1)** `resolve_model` used global `MODEL_MAP`/`DISABLE_MAP` instead of reading from config. Now reads from config when provided, falls back to globals for test compatibility.
5. **(P2)** `prefetch_initial_stream_lines` leaked a thread pool reference count on every call (only incremented, never decremented). Added `_release_prefetch_pool()` in `finally` block.
6. **(P2)** `KeyboardInterrupt` handler did not close `UPSTREAM_CLIENT` connection pool, potentially leaking sockets on exit.
7. **(P2)** Eliminated ~40 lines of duplicated startup code between `main()` and `__main__` block.

**Other improvements:**
- `admin_routes.py`: Model pricing cache now uses a lock to prevent thundering-herd when cache expires.
- `model_registry.py`: Enhanced model discovery logic.
- `usage_accounting.py`: Usage statistics improvements.

### Changes since 2026-06-10

**5 bug fixes** (see `docs/fix-plan-2026-06-25.md`):

1. `relay_sse_stream` now switches socket read timeout from first-byte budget to read budget after first byte (P0).
2. `open_stream` error path now closes urllib3 response before raising, preventing pool connection leaks (P0).
3. Per-request `print(flush=True)` gated behind `log_provider_on_each_request`, removing a global synchronization point (P1).
4. `_use_urllib3` transport selection no longer checks `sys.modules` for `unittest`; default is always `urllib3` in production (P1).
5. `_pool_managers` dict capped with LRU eviction at 32 entries (P2).

**Bonus fix**: Routing state migration (`migrate_state_from` / `dump_state` / `load_state`) now uses value-based key fingerprint (`SHA-256` `key_hint`) instead of positional index, preventing state corruption when key lists are reordered.

**Playground feature** (see `docs/playground-design.md`):

- New Playground view in the dashboard for live model testing with SSE streaming.
- Supports Chat Completions, Responses, and Anthropic Messages formats.
- Model selector with search/filter combobox; always fetches latest model list from `/v1/models`.
- Routing trace strip showing selected provider, key, upstream format, upstream model, attempt number, first-byte latency, total latency, and token usage.
- Backend injects `X-Route-Provider`, `X-Route-Key`, `X-Route-Format`, `X-Route-Model`, `X-Route-Attempt` response headers on all 6 success paths (3 streaming + 3 non-streaming).

## Production-Like Config

Use `config.example.jsonc` as the main reference and copy it to `config.json`.

Required edits before running:

- Set `server.port` to the intended local port, normally `4894`.
- Set a non-empty `server.admin_key`; otherwise `/-/admin/*` is inaccessible.
- Fill provider `keys`.
- Confirm each provider's `base_url` and `formats.<format>.path`.
- Confirm `models.routes` and `models.provider_model_map` for each model/provider pair.

The example uses three upstream format roles:

- `opencode`: Chat Completions upstream.
- `rawchat`: Responses upstream.
- `deepseek`: Anthropic Messages upstream.

## Start And Restart

`start_proxy_config.bat` now lets `config.json` be the source of truth for `server.port`.

`config_loader.py` and `config_manager.py` read config files with `utf-8-sig`, so a Windows editor or PowerShell rewrite that adds a UTF-8 BOM will not silently force the proxy back to default config.

Recommended start:

```powershell
python sse2json.py
```

Optional override:

```powershell
$env:PROXY_PORT = "4894"
$env:PROXY_CONFIG_PATH = "C:\path\to\config.json"
python sse2json.py
```

Do not restart an existing dashboard process unless the same admin key is available in `config.json` or `PROXY_ADMIN_KEY`.

Latest local service state:

- `config.json` has `server.port = 4894`.
- `config.json` has a non-empty `server.admin_key`.
- `http://127.0.0.1:4894/-/admin/status` returned HTTP 200 with the configured key.
- The service was restarted on latest code after this checkpoint work.

## Verified Tests

Unit and integration tests:

```powershell
python -m unittest discover -s tests
python -m py_compile stream_adapters.py sse2json.py protocol_adapters.py format_adapters.py request_routes.py tools\real_stream_tool_smoke.py
```

Latest local result (2026-07-08): **590 passed in 48.75s** (`python -m pytest tests/ -x -q`).

Real upstream smoke results were documented in `docs/development-roadmap.md`. The temporary JSON reports were removed during project cleanup so `tmp/` only carries runtime state.

## Cleanup State

Project cleanup on 2026-06-10 removed obsolete startup scripts, stale TODO notes, IDE/tool scratch directories, Playwright snapshots, old screenshots, old smoke logs, and old temporary reports.

`config.json` is normalized to the three intended providers only:

- `opencode`
- `rawchat`
- `deepseek`

The default provider pool, model routes, and provider model map are also limited to those three providers.

`PROJECT_OVERVIEW.md` was added as the handoff entry point for new contributors or AI agents.

## Known Limits

These should be handled by maintenance as real cases appear:

- Hosted tools and provider-specific tool extensions.
- Complex multimodal content chunks.
- Provider-private SSE events beyond the current common variants.
- Malformed or incomplete streamed JSON argument fragments.
- Transparent retry after SSE bytes have already been sent is intentionally not supported.

## Next Maintenance Items

- Restart the live `4894` service with the same admin key and latest code.
- Run `tools\real_stream_tool_smoke.py --run` after major stream adapter changes.
- Keep adding compatibility tests from real failed request reports.
