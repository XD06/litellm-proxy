# Release Checkpoint

Date: 2026-06-10

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

Latest local result: 177 tests OK.

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
