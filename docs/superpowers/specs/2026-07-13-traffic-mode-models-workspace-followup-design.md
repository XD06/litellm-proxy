# Traffic Mode and Provider Models Workspace Follow-up

Date: 2026-07-13

## Context

The redesigned traffic workspace exposes a Requests/Tokens segmented control,
but clicking Tokens immediately returns to Requests. The chart shell and both
buttons currently share `data-traffic-mode`; the event binder consequently
attaches the mode-changing handler to all three nodes. A button click changes
the mode first, then bubbles to the shell, whose stale mode changes it back.

The provider Models tab also mixes four different operator tasks in one flat
scroll region: discovery health, per-key catalogs, day-to-day model enablement,
canonical variant configuration, and static fallback configuration. All of the
features are useful, but their equal visual weight obscures the primary model
catalog and makes the drawer difficult to scan.

## Goals

- Make Requests/Tokens switching reliable for pointer and keyboard users.
- Keep the model catalog as the primary Models-tab task.
- Preserve per-key discovery evidence without showing it as permanent clutter.
- Move canonical variants and static fallback behind progressive disclosure.
- Preserve every existing model action, form field, data attribute, API call,
  optimistic draft, and auto-refresh behavior.

## Non-goals

- Do not change chart aggregation, traffic data, or backend endpoints.
- Do not change model discovery, model mapping, routing, or persistence rules.
- Do not move model management into another provider tab.
- Do not introduce nested tabs, a third-party component library, or new APIs.
- Do not redesign unrelated provider drawer panels.

## Traffic Mode Fix

The chart shell will expose its rendered state through a non-interactive
attribute such as `data-traffic-current-mode`. Only mode buttons will retain
`data-traffic-mode`. Event binding will target
`button[data-traffic-mode]`, so a click has one mode-changing handler and no
ancestor can reverse the transition during bubbling.

`state.trafficChartMode` remains the source of truth. Switching modes still
calls the existing `renderTrafficChart()` path, which updates metrics, legend,
series, axis units, accessible labels, and pressed states together. The fix
does not stop propagation because the underlying problem is ambiguous element
ownership, not event bubbling itself.

## Models Workspace

### Compact status strip

Replace the six equal metric cards with one compact status strip containing:

- discovery status and last fetch time;
- discovered model count and disabled count;
- usable per-key catalog coverage;
- a clearly labelled Refresh action.

Route count is omitted from this strip because route ownership already lives
in the Routing tab. Errors and pending discovery remain immediately below the
strip with the existing error content and recovery action.

### Primary model catalog

The model catalog is the first full section and owns the normal workflow:
search, enabled/disabled filtering, bulk staging, individual enable/disable,
and mapping edit. Existing `data-provider-model-*` contracts remain intact.

Icon-only bulk controls receive persistent text or adjacent labels at desktop
widths and retain descriptive `aria-label` values. Model rows use a compact
list rather than a loose chip cloud so canonical ID, raw ID, state, staged
state, and edit action align predictably. The catalog keeps the current
100-item rendering limit.

When staged changes exist, Apply and Reset move into one sticky staged-change
bar that reports the draft count. When there are no drafts, the primary catalog
does not reserve space for disabled save controls.

### Discovery by key

Per-key catalogs move into a native disclosure section titled `Models by key`.
Its summary shows usable catalogs over total catalogs and any warning/error
count. It is collapsed by default when all keys agree and have usable results,
and opens by default when keys disagree, are stale, or contain an error.

Each key row retains the masked key ID, status badge, error, and model list.
Long model lists remain truncated with a count rather than expanding the drawer
horizontally.

### Canonical variants

Canonical variants become a separate disclosure section titled
`Canonical aliases`. Its summary reports the number of configured canonical
models. Existing mappings render as compact canonical-to-raw rows.

The edit form is not permanently visible. An `Add alias` action reveals the
same existing fields and submission contract. Empty-state copy explains that
aliases combine multiple upstream variants under one client-facing model name.
Submitting or cancelling returns to the mapping list without changing backend
semantics.

### Static fallback

Static models move into an `Advanced fallback` disclosure section, collapsed
by default. Its summary reports the configured static model count and explains
that the list is only used when `/v1/models` cannot be reached. Existing add
and delete controls, field names, confirmation behavior, and API calls remain
unchanged.

## Responsive and Accessibility Behavior

- The workspace uses one vertical scroll owner: the provider drawer section.
- Disclosures use native `<details>` and `<summary>` semantics with visible
  focus and at least 44px interactive height on touch layouts.
- The catalog toolbar wraps without horizontal page or drawer overflow.
- At narrow widths, textual action labels remain available and model metadata
  stacks below the canonical model ID.
- Staged changes remain visible without covering the final catalog row.
- Status is communicated with text and icons, never color alone.

## Preservation Constraints

- Keep `state.trafficChartMode` and `renderTrafficChart()` as the chart state
  and rendering boundary.
- Keep `filteredProviderModelItems()`, `providerModelDraftCount()`, model draft
  storage, and model mutation functions unchanged.
- Keep all existing model-management and static-model `data-*` attributes and
  form field names unchanged.
- Preserve provider drawer tab switching, focus preservation, and auto-refresh
  guards.
- Do not modify backend files for this follow-up.
- Do not overwrite or revert unrelated uncommitted routing work.

## Error and Empty States

- A failed model discovery stays visible directly beneath the status strip and
  automatically expands Models by key when key-level evidence exists.
- No matching models shows the existing recoverable catalog empty state while
  keeping search and filters available.
- No aliases and no static models each show purpose-specific empty copy inside
  their disclosures.
- Failed apply/save behavior continues through the existing optimistic rollback
  and toast system.

## Testing Strategy

### Automated tests

- Assert the shell does not match the interactive traffic-mode selector.
- Assert the mode binder targets buttons only and a Tokens click cannot be
  reversed by an ancestor handler.
- Assert the Models tab renders the catalog before advanced configuration.
- Assert per-key catalogs, canonical aliases, and static fallback use separate
  disclosure sections.
- Assert existing model and static-model forms, field names, and `data-*`
  contracts remain present.
- Assert staged Apply/Reset controls remain connected to the existing draft
  count and mutation bindings.

### Browser verification

- Switch Requests to Tokens and back with pointer and keyboard; verify metrics,
  legend, plot, units, accessible pressed state, and inspection labels change.
- Inspect Models with one key, multiple differing keys, discovery errors, no
  aliases, configured aliases, and static fallback models.
- Verify the drawer at desktop, 1024px, and 375px without horizontal overflow.
- Verify auto-refresh does not close disclosures while a contained control has
  focus or discard staged model changes.
- Check console errors and warnings.

### Regression

- Run all Dashboard Node tests and the Vite production build.
- Run Python syntax checks and the complete Python test suite because unrelated
  routing work remains in the shared working tree.

## Acceptance Criteria

- Requests/Tokens switching works on the first click and remains in the chosen
  mode until the user changes it.
- The Models tab opens with a clear status summary and model catalog as the
  dominant task.
- Per-key evidence, canonical aliases, and static fallback remain discoverable
  but do not compete with everyday model management.
- All existing model enablement, mapping, refresh, static fallback, optimistic
  apply/reset, and rollback behavior remains functional.
- No backend or unrelated dashboard behavior regresses.
