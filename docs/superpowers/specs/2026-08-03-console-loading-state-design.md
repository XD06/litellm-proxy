# Console Loading State Design

## Goal

Improve the perceived quality of the console access-checking screen without changing authentication behavior, text fields, DOM identifiers, or backend interfaces.

## Approved Direction

Use a compact operational loading card that matches the existing console's restrained monochrome visual language. Keep the current LP mark, console title, access-checking message, and indeterminate progress state.

## Layout And Styling

- Place the LP mark and text in a compact two-column header instead of stacking them vertically.
- Use the established `1rem` outer radius and system typography.
- Keep the page background quiet and neutral, with card elevation providing the only depth cue.
- Add a small pulsing status dot to clarify that access checking is active.
- Refine the progress track and movement without adding new visible labels or decorative graphics.

## Motion And Accessibility

- Use a short entrance transition and smooth transform-based progress movement.
- Preserve `role="status"` and `aria-live="polite"`.
- Replace spatial movement with a restrained opacity pulse when reduced motion is requested.

## Compatibility

- Preserve `#authChecking`, `#authCheckingText`, `#loginGate`, and `#app`.
- Do not change authentication JavaScript or any request path.
- Limit styling to `.auth-checking` descendants so the admin-key login form remains unchanged.
- Verify desktop and narrow viewport geometry, frontend tests, production build, and the full Python test suite.
