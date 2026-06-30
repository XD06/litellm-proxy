# litellm-proxy

LLM API format proxy for routing one client API shape to multiple upstream providers.

It accepts OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages style requests, selects an available provider/key, forwards in the provider's declared upstream format, and converts the response back to the client format when needed.

## What It Does

- Converts between `chat_completions`, `responses`, and `anthropic_messages`.
- Supports streaming SSE conversion for common text, reasoning/thinking, and tool-call flows.
- Routes across multiple providers and multiple keys with failover, cooldown, retry, and model filtering.
- Serves a local web dashboard for provider state, request history, metrics, routing config, and runtime edits.
- Keeps real runtime config out of git: `config.json` and `runtime_config.json` are ignored.

## Quick Start

Windows:

```powershell
copy config.example.jsonc config.json
# Edit config.json and fill providers.*.keys
python sse2json.py
```

Linux/macOS:

```bash
cp config.example.jsonc config.json
# Edit config.json and fill providers.*.keys
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python sse2json.py
```

Default local URL:

```text
http://127.0.0.1:4894
```

Dashboard:

```text
http://127.0.0.1:4894/
http://127.0.0.1:4894/-/dashboard
```

Use the `server.admin_key` from `config.json` to log in.

## Docker / VPS

Recommended VPS path:

```bash
git clone https://github.com/XD06/litellm-proxy.git
cd litellm-proxy

# Copy your local config files into this directory:
#   config.json
#   runtime_config.json  (optional, but recommended if you used the dashboard)

mkdir -p tmp proxy_logs data
touch runtime_config.json
docker compose up -d --build
docker compose logs -f
```

Health checks:

```bash
curl http://127.0.0.1:4894/health
curl http://127.0.0.1:4894/v1/models
```

`docker-compose.yml` binds the service to `127.0.0.1:4894` on the VPS by default. Put Nginx/Caddy in front for HTTPS and public access.

Full migration notes: [docs/VPS_MIGRATION.md](docs/VPS_MIGRATION.md)

## Configuration Files

| File | Purpose | Commit? |
| --- | --- | --- |
| `config.example.jsonc` | Commented reference config | Yes |
| `config.example.json` | Minimal JSON example | Yes |
| `config.json` | Real base config with provider keys and admin key | No |
| `runtime_config.json` | Dashboard/Admin API runtime overlay | No |

Effective config precedence:

```text
config.json -> runtime_config.json -> environment variables
```

Useful environment overrides:

| Variable | Effect |
| --- | --- |
| `PROXY_CONFIG_PATH` | Path to base config |
| `PROXY_RUNTIME_CONFIG_PATH` | Path to runtime overlay |
| `PROXY_PORT` | Override `server.port` |
| `PROXY_MAX_WORKERS` | Override `server.max_workers` |
| `PROXY_LOG_DIR` | Override log directory |
| `PROXY_ADMIN_KEY` | Override admin key |
| `PROXY_PROVIDER_KEYS__name` | Override provider keys with a JSON array |

Example provider entry:

```jsonc
{
  "providers": {
    "deepseek": {
      "base_url": "https://api.deepseek.com",
      "formats": {
        "chat_completions": { "enabled": true, "path": "/v1/chat/completions" },
        "responses": { "enabled": false, "path": "/v1/responses" },
        "anthropic_messages": { "enabled": false, "path": "/v1/messages" }
      },
      "keys": [
        "sk-your-key",
        { "key": "sk-another-key", "proxy": "http://127.0.0.1:9000" }
      ],
      "enabled": true,
      "priority": 90
    }
  }
}
```

Proxy priority is:

```text
key proxy -> provider proxy -> global proxy -> direct connection
```

## Client Endpoints

| Endpoint | Client format |
| --- | --- |
| `POST /v1/chat/completions` | OpenAI Chat Completions |
| `POST /v1/responses` | OpenAI Responses |
| `POST /openai/v1/responses` | OpenAI Responses alias |
| `POST /anthropic/v1/messages` | Anthropic Messages |
| `POST /anthropic/v1/messages/count_tokens` | Anthropic token estimate |
| `POST /v1/messages` | Legacy Anthropic-compatible alias |
| `POST /v1/messages/count_tokens` | Legacy token estimate |
| `GET /v1/models` | Model list |
| `GET /health` | Health check |
| `GET /` or `GET /-/dashboard` | Web dashboard |

