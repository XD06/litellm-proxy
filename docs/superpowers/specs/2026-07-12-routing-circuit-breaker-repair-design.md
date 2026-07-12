# Routing Format and Circuit Breaker Repair Design

Date: 2026-07-12

## Goal

Ensure `priority_first` applies across every semantically convertible upstream format, and separate provider/model/format/request-feature compatibility failures from API-key health failures.

## Format eligibility

Replace request-wide native-only gating with per-target-format compatibility checks. Same-format routing remains allowed. `store: false` is safely ignorable. Responses-to-Chat preserves `parallel_tool_calls`; targets that cannot preserve a parameter remain excluded. Stateful or native service fields such as `previous_response_id`, `background`, and `prompt` remain native-only. Excluded formats and their blocking parameters are observable.

## Compatibility circuit

Track compatibility state by provider, canonical model, upstream format, and a non-content request feature profile such as plain, tools, forced tool choice, reasoning, structured output, vision, or audio. `client_error`, `provider_compat`, and `empty_visible_output` affect only this circuit, using 10, 60, and 3600 second cooldowns. A success clears only the exact circuit. Health probes use an isolated profile and cannot clear user-request compatibility circuits.

## Key health circuit

Network, server, and unknown failures retain the transient 10/60/3600-second ladder. Credential and quota failures use 1-hour, 6-hour, and 24-hour cooldowns, remaining at 24 hours after further failures. Rate limits continue to respect Retry-After.

## Classification

Inspect structured error fields and response text before treating 401/403 as invalid credentials. Explicit balance, billing, credit, or quota messages classify as `quota_or_balance`; invalid token/key/authentication messages classify as `key_invalid`. Existing model, schema, and provider-compatibility classification remains, with the classification reason recorded.

## State and observability

Persist compatibility circuits while accepting old state files. Router snapshots expose aggregate active-circuit counts and nearest recovery time without request content. Provider scan cooldown, key cooldown, and compatibility cooldown remain distinct concepts.

## Tests

Cover per-target format eligibility, `store: false`, Responses-to-Chat `parallel_tool_calls`, stateful native-only fields, priority-first ordering, compatibility ladder isolation by request profile and format, health-probe isolation, quota classification, credential/quota cooldown escalation, and old-state loading.
