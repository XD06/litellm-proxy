# Dashboard Call Bars and Optimistic Mutations Design

Date: 2026-07-13

## Context

The provider activity strip renders 40 SVG slots, but `providerSparklineStats()`
clips activity to 36 events. A busy provider therefore always leaves four empty
slots even when at least 40 recent calls exist.

Configuration controls have a separate responsiveness problem. Provider, key,
priority, format, and route handlers generally await the Admin API before
updating `state.data.config`. On a slow connection the button becomes disabled
and a saving notice appears, but every configuration-derived view continues to
show the old value until the full response arrives. Background refreshes can
also race with any naive local state change and temporarily restore stale data.

## Goals

- Render up to 40 provider activity events in the 40-slot strip.
- Make safe configuration mutations visible immediately in every affected view.
- Preserve server authority and reconcile against each Admin API response.
- Prevent polling or an unrelated mutation response from erasing pending local
  changes.
- Roll back only the failed mutation and preserve the user's submitted form
  values for a direct retry.
- Support concurrent mutations to distinct resources without lost updates.
- Keep raw provider keys out of optimistic state, logs, notices, and tests.

## Non-goals

- Do not change Admin API persistence or runtime hot-reload semantics.
- Do not make request execution, cooldown, or health observations optimistic.
- Do not optimistically invent a final masked key ID for a newly added key.
- Do not add WebSockets or asynchronous server acknowledgements.
- Do not redesign the Dashboard visual language.

## Root causes

### Activity strip

The statistics helper uses `events.slice(-36)` while the renderer declares
`slotCount = 40`. The renderer correctly right-aligns all events it receives,
so the four missing bars originate before rendering.

### Configuration latency

`runConfigMutation()`, provider priority handlers, format handlers, and several
route handlers call `await apiPatch()` or `await apiPost()` before applying a
configuration result. The initial UI feedback is limited to disabling controls
and displaying a notice. There is no local configuration transition before the
network boundary.

Directly mutating `state.data.config` is insufficient because periodic refresh
functions replace the whole config object. Full-config mutation responses can
also arrive out of order: a response for provider A can omit the still-pending
provider B change and make B visibly revert.

## Design

### One activity-window constant

Define and export `PROVIDER_CALL_BAR_SLOTS = 40` from a small pure Dashboard
module. The same module provides a helper that returns the newest bounded event
window. Both statistics and SVG rendering use the constant. A Node unit test
passes more than 40 events and verifies that exactly the newest 40 are retained.

### Confirmed configuration and optimistic overlay

The Dashboard will distinguish:

- **confirmed config**: the newest complete configuration accepted from an
  Admin API mutation or configuration refresh;
- **pending mutations**: ordered, resource-keyed local transformations that
  have been sent but not yet confirmed;
- **effective config**: a clone of confirmed config with every pending
  transformation applied in submission order. Existing render functions keep
  reading `state.data.config`, which always points to this effective config.

Central helpers own this lifecycle:

1. `acceptConfirmedConfig(config)` stores a safe clone as confirmed state and
   rebuilds effective config with all pending transformations reapplied.
2. `beginOptimisticConfigMutation(resourceKey, apply)` registers a mutation,
   rebuilds effective config, marks related views dirty, and renders immediately.
3. `confirmOptimisticConfigMutation(id, serverConfig)` removes the confirmed
   mutation, accepts the server config, reapplies other pending transformations,
   and renders the authoritative result.
4. `rejectOptimisticConfigMutation(id)` removes only that mutation and rebuilds
   from the last confirmed config plus the remaining pending transformations.

All code paths that accept a complete server config—including initial load,
static refresh, provider-config refresh, and `applyMutationResult()`—must go
through `acceptConfirmedConfig()`. This is what prevents the five-second poll
from producing a stale-state flash.

### Resource identity and concurrency

Each mutation has a stable resource key:

- `provider:<name>` for provider fields and global provider priority;
- `key:<provider>:<index>` for an existing key's proxy/model metadata;
- `provider-key-list:<provider>` for add/delete operations;
- `provider-format:<provider>:<format>` for format enable/path edits;
- `model-route:<canonical>` for a route and its provider priorities;
- `model-variants:<provider>:<canonical>` for raw model variants;
- a dedicated singleton key for global routing, retry, or proxy configuration.

