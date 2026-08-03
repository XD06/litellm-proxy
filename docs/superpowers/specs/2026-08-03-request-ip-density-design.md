# Request Log IP and Format Density

## Scope

Adjust only the desktop overview health card and request-log presentation. Preserve all request fields, filters, endpoints, pagination, row actions, and detail data.

## Design

- Keep the overview health card aligned with the traffic chart. Fit nine provider rows and the remaining-provider button by reducing vertical gaps and bottom padding, without increasing the grid-row height.
- Move `client_ip` out of the model metadata line into a dedicated compact `Client IP` table column. Keep the raw value and existing filter unchanged; expose the full value and `client_ip_source` through the tooltip.
- Keep ordinary request-format badges unchanged.
- For converted requests, render only an `arrow-right-left` conversion icon followed by the final upstream format. Keep the full source-to-final mapping in the tooltip and accessible label.
- Rebalance desktop column widths within the existing table width so the new IP column does not widen the page or reduce row density.

## Verification

- Source-level layout tests cover the IP column, conversion output, fields, endpoint contract, and compact desktop sizing.
- Build the production dashboard and inspect overview and request pages at desktop width for overflow, clipping, and console errors.
