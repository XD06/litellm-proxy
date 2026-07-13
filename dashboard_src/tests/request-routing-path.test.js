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

assert.match(source, /import \{ groupRoutingTrace, routingTraceIdentity, routingTraceTone, summarizeFormatTraceStep \}/);
assert.match(routingPath, /groupRoutingTrace\(trace\)/, "raw trace events must be grouped before rendering");
assert.match(routingPath, /summarizeFormatTraceStep\(step, context\)/, "format handling must describe the actual selected conversion");
assert.match(routingPath, /renderRoutingFormatPath\(summary\.sourceFormat/, "the primary path must not list every merely eligible format");
assert.match(routingPath, /<ol class="routing-path"/, "the primary decision path must preserve ordered semantics");
assert.match(routingPath, /<details class="routing-diagnostics">/, "raw diagnostic evidence must remain available on demand");
assert.match(routingPath, /routing-diagnostic-list/, "expanded diagnostics must render the original events");
assert.match(routingPath, /routingDiagnosticHeadline\(event\)/, "raw events must receive a human-readable explanation");
assert.match(routingPath, /routing-diagnostic-internal/, "raw stage and code values must remain available for tracing");
assert.match(routingPath, /event\.owner \?/, "empty owner rows must not be rendered");
assert.doesNotMatch(routingPath, /class="routing-diagnostic-grid"/, "diagnostics must not render empty Candidate / Owner / Details grids");
assert.doesNotMatch(routingPath, /<article class="attempt/, "routing decisions must not reuse large attempt cards");

assert.match(styles, /\.routing-path-step:not\(:last-child\)::after/, "decision steps must expose a visual connector");
assert.match(styles, /\.routing-path-marker/, "decision steps must expose semantic state markers");
assert.match(styles, /\.routing-diagnostics > summary:focus-visible/, "diagnostic disclosure must keep keyboard focus feedback");
assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.routing-path-step-head/, "the path must adapt on narrow screens");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.routing-diagnostics > summary::after/, "disclosure motion must respect reduced-motion preferences");

for (const key of [
  "req.route_path",
  "req.route_format_evaluation",
  "req.route_candidate_filter",
  "req.route_diagnostics",
  "req.routing_summary",
]) {
  assert.ok(translations.includes(`"${key}":`), `missing request routing translation: ${key}`);
}
assert.match(routingSummary, /t\("req\.routing_summary"\)/, "routing summary title must follow the active language");

console.log("request routing path tests passed");
