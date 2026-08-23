# System Settings Visual Alignment Design

## Status

Approved visual direction: **B — Unified Operations Workspace**.

## Objective

Make the System Settings view visually indistinguishable in theme, typography,
spacing, panel treatment, sidebar behavior, and responsive layout from the
existing Proxy Console. Requests is the reference for page framing, toolbars,
tables, and empty states. Routing Policy is the reference for structured
configuration cards.

The work applies to all three System Settings tabs:

1. Client API Keys
2. Model Pricing
3. Operations & System

## Scope and Constraints

### In scope

- Rework Settings-specific HTML wrappers and CSS classes as needed.
- Reuse the console's existing design tokens, icon set, shared button styles,
  table semantics, panel chrome, and mobile settings drawer.
- Reorganize existing Settings controls into clearer visual groups.
- Eliminate layout movement while switching between the main navigation views
  and among the three Settings tabs.
- Preserve the existing keyboard behavior, focus visibility, tab semantics,
  empty states, loading states, and responsive behavior.

### Explicitly out of scope

- New backend endpoints, API payload changes, storage changes, or migration.
- Renaming, removing, or changing the submitted value of any existing field.
- Changing existing element IDs, input names, form IDs, `data-*` event hooks,
  or endpoint bindings unless a like-for-like replacement is required and all
  existing bindings are updated in the same change.
- Any change outside System Settings and the shared styles strictly needed to
  make it inherit the current console shell.

## Current State and Diagnosis

The Settings feature is structurally functional: tabs are persisted in
`proxyConsoleSettingsTab`, each lazy-loads the appropriate data, and mutations
already use the established API client and toast handling. Its visual drift is
caused by a late, page-specific CSS layer that overrides console-shell sizing,
surfaces, table treatment, sidebar rendering, and responsive breakpoints.

At desktop widths, the Settings-only `body:has(#settingsView.is-active)` rules
and its large page-specific layout block create a different canvas and sidebar
appearance than Requests and Routing Policy. The resulting change in workspace
geometry is visible as a jump while navigating to or from Settings.

## Design System Alignment

Settings will use the already-established console language:

- `--bg`, `--surface`, `--line`, `--text`, `--muted`, semantic colors, and
  existing `--sans` / `--mono` typography; no Settings-only palette.
- The existing desktop sidebar and mobile "More settings" drawer without
  local overrides to icons, width, labels, active indicators, or background.
- The same workspace gutter, page heading scale, page subtitle, tab baseline,
  panel radii, shadow strength, control height, and button rhythm used by the
  reference views.
- Existing console SVG icons only; no emoji or additional icon dependency.
- Transitions limited to existing transform/opacity-safe interaction feedback;
  `prefers-reduced-motion` remains respected.

## Shared Settings Shell

The existing Settings title, subtitle, and three tabs remain intact. Their
wrappers will be normalized so every tab renders inside one stable workspace:

```
Settings view
├── standard page heading (same rhythm as Requests / Policy)
├── settings tab navigation (constant height and baseline)
└── active tab content
    └── standard panel or card grid
```

The view retains its current tab roles, `aria-selected` updates, local storage
memory, and lazy data loading. Tab panels remain in the DOM and toggle only
through `hidden`; their switch must not alter the outer workspace width,
sidebar, or header geometry.

## Tab Designs

### Client API Keys

- Keep the existing primary "Create key" button in the panel header.
- Use one Requests-style data area for all states: loading, unavailable,
  empty, and populated table.
- Preserve the current table columns, copy/edit/reset/delete controls, key
  drawer, quota visualization, status badge, and their `data-*` hooks.
- Center the existing empty-state component in a deliberately sized content
  region so adding the first key does not change the surrounding page frame.

### Model Pricing

- Keep the existing search, model fetch/cache action, refresh action,
  pagination, inline override inputs, individual save action, and clear action.
- Present the actions and cached-pricing summary in a Requests-style toolbar.
- Reuse the shared table header and row density; retain numeric alignment,
  `mono` values, overridden-row state, and accessible pagination labels.
- On smaller screens, preserve horizontal table scrolling rather than hiding
  price columns or changing input values.

### Operations & System

- Preserve the existing four logical cards and form endpoints.
- Present the cards in a Policy-style grid with these clear task groups:
  1. Global egress proxy
  2. Concurrency and timeout budget
  3. Configuration version and runtime overlay
  4. Console security
- Each saving form retains its current submit event, form ID, fields, and
  save button. Status-only details remain non-editable key/value rows.
- At desktop widths the grid is balanced; at the established responsive
  breakpoint it becomes one column without changing form field order.

## Functional Safety

No settings data flow changes are permitted:

- `loadClientKeys`, `loadSettingsPricingCatalog`, and Settings lazy loading
  retain their request timing and error paths.
- Client-key copy, edit, reset-usage, and delete actions retain their current
  API calls and confirmation behavior.
- Pricing save/clear/fetch actions retain current endpoint, payload, optimistic
  refresh behavior, and disabled-button state.
- Operations proxy/runtime submits and overlay export/reset retain their
  current forms, endpoints, and notices.
- Existing localized strings are reused. Missing translation keys are not
  introduced by this visual work.

## Implementation Boundaries

Primary sources:

- `dashboard/index.html` — only Settings view wrappers and semantic grouping
  where static markup is required.
- `dashboard_src/src/app.js` — only Settings markup generation when a wrapper
  or class must be attached while preserving existing selectors and hooks.
- `dashboard_src/src/styles.css` — replace the Settings-only override layer
  with a compact, scoped alignment layer built from shared console variables.

The Vite build must synchronize the production assets in `dashboard/`. Source
and generated assets must remain consistent.

## Verification

1. Build the dashboard and run the existing frontend test suite.
2. Verify desktop navigation transitions among Requests, Routing Policy, and
   each Settings tab: no sidebar, workspace-width, or top-offset jump.
3. Verify all three Settings tabs at desktop and 390 px viewport widths.
4. Verify tab selection persists after reload and mobile Settings drawer opens
   and closes normally.
5. Verify representative functional paths without changing data:
   - Open Create Key drawer and close it without saving.
   - Search and paginate pricing catalog; focus override fields without losing
     values on an unrelated refresh.
   - Submit neither form, but verify Operations form controls retain their
     names and disabled/loading visual states.
6. Run a browser console check for new errors and inspect keyboard focus on
   tabs, buttons, inputs, and pagination.

## Acceptance Criteria

- Settings visually shares the same shell, sidebar, typography, surfaces,
  controls, tables, spacing, and responsive behavior as the reference pages.
- Switching to or from Settings no longer causes a visually perceptible shell
  reflow or sidebar/icon change.
- The three tabs remain recognizably distinct and scannable without changing
  any existing Settings field or backend integration.
- Existing frontend tests pass and no new console errors are introduced.
