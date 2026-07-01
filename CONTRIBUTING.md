# Contributing to litellm-proxy

Thanks for your interest in contributing! This guide will help you get started quickly.

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
```

### Dashboard Development

The Dashboard source lives in `dashboard_src/`. The built artifacts are in `dashboard/`.

```bash
cd dashboard_src
npm install
npm run dev      # Start Vite dev server with HMR
npm run build    # Build production bundle to dashboard/
```

When you make changes to the Dashboard, always run `npm run build` so the `dashboard/` directory stays in sync.

## Project Structure

```
litellm-proxy/
├── sse2json.py            # Main entry point & HTTP handler
├── router.py              # Provider/key selection, cooldown, failover
├── stream_adapters.py     # SSE format conversion (6 stream functions)
├── protocol_adapters.py   # Non-streaming format conversion
├── format_adapters.py     # Format routing helpers
├── config_loader.py       # Config loading + zero-config env inference
├── config_manager.py      # Runtime config overlay (tombstone-based)
├── observability.py       # Metrics, request history, health scores
├── model_registry.py      # Model discovery, mapping, normalization
├── admin_routes.py        # Admin API endpoints
├── upstream_client.py     # HTTP client for upstream providers
├── scheduler_policy.py    # Retry/cooldown policy engine
├── history_store.py       # SQLite-persisted request history
├── usage_accounting.py    # Token normalization & cost estimation
├── audit_store.py         # Admin audit log
├── dashboard_src/         # Dashboard source (Vite + vanilla JS)
├── dashboard/             # Built Dashboard (served by the proxy)
├── tests/                 # Test suite
└── docs/                  # Documentation
```

For a deeper overview, see `PROJECT_OVERVIEW.md`.

## Testing

Run the full test suite:

```bash
python -m pytest tests/ -q
```

Run a specific test file:

```bash
python -m pytest tests/test_router.py -v
```

All tests must pass before merging. The CI pipeline runs tests across Python 3.10–3.13.

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

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Write tests** — every new feature or bug fix should have test coverage
3. **Run tests locally** — ensure `python -m pytest tests/ -q` passes
4. **Build the Dashboard** — if you changed `dashboard_src/`, run `npm run build`
5. **Keep PRs focused** — one feature/fix per PR makes review faster
6. **Update docs** — if you added a feature, update relevant docs

## Code Style

- Python: Follow PEP 8, use `from __future__ import annotations` for forward references
- Dashboard: Vanilla JS, no framework — keep it lightweight
- Every public function should have a docstring
- Prefer explicit over implicit — "simple is better than complex"

## Reporting Issues

- Use the Bug Report template for bugs
- Use the Feature Request template for feature ideas
- Include your Python version, OS, and relevant config (with keys redacted)

## Questions?

Open a [Discussion](https://github.com/XD06/litellm-proxy/discussions) — we're happy to help!
