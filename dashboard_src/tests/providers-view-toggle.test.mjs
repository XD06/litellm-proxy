import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const stateJs = fs.readFileSync(path.join(root, "src", "state.js"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.js"), "utf8");
const html = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

// --- Static shell: segmented cards/table toggle lives in the providers head ---
assert.match(
  html,
  /class="providers-view-toggle"[^>]*>\s*<button class="providers-view-btn is-active" type="button" data-providers-view="cards"/,
  "providers head must own a cards/table segmented toggle with cards as default",
);
assert.match(
  html,
  /data-providers-view="table"/,
  "providers toggle must expose the table mode",
);
assert.match(
  html,
  /class="providers-head-actions"/,
  "providers toggle and add button must share the head actions group",
);

// --- State: mode + persistence ---
assert.match(
  stateJs,
  /providersViewMode:\s*"cards"/,
  "providers view mode must default to cards",
);
assert.match(
  app,
  /localStorage\.setItem\("proxyConsoleProvidersView", mode\)/,
  "view mode changes must persist to localStorage",
);
assert.match(
  app,
  /localStorage\.getItem\("proxyConsoleProvidersView"\)/,
  "view mode must be restored from localStorage on init",
);
assert.match(
  app,
  /function setProvidersViewMode\(mode\)[\s\S]*?state\.providersPage = 0;[\s\S]*?state\.forceProvidersRender = true;[\s\S]*?syncProvidersViewToggle\(\);[\s\S]*?renderProvidersTable\(\);/,
  "switching view mode must reset pagination, force a render, and sync the toggle",
);

// --- Render: both views share the same providerViewModel pipeline ---
assert.match(
  app,
  /state\.providersViewMode === "table"\s*\?\s*providerRuntimeTable\(visibleCards\)\s*:\s*`<div class="provider-card-grid">/,
  "renderProvidersTable must branch between table rows and the card grid",
);
assert.match(
  app,
  /const visibleCards = page\.items\.map\(\(view\) => providerViewModel\(view\.name\)\);/,
  "both presentations must render from the full providerViewModel objects",
);
assert.match(
  app,
  /if \(state\.providersViewMode === "table"\) bindProviderRows\(target\);/,
  "table mode must bind row interactions after render",
);

// --- Table row markup: real fields only, no invented actions ---
assert.match(
  app,
  /function providerRuntimeTable\(views\)[\s\S]*?views\.map\(providerRuntimeRow\)/,
  "provider table must map the visible viewmodels to rows",
);
assert.match(
  app,
  /function providerRuntimeRow\(view\)[\s\S]*?providerBrandIconMarkup\(view\.name, iconSvg\("server"\)\)/,
  "table rows must use the shared provider brand icon markup",
);
assert.match(
  app,
  /function providerRuntimeRow\(view\)[\s\S]*?data-provider-row="\$\{escapeHtml\(view\.name\)\}"/,
  "table rows must carry the data-provider-row key used by morphdom",
);
assert.match(
  app,
  /function providerRuntimeRow\(view\)[\s\S]*?view\.activity\.successRate[\s\S]*?view\.activity\.latestLatency[\s\S]*?providerSparklineStats\(view\.activity\)/,
  "table rows must read success rate, latency, and call stats from the shared activity viewmodel",
);
assert.match(
  app,
  /function providerRuntimeRow\(view\)[\s\S]*?data-provider-open="\$\{escapeHtml\(view\.name\)\}"[\s\S]*?actionButton\(view\.runtime\.runtime_enabled !== false \? "Disable" : "Enable"/,
  "row actions must reuse the existing drawer-open and enable/disable endpoints",
);
assert.match(
  app,
  /function bindProviderRows\(target\)[\s\S]*?event\.target\.closest\("button, a, input, select, label"\)/,
  "row clicks must ignore nested buttons so row actions keep their own behavior",
);
assert.match(
  app,
  /"data-provider-row",/,
  "morphdom node keys must cover provider table rows",
);

// --- Health pill: overview health score with runtime-state fallback ---
assert.match(
  app,
  /function providerHealthPill\(view\)[\s\S]*?state\.data\.healthScores\?\.providers\?\.\[view\.name\]/,
  "health pill must prefer the aggregated health score",
);
assert.match(
  app,
  /function providerHealthPill\(view\)[\s\S]*?health\.grade\.\$\{grade\}/,
  "health pill grades must reuse the shared grade i18n keys",
);
assert.match(
  styles,
  /\.provider-health-pill\.tone-ok[\s\S]*?\.provider-health-pill\.tone-warn[\s\S]*?\.provider-health-pill\.tone-bad/,
  "health pill tones must be styled",
);

// --- Table + toggle styling ---
assert.match(
  styles,
  /\.providers-view-toggle\s*\{[\s\S]*?\.providers-view-btn\.is-active/,
  "view toggle must have segmented active styling",
);
assert.match(
  styles,
  /\.provider-table-scroll\s*\{[\s\S]*?\.provider-list-table\s*\{/,
  "provider table must own scroll shell and list table styles",
);

// --- Cards: unified KPI anatomy shared with the table view ---
assert.match(
  app,
  /function providerRuntimeCard\(view\)[\s\S]*?class="provider-kpi-card \$\{view\.runtimeState\.tone\}[\s\S]*?data-provider-card="\$\{escapeHtml\(view\.name\)\}"[\s\S]*?data-provider-open="\$\{escapeHtml\(view\.name\)\}"/,
  "provider cards must use the KPI anatomy with the whole card opening the drawer",
);
assert.match(
  app,
  /function providerRuntimeCard\(view\)[\s\S]*?providerBrandIconMarkup\(view\.name, iconSvg\("server"\)\)[\s\S]*?providerHealthPill\(view\)/,
  "provider cards must reuse the shared brand icon and health pill helpers",
);
assert.match(
  app,
  /function providerRuntimeCard\(view\)[\s\S]*?provider-kpi-stats[\s\S]*?view\.activity\.successRate[\s\S]*?view\.activity\.latestLatency/,
  "provider card stats must read the same activity viewmodel fields as the table rows",
);
assert.match(
  app,
  /function providerRuntimeCard\(view\)[\s\S]*?data-action-path="\/providers\/\$\{encodeURIComponent\(view\.name\)\}\/\$\{isDisabled \? "enable" : "disable"\}"/,
  "card footer ops must reuse the existing enable/disable endpoint",
);
assert.match(
  app,
  /function providerRuntimeCard\(view\)[\s\S]*?providerSparkline\(view\.activity, view\.name\)/,
  "card must render the recent-call strip only through the shared sparkline helper",
);
assert.match(
  app,
  /const height = bad \? 13 : 4\.5 \+ 8\.5 \* Math\.min\(1, latency \/ maxLatency\);/,
  "sparkline bars must encode per-call latency as height",
);
assert.match(
  app,
  /function bindProviderCards\(target\)[\s\S]*?event\.target !== button && event\.target\.closest\("button, a, input, select, label"\)/,
  "card-level drawer open must yield to nested buttons and links",
);
assert.match(
  styles,
  /#providersView \.provider-kpi-card\s*\{/,
  "KPI card must own its card-level styles",
);

// --- i18n: en/zh both present for the new surface ---
for (const key of [
  "prov.view_toggle_label",
  "prov.view_cards",
  "prov.view_table",
  "prov.col_provider",
  "prov.col_models",
  "prov.col_success",
  "prov.col_ttfb",
  "prov.col_calls",
  "prov.col_actions",
  "prov.row_details",
  "prov.open_details",
  "prov.health_score_title",
  "prov.calls_summary",
  "prov.no_recent_calls",
]) {
  const entry = new RegExp(`"${key}":\\s*\\{\\s*en:.+, zh:.+\\}`);
  assert.match(i18n, entry, `${key} must provide both en and zh strings`);
}

console.log("providers view toggle tests passed");
