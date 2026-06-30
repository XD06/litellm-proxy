<div align="center">

# 🚀 litellm-proxy

**LLM API Proxy with 3-Format Conversion, Smart Routing & Web Dashboard**
**智能路由 · 三格式互转 · 多供应商管理**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/badge/Tests-356%20passed-brightgreen.svg)](#development)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](#docker--vps)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-ff69b4.svg)](https://github.com/XD06/litellm-proxy/pulls)

[Features](#-features) · [Quick Start](#-quick-start) · [Dashboard](#-dashboard) · [Routing](#-routing-model) · [Docs](#-project-map)

</div>

---

> **EN** | [中文](#-中文文档)

A format-aware LLM API proxy that accepts **OpenAI Chat Completions**, **OpenAI Responses**, and **Anthropic Messages** requests, routes them across multiple providers/keys with failover, and converts between formats when needed — all managed via a built-in web dashboard.

The client picks the API shape by path; each provider declares its upstream format. The proxy prefers same-format pass-through for speed and only converts when a fallback provider uses a different format.

---

## ✨ Features

- **🔄 Three-Format Conversion** — Bidirectional conversion between `chat_completions` ↔ `responses` ↔ `anthropic_messages`, including streaming SSE with text, reasoning/thinking blocks, and tool calls.
- **🧠 Smart Routing** — Priority-based failover, round-robin, weighted rotation, and random selection across providers and keys with per-key/per-provider cooldown, retry policies, and candidate de-duplication.
- **📊 Web Dashboard** — Provider health cards with latency charts, request history with per-attempt traces, routing config, failure policies, model mapping, and audit logs. All edits go to a runtime overlay — `config.json` is never rewritten.
- **🔍 Observability** — SQLite-persisted request history, per-attempt latency attribution, routing explainability, token/cost estimation, and masked key logging.
- **⚙️ Runtime Config** — Three-layer overlay (`config.json → runtime_config.json → env vars`) with tombstone-based deletion so base-config entries don't resurrect.
- **🐳 Docker Ready** — One-command `docker compose up` with health checks and Nginx/Caddy reverse proxy guidance.
- **🔒 Security-First** — Keys always masked in API responses and history; admin endpoints require authentication; config files kept out of git.

---

## 🚀 Quick Start

### Windows

```powershell
copy config.example.jsonc config.json
# Edit config.json and fill providers.*.keys
python sse2json.py
```

### Linux / macOS

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

---

## 🐳 Docker / VPS

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

---

## 📊 Dashboard

The dashboard is static HTML/CSS/JS served by the proxy. It can:

- 🩺 View provider/key health and cooldown state
- ➕ Add or edit providers, keys, proxy settings, and upstream formats
- 🔄 Refresh model capabilities from upstream
- 🛣️ Edit routing, retry, failure policy, and model route settings
- 🔍 Inspect recent requests with per-attempt traces, latency, token usage, and cost
- 📤 Export, validate, or clear the runtime overlay
- 📋 View admin mutation audit records

All dashboard writes go to `runtime_config.json` — `config.json` is never modified.

---

## 🛣️ Routing Model

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

---

## 📡 Client Endpoints

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

---

## ⚙️ Configuration

| File | Purpose | Commit? |
| --- | --- | --- |
| `config.example.jsonc` | Commented reference config | ✅ |
| `config.example.json` | Minimal JSON example | ✅ |
| `config.json` | Real base config with provider keys | ❌ |
| `runtime_config.json` | Dashboard/Admin API runtime overlay | ❌ |

**Config precedence:** `config.json → runtime_config.json → environment variables`

<details>
<summary>📖 Environment Variables</summary>

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
<summary>📖 Example Provider Config</summary>

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

---

## 🗂️ Project Map

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

---

## 🔧 Development

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

---

## 🔒 Security Notes

- Replace the example `server.admin_key` before exposing the service.
- Prefer HTTPS through a reverse proxy on VPS.
- Keep port `4894` bound to localhost unless you intentionally expose it.
- Never commit `config.json`, `runtime_config.json`, logs, caches, or SQLite data.
- Admin API responses and history records always keep provider keys masked.

---

## 📄 License

[MIT](LICENSE) © 2026 [XD06](https://github.com/XD06)

---

<div align="center">

**⭐ If this project helps you, please consider giving it a star!**

</div>

---

<!-- 中文文档 -->

# 📖 中文文档

一个格式感知的 LLM API 代理，接受 **OpenAI Chat Completions**、**OpenAI Responses** 和 **Anthropic Messages** 三种格式的请求，在多个供应商和密钥之间智能路由并自动故障转移，必要时在不同格式之间进行转换——全部通过内置 Web 控制台管理。

客户端通过路径选择 API 格式，每个供应商声明其上游格式。代理优先使用同格式直通以提升速度，仅在回退供应商使用不同格式时才进行转换。

## 核心功能

- **🔄 三格式互转** — `chat_completions` ↔ `responses` ↔ `anthropic_messages` 双向转换，支持流式 SSE（文本、推理/思考块、工具调用）
- **🧠 智能路由** — 优先级故障转移、轮询、加权轮询、随机选择，支持 per-key/per-provider 冷却、重试策略、候选去重
- **📊 Web 控制台** — 供应商健康卡片（延迟图表）、请求历史（逐次尝试追踪）、路由配置、失败策略、模型映射、审计日志
- **🔍 可观测性** — SQLite 持久化历史、逐次尝试延迟归因、路由可解释性、Token/费用估算、密钥脱敏
- **⚙️ 运行时配置** — 三层覆盖（`config.json → runtime_config.json → 环境变量`），Tombstone 删除机制防止基础配置复活
- **🐳 Docker 就绪** — 一键 `docker compose up`，支持 Nginx/Caddy 反向代理

## 快速开始

```bash
cp config.example.jsonc config.json
# 编辑 config.json，填入 providers.*.keys
pip install -r requirements.txt
python sse2json.py
```

打开 `http://127.0.0.1:4894` 访问控制台，使用 `config.json` 中的 `server.admin_key` 登录。

## 文件说明

| 文件 | 用途 | 是否提交 |
| --- | --- | --- |
| `config.json` | 真实基础配置（含密钥） | ❌ |
| `runtime_config.json` | 控制台/Admin API 运行时覆盖 | ❌ |
| `config.example.jsonc` | 带注释的参考配置 | ✅ |

配置优先级：`config.json → runtime_config.json → 环境变量`

## 安全须知

- 暴露服务前替换示例 `server.admin_key`
- VPS 部署优先使用 HTTPS 反向代理
- 端口 `4894` 默认绑定 localhost
- 永远不要提交 `config.json`、`runtime_config.json`、日志或 SQLite 数据

## 许可证

[MIT](LICENSE) © 2026 XD06
