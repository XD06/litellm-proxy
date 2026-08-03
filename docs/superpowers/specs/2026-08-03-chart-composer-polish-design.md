# Chart And Composer Polish Design

## Goal

Improve the overview trend chart and reduce the desktop playground composer footprint without changing data fields, request parameters, event handlers, or backend interfaces.

## Chart

- Close the average-latency and estimated-cost curves to the plot baseline.
- Render restrained amber/gold gradients beneath those secondary series.
- Keep all areas below their lines and point markers.
- Add right-side latency scale labels so the secondary axis is understandable.
- Soften grid and axis contrast while retaining the existing semantic series colors.

## Playground Composer

- Center the desktop composer at 88% of its panel, capped at 860px.
- Reduce its textarea minimum height to 40px and maximum expanded height to 96px.
- Reduce padding, internal gap, and icon actions proportionally.
- Preserve the existing full-width responsive behavior below the desktop breakpoint.

## Loading State Cleanup

- Keep one `#authChecking` flow and the approved compact loading style.
- Remove the stylesheet import from the JavaScript entry so the bundle cannot inject a second CSS copy.
- Copy the canonical source stylesheet to `dashboard/styles.css` during every production build.
- Use one shared cache version for the stylesheet and bundle.

## Verification

- Add regression coverage for SVG area paths, gradients, composer geometry, and single-source CSS delivery.
- Run focused frontend tests, the complete frontend suite, a production build, and browser checks before visual handoff.
