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

const keysPanel = bodyBetween("function providerDrawerKeys", "function providerDrawerModels");
const modelsPanel = bodyBetween("function providerDrawerModels", "function providerDrawerRouting");
const routingPanel = bodyBetween("function providerDrawerRouting", "function providerDrawerConfig");
const configPanel = bodyBetween("function providerDrawerConfig", "function providerRoutingRows");
const overviewPanel = bodyBetween("function providerDrawerOverview", "const _providerActivityEventsState");
const drawerRender = bodyBetween("function renderProviderDrawer", "let _tabSwitchRaf");
const drawerTabSwitch = bodyBetween("function _renderProviderDrawerTabSwitchNow", "function bindProviderDrawerEvents");

for (const [name, region] of [["drawer render", drawerRender], ["drawer tab switch", drawerTabSwitch]]) {
  assert.match(region, /providerDrawerTabMeta\(tab\)/, `${name} must use translated tab metadata`);
  assert.match(region, /provider-drawer-tab-icon/, `${name} must keep tab icons`);
  assert.match(region, /aria-selected=/, `${name} must keep tab selection semantics`);
}

assert.match(
  keysPanel,
  /providerKeyConfiguration\(view\.name, view\.configKeys\)/,
  "the Keys tab must own configured key metadata and key creation",
);
assert.match(
  routingPanel,
  /providerFormatConfiguration\(view\.name, view\.formats\)/,
  "the Routing tab must own provider format routes",
);
assert.match(
  configPanel,
  /providerConfigInspector\(view\.name, view\.config\)/,
  "the Config tab must render only the provider inspector",
);
assert.doesNotMatch(configPanel, /providerKeyConfiguration|providerFormatConfiguration/);

