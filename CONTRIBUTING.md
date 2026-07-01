# Contributing to litellm-proxy

Thanks for your interest in contributing! This guide will help you get started quickly.

> **New here?** Read `PROJECT_OVERVIEW.md` first — it's the definitive architecture guide
> that explains module responsibilities, data flow, and key design decisions.

---

## Development Environment

### Prerequisites

- Python 3.10+ (3.12 recommended)
- Node.js 20+ (for Dashboard development only)

### Setup

```bash
# Clone the repository
git clone https://github.com/XD06/litellm-proxy.git
cd litellm-proxy

# Create and activate a virtual environment
python -m venv .venv
# Linux/macOS:
. .venv/bin/activate
# Windows:
.venv\Scripts\Activate.ps1

# Install Python dependencies
pip install -r requirements.txt
pip install pytest

# Create config from example
cp config.example.jsonc config.json
# Edit config.json — fill in your API keys

# Start the proxy
python sse2json.py
# Or, if installed via pip:
litellm-proxy
```

### Dashboard Development

The Dashboard source lives in `dashboard_src/`. The built artifacts are in `dashboard/`.

```bash
cd dashboard_src
npm install
npm run dev      # Start Vite dev server with HMR (localhost:5173)
npm run build    # Build production bundle to dashboard/
```

> **Important:** Always run `npm run build` after making dashboard changes.
> The proxy serves the built `dashboard/` directory, not the source files.

---

## Project Structure

```
litellm-proxy/
├── sse2json.py              # Main entry point & HTTP handler
├── router.py                # Provider/key selection, cooldown, failover
├── stream_adapters.py       # SSE format conversion (6 stream functions)
├── protocol_adapters.py     # Non-streaming format conversion
├── format_adapters.py       # Format routing helpers
├── chat.py / responses.py   # Format-specific non-streaming handlers
├── config_loader.py         # Config loading + zero-config env inference
├── config_manager.py        # Runtime config overlay (tombstone-based)
├── upstream_client.py       # HTTP client for upstream providers
├── scheduler_policy.py      # Retry/cooldown policy engine
├── request_routes.py        # Path → format classification
├── request_dispatcher.py    # Request routing helpers
├── observability.py         # Metrics, request history, health scores
├── history_store.py         # SQLite-persisted request history
├── audit_store.py           # Admin audit log (JSONL)
├── usage_accounting.py      # Token normalization & cost estimation
├── model_registry.py        # Model discovery, mapping, normalization
├── model_discovery_queue.py # Async model discovery queue
├── admin_routes.py          # Admin API endpoints
├── routing_explain.py       # Human-readable routing explanations
├── proxy_utils.py           # Shared utilities (key masking, etc.)
├── dashboard_src/           # Dashboard source (Vite + vanilla JS)
│   ├── src/app.js           # Main dashboard application (~7,300 lines)
│   ├── src/api.js           # API client with admin key auth
│   └── src/styles.css       # Dashboard styles
├── dashboard/               # Built Dashboard (served by the proxy)
├── tests/                   # Test suite (459 tests, 28 files)
├── docs/                    # Documentation
├── deploy/                  # Deployment configs (nginx, systemd)
├── Dockerfile               # Container image definition
├── docker-compose.yml       # Single-service compose with health check
└── config.example.jsonc     # Annotated config example
```

For a deeper architectural overview, see `PROJECT_OVERVIEW.md`.

---

## Testing

### Running Tests

```bash
# Full suite (459 tests)
python -m pytest tests/ -q

# Specific module
python -m pytest tests/test_router.py -v

# With coverage (optional)
python -m pytest tests/ -q --tb=short

# Compile-check core modules (same as CI)
python -m py_compile sse2json.py config_loader.py config_manager.py router.py upstream_client.py stream_adapters.py protocol_adapters.py format_adapters.py request_routes.py observability.py history_store.py model_registry.py scheduler_policy.py admin_routes.py usage_accounting.py
```

### Test Categories

| Category | Key Test Files |
|---|---|
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

