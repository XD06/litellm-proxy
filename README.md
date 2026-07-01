# LLM API Proxy — 3-Format Conversion · Smart Routing · Web Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Python 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/downloads/) [![CI](https://github.com/XD06/litellm-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/XD06/litellm-proxy/actions/workflows/ci.yml) [![Docker](https://img.shields.io/docker/pulls/dsk3/litellm-proxy.svg)](https://hub.docker.com/r/dsk3/litellm-proxy) [![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-ff69b4.svg)](https://github.com/XD06/litellm-proxy/pulls)

**English** | [中文](README_CN.md)

<table>
  <tr>
    <td width="50%" align="center"><img src="assets/overview.png" alt="Overview Dashboard" /></td>
    <td width="50%" align="center"><img src="assets/provider.png" alt="Provider Detail" /></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="assets/requests.png" alt="Request History" /></td>
    <td width="50%" align="center"><img src="assets/playground.png" alt="Playground" /></td>
  </tr>
</table>

A format-aware LLM API proxy that accepts OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages requests, routes them across multiple providers and keys with failover, and converts between formats when needed — all managed through a built-in web dashboard.

The client picks the API shape by path; each provider declares its upstream format. The proxy prefers same-format pass-through for speed and only converts when a fallback provider uses a different format.

---

## Features

- **Three-Format Conversion** — Bidirectional conversion between `chat_completions` ↔ `responses` ↔ `anthropic_messages`, including streaming SSE with text, reasoning/thinking blocks, and tool calls.
- **Smart Routing** — Priority-based failover, round-robin, weighted rotation, random selection, and **auto mode** with real-time health-score-based priority adjustment, across providers and keys, with per-key/per-provider cooldown, retry policies, and candidate de-duplication.
- **Web Dashboard** — Provider health cards with latency charts, request history with per-attempt traces, routing config, failure policies, model mapping, and audit logs. All edits go to a runtime overlay — `config.json` is never rewritten.
- **Observability** — SQLite-persisted request history, per-attempt latency attribution, routing explainability, token/cost estimation, and masked key logging.
- **Runtime Config** — Three-layer overlay (`config.json → runtime_config.json → env vars`) with tombstone-based deletion so base-config entries don't resurrect.
- **Docker Ready** — One-command `docker compose up` with health checks and reverse proxy guidance.
- **Security-First** — Keys always masked in API responses and history; admin endpoints require authentication; config files kept out of git.

## Quick Start

### Zero-Config (Environment Variables)

No config file needed — just set API keys as environment variables:

```bash
export OPENAI_API_KEY=sk-...
export DEEPSEEK_API_KEY=sk-...
python sse2json.py
# Proxy auto-detects providers from env vars and starts immediately
```

### Via pip (PyPI)

```bash
pip install litellm-proxy
litellm-proxy                          # Start with auto-config
litellm-proxy --init                   # Create config.json from template
litellm-proxy --config my.json --port 8080  # Custom config & port
```

### From Source

#### Windows

```powershell
copy config.example.jsonc config.json
# Edit config.json and fill providers.*.keys
python sse2json.py
```

#### Linux / macOS

```bash
cp config.example.jsonc config.json
# Edit config.json and fill providers.*.keys
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python sse2json.py
```

### Default URLs

| URL | Description |
| --- | --- |
| `http://127.0.0.1:4894` | Dashboard |
| `http://127.0.0.1:4894/v1/chat/completions` | Chat Completions endpoint |
| `http://127.0.0.1:4894/anthropic/v1/messages` | Anthropic Messages endpoint |
| `http://127.0.0.1:4894/health` | Health check |

Use the `server.admin_key` from `config.json` to log in to the dashboard.

## Docker / VPS

### Pull from Docker Hub

```bash
docker pull dsk3/litellm-proxy:latest

docker run -d --name litellm-proxy \
  -p 4894:4894 \
  -v ./config.json:/app/config.json:ro \
  -v ./runtime_config.json:/app/runtime_config.json \
  -v ./tmp:/app/tmp \
  -v ./proxy_logs:/app/proxy_logs \
  -v ./data:/app/data \
  dsk3/litellm-proxy:latest
```

### Build from Source

