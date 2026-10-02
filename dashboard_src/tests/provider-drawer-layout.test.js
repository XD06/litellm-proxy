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
const keyCardRegion = bodyBetween("function keyCard", "function actionButton");
const modelsPanel = bodyBetween("function providerDrawerModels", "function providerDrawerRouting");
const routingPanel = bodyBetween("function providerDrawerRouting", "function providerDrawerConfig");
const configPanel = bodyBetween("function providerDrawerConfig", "function providerRoutingRows");
const overviewPanel = bodyBetween("function providerDrawerOverview", "const _providerActivityEventsState");
const providerCard = bodyBetween("function providerRuntimeCard", "function providerHealthPill");
const drawerRender = bodyBetween("function renderProviderDrawer", "let _tabSwitchRaf");
const drawerTabSwitch = bodyBetween("function _renderProviderDrawerTabSwitchNow", "function bindProviderDrawerEvents");

for (const [name, region] of [["drawer render", drawerRender], ["drawer tab switch", drawerTabSwitch]]) {
  assert.match(region, /providerDrawerTabMeta\(tab\)/, `${name} must use translated tab metadata`);
  assert.match(region, /provider-drawer-tab-icon/, `${name} must keep tab icons`);
  assert.match(region, /aria-selected=/, `${name} must keep tab selection semantics`);
}

