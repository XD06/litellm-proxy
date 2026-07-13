const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");

function bodyBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source region: ${startMarker}`);
  return source.slice(start, end);
}

const trafficRenderer = bodyBetween("function renderTrafficChart", "function niceChartMax");
const comboRenderer = bodyBetween("function renderTrafficComboChart", "function renderUsageChart");

assert.doesNotMatch(
  trafficRenderer,
  /usage-trend-overview/,
  "traffic metrics must not render as a detached KPI card grid",
);
assert.match(trafficRenderer, /summary:\s*\{/, "traffic totals must be passed into the chart workspace");
assert.match(comboRenderer, /traffic-workspace-header/, "the chart must own one integrated header");
assert.match(comboRenderer, /traffic-workspace-metrics/, "the integrated header must expose compact metrics");
assert.match(comboRenderer, /traffic-success-line/, "request success must render as a readable trend line");
assert.match(comboRenderer, /traffic-failure-line/, "request failures must render as a separate trend line");
assert.match(comboRenderer, /data-traffic-bucket/, "time buckets must expose inspection targets");
assert.match(comboRenderer, /tabindex="0"/, "time buckets must be keyboard reachable");
assert.match(comboRenderer, /<svg[^>]+role="group"/, "the SVG must expose its interactive bucket descendants");
assert.match(comboRenderer, /const inspectableBuckets = enriched\.filter/, "empty buckets must not flood keyboard navigation");
assert.match(comboRenderer, /<g aria-hidden="true">/, "visual chart marks must not duplicate accessible bucket labels");
assert.match(comboRenderer, /traffic-inspection-tooltip/, "the workspace must provide one exact-value tooltip");
assert.match(comboRenderer, /aria-live="polite"/, "inspection values must be announced without stealing focus");
assert.match(trafficRenderer, /bindTrafficChartInspection\(target\)/, "the rendered chart must bind pointer and focus inspection");
assert.match(trafficRenderer, /traffic-workspace-empty/, "empty traffic data must render an explicit workspace state");

console.log("traffic workspace tests passed");