Only one in-flight mutation is allowed for the same resource key. Controls for
that resource remain busy until confirmation. Distinct resource keys may run in
parallel. Pending transformations are reapplied in monotonic submission order,
so a later local change is never overwritten by an older response.

The implementation covers every Dashboard mutation whose result carries a
complete config snapshot: provider add/edit/delete and priority, key
add/edit/delete, skip-probe and format controls, static models, model maps and
variants, model routes and route priorities, global proxy, routing, retry, and
failure-policy forms. Operations that require a server-generated masked key ID
render an immediate secret-free pending placeholder and remain pending until the
response supplies the authoritative identity.

### Mutation-specific transformations

Transformations operate only on masked Dashboard configuration:

- Provider edit merges validated form fields into
  `config.providers[provider]`.
- Provider priority replaces `config.providers[provider].priority`.
- Existing key edit merges `proxy` and `models` into the matching key entry
  while preserving its masked identity fields.
- Format edit merges `enabled` or `path` under the provider format.
- Model route edit replaces the canonical route with the submitted provider
  list and selection mode.
- Variant edit replaces or deletes the canonical variant list.

The optimistic transformation never copies a raw key from a password input into
shared state. Adding a key appends a `pending` display entry containing only its
temporary index and non-secret metadata; the raw submitted secret remains
confined to the request body and form element.

### UI feedback and failure behavior

Immediately after submission:

- related cards, badges, priority ordering, key metadata, and drawer content
  render the optimistic value;
- the originating resource receives `aria-busy="true"` and a pending visual
  state;
- the saving notice remains informational, not a false success message.

On success, the pending marker disappears and a success notice is shown. On
failure, only the failed transformation is removed. The form values captured at
submission are restored after rollback, the resource remains visible, focus is
returned to the first changed control (or the submit button if that control no
longer exists), and the error notice explains that the displayed saved state was
restored. The user can correct or resubmit without retyping.

Runtime-only facts such as cooldown, usable key counts, compatibility circuits,
and health scores always come from server status and are never fabricated.

### Rendering scope

Optimistic transitions set the same force-render flags as an accepted config
response. Rendering remains synchronous and local; no extra network fetch is
needed for the initial transition. A successful mutation schedules the existing
bounded background refresh for status, audit, discovery, and runtime effects.

To avoid focus loss, rollback restoration occurs after the effective config is
rebuilt, then restores submitted form values into the newly rendered form. The
implementation uses existing dirty-container and drawer render rules rather
than introducing a second form framework.

## Error and race handling

- A failed mutation cannot roll back another resource's pending change.
- A stale polling response becomes the new confirmed base but pending changes
  are immediately reapplied before rendering.
- A full-config success response removes only its own pending mutation before
  accepting the response.
- If a response lacks `config`, the mutation remains pending until a targeted
  configuration refresh succeeds; a bounded reconciliation refresh is queued.
- Same-resource double submission is rejected while pending and leaves the
  current optimistic value visible.
- Logout/reset clears confirmed and pending optimistic state.
- Server validation remains final; the browser does not bypass existing form or
  backend validation.

## Test strategy

### Pure Node tests

- More than 40 activity events retain exactly the newest 40.
- Fewer than 40 retain all events and right-align correctly.
- Starting a mutation updates effective config before its promise resolves.
- A polling config replacement preserves pending transformations.
- A successful response confirms one mutation while retaining another pending
  mutation.
- A failure removes only the failed mutation.
- Same-resource concurrent submission is rejected; distinct resources coexist.
- Optimistic key state never contains the submitted raw secret.

### Dashboard integration/static tests

- Provider/key/priority handlers invoke the optimistic lifecycle before their
  network operation.
- Pending/busy and failure messaging are present in the built Dashboard asset.
- The Vite build contains the shared 40-slot implementation.

### Regression tests

- Run all Dashboard Node suites and the Vite production build.
- Run Admin API/config tests covering provider, key, priority, format, route,
  and variants responses.
- Run the complete Python test suite because configuration hot reload affects
  router state and model discovery.

## Acceptance criteria

- A provider with at least 40 recent calls visibly fills all 40 slots.
- With an artificially delayed Admin API response, provider/key/priority UI
  changes appear in the same event turn, before the response resolves.
- A five-second poll during the delay does not flash the old value.
- Failed requests restore confirmed state, retain submitted form values, and
  permit retry.
- Concurrent changes to two providers remain visible regardless of response
  order.
- No raw key is introduced into Dashboard shared state or API output.
