import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.js"), "utf8");
const state = fs.readFileSync(path.join(root, "src", "state.js"), "utf8");
const constants = fs.readFileSync(path.join(root, "src", "constants.js"), "utf8");
const modelIcons = fs.readFileSync(path.join(root, "src", "model-brand-icons.js"), "utf8");
const index = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

function between(start, end) {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source region: ${start}`);
  return app.slice(startIndex, endIndex);
}

const requests = between("function renderRequestsTable", "function requestTone");
const modelUsage = between("function renderModelUsage", "function dominantCostStatus");
const usageStatisticsLoader = between("async function loadUsageStatistics", "function populateUsageStatisticsDimensions");
const usageStatisticsChart = between("function renderUsageStatisticsChart", "function usageStatisticsBreakdownMetric");
const usageStatisticsBreakdown = between("function renderUsageStatisticsBreakdown", "function renderConfig");
const attempts = between("function renderAttemptsTable", "function renderRequestMetadata");

assert.match(requests, /<caption class="sr-only">/, "request table needs an accessible caption");
assert.match(requests, /<th scope="col"/, "request headers need column scope");
assert.match(requests, /data-request-open=/, "request rows need a real open button");
assert.doesNotMatch(requests, /<tr[^>]+tabindex=/, "request table rows must not impersonate buttons");
assert.match(requests, /request-model-mark[\s\S]*modelBrandIconMarkup\(r\.model/, "request identity must use the shared model icon registry");
assert.doesNotMatch(requests, /request-status-mark/, "request identity must not duplicate the separate result status icon");
assert.doesNotMatch(requests, /request-model-mark tone-/, "model identity must keep its native brand color instead of inheriting request status color");

assert.match(modelUsage, /<caption class="sr-only">/, "model table needs an accessible caption");
assert.match(modelUsage, /<th scope="col"/, "model table headers need column scope");
assert.match(modelUsage, /data-model-usage-open=/, "model rows need a real open button");
assert.doesNotMatch(modelUsage, /<tr[^>]+tabindex=/, "model table rows must not impersonate buttons");
assert.match(app, /limit: String\(MODEL_USAGE_PAGE_SIZE\)/, "model usage must request a bounded page instead of silently truncating at 200 rows");
assert.match(app, /offset: String\(Math\.max\(0, Number\(state\.modelUsagePage \|\| 0\)\) \* MODEL_USAGE_PAGE_SIZE\)/, "model usage pagination must send the selected model-page offset");
assert.match(app, /function modelUsagePagination[\s\S]*data-model-usage-page/, "model usage needs visible previous and next page controls");
assert.match(modelUsage, /modelUsagePagination\(payload\)/, "model pagination must render with the aggregated model rows");
assert.match(modelUsage, /current_support[\s\S]*model-usage-support/, "each client-model row must show its aggregated current provider support");
assert.match(modelUsage, /modelBrandIconMarkup\(item\.client_model/, "model rows must expose a recognizable model icon");
assert.match(modelUsage, /model_usage\.col_calls[\s\S]*model_usage\.col_success/, "calls and success rate need separate table headers");
assert.match(modelUsage, /model-usage-calls[\s\S]*model-usage-success/, "calls and success rate need separate fixed table cells");
assert.doesNotMatch(modelUsage, /model-call-stat/, "call count and success rate must not share a content-width flex wrapper");
assert.match(state, /modelUsagePage:\s*0/, "model pagination needs explicit state");
assert.match(constants, /MODEL_USAGE_PAGE_SIZE\s*=\s*10/, "model usage page size must remain intentionally bounded");
assert.match(constants, /USAGE_STATISTICS_BREAKDOWN_PAGE_SIZE\s*=\s*6/, "lifetime breakdown must remain intentionally bounded");

for (const endpoint of ["summary", "timeseries", "breakdown", "dimensions"]) {
  assert.match(usageStatisticsLoader, new RegExp(`usage-statistics/${endpoint}`), `usage statistics must load ${endpoint}`);
}
assert.match(usageStatisticsLoader, /Promise\.allSettled/, "independent statistics panels must degrade without blanking the whole page");
assert.match(usageStatisticsLoader, /usageStatisticsLoadSeq/, "stale statistics responses must not overwrite newer filters");
assert.match(app, /usage-statistics\/clear[\s\S]*clear_usage_statistics/, "permanent statistics clearing must use the backend confirmation contract");
assert.match(app, /_lastPricingFetchedAt/, "pricing enrichment must expire so newly cached prices become visible");
assert.match(app, /MODEL_PRICING_BATCH_SIZE/, "pricing enrichment must support bounded batches instead of silently dropping models");
assert.match(app, /pricingFetchSequence/, "stale pricing responses must not overwrite a newer model pricing set");
assert.match(usageStatisticsChart, /role="img" aria-label=/, "statistics charts need an accessible summary");
assert.match(usageStatisticsChart, /data-tip=/, "statistics points need inspectable evidence");
assert.match(usageStatisticsChart, /usage-statistics-fill-\$\{seriesIndex\}/, "each chart series needs its own gradient fill id");
assert.doesNotMatch(usageStatisticsChart, /seriesIndex === 0 && path/, "area fills must not be limited to the first series");
assert.match(usageStatisticsChart, /seriesAreas[\s\S]*seriesLines/, "chart areas should paint under series lines");
assert.match(usageStatisticsBreakdown, /providerBrandIconMarkup/, "provider breakdowns must use provider identity icons");
assert.match(usageStatisticsBreakdown, /modelBrandIconMarkup/, "model breakdowns must use model identity icons");
assert.match(state, /usageStatisticsRange:\s*"all"/, "lifetime statistics should open on the complete retained aggregate");
assert.match(state, /usageStatisticsFilters:\s*\{[\s\S]*model:[\s\S]*provider:[\s\S]*client_format:/, "statistics filters need explicit stable state");

assert.match(attempts, /<th scope="col"/, "attempt table headers need column scope");
assert.match(app, /role="img" aria-label=.*token/, "token composition needs accessible text");
for (const state of ["priced", "estimated", "pending", "unpriced", "legacy"]) {
  assert.match(app, new RegExp(`${state}: t\\("cost\\.${state}"\\)`), `missing ${state} cost state`);
}

assert.match(index, /data-model-usage-range="7d" aria-pressed="true"/, "active range needs aria-pressed");
assert.match(index, /id="modelUsageTable"[^>]+aria-busy="false"/, "model usage loading state needs aria-busy");
assert.match(index, /class="model-usage-workspace"[\s\S]*id="modelUsageSummary"[\s\S]*id="modelUsageTable"/, "model controls and data must share one inset workspace boundary");
assert.match(index, /data-i18n="cfg\.tab_data_statistics"/, "model data must live under the data statistics top-level tab");
assert.match(index, /id="statisticsViewTabs"[\s\S]*data-statistics-view="usage"[\s\S]*data-statistics-view="models"/, "statistics needs clear usage and model subviews");
assert.match(index, /id="usageStatisticsRange"[\s\S]*data-usage-statistics-range="today"[\s\S]*data-usage-statistics-range="custom"/, "statistics needs complete time range controls");
assert.match(index, /id="usageStatisticsMetric"[\s\S]*data-usage-statistics-metric="tokens"[\s\S]*data-usage-statistics-metric="latency"/, "statistics needs all four metric modes");
assert.match(index, /id="usageStatisticsSummary"[^>]+aria-busy="false"/, "statistics summary needs an exposed loading state");
assert.match(index, /id="usageStatisticsChart"[^>]+aria-busy="false"/, "statistics chart needs an exposed loading state");
assert.match(index, /id="usageStatisticsBreakdown"[^>]+aria-busy="false"/, "statistics breakdown needs an exposed loading state");
assert.match(index, /id="usageStatisticsClear"/, "permanent statistics need an intentionally hidden management action");
assert.match(index, /id="healthMonitorStatus"[^>]+aria-live="polite"/, "health status needs aria-live");
assert.match(index, /class="skip-link" href="#mainContent"/, "dashboard needs a skip link");
assert.match(index, /\.skip-link \{[^}]*transform: translateY\(-200%\)/, "skip link must be hidden before the external stylesheet loads");
assert.match(index, /<main id="mainContent"[^>]+tabindex="-1"/, "skip link target must be focusable");
assert.match(index, /id="hmPatrolMin" value="21600"/, "patrol minimum should default to 6 hours");
assert.match(index, /id="hmPatrolMax" value="43200"/, "patrol maximum should default to 12 hours");
assert.match(app, /patrol_interval_min_s \?\? 21600/, "runtime patrol minimum must match markup");
assert.match(app, /patrol_interval_max_s \?\? 43200/, "runtime patrol maximum must match markup");

assert.match(styles, /\.request-row-open-button:focus-visible/, "open buttons need visible keyboard focus");
assert.match(styles, /#requestsTable \.request-model-mark\s*\{[\s\S]*?place-items:\s*center/, "request model icons need a stable aligned marker");
assert.match(styles, /#requestsTable \.request-model-mark \.model-brand-mark\s*\{[\s\S]*?border:\s*0/, "request model icons must not render a nested double border");
assert.match(styles, /font-variant-numeric: tabular-nums/, "data tables need stable numeric columns");
assert.match(i18n, /"req\.table_label"[^\n]+zh:/, "request table copy must be bilingual");
assert.match(i18n, /"model_usage\.table_label"[^\n]+zh:/, "model usage copy must be bilingual");
assert.match(i18n, /"model_usage\.aggregation_hint"[^\n]+zh:/, "model aggregation semantics must be clear in both languages");
assert.match(i18n, /"usage_stats\.provider_semantics"[^\n]+zh:/, "provider request and attempt semantics must be bilingual");
assert.match(i18n, /"usage_stats\.backfill_hint"[^\n]+zh:/, "partial migration status must be bilingual");
assert.match(styles, /#configView\.is-model-data \.model-usage-table-wrap\s*\{[\s\S]*?overflow:\s*visible/, "the model data page must not trap vertical scrolling in its table panel");
assert.match(styles, /\.token-uncached\s*\{\s*background:\s*#4388e7/, "uncached input tokens need a clear blue segment");
assert.match(styles, /\.token-output\s*\{\s*background:\s*#42a66f/, "output tokens need a familiar green segment");
assert.match(styles, /#requestsTable \.request-data-table thead[\s\S]*?height:\s*0/, "request table headers should not consume a visual row");
assert.match(styles, /#configView\.is-model-data \.model-usage-table thead[\s\S]*?height:\s*0/, "model table headers should not consume a visual row");
assert.match(styles, /#configView\.is-model-data \.model-usage-panel\s*\{[\s\S]*?padding:\s*6px 10px 10px/, "model data needs a compact outer gutter below the config tabs");
assert.match(styles, /#configView\.is-model-data \.model-usage-workspace\s*\{[\s\S]*?border:\s*1px solid #cbd5e1/, "model data controls and table need one visible inner boundary");
assert.match(styles, /#configView\.is-model-data \.model-usage-table-scroll\s*\{[\s\S]*?overscroll-behavior-y:\s*auto/, "horizontal model table scrolling must pass vertical wheel input to the page");
assert.match(styles, /#modelDrawer \.attempt-table-scroll\s*\{[\s\S]*?overscroll-behavior-y:\s*auto/, "model provider details must pass vertical wheel input to the drawer");
assert.match(modelIcons, /getLobeIconCDN/, "model icons must use the official Lobe icon CDN helper");
assert.match(modelIcons, /format: "svg"/, "model icons must use official static SVG assets");
assert.match(modelIcons, /function providerBrandIconMarkup/, "the shared icon registry must expose provider artwork");
assert.match(modelIcons, /PROVIDER_ICON_ALIASES/, "provider icons must use explicit aliases rather than arbitrary substrings");
assert.match(modelIcons, /model-brand-fallback/, "CDN artwork must retain a local fallback marker");
assert.match(app, /model-brand-icon[\s\S]*classList\.add\("is-broken"\)/, "failed CDN artwork must activate the local fallback without disturbing layout");
assert.match(modelIcons, /COLOR_ICON_SLUGS\.has\(slug\) \? "color" : "mono"/, "recognized models should use color artwork only when LobeHub publishes it");
assert.match(styles, /\.model-brand-mark\s*\{[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px/, "model names need a compact, aligned icon marker");
assert.match(styles, /#configView\.is-model-data \.model-usage-open-button\s*\{[\s\S]*?width:\s*28px[\s\S]*?height:\s*28px/, "row and pagination chevrons need the same control geometry");
assert.match(styles, /#configView\.is-model-data \.model-usage-cost \.cost-state\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center/, "compact model costs need a single horizontal alignment context");
assert.match(styles, /grid-template-areas:[\s\S]*?"calls success"/, "mobile model rows must preserve separate calls and success areas");
assert.match(styles, /#modelDrawer\s*\{[\s\S]*?z-index:\s*36/, "the model drawer must stay above the tablet app shell");
assert.match(styles, /#configView\.is-model-data \.config-tab-nav\s*\{[\s\S]*?margin-bottom:\s*4px/, "model table must sit closer to the config tab bar");
assert.match(styles, /#configView\.is-model-data \.config-side-column\s*\{[\s\S]*?gap:\s*0/, "model data must remove the inherited config column gap");
assert.match(styles, /\.usage-statistics-primary-row\s*\{[\s\S]*?grid-template-columns:/, "usage statistics needs one intentional primary summary row");
assert.match(styles, /\.usage-statistics-chart-canvas svg\s*\{[\s\S]*?width:\s*100%/, "statistics charts must scale to the workspace");
assert.match(styles, /\.usage-statistics-breakdown-row\s*\{[\s\S]*?grid-template-columns:/, "statistics breakdown rows must keep aligned metrics");

console.log("usage observability UI tests passed");
