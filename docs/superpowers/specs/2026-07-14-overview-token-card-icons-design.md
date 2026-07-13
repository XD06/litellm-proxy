# Overview Token Card and Icon Contrast

## Goal

Improve the four overview metric cards without changing their position, size, spacing, or surrounding layout.

## Metric Change

Replace the first card's request count with token usage for the currently selected overview time range.

- Label: localized `Total tokens` / `Token 总量`.
- Value: `fmtTokenCount(currentUsageTotal(counters).total_tokens)`.
- Detail: localized input and output token totals, separated by a centered dot.
- Exact values remain available through the existing native title tooltip pattern.
- Icon: the existing `boxes` glyph, representing a measured token volume rather than request activity.

No backend endpoint or counter schema changes are required. The overview already calculates the same window-scoped usage for the traffic workspace and usage metrics.

## Icon Direction

Use the approved soft semantic-color treatment (option A):

- Total tokens: compatibility purple.
- Success rate: success green.
- First-byte latency: information blue, with existing warning or danger tones retained when latency crosses current thresholds.
- Available keys: teal/green for healthy state, with existing warning or danger tones retained for degraded state.

Each icon container keeps the current 28 px footprint and 9 px radius. Contrast increases through a tinted background, semantic border, darker foreground, and a 15 px glyph. Card geometry remains unchanged.

## Data and Rendering

`renderOverviewVisuals()` continues to derive all four cards from the current in-memory metrics snapshot. The token card uses the existing `currentUsageTotal()` fallback semantics, so it remains compatible with both timeseries usage and legacy aggregate counters.

`overviewMetricCard()` exposes the semantic tone on the icon container so the shared CSS can style every card consistently. The card's status dot and top accent keep using the same tone.

## Empty and Responsive States

- Missing usage renders `0`, using the existing token formatter.
- Input and output both render as `0` when absent.
- Long localized detail text remains clipped by the existing single-line metric subtitle behavior.
- Existing responsive breakpoints, card order, widths, and heights remain unchanged.

## Verification

- Add a frontend structure test asserting that the first overview card uses total, input, and output token usage instead of request count.
- Assert that metric icons receive semantic tone classes.
- Run the complete frontend test suite and production build.
- Run the complete Python suite because the workspace currently includes uncommitted routing fixes that must remain regression-free.
