# Observability Chart and Provider Config Redesign

Date: 2026-07-13

## Context

The Overview traffic chart currently splits attention across nested containers,
detached KPI cards, a large legend, a mode switch, dual axes, and a sparse SVG
plot. The data is correct, but the visual hierarchy reads as a collection of
widgets rather than a coherent observability workspace.

The provider Config tab has a related information architecture problem. It
combines connection fields, runtime settings, health-probe controls, key
management, format management, and provider deletion inside one long drawer.
Keys already have a dedicated provider tab, while formats belong with routing
capability. Repeating them in Config creates duplicate paths and makes the
primary provider settings difficult to scan.

## Design Read

This is an existing B2B operations console for technical operators. The
redesign is a targeted structural evolution with a restrained, high-density
observability language. It keeps the current light theme, native JavaScript
stack, navigation, data sources, API contracts, and interaction semantics.

Design dials:

- Design variance: 4 out of 10. Familiar product structure with deliberate
  hierarchy, not marketing-page composition.
- Motion intensity: 3 out of 10. State feedback only, with no decorative chart
  animation.
- Visual density: 8 out of 10. Compact operator-focused information using
  spacing and dividers instead of nested cards.

## Goals

- Turn the traffic chart into one readable data workspace.
- Make exact values discoverable without adding visual noise.
- Make the Config tab scannable in one short drawer viewport.
- Remove duplicate key and format management paths from Config.
- Preserve all existing provider settings, Admin API calls, optimistic updates,
  focus behavior, and failure recovery.
- Preserve current dashboard rendering performance and refresh behavior.

## Non-goals

- Do not replace the native JavaScript Dashboard with React or import a large
  third-party design system.
- Do not change routing, health, cooldown, model discovery, or persistence
  behavior.
- Do not rename provider form fields, data attributes, Admin API routes, tabs,
  or navigation destinations.
- Do not redesign unrelated Overview panels or provider tabs.
- Do not add new backend chart aggregation or provider configuration fields.

## Traffic Workspace

### Header and metrics

The chart becomes a single bordered workspace with one header row. The left
side contains the chart title and data resolution. Request count, success,
failure, and average latency appear as compact metrics in the same row using
tabular figures and sparse vertical dividers. The existing Requests and Usage
mode switch remains on the right as a compact segmented control.

The separate legend block is reduced to an inline legend immediately above the
plot. Success, failure, and latency remain explicitly named so color is not the
only differentiator.

### Plot

The request mode retains stacked success/failure bars and the latency line, but
uses a denser bar rhythm, a restrained amber latency stroke, low-contrast
horizontal grid lines, and clearer axis unit labels. Empty time buckets remain
visible as empty positions so time continuity is preserved.

The usage mode retains the current token series and cost/usage semantics. It
uses the same header, plot bounds, axis rhythm, and tooltip component so mode
switching does not visually replace the whole component.

### Inspection and accessibility

Pointer and keyboard focus on a time bucket reveal a shared inspection tooltip
with bucket time, total requests, successes, failures, and average latency. A
vertical guide and focused data marker connect the tooltip to the bucket.

The SVG keeps an accessible chart summary. Interactive buckets are reachable
by keyboard, expose meaningful labels, and do not rely on hover. The chart also
retains visible textual totals outside the SVG. Reduced-motion users receive
the complete chart without entrance animation.

### Responsive behavior

At narrower widths the metric row wraps into two compact rows, the mode switch
remains reachable, axis ticks are sampled, and the plot height decreases. The
chart never creates horizontal page scrolling. The drawer layout continues to
take precedence when open.

## Provider Config Inspector

### Information ownership

The Config tab contains only settings that describe the provider itself:

1. Connection: Base URL, proxy, and User-Agent.
2. Runtime: configured priority and enabled state.
3. Health probes: skip-idle and skip-patrol controls with explanatory text.
4. Danger zone: provider deletion, visually separated at the end.

Key creation, editing, deletion, and proxy metadata remain in the Keys tab.
Format enablement and upstream paths move to Routing, which already owns route
behavior. No backend endpoint or data structure changes.

### Form structure

