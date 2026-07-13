# Explainable Key-Aware Routing Design

Date: 2026-07-13

## Goal

Make routing correct and explainable when requests cross API formats, providers expose multiple raw model variants for one client model, and keys under the same provider expose different model catalogs. Request history, router state, and provider health must describe the same decision.

## Current Failures

1. History records only executed upstream attempts. It loses providers, keys, formats, and models rejected before an attempt.
2. HTTP 422 errors are classified as client errors before inspecting billing semantics. `Insufficient credits` therefore opens a compatibility circuit instead of cooling the key.
3. Compatibility circuits are keyed by provider, canonical model, format, and request profile. They omit the key and raw model, so a corrected model mapping can remain blocked by stale state.
4. Request-wide native-only field checks remove all cross-format candidates for common agent payloads even where the existing adapters can preserve or safely degrade the semantics.
5. Provider model mappings are one-to-one. They cannot express several ordered raw models for one canonical model.
6. Model discovery uses one healthy key per provider and stores one provider-wide catalog. It cannot route correctly when keys expose different models.

## Unified Routing Candidate

Routing uses one immutable candidate identity throughout selection, failure handling, persistence, and presentation:

```text
provider
key_fingerprint
key_index
canonical_model
raw_model
upstream_format
compatibility_profile
```

Candidate deduplication includes `raw_model`. Compatibility circuits include `key_fingerprint` and `raw_model`. Credential, quota, rate-limit, and transport health remain key-scoped and therefore affect every model on that key.

## Routing Trace

Each request owns a secret-free routing trace. Producers append stable decision records; the observability layer persists them; the dashboard only renders them.

Trace stages include request compatibility planning, canonical model resolution, provider filtering, raw-model expansion, key filtering, format filtering, compatibility-circuit filtering, selection, upstream result, and state action.

Decision codes include:

- `selected`
- `provider_disabled`
- `provider_cooldown`
- `key_disabled`
- `key_cooldown`
- `model_unsupported_by_key`
- `model_capability_unknown`
- `format_disabled`
- `format_blocked_by_parameter`
- `compatibility_circuit`
- `duplicate_candidate`
- `attempt_failed`
- `attempt_succeeded`

The trace stores key index, stable key ID, and masked key only. It never stores raw keys, authorization headers, request content, or secrets in upstream URLs.

## Failure Taxonomy

Upstream error classification examines structured `error.type`, `error.code`, and `error.message`, then normalized text, and only then falls back to HTTP status.

Every failure records an owner:

- `client_request`
- `proxy_routing`
- `proxy_conversion`
- `upstream`
- `transport`

Important state actions:

- invalid credential: key disable/cooldown
- quota or balance: key cooldown ladder of 1h, 6h, and 24h
- rate limit: key cooldown honoring `Retry-After`
- network/server failure: existing transient key ladder
- model not found: raw-model compatibility circuit, then try another raw model or key
- provider compatibility: provider/key/raw-model/format/profile circuit
- malformed client request: no shared routing-state mutation

HTTP responses distinguish malformed client input (400), unsupported proxy semantic conversion (422), no currently eligible candidate (503), and exhaustion after upstream attempts (502).

## Semantic Conversion Plans

Compatibility is evaluated per target format and returns a plan rather than a boolean:

```text
target_format
allowed
transformations
dropped_hints
blockers
fidelity
```

The default `safe` policy permits lossless mappings, known semantic mappings, and explicitly safe hint removal. `strict` permits only lossless mappings.

Examples:

- messages, tools, tool choice, stop, and token limits: map using existing adapters
- thinking/reasoning: map using existing reasoning support and record budget degradation where exact preservation is impossible
- cache-control and unsupported service-tier hints: remove only when classified as safe hints and record the adaptation
- structured output: map only where the target adapter can preserve it
- MCP servers, provider containers, and server-side context management: block targets that cannot preserve state

No unknown field is silently removed.

## Model Variants

The existing one-to-one provider model map remains supported. A new ordered variant list expresses multiple raw models for one canonical model:

```json
{
  "models": {
    "provider_model_variants": {
      "grok-provider": {
        "grok-4.3": [
          {"model": "grok-4.3-high", "priority": 100},
          {"model": "grok-4.3-console", "priority": 80},
          {"model": "grok-4.3-low", "priority": 50}
        ]
      }
    }
  }
}
```

Priority failover is deterministic. Names such as `high` and `low` have no inferred meaning. A model-specific compatibility failure advances to another raw model; a key health failure advances to another key.

## Per-Key Model Capabilities

Each key has a capability entry addressed by a stable fingerprint rather than array position. Capability source precedence is:

1. key-level manual mapping
2. successful key-level discovery
3. provider-level manual mapping
4. legacy provider-level discovery fallback
5. explicit unknown-model policy

Discovery fetches `/models` for each enabled key, caches results, retains stale successful data when refresh fails, and atomically replaces one key snapshot at a time. Provider-wide capability data becomes a display union only and is not authoritative for key selection.

Manual key configuration may declare canonical-to-raw mappings. A successful discovery list that omits the target produces `model_unsupported_by_key`. Failed or missing discovery produces `model_capability_unknown`, with routing controlled by the existing assume-unknown policy.

## State Invalidation

Configuration changes invalidate only state whose identity changed:

- raw-model mapping change: remove circuits for the old raw model
- key change/removal: remove capability and circuits for the old fingerprint
- format change: remove circuits for that provider and format
- provider removal: remove all provider state
- request-profile policy change: remove incompatible profile circuits

Unrelated key cooldowns and provider health survive hot reload. New capability snapshots are visible to the next request without waiting for dashboard polling or process restart.

## Persistence And Dashboard

SQLite stores request-level compatibility plans and routing decisions in structured JSON columns or normalized trace rows. Schema migration is backward compatible; old requests continue to render with attempt-only details.

Request detail shows:

- canonical model and selected raw model
- target-format compatibility adaptations and blockers
- every considered candidate and its decision code
- failure owner and classification evidence
- exact state action, scope, duration, and recovery time
- final reason when no upstream attempt was made

Provider detail separates transport health, provider cooldown, available keys, per-key model capability, and compatibility circuits. A transport-healthy provider with an active compatibility circuit is shown as degraded rather than contradictory healthy/unroutable state.

## Delivery Order

1. Add failing regression tests for billing classification, zero-attempt explanation, stale mapping circuits, model variants, and per-key model catalogs.
2. Introduce shared candidate, trace, compatibility-plan, and failure-action contracts without changing selection behavior.
3. Fix structured error classification and compatibility-circuit identity/invalidation.
4. Replace request-wide format blocking with per-target semantic conversion plans.
5. Add ordered raw-model variants and update candidate generation/deduplication.
6. Add per-key capabilities and key-aware discovery/routing with legacy fallbacks.
7. Persist routing traces and render request/provider details.
8. Run focused tests after each slice, then the complete Python and dashboard suites.

## Test Strategy

Tests cover pure classification and compatibility functions, router candidate ordering and circuit scopes, HTTP handler behavior, model discovery with heterogeneous keys, config migration, SQLite round trips, secret redaction, and dashboard rendering. Existing legacy configuration tests remain mandatory.

Completion requires the original synthetic reproductions to pass, the full Python suite to pass, dashboard tests to pass, and no raw key or authorization data to appear in trace payloads.