assert.match(overviewPanel, /provider-overview-workspace/, "Overview must expose a dedicated information hierarchy");
assert.match(overviewPanel, /provider-overview-readiness/, "Overview must lead with route readiness");
assert.match(overviewPanel, /provider-overview-kpis/, "Overview must group the four decision KPIs");
assert.strictEqual(
  (overviewPanel.match(/providerOverviewMetric\(/g) || []).length,
  4,
  "Overview must render exactly four primary KPIs",
);
assert.match(overviewPanel, /compatibilityCircuits\.length \?/, "routing exceptions must only render when active");
assert.match(overviewPanel, /data-provider-activity-list/, "Overview must preserve lazy activity loading");
assert.match(overviewPanel, /data-provider-probe-list/, "Overview must preserve lazy probe loading");
assert.match(overviewPanel, /<details class="provider-overview-disclosure"/, "health probes must use progressive disclosure");
assert.match(overviewPanel, /data-provider-probes-disclosure/, "probe disclosure must remain patchable after lazy loading");
assert.doesNotMatch(overviewPanel, /config on|runtime on|0s cooldown|0 compat/, "Overview must not expose the old raw state chip dump");

for (const key of [
  "prov.overview_readiness",
  "prov.overview_key_coverage",
  "prov.overview_models",
  "prov.overview_recent_success",
  "prov.overview_avg_first_byte",
  "prov.overview_routing_exceptions",
  "prov.overview_recent_activity",
  "prov.overview_health_probes",
]) {
  assert.ok(translations.includes(`"${key}":`), `missing provider overview translation: ${key}`);
}

const inspector = bodyBetween("function providerConfigInspector", "function providerKeyConfiguration");
for (const fieldName of ["base_url", "user_agent", "priority", "enabled"]) {
  assert.match(inspector, new RegExp(`name=["']${fieldName}["']`), `Config must preserve ${fieldName}`);
}
assert.match(inspector, /proxyControlInput\("proxy"/, "Config must preserve the proxy field");
assert.match(inspector, /data-skip-idle-toggle/, "Config must preserve the idle probe toggle");
assert.match(inspector, /data-skip-patrol-toggle/, "Config must preserve the patrol probe toggle");
assert.match(inspector, /type="reset"/, "Config must offer a reset action in the sticky footer");
assert.match(inspector, /type="submit"/, "Config must preserve one provider save action");

const catalogIndex = modelsPanel.indexOf('t("prov.models.catalog")');
const discoveryIndex = modelsPanel.indexOf('t("prov.models.by_key")');
assert.ok(catalogIndex >= 0, "Models must expose the model catalog as the primary task");
assert.ok(discoveryIndex > catalogIndex, "per-key discovery must follow the primary model catalog");
assert.match(modelsPanel, /<details class="provider-model-disclosure/, "advanced model tasks must use progressive disclosure");
assert.match(modelsPanel, /t\("prov\.models\.canonical_aliases"\)/, "canonical variants must be presented as aliases");
assert.match(modelsPanel, /data-provider-variant-model/, "alias editor must offer discovered models as selectable variants");
assert.match(modelsPanel, /data-provider-variant-search/, "large discovered catalogs must be searchable inside the alias editor");
assert.match(modelsPanel, /data-provider-variant-edit/, "configured aliases must be editable without retyping model ids");
assert.match(modelsPanel, /data-provider-variant-delete/, "configured aliases must have an explicit delete action");
assert.match(modelsPanel, /provider-variant-custom-input/, "alias editor must retain an advanced custom-id fallback");
assert.match(modelsPanel, /t\("prov\.models\.advanced_fallback"\)/, "static models must be presented as advanced fallback configuration");
assert.match(modelsPanel, /const largeCatalog = visibleItems\.length > 24/, "large model catalogs must switch to dense mode");
assert.match(modelsPanel, /provider-model-catalog \$\{largeCatalog \? "is-large-catalog" : ""\}/, "large model catalogs must expose a layout hook");
assert.match(modelsPanel, /role="list"/, "model catalog must expose list semantics");
assert.match(modelsPanel, /role="listitem"/, "model chips must expose list item semantics");

for (const hardcodedLabel of ["Models by key", "Model catalog", "Key coverage", "Canonical aliases", "Advanced fallback"]) {
  assert.doesNotMatch(modelsPanel, new RegExp(hardcodedLabel), `${hardcodedLabel} must come from i18n`);
}
const modelTranslationKeys = [...modelsPanel.matchAll(/t\("(prov\.models\.[^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(modelTranslationKeys)) {
  assert.ok(translations.includes(`"${key}":`), `missing provider model translation: ${key}`);
}
assert.match(translations, /"prov\.models\.by_key": \{ en: "Models by key", zh: "按密钥查看模型" \}/);

assert.match(styles, /\.provider-drawer-models\s*\{[\s\S]*grid-template-columns: repeat\(auto-fill, minmax\(118px, 1fr\)\)/, "all model catalogs must use dense responsive columns by default");
assert.match(styles, /\.provider-drawer-models \.provider-model-chip\s*\{[\s\S]*min-height: 29px/, "default model chips must stay compact");
assert.match(styles, /\.provider-model-catalog\.is-large-catalog \.provider-drawer-models/, "large model catalogs must have dedicated scroll styles");
assert.match(styles, /grid-template-columns: repeat\(auto-fill, minmax\(126px, 1fr\)\)/, "large model catalogs must keep dense responsive columns");
assert.match(styles, /overflow-y: auto/, "large model catalogs must scroll internally");
assert.match(styles, /overscroll-behavior: contain/, "large model catalog scrolling must stay inside the drawer");
assert.match(styles, /\.provider-overview-readiness/, "provider overview must style route readiness");
assert.match(styles, /\.provider-overview-state-facts/, "provider overview must visually separate state evidence");
assert.match(styles, /\.provider-overview-kpis/, "provider overview must provide a compact KPI grid");
assert.match(styles, /\.provider-overview-disclosure > summary:focus-visible/, "probe disclosure must keep keyboard focus feedback");

console.log("provider drawer layout tests passed");
