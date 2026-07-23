# Client identity, conversion diagnostics, and dashboard state design

## Scope

This change fixes four related operational gaps without changing routing
selection or format-conversion semantics:

1. Preserve the original client IP behind a local reverse proxy and
   Cloudflare.
2. Persist safe, detailed conversion failures as an exportable artifact.
3. Prevent the dashboard from rendering an empty-provider onboarding state
   before configuration has loaded.
4. Make compatibility-circuit state and clearing actions easier to identify.

## Client identity

Forwarded headers are accepted only when the direct socket peer belongs to a
configured trusted proxy CIDR. For trusted peers, `CF-Connecting-IP` is checked
before generic forwarding chains when it is an allowed header. This avoids
selecting a Cloudflare edge address appended by nginx to
`X-Forwarded-For`. Invalid values fall through to the next allowed header and
ultimately to the direct peer.

The default allowed-header order includes `cf-connecting-ip` first, followed by
`forwarded`, `x-forwarded-for`, and `x-real-ip`. Trusting proxy CIDRs remains an
explicit deployment choice. Existing explicit header lists keep their declared
order.

## Conversion diagnostics

A bounded `ConversionDiagnosticStore` writes newline-delimited JSON under the
configured server log directory. It records failures from request conversion,
response conversion, and stream conversion with:

- timestamp and request ID;
- conversion stage and source/target formats;
- client and upstream model, provider, attempt number, and masked key identity;
- structured conversion error code, field, message, and details;
- recursively sanitized and size-limited request/response context.

Authorization, cookies, API-key-shaped values, proxy credentials, and known
secret fields are redacted before enqueueing. Records are written by a bounded
background queue so disk I/O cannot block a proxy response. Files rotate by
size and retention count. Queue overflow increments a dropped counter rather
than increasing request latency or memory without bound.

Admin endpoints expose status, a downloadable JSONL export, and clear. The
dashboard places download and clear actions in the existing advanced
diagnostics area. Clearing requires the existing confirmation pattern.

## Dashboard loading state

Static administration data has an explicit lifecycle: `idle`, `loading`,
`ready`, or `error`. The onboarding banner is eligible only in `ready` state
after a successful config response proves that no configured provider has a
usable key. During initial authentication and refresh, the last confirmed
configuration remains visible; on the first load, a neutral loading placeholder
is shown instead of the onboarding message.

Partial refresh failures retain the last confirmed configuration and do not
reinterpret missing data as an empty configuration.

## Compatibility circuits

The provider card keeps the amber `compatibility degraded` state. Opening that
provider exposes a compact warning section containing the affected model map,
format/profile, key identity, failure count, and recovery countdown. The clear
button uses an explicit warning treatment, clear label, and busy state.

A global clear action is added beside the compatibility-circuit summary in the
routing/health administration surface. Provider-level and global actions use
the existing endpoints and force a runtime refresh after success. Destructive
actions use confirmation and report how many circuits were removed.

## Failure handling

- Untrusted forwarding headers never replace the peer IP.
- Diagnostic persistence failures never fail or delay the client request.
- Export and clear endpoints require admin authentication.
- A failed dashboard refresh preserves confirmed content and displays the
  connection failure separately.
- Repeated clear clicks are deduplicated by the existing action registry.

## Verification

Regression tests cover Cloudflare header precedence and spoof rejection,
diagnostic redaction/rotation/overflow and admin endpoints, initial dashboard
loading behavior, and compatibility-clear rendering/action refresh. Focused
backend and frontend suites run before the full backend suite and production
dashboard build.
