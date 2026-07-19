const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");
const translations = fs.readFileSync(path.join(__dirname, "..", "src", "i18n.js"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(__dirname, "..", "..", "dashboard", "index.html"), "utf8");

function bodyBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source region: ${startMarker}`);
  return source.slice(start, end);
}

const trafficRenderer = bodyBetween("function renderTrafficChart", "function niceChartMax");
const comboRenderer = bodyBetween("function renderTrafficComboChart", "function renderUsageChart");
const overviewRenderer = bodyBetween("function renderOverviewVisuals", "function overviewMetricCard");
const overviewCardRenderer = bodyBetween("function overviewMetricCard", "function metricDot");
const healthRenderer = bodyBetween("function renderHealthOverview", "function enabledFormats");

assert.doesNotMatch(
  trafficRenderer,
  /usage-trend-overview/,
  "traffic metrics must not render as a detached KPI card grid",
);
assert.match(trafficRenderer, /summary:\s*\{/, "traffic totals must be passed into the chart workspace");
assert.match(comboRenderer, /traffic-workspace-header/, "the chart must own one integrated header");
assert.match(comboRenderer, /traffic-workspace-metrics/, "the integrated header must expose compact metrics");
assert.match(comboRenderer, /traffic-workspace-metric-icon/, "traffic metrics must expose semantic icon wrappers");
assert.match(comboRenderer, /iconSvg\(metric\.icon\)/, "traffic metric icons must use the shared icon system");
assert.match(comboRenderer, /tone-compat/, "token metrics must retain the usage statistics compatibility tone");
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
assert.match(overviewRenderer, /currentUsageTotal\(counters\)/, "overview cards must use window-scoped token usage");
assert.match(overviewRenderer, /t\("traffic\.total_tokens"\)/, "the first overview card must be total tokens");
assert.match(overviewRenderer, /usage\.total_tokens/, "the token card must render total token usage");
assert.match(overviewRenderer, /usage\.input_tokens/, "the token card must expose input token usage");
assert.match(overviewRenderer, /usage\.output_tokens/, "the token card must expose output token usage");
assert.doesNotMatch(overviewRenderer, /overviewMetricCard\(t\("metric\.requests"\)/, "request count must not remain the first overview card");
assert.match(overviewCardRenderer, /metric-icon tone-/, "overview card icons must expose their semantic tone");
assert.match(styles, /#overviewView \.visual-card \.metric-icon\.tone-compat/, "token icons must use the approved purple treatment");
assert.match(styles, /#overviewView \.visual-card \.metric-icon\.tone-success/, "healthy metric icons must use the approved green treatment");
assert.match(styles, /#overviewView \.visual-card \.metric-icon\.tone-info/, "informational metric icons must use the approved blue treatment");
assert.match(styles, /#overviewView \.visual-card \.metric-icon\.tone-warning/, "warning metric icons must remain distinct");
assert.match(styles, /#overviewView \.visual-card \.metric-icon\.tone-danger/, "danger metric icons must remain distinct");
assert.doesNotMatch(overviewRenderer, /const failureRate =/, "key availability color must not depend on request failures");
assert.match(dashboardHtml, /data-i18n="health\.title"/, "failover health title must follow the active language");
assert.match(dashboardHtml, /data-i18n="health\.subtitle"/, "failover health description must follow the active language");
assert.match(healthRenderer, /t\("health\.grade\." \+ overallGrade\)/, "overall health grade must be translated");
assert.match(healthRenderer, /t\("health\.providers_count"/, "provider count must be translated");
assert.match(healthRenderer, /t\("health\.more_providers"/, "hidden provider count must be translated");
assert.match(translations, /"health\.grade\.excellent"\s*:\s*\{\s*en:\s*"Excellent",\s*zh:\s*"优秀"/, "excellent grade needs Chinese and English copy");
assert.match(translations, /"traffic\.requests_per_minute"\s*:\s*\{\s*en:\s*"Unit: requests\/min",\s*zh:\s*"单位：请求\/分钟"/, "request chart unit must be explicit");
assert.match(styles, /\.traffic-success-legend i,[\s\S]{0,120}width:\s*18px/, "request legends must use visible line swatches");
assert.match(styles, /\.traffic-failure-legend i\s*\{[\s\S]{0,120}border-top:\s*2px dashed/, "failure legend must mirror the dashed chart line");
assert.match(styles, /\.traffic-latency-legend i\s*\{[\s\S]{0,120}border-top:\s*2px solid/, "latency legend must mirror the solid chart line");

console.log("traffic workspace tests passed");
