# Request Routing Decision Visualization

## Goal

Make request routing understandable at a glance without removing the diagnostic evidence needed to investigate routing, format conversion, key selection, cooldown, and upstream failures.

## Information hierarchy

1. Keep the existing routing summary as the result-oriented overview.
2. Replace the repeated raw-event cards with one compact decision path.
3. Collapse repeated `format_compatibility` events into one format-evaluation step that lists the eligible formats.
4. Show provider, masked key, upstream model, and upstream format together for routing and upstream-result steps.
5. Put owner, fidelity, compatibility profile, cooldown, and state-action metadata in a native disclosure labelled as diagnostic detail.

## Visual behavior

- Render the main path as a vertical sequence with semantic state markers: completed, selected/success, warning/failure, and neutral evaluation.
- Use short translated stage and result labels instead of raw internal codes in the default view.
- Preserve raw stage/code values in the expanded diagnostic detail.
- Keep the component compact inside the existing request drawer and adapt to narrow screens without horizontal scrolling.
- Avoid animation beyond a short state reveal; respect `prefers-reduced-motion`.

## Data and safety

- The frontend consumes the existing `routing_trace` array; no backend schema or routing behavior changes.
- Group only adjacent format-compatibility events so event order remains truthful.
- Never unmask keys or expose data not already present in the request record.
- Unknown stages and codes fall back to their raw values instead of disappearing.

## Verification

- Unit-test trace grouping, stage labels, outcome tones, and fallback behavior.
- Assert the request detail renderer uses the compact path and retains an expandable diagnostic section.
- Build the production dashboard and verify direct-success, recovered, failed, and no-attempt records in the live drawer.