Admin endpoints live under `/-/admin/*` and require the admin key via one of:

```text
X-Admin-Key: ...
Authorization: Bearer ...
?admin_key=...
```

## Routing Model

Request flow:

```text
HTTP request
  -> request_routes.py classifies the client format
  -> sse2json.py normalizes request and resolves model
  -> router.py selects provider + key + upstream format
  -> same-format pass-through or format conversion
  -> upstream_client.py calls the provider
  -> stream_adapters.py / protocol_adapters.py convert the response if needed
  -> observability/history record masked metadata
```

Provider selection is controlled by `routing.provider_select`:

| Mode | Behavior |
| --- | --- |
| `priority_failover` | Prefer higher priority providers; fail over on retryable errors |
| `round_robin` | Rotate providers evenly |
| `weighted_rr` | Rotate using route weights |
| `random` | Randomized provider order per request |

Retry and cooldown behavior is configured under `retry.failure_policies`.

## Dashboard

The dashboard is static HTML/CSS/JS served by the proxy. It can:

- View provider/key health and cooldown state.
- Add or edit providers, keys, proxy settings, and supported upstream formats.
- Refresh model capabilities.
- Edit routing, retry, failure policy, and model route settings.
- Inspect recent requests, attempts, latency, token usage, estimated cost, and failures.
- Export, validate, or clear the masked runtime overlay.
- View admin mutation audit records.

Dashboard writes go to `runtime_config.json`; they do not rewrite `config.json`.

## Runtime Data

Ignored local runtime paths:

| Path | Purpose |
| --- | --- |
| `tmp/proxy_history.sqlite3*` | Request history and dashboard time series |
| `tmp/admin_audit.jsonl` | Admin mutation audit log |
| `tmp/router_state.json` | Router health and discovered capability snapshot |
| `proxy_logs/` | Optional diagnostic logs |
| `data/` | Local model/pricing/cache data |

Request history stores metadata only. It should not contain full request bodies or raw API keys.

## Development

Run tests:

```bash
python -m unittest discover -s tests
```

Compile-check core files:

```bash
python -m py_compile sse2json.py config_loader.py config_manager.py router.py upstream_client.py stream_adapters.py
```

Check dashboard bundle syntax:

```bash
node --check dashboard/app.js
```

Build dashboard source if you edit `dashboard_src/`:

```bash
cd dashboard_src
npm install
npm run build
```

Real upstream smoke tools are opt-in and may consume quota:

```bash
python tools/real_upstream_matrix.py --max-cases 3
python tools/real_upstream_matrix.py --run --max-cases 3 --output tmp/real_upstream_matrix.json
python tools/real_stream_tool_smoke.py --run --base-url http://127.0.0.1:4894 --output tmp/real_stream_tool_smoke.json
```

## Project Map

| Area | Files |
| --- | --- |
| HTTP server and endpoint dispatch | `sse2json.py`, `request_routes.py` |
| Admin API | `admin_routes.py`, `config_manager.py` |
| Routing and retry policy | `router.py`, `scheduler_policy.py`, `model_registry.py`, `model_discovery_queue.py` |
| Upstream HTTP | `upstream_client.py` |
| Non-streaming conversion | `format_adapters.py`, `protocol_adapters.py`, `chat.py`, `responses.py` |
| Streaming conversion | `stream_adapters.py` |
| Observability and history | `observability.py`, `history_store.py`, `audit_store.py`, `usage_accounting.py`, `routing_explain.py` |
| Dashboard runtime | `dashboard/` |
| Dashboard source | `dashboard_src/` |
| Deployment | `Dockerfile`, `docker-compose.yml`, `deploy/` |

More architecture context: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)

## Security Notes

- Replace the example `server.admin_key` before exposing the service.
- Prefer HTTPS through a reverse proxy on VPS.
- Keep port `4894` bound to localhost unless you intentionally expose it.
- Never commit `config.json`, `runtime_config.json`, logs, caches, or SQLite runtime data.
- Admin API responses and history records should keep provider keys masked.

## License

[MIT](LICENSE)