Config uses an inspector layout rather than nested cards. Each section has a
short title and one explanatory line, followed by a two-column label/control
grid. Labels occupy a stable narrow column and controls use the remaining
width. Section boundaries use one divider and spacing tier instead of another
container background.

Runtime and health booleans are rendered as full setting rows with a title,
plain-language description, and one native checkbox-backed switch. The label
and switch share one hit target. Priority remains a number input so keyboard,
paste, and form serialization behavior stay unchanged.

### Action model

The existing provider form remains the single submission boundary. A sticky
drawer footer contains the primary Save Configuration action and a Reset
action that restores the latest effective config. The footer reports
whether values are unchanged, modified, saving, saved, or restored after an
error. The existing optimistic mutation store remains authoritative for
pending, confirmation, and rollback behavior.

Skip-probe controls retain their existing immediate optimistic endpoints. Their
visual location changes, but data attributes and event binding stay intact.
Provider deletion remains confirmation-gated and outside the normal form.

### Drawer behavior

The Config content scrolls beneath the sticky action footer, with enough bottom
padding that no field or danger action is obscured. Existing drawer tabs,
close behavior, selected provider state, and auto-refresh preservation remain
unchanged.

## Visual System

- Continue using the current semantic tokens and light theme.
- Use one 6px control radius and a 6-8px section/container radius.
- Remove decorative wide shadows from the chart and Config sections.
- Use neutral surfaces and dividers for hierarchy.
- Reserve cobalt blue for selection, focus, and primary actions.
- Reserve green, red, and amber for success, failure, and latency semantics.
- Use tabular figures for metrics, axes, and tooltip values.
- Use 4px and 8px spacing increments, with 16px section padding.
- Keep transitions within 150-220ms and list explicit transformed properties.

## Preservation Constraints

- Keep `renderTrafficChart()` data inputs and mode state unchanged.
- Keep all provider form `name` values and `data-*` contracts unchanged.
- Keep `runConfigMutation()`, `runOptimisticConfigAction()`, and resource keys
  unchanged unless a test demonstrates a required adapter.
- Keep Keys and Formats rendering functions intact and reuse them in their new
  owner tabs.
- Do not modify backend files for this redesign.
- Do not overwrite or revert unrelated uncommitted routing work.

## Error and Empty States

- A chart with no buckets shows a compact explanatory empty state instead of
  an empty grid.
- A chart load error retains the surrounding workspace and exposes the existing
  refresh/retry path.
- Provider validation errors remain associated with their fields and focus the
  first invalid control.
- A failed save restores submitted values and focus through the existing
  optimistic rollback system.
- Busy state remains visible across drawer re-renders and auto-refresh.

## Testing Strategy

### Pure and DOM-oriented tests

- Chart bucket inspection exposes exact values and accessible text.
- Empty chart data produces an explicit empty state.
- Requests and Usage modes preserve their current data mappings.
- Config renders Connection, Runtime, and Health Probes without rendering Keys
  or Formats.
- Routing renders the provider format controls previously duplicated in Config.
- Existing provider form names and mutation resource keys remain unchanged.

### Browser verification

- Verify Overview and provider drawer at 1495x694, 1024x768, and 375x812.
- Verify keyboard access to mode controls, chart buckets, switches, save, reset,
  tabs, and provider deletion.
- Verify visible focus, long provider URLs, long provider names, empty data, and
  busy/error states.
- Verify reduced-motion behavior and no horizontal overflow.

### Regression

- Run all Dashboard Node tests.
- Run the Vite production build and syntax-check the built bundle.
- Run the complete Python test suite because the working tree also contains
  routing changes that must remain intact.

## Acceptance Criteria

- The chart reads as one coherent observability workspace at first glance.
- Exact bucket values are available by pointer and keyboard.
- The Config tab shows only provider-level settings and fits its normal content
  within a short, clearly structured scroll region.
- Keys remain fully functional in Keys and formats remain fully functional in
  Routing.
- Provider save, hot priority, probe toggles, optimistic feedback, rollback,
  and deletion behavior are unchanged.
- No unrelated view or backend behavior regresses.