All tests must pass before merging. The CI pipeline runs tests across Python 3.10–3.13.

### Writing Tests

- Place test files in `tests/` following the `test_*.py` naming convention.
- Use `unittest.TestCase` (the existing pattern) or plain `pytest` functions.
- Mock upstream HTTP calls — never hit real providers in tests.
- For streaming tests, use `io.BytesIO` or similar to simulate SSE responses.
- Add at least one test for each new feature or bug fix.

---

## CI/CD Pipeline

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to `main` and every PR. Three parallel jobs:

1. **test** — Python 3.10/3.11/3.12/3.13 matrix: installs deps, compile-checks core modules, runs `pytest`.
2. **dashboard-check** — Node 20: runs `node --check dashboard/app.js` to verify the built bundle has no syntax errors.
3. **docker-build** — Builds the Docker image and runs a smoke test (health check against a minimal config).

### Docker Publish (`.github/workflows/docker-publish.yml`)

Runs on pushes to `main` and version tags (`v*`):

- Multi-arch build: `linux/amd64` + `linux/arm64` via QEMU.
- Tags: `latest` (main), semver (`v1.0.0`, `v1.0`, `v1`), and `sha-<git-sha>`.
- Pushes to Docker Hub (requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets).
- Smoke-tests the published image on main branch pushes.

---

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `refactor` | Code refactoring (no behavior change) |
| `test` | Adding or updating tests |
| `chore` | Build, CI, or tooling changes |
| `perf` | Performance improvement |

Example: `feat: add auto routing mode with health-score-based priority adjustment`

---

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Write tests** — every new feature or bug fix should have test coverage
3. **Run tests locally** — ensure `python -m pytest tests/ -q` passes
4. **Build the Dashboard** — if you changed `dashboard_src/`, run `npm run build` in `dashboard_src/`
5. **Keep PRs focused** — one feature/fix per PR makes review faster
6. **Update docs** — if you added a feature, update relevant docs (`README.md`, `PROJECT_OVERVIEW.md`, `config.example.jsonc`)

### PR Checklist

- [ ] Tests pass locally (`python -m pytest tests/ -q`)
- [ ] Dashboard builds without errors (`cd dashboard_src && npm run build`)
- [ ] No new compile errors in core modules
- [ ] Documentation updated (if applicable)
- [ ] Conventional Commit messages used

---

## Code Style

### Python

- Follow PEP 8 (line length 120 is acceptable)
- Use `from __future__ import annotations` for forward references
- Type hints are encouraged for public APIs
- Every public function should have a docstring
- Prefer explicit over implicit — "simple is better than complex"

### Key Patterns

**Runtime Context:** All request-scoped access to runtime state goes through `_request_runtime()` which returns an immutable `RuntimeContext` snapshot. Never access the global `RUNTIME` directly inside a request handler — always capture it once at the start.

**Config Overlay:** Admin mutations use `RuntimeConfigManager._locked_overlay()` — an RLock-protected context manager that ensures atomic reads-modify-writes. Never modify the overlay outside this context manager.

**Stream Adapters:** All 6 stream converters follow the same error-handling pattern: wrap error-handling in `try/except` to handle client disconnections gracefully, return `None` on failure.

### Dashboard (JavaScript)

- Vanilla JS, no framework — keep it lightweight
- Use `morphdom` for DOM diffing (already imported)
- All user input rendered as HTML must go through `pgEsc()` for XSS prevention
- Use `apiGet`, `apiPost`, `apiPatch` from `api.js` for all API calls
- Remove sensitive data from URLs after use (e.g., `admin_key` via `history.replaceState`)

---

## Reporting Issues

- Use the Bug Report template for bugs
- Use the Feature Request template for feature ideas
- Include your Python version, OS, and relevant config (with API keys redacted)
- For streaming issues, include the proxy log output (with `[proxy]` prefix lines)

---

## Questions?

Open a [Discussion](https://github.com/XD06/litellm-proxy/discussions) — we're happy to help!
