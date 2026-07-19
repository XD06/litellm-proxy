const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");
const translations = fs.readFileSync(path.join(__dirname, "..", "src", "i18n.js"), "utf8");

function bodyBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source region: ${startMarker}`);
  return source.slice(start, end);
}

const routingPath = bodyBetween("function renderRoutingTrace", "function routingSummaryInline");
const routingSummary = bodyBetween("function renderRoutingSummary", "function renderAttemptExplanation");
const routeOutcomeHelpers = bodyBetween("function routeOutcomeLabel", "function setView");
const requestDetail = bodyBetween("function renderDrawer", "function renderRoutingTrace");
const requestDetailCardStyles = styles.slice(
  styles.indexOf("#detailDrawer .routing-path-shell,"),
  styles.indexOf("#detailDrawer .routing-path-header", styles.indexOf("#detailDrawer .routing-path-shell,")),
);
const requestIssuePanelStyles = styles.slice(
  styles.indexOf("#detailDrawer .request-issue-panel {"),
  styles.indexOf("}", styles.indexOf("#detailDrawer .request-issue-panel {")) + 1,
);
const requestMetadataValueStyles = styles.slice(
  styles.lastIndexOf("#detailDrawer .request-metadata dd"),
  styles.indexOf("}", styles.lastIndexOf("#detailDrawer .request-metadata dd")) + 1,
);

assert.match(source, /import \{ groupRoutingTrace, routingTraceIdentity, routingTraceTone, summarizeFormatTraceStep \}/);
assert.match(routingPath, /groupRoutingTrace\(trace\)/, "raw trace events must be grouped before rendering");
assert.match(routingPath, /summarizeFormatTraceStep\(step, context\)/, "format handling must describe the actual selected conversion");
assert.match(routingPath, /renderRoutingFormatPath\(summary\.sourceFormat/, "the primary path must not list every merely eligible format");
assert.match(routingPath, /<ol class="routing-path"/, "the primary decision path must preserve ordered semantics");
assert.match(routingPath, /<details class="routing-diagnostics">/, "raw diagnostic evidence must remain available on demand");
assert.match(routingPath, /routing-diagnostic-list/, "expanded diagnostics must render the original events");
assert.match(routingPath, /routingDiagnosticHeadline\(event\)/, "raw events must receive a human-readable explanation");
assert.match(routingPath, /routing-diagnostic-internal/, "raw stage and code values must remain available for tracing");
assert.match(routingPath, /<details class="routing-path-technical">/, "technical call identity must be progressively disclosed below the plain-language route summary");
assert.match(routingPath, /routingTraceStepSummary\(step, context\)/, "each route step must lead with a plain-language explanation");
assert.match(routingPath, /event\.owner \?/, "empty owner rows must not be rendered");
assert.doesNotMatch(routingPath, /class="routing-diagnostic-grid"/, "diagnostics must not render empty Candidate / Owner / Details grids");
assert.doesNotMatch(routingPath, /<article class="attempt/, "routing decisions must not reuse large attempt cards");

assert.match(styles, /\.routing-path-step:not\(:last-child\)::after/, "decision steps must expose a visual connector");
assert.match(styles, /\.routing-path-marker/, "decision steps must expose semantic state markers");
assert.match(styles, /\.routing-diagnostics > summary:focus-visible/, "diagnostic disclosure must keep keyboard focus feedback");
assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.routing-path-step-head/, "the path must adapt on narrow screens");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.routing-diagnostics > summary::after/, "disclosure motion must respect reduced-motion preferences");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*#detailDrawer \.routing-path-technical > summary::after/, "technical route disclosure motion must respect reduced-motion preferences");
assert.match(styles, /#detailDrawer \.drawer-body\s*\{[\s\S]*overflow-y:\s*auto/, "the request drawer must remain vertically scrollable");
assert.match(requestDetailCardStyles, /overflow:\s*clip/, "request detail cards must clip decoration without becoming nested scroll containers");
assert.doesNotMatch(requestDetailCardStyles, /overflow:\s*hidden/, "request detail cards must not trap wheel scrolling inside non-scrollable panels");
assert.match(requestIssuePanelStyles, /overflow:\s*clip/, "failure locator panels must not trap wheel scrolling");
assert.doesNotMatch(requestIssuePanelStyles, /overflow:\s*hidden/, "failure locator panels must preserve the drawer wheel chain");
assert.match(styles, /#detailDrawer \.routing-path-technical > summary:focus-visible/, "technical route disclosure must preserve keyboard focus feedback");
assert.match(styles, /#detailDrawer \.routing-path-technical \.chip-list\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/, "expanded routing evidence must wrap within the drawer instead of being clipped");
assert.match(styles, /#detailDrawer \.attempt-table-scroll\s*\{[\s\S]*?overscroll-behavior-y:\s*auto/, "vertical wheel input over the attempts table must continue scrolling the request drawer");
assert.match(requestMetadataValueStyles, /white-space:\s*normal/, "long request metadata must wrap instead of being hidden");
assert.match(requestMetadataValueStyles, /overflow-wrap:\s*anywhere/, "request metadata must remain readable for long paths and user agents");

for (const key of [
  "req.route_path",
  "req.route_format_evaluation",
  "req.route_candidate_filter",
  "req.route_diagnostics",
  "req.routing_summary",
  "req.failure_locator",
  "req.recovery_locator",
  "req.failure_owner",
  "req.failure_evidence",
  "req.no_usage",
]) {
  assert.ok(translations.includes(`"${key}":`), `missing request routing translation: ${key}`);
}
assert.match(routingSummary, /t\("req\.routing_summary"\)/, "routing summary title must follow the active language");
assert.match(routeOutcomeHelpers, /outcome === "direct_success"[\s\S]*return "ok"/, "direct success must use the success tone");
assert.match(routeOutcomeHelpers, /outcome === "recovered"[\s\S]*return "warn"/, "recovered routing must use the warning tone");
assert.match(routeOutcomeHelpers, /outcome === "failed"[\s\S]*return "bad"/, "failed routing must use the danger tone");
assert.match(routeOutcomeHelpers, /outcome === "no_attempts"[\s\S]*return "route-info"/, "no-attempt routing must use a distinct blue information tone");
assert.match(routeOutcomeHelpers, /return "neutral"/, "unknown and legacy routing outcomes must fall back to a neutral tone");
assert.match(source, /request-route-chip tone-\$\{escapeHtml\(routeOutcomeTone\(route\)\)\}[\s\S]*routeOutcomeIcon\(route\)/, "request rows must render the shared route tone and icon");
assert.match(styles, /\.request-route-chip\.tone-ok/, "direct route chips need a green style");
assert.match(styles, /\.request-route-chip\.tone-warn/, "recovered route chips need an amber style");
assert.match(styles, /\.request-route-chip\.tone-bad/, "failed route chips need a red style");
assert.match(styles, /\.request-route-chip\.tone-route-info/, "no-attempt route chips need a blue style");
assert.match(styles, /\.badge\.route-info/, "no-attempt badges need the same blue style in request details");
assert.match(styles, /\.routing-summary-card\.tone-route-info/, "no-attempt routing summaries need the same blue style");
assert.match(styles, /#requestsTable\.table-wrap\s*\{[\s\S]*--request-direct:[\s\S]*--request-recovered:[\s\S]*--request-failed:[\s\S]*--request-no-attempt:/, "request routing colors must remain stable across global themes");
assert.match(styles, /--request-direct:\s*#20ad50;[\s\S]*--request-recovered:\s*#dd7d00;[\s\S]*--request-failed:\s*#e5484d;[\s\S]*--request-no-attempt:\s*#2878c8;/, "request routing colors must use the clear provider-card semantic palette");
assert.match(styles, /#requestsTable \.request-data-table th\s*\{[\s\S]*height:\s*28px;[\s\S]*request-header-surface/, "request table headers must be compact and visually distinct");
assert.match(styles, /--request-row-alt:\s*#ffffff;[\s\S]*tbody tr:nth-child\(even\)[\s\S]*request-row-alt/, "request rows must use clean white surfaces with divider-based separation");
assert.match(styles, /tbody tr:hover,[\s\S]*request-row-hover[\s\S]*request-hover-line/, "request row hover must use a neutral surface and full outline");
assert.match(styles, /\.request-route-chip\s*\{[\s\S]*font-weight:\s*760/, "routing outcome labels must read as semantic fields, not body copy");
assert.match(styles, /\.request-meta-chip\s*\{[\s\S]*font-weight:\s*620/, "request metadata tags need a consistent medium weight");
assert.match(styles, /#detailDrawer \.request-result-stat small\s*\{[\s\S]*font-weight:\s*700/, "request detail field labels must remain visually explicit");
assert.match(requestDetail, /request-detail-route-chip tone-\$\{escapeHtml\(routeTone\)\}/, "request detail must expose the formal routing outcome beside request status");
assert.match(requestDetail, /function requestResultHeadlineMarkup[\s\S]*replace\(\/;\\s\+\/g, "\. "\)/, "request result headlines must not leave a semicolon stranded at the start of a wrapped line");
assert.match(requestDetail, /function renderRequestIssuePanel[\s\S]*summary\?\.owner[\s\S]*failure_owner[\s\S]*diagnostic_stage[\s\S]*upstream_error_summary/, "request failures must surface owner, stage, and upstream evidence from recorded data");
assert.match(requestDetail, /function requestErrorEvidenceSummary[\s\S]*JSON\.parse[\s\S]*payload\?\.error\?\.message/, "structured upstream errors must show their message instead of raw JSON in the failure locator");
assert.match(requestDetail, /outcome === "direct_success"[\s\S]*return ""/, "direct success must stay compact without a redundant failure panel");
assert.match(requestDetail, /recovered \? "warn" : "bad"/, "recovered requests and failed requests must use different issue tones");
assert.match(requestDetail, /usage\.total_tokens <= 0[\s\S]*usage-empty-state/, "zero-usage requests must use a compact empty state");
assert.match(requestDetail, /request-attempts-empty[\s\S]*req\.no_attempts_desc/, "requests without attempts must explain why the attempt table is empty");
assert.match(styles, /#detailDrawer \.request-issue-panel[\s\S]*request-issue-facts[\s\S]*request-issue-evidence[\s\S]*request-issue-action/, "failure locator styling must preserve facts, evidence, and recovery action hierarchy");
assert.match(styles, /#detailDrawer \.request-result-message[\s\S]*border:\s*1px solid/, "routing summaries must use a complete hairline border");
assert.doesNotMatch(styles, /#detailDrawer \.request-result-message\s*\{[^}]*border-left:/, "routing summaries must not use a heavy side stripe");
assert.match(styles, /#detailDrawer \.request-result-message \.keyword[\s\S]*background:\s*transparent/, "request detail prose must not become a field of colored keyword chips");
assert.match(requestDetail, /function requestKeyNumber[\s\S]*index \+ 1/, "zero-based key indexes must render as human-readable Key 1 labels");
assert.match(requestDetail, /attempt-key-meta[\s\S]*keyNumber/, "attempt rows must show the human-readable key position next to the masked key");

console.log("request routing path tests passed");