```bash
git clone https://github.com/XD06/litellm-proxy.git
cd litellm-proxy

# Copy your config files:
#   config.json
#   runtime_config.json  (optional)

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

`docker-compose.yml` binds to `127.0.0.1:4894` by default. Put Nginx/Caddy in front for HTTPS.

Full migration notes: [docs/VPS_MIGRATION.md](docs/VPS_MIGRATION.md)

## Dashboard

The dashboard is static HTML/CSS/JS served by the proxy. It can:

- View provider/key health and cooldown state
- Add or edit providers, keys, proxy settings, and upstream formats
- Refresh model capabilities from upstream
- Edit routing, retry, failure policy, and model route settings
- Inspect recent requests with per-attempt traces, latency, token usage, and cost
- Export, validate, or clear the runtime overlay
- View admin mutation audit records

All dashboard writes go to `runtime_config.json` — `config.json` is never modified.

## Routing Model

```text
HTTP request
  → request_routes.py classifies the client format
  → sse2json.py normalizes request and resolves model
  → router.py selects provider + key + upstream format
  → same-format pass-through or format conversion
  → upstream_client.py calls the provider
  → stream_adapters.py / protocol_adapters.py convert the response if needed
  → observability/history record masked metadata
```

| Mode | Behavior |
| --- | --- |
| `priority_failover` | Prefer higher priority providers; fail over on retryable errors |
| `round_robin` | Rotate providers evenly |
| `weighted_rr` | Rotate using route weights |
| `random` | Randomized provider order per request |

## Client Endpoints

| Endpoint | Client Format |
| --- | --- |
| `POST /v1/chat/completions` | OpenAI Chat Completions |
| `POST /v1/responses` | OpenAI Responses |
| `POST /openai/v1/responses` | OpenAI Responses alias |
| `POST /anthropic/v1/messages` | Anthropic Messages |
| `POST /anthropic/v1/messages/count_tokens` | Anthropic token estimate |
| `POST /v1/messages` | Legacy Anthropic alias |
| `GET /v1/models` | Model list |
| `GET /health` | Health check |
| `GET /` or `GET /-/dashboard` | Web dashboard |

Admin endpoints live under `/-/admin/*` and require the admin key via `X-Admin-Key`, `Authorization: Bearer`, or `?admin_key=`.

## Configuration

| File | Purpose | Commit? |
| --- | --- | --- |
| `config.example.jsonc` | Commented reference config | Yes |
| `config.example.json` | Minimal JSON example | Yes |
| `config.json` | Real base config with provider keys | No |
| `runtime_config.json` | Dashboard/Admin API runtime overlay | No |

**Config precedence:** `config.json → runtime_config.json → environment variables`

<details>
<summary>Environment Variables</summary>

| Variable | Effect |
| --- | --- |
| `PROXY_CONFIG_PATH` | Path to base config |
| `PROXY_RUNTIME_CONFIG_PATH` | Path to runtime overlay |
| `PROXY_PORT` | Override `server.port` |
| `PROXY_MAX_WORKERS` | Override `server.max_workers` |
| `PROXY_LOG_DIR` | Override log directory |
| `PROXY_ADMIN_KEY` | Override admin key |
| `PROXY_PROVIDER_KEYS__name` | Override provider keys (JSON array) |

</details>

<details>
<summary>Example Provider Config</summary>

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

Proxy priority: `key proxy → provider proxy → global proxy → direct connection`

</details>

## Project Map

| Area | Files |
| --- | --- |
| HTTP server & dispatch | `sse2json.py`, `request_routes.py` |
| Admin API | `admin_routes.py`, `config_manager.py` |
| Routing & retry policy | `router.py`, `scheduler_policy.py`, `model_registry.py` |
| Upstream HTTP | `upstream_client.py` |
| Non-streaming conversion | `format_adapters.py`, `protocol_adapters.py`, `chat.py`, `responses.py` |
| Streaming conversion | `stream_adapters.py` |
| Observability & history | `observability.py`, `history_store.py`, `audit_store.py`, `routing_explain.py` |
| Dashboard runtime | `dashboard/` |
| Dashboard source | `dashboard_src/` |
| Deployment | `Dockerfile`, `docker-compose.yml`, `deploy/` |

More architecture context: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)

## Development

```bash
# Run tests
python -m pytest tests/ -q

# Compile-check core files
python -m py_compile sse2json.py config_loader.py config_manager.py router.py upstream_client.py stream_adapters.py

# Check dashboard bundle syntax
node --check dashboard/app.js

# Build dashboard from source
cd dashboard_src && npm install && npm run build
```

## Security Notes

- Replace the example `server.admin_key` before exposing the service.
- Prefer HTTPS through a reverse proxy on VPS.
- Keep port `4894` bound to localhost unless you intentionally expose it.
- Never commit `config.json`, `runtime_config.json`, logs, caches, or SQLite data.
- Admin API responses and history records always keep provider keys masked.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR process.

## License

[MIT](LICENSE) © 2026 [XD06](https://github.com/XD06)