assert.match(
  keysPanel,
  /providerKeyConfiguration\(view\.name, view\.configKeys\)|view\.keys\.map\(\(key\) => keyCard\(view\.name, key, view\.keyStats\.total\)\)/,
  "the Keys tab must own configured key metadata and key creation",
);
assert.match(
  keysPanel,
  /config-key-form provider-key-add-form/,
  "the Keys tab must keep a dedicated add-key form",
);
assert.doesNotMatch(
  keysPanel,
  /data-key-test-provider|probeModelSelect|providerKeyConfiguration/,
  "per-key model testing and the probe model dropdown must stay removed",
);
assert.match(
  keysPanel,
  /provider-overview-kpis/,
  "the Keys tab must reuse the overview KPI row style",
);
assert.match(
  keyCardRegion,
  /key-card-details/,
  "per-key proxy/model overrides must collapse behind a disclosure",
);
assert.match(
  keyCardRegion,
  /key-card-ops/,
  "per-key actions must live in a dedicated ops container",
);
assert.match(
  keyCardRegion,
  /aria-label=/,
  "per-key icon buttons must carry accessible names",
);
assert.doesNotMatch(keyCardRegion, /iconOnly: true/, "per-key ops must not rely on English actionButton labels");
assert.doesNotMatch(keysPanel, /miniMetric\("Usable"/, "keys tab must not use untranslated mini metrics");
const keyTranslationKeys = [
  ...keysPanel.matchAll(/t\("(prov\.[^"]+)"/g),
  ...keyCardRegion.matchAll(/t\("(prov\.[^"]+)"/g),
].map((match) => match[1]);
for (const key of new Set(keyTranslationKeys)) {
  assert.ok(translations.includes(`"${key}":`), `missing provider keys translation: ${key}`);
}
assert.match(
  routingPanel,
  /providerFormatConfiguration\(view\.name, view\.formats\)/,
  "the Routing tab must own provider format routes",
);
assert.match(routingPanel, /provider-overview-kpis/, "the Routing tab must reuse the overview KPI row style");
assert.match(routingPanel, /providerRouteChainRows\(/, "route chains must render as ranked provider rows");
assert.match(routingPanel, /provider-route-rank-num/, "ranked chain rows must expose a position badge");
assert.match(routingPanel, /data-provider-pool-toggle/, "the default pool switch must be wired to the routing config");
assert.match(routingPanel, /provider-routing-pool-switch/, "the pool switch must use the capsule switch style");
assert.match(routingPanel, /aria-checked=/, "the pool switch must expose switch semantics");
assert.match(routingPanel, /data-routing-context-disclosure/, "the global routing context must be a persistent disclosure");
assert.match(routingPanel, /data-hot-priority-apply[^>]*aria-label=/, "the hot priority apply must be an icon button with an accessible name");
assert.doesNotMatch(routingPanel, /Quick priority|Instantly updates priority|"Default pool"|Max attempts|Route models|Provider select/, "routing tab must not leak untranslated legacy labels");
const formatConfigRegion = bodyBetween("function providerFormatConfiguration", "function providerRuntimeState");
const formatRouteItemsRegion = bodyBetween("function formatRouteItems", "function stateBadges");
assert.match(formatConfigRegion, /formatRouteItems\(formats, name, \{ poolRow: true \}\)/, "routing-tab format routes must request the pool-card capsule variant");
assert.match(formatRouteItemsRegion, /format-route-icon/, "pool-card format routes must render an icon tile");
const routingTranslationKeys = [...routingPanel.matchAll(/t\("(prov\.routing\.[^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(routingTranslationKeys)) {
  assert.ok(translations.includes(`"${key}":`), `missing provider routing translation: ${key}`);
}
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
assert.match(overviewPanel, /provider-compatibility-clear/, "provider compatibility clear must have a dedicated warning action");
assert.match(overviewPanel, /data-compatibility-circuit/, "each compatibility circuit must expose traceable row metadata");
assert.match(overviewPanel, /data-provider-activity-list/, "Overview must preserve lazy activity loading");
assert.match(overviewPanel, /data-provider-probe-list/, "Overview must preserve lazy probe loading");
assert.match(
  overviewPanel,
  /provider-overview-activity-card[\s\S]*data-provider-activity-tab="calls"[\s\S]*data-provider-activity-tab="probes"[\s\S]*data-provider-activity-pane/,
  "health probes and recent calls must merge into one activity card with sub-panes",
);
assert.match(
  overviewPanel,
  /state\.providerOverviewActivityTab\s*\|\|\s*\(hasFailedProbe\s*\|\|\s*view\.runtimeState\.id === "cooldown" \? "probes" : "calls"\)/,
  "activity sub-pane must follow the user's choice, falling back to probes on failure evidence",
);
assert.doesNotMatch(overviewPanel, /config on|runtime on|0s cooldown|0 compat/, "Overview must not expose the old raw state chip dump");

for (const key of [
  "prov.overview_readiness",
  "prov.overview_key_coverage",
  "prov.overview_models",
  "prov.overview_recent_success",
  "prov.overview_avg_first_byte",
  "prov.overview_routing_exceptions",
  "prov.overview_activity_title",
  "prov.overview_tab_calls",
  "prov.overview_tab_probes",
  "prov.overview_view_all",
]) {
  assert.ok(translations.includes(`"${key}":`), `missing provider overview translation: ${key}`);
}

const inspector = bodyBetween("function providerConfigInspector", "function providerFormatConfiguration");
for (const fieldName of ["base_url", "site_url", "user_agent", "priority", "enabled"]) {
  assert.match(inspector, new RegExp(`name=["']${fieldName}["']`), `Config must preserve ${fieldName}`);
}
assert.match(inspector, /proxyControlInput\("proxy"/, "Config must preserve the proxy field");
assert.match(inspector, /data-skip-idle-toggle/, "Config must preserve the idle probe toggle");
assert.match(inspector, /data-skip-patrol-toggle/, "Config must preserve the patrol probe toggle");
assert.match(inspector, /type="reset"/, "Config must offer a reset action in the sticky footer");
assert.match(inspector, /type="submit"/, "Config must preserve one provider save action");
assert.match(providerCard, /providerBrandIconMarkup\(view\.name, iconSvg\("server"\)\)/, "Provider cards must use the shared brand icon helper with the server fallback");
assert.match(providerCard, /provider-kpi-head[\s\S]*provider-kpi-name[\s\S]*providerHealthPill\(view\)[\s\S]*provider-kpi-meta[\s\S]*provider-kpi-stats/, "Provider card must follow the KPI anatomy (identity, health pill, meta line, big-number stats)");
assert.match(source, /function providerServerIconMarkup[\s\S]*iconSvg\("server"\)/, "Provider cards must render the fixed server SVG");
assert.match(source, /providerServerIconMarkup[\s\S]*noopener noreferrer/, "Provider site links must be safe for a new tab");
assert.match(source, /function providerSiteUrl[\s\S]*\["http:", "https:"\]\.includes\(parsed\.protocol\)/, "Provider site links must only allow HTTP(S)");
assert.match(source, /if \(!enabled\) return \{ id: "disabled", label: "disabled", tone: "is-disabled", badge: "disabled" \}/, "Disabled providers must use the neutral badge color");
assert.match(source, /return \{ id: "unavailable", label: "unavailable", tone: "is-unavailable", badge: "bad" \}/, "Unavailable providers must use the red badge color");
assert.match(drawerRender, /providerDrawerIconSlot/, "Provider drawer title must preserve the fixed server icon");
const catalogIndex = modelsPanel.indexOf('t("prov.models.catalog")');
assert.ok(catalogIndex >= 0, "Models must expose the model catalog as the primary task");
assert.doesNotMatch(modelsPanel, /t\("prov\.models\.by_key"\)/, "per-key catalog testing must stay removed from the models workspace");
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
assert.match(modelsPanel, /provider-overview-kpis/, "the Models tab must reuse the overview KPI row style");
assert.match(modelsPanel, /providerModelRow\(/, "small model catalogs must render detailed rows");
assert.match(modelsPanel, /provider-model-rows/, "small-catalog model rows must have a dedicated container");
assert.match(modelsPanel, /provider-model-draft-bar[\s\S]*?data-provider-model-apply[^>]*aria-label=/, "the draft bar's apply action must be an icon button with an accessible name");
assert.doesNotMatch(modelsPanel, /data-provider-model-reset[^>]*>[\s\S]{0,300}?<span>/, "the draft bar's reset action must be icon-only");
assert.doesNotMatch(modelsPanel, /data-provider-model-apply[^>]*>[\s\S]{0,300}?<span>/, "the draft bar's apply action must be icon-only");
assert.match(modelsPanel, /data-models-disclosure/, "models disclosures must persist their open state across polls");
assert.match(modelsPanel, /aria-label=/, "model row icon ops must carry accessible names");
assert.match(modelsPanel, /provider-model-catalog-head/, "the catalog must keep a compact head with the refresh action");

for (const hardcodedLabel of ["Models by key", "Model catalog", "Key coverage", "Canonical aliases", "Advanced fallback"]) {
  assert.doesNotMatch(modelsPanel, new RegExp(hardcodedLabel), `${hardcodedLabel} must come from i18n`);
}
const modelTranslationKeys = [...modelsPanel.matchAll(/t\("(prov\.models\.[^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(modelTranslationKeys)) {
  assert.ok(translations.includes(`"${key}":`), `missing provider model translation: ${key}`);
}
assert.doesNotMatch(translations, /"prov\.models\.by_key"/, "cancelled per-key catalog feature must not keep drawer translations");

assert.match(styles, /\.provider-drawer-models\s*\{[\s\S]*grid-template-columns: repeat\(auto-fill, minmax\(118px, 1fr\)\)/, "all model catalogs must use dense responsive columns by default");
assert.match(styles, /\.provider-drawer-models \.provider-model-chip\s*\{[\s\S]*min-height: 29px/, "default model chips must stay compact");
assert.match(styles, /\.provider-model-catalog\.is-large-catalog \.provider-drawer-models/, "large model catalogs must have dedicated scroll styles");
assert.match(styles, /grid-template-columns: repeat\(auto-fill, minmax\(126px, 1fr\)\)/, "large model catalogs must keep dense responsive columns");
assert.match(styles, /overflow-y: auto/, "large model catalogs must scroll internally");
assert.match(styles, /overscroll-behavior: contain/, "large model catalog scrolling must stay inside the drawer");
assert.match(styles, /\.provider-model-rows\s*\{/, "small-catalog model rows must have dedicated styles");
assert.match(styles, /\.provider-routing-card\s*\{/, "routing tab cards must have dedicated styles");
assert.match(styles, /\.provider-route-rank\.is-me/, "the current provider must be highlighted in ranked route chains");
assert.match(styles, /\.provider-routing-context\[open\] \.provider-routing-chev/, "the routing context chevron must rotate when open");
assert.match(styles, /\.provider-drawer-section \.provider-formats-group \.format-route\.is-interactive\s*\{/, "routing-tab format routes must read as capsule rows");
assert.match(styles, /\.provider-routing-pool-switch/, "the pool switch must have explicit capsule sizing");
assert.match(styles, /\.provider-model-row\.is-pending/, "staged model rows must read as pending until applied");
assert.match(styles, /\.provider-model-draft-bar\s*\{[\s\S]*?color-mix\(in srgb, var\(--warning\)/, "the draft bar must read as a pending-write warning");
assert.match(styles, /\.provider-model-disclosure-chev/, "disclosure summaries must keep an explicit chevron");
assert.match(styles, /\.model-chip-pending-flag/, "staged chips must carry a visible pending flag");
assert.match(styles, /\.provider-overview-readiness/, "provider overview must style route readiness");
assert.match(styles, /\.provider-overview-state-dot/, "provider overview must keep a visible state dot on the readiness ribbon");
assert.match(styles, /\.provider-overview-kpis/, "provider overview must provide a compact KPI grid");
assert.match(styles, /\.provider-activity-tab:focus-visible/, "activity sub-tabs must keep keyboard focus feedback");
assert.match(styles, /\.provider-compatibility-clear/, "compatibility clear action must have a distinct visual treatment");
assert.match(styles, /\.key-card-details\[open\] \.key-card-chev/, "the overrides disclosure must rotate its chevron when open");
assert.match(styles, /\.key-card-ops \.key-op-btn\s*\{/, "per-key icon ops must get slimmer sizing so the head row stays quiet");
assert.match(styles, /\.provider-key-add-form\s*\{[\s\S]*?border: 1\.5px dashed/, "the add-key form must read as a distinct drop-zone card");
assert.match(source, /providerCompatibilityToolbar/, "providers view must expose a global compatibility-circuit summary and clear action");
assert.match(styles, /#providersView \.provider-kpi-card\s*\{/, "provider cards must use the unified KPI anatomy");

console.log("provider drawer layout tests passed");
