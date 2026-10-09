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
assert.match(inspector, /provider-overview-kpis/, "the Config tab must reuse the overview KPI row style");
assert.match(inspector, /provider-routing-card provider-config-card/, "config groups must reuse the routing card shell");
assert.match(inspector, /data-provider-flag="[^"]*" data-flag-field="enabled"/, "the enabled switch must hot-apply through the flag binding");
for (const flag of ["force_reasoning_content", "force_anthropic_thinking", "assume_supports_unknown_models"]) {
  assert.match(inspector, new RegExp(`providerFlagSwitch\\(name, "${flag}"`), `Config must expose the backend ${flag} switch`);
}
assert.match(inspector, /data-flag-field=/, "flag switches must carry their backend field name");
assert.match(inspector, /name="forward_client_headers"/, "Config must expose the forward client headers whitelist");
assert.match(inspector, /aria-label=/, "config switches must carry accessible names");
const configTranslationKeys = [...inspector.matchAll(/t\("(prov\.config\.[^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(configTranslationKeys)) {
  assert.ok(translations.includes(`"${key}":`), `missing provider config translation: ${key}`);
}
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
assert.match(styles, /\.provider-config-row\s*\{/, "config tab switch rows must have dedicated styles");
assert.match(styles, /\.toggle-switch input:checked \+ \.slider\s*\{\s*background: var\(--accent\)/, "capsule switches must use the accent color when on");
assert.match(styles, /\.format-route-switch\.is-on\s*\{[^}]*background: var\(--accent\)/, "routing capsule switches must use the accent color when on");
assert.doesNotMatch(styles, /\.format-route-switch\.is-on \{[^}]*--success/, "routing capsule switches must not fall back to the success green");
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

assert.match(providerCard, /prov\.restore_routing/, "provider card clear action must be labeled as routing restore, not cooldown clearing");
assert.doesNotMatch(source, /prov\.clear_cooldown/, "the misleading clear-cooldown label must be fully retired");
assert.match(providerCard, /cooldown\/clear[^>]*data-tip="\$\{escapeHtml\(t\("prov\.restore_routing_tip"\)\)\}"/, "the restore action must carry a tooltip explaining its key-level scope");
assert.match(translations, /"prov\.restore_routing"\s*:\s*\{[^}]*zh:/, "restore routing label must be bilingual");
assert.match(translations, /"prov\.restore_routing_tip"[\s\S]{0,300}zh:/, "restore routing tooltip must be bilingual");


// --- Runtime render guard -------------------------------------------------
// Every assertion above greps source text. That let a ReferenceError ship:
// `allItems` was referenced by the toolbar before its `const` declaration, so
// the Models tab threw at runtime while all regex checks stayed green. Extract
// the real render functions and execute them so scope errors fail the suite.
const os = require("os");
const { execFileSync } = require("child_process");

function sourceRegion(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source region: ${startMarker}`);
  return source.slice(start, end);
}

const catalogHelper = sourceRegion(
  "  function providerDrawerCatalogItems(",
  "  function providerRouteModels(",
);
const modelRowRenderFn = sourceRegion(
  "  function providerModelRow(",
  "  function providerDrawerRouting(",
);
const modelsRenderFn = sourceRegion(
  "  function providerDrawerModels(",
  "  function providerModelRow(",
);

const renderHarness = `
const state = { data: { config: { providers: {}, models: {} } }, providerModelFilters: {}, providerModelsDisclosuresOpen: new Set() };
const t = (key) => key;
const escapeHtml = (value) => String(value ?? "");
const iconSvg = () => "<i></i>";
const badge = () => "";
const fmtInt = (value) => String(value);
const fmtDate = (value) => String(value);
const normalizeStaticModelIds = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const filteredProviderModelItems = (value) => (Array.isArray(value) ? value : []);
const providerModelStatusLabel = () => "";
const messageMarkup = () => "";
const refreshSpinner = () => "";
const providerOverviewMetric = () => "";
const providerModelDraftCount = () => 0;
const modelCapabilityItems = () => [];
const discovered = (count, prefix) => Array.from({ length: count }, (_, index) => ({
  label: prefix + index,
  sourceModel: prefix + index,
  raw: prefix + index,
  disabled: false,
  pending: false,
  manual: false,
}));
const catalogOf = (html) => {
  const start = html.indexOf("provider-model-catalog");
  const end = html.indexOf("provider-model-disclosure provider-model-aliases");
  return start < 0 ? "" : html.slice(start, end < 0 ? html.length : end);
};
const inspect = (label, html) => ({
  label,
  count: catalogOf(html).split(">s1<").length - 1,
  isStaticClass: catalogOf(html).includes("is-static"),
  staticBadge: catalogOf(html).includes("model-chip-static-badge"),
});
const results = [];
try {
  results.push(inspect("rowsMode", providerDrawerModels({ name: "p", config: { static_models: ["s1"] }, capability: {}, modelItems: discovered(1, "a") })));
  results.push(inspect("chipMode", providerDrawerModels({ name: "p", config: { static_models: ["s1"] }, capability: { status: "ok" }, modelItems: discovered(30, "m") })));
  results.push(inspect("staticOnly", providerDrawerModels({ name: "p", config: { static_models: ["s1"] }, capability: {}, modelItems: [] })));
  results.push(inspect("empty", providerDrawerModels({ name: "p", config: {}, capability: {}, modelItems: [] })));
  const deduped = catalogOf(providerDrawerModels({ name: "p", config: { static_models: ["a0"] }, capability: {}, modelItems: discovered(1, "a") }));
  results.push({ label: "dedupe", count: deduped.split(">a0<").length - 1, isStaticClass: deduped.includes("is-static"), staticBadge: false });
  const ordered = catalogOf(providerDrawerModels({ name: "p", config: { static_models: ["s1"] }, capability: {}, modelItems: discovered(1, "a") }));
  results.push({ label: "ordering", staticFirst: ordered.indexOf(">s1<") >= 0 && ordered.indexOf(">s1<") < ordered.indexOf(">a0<") });
  console.log("RENDER_RESULT " + JSON.stringify(results));
} catch (error) {
  console.log("RENDER_THREW " + error.constructor.name + ": " + error.message);
  process.exit(1);
}
`;

const probePath = path.join(os.tmpdir(), `provider-drawer-render-${process.pid}.js`);
fs.writeFileSync(probePath, `${renderHarness}\n${catalogHelper}\n${modelRowRenderFn}\n${modelsRenderFn}\n`, "utf8");
let renderOutput = "";
try {
  renderOutput = execFileSync(process.execPath, [probePath], { encoding: "utf8" });
} catch (error) {
  assert.fail(`providerDrawerModels threw at runtime: ${error.stdout || error.message}`);
} finally {
  fs.rmSync(probePath, { force: true });
}

const renderResults = Object.fromEntries(
  JSON.parse(renderOutput.split("RENDER_RESULT ")[1].trim()).map((item) => [item.label, item]),
);
for (const label of ["rowsMode", "chipMode", "staticOnly"]) {
  assert.equal(renderResults[label].count, 1, `${label}: the catalog must list the static model exactly once`);
  assert.equal(renderResults[label].isStaticClass, true, `${label}: static fallback entries must be marked`);
}
assert.equal(renderResults.empty.count, 0, "a provider without static models must not invent catalog entries");
assert.equal(renderResults.chipMode.staticBadge, true, "large catalogs must carry the visible static badge");
assert.equal(renderResults.dedupe.count, 1, "a static model that discovery already returned must not render twice");
assert.equal(renderResults.dedupe.isStaticClass, false, "a discovered model must not be relabeled static");
assert.equal(renderResults.ordering.staticFirst, true, "static fallback models must lead the catalog so operators see their own additions first");

// The toolbar enablement and the bulk handler must resolve the same catalog,
// otherwise the buttons enable while staging nothing.
assert.match(source, /providerDrawerCatalogItems\(view, filteredProviderModelItems\(view\.modelItems\)\)/, "the bulk enable/disable handler must stage the catalog the drawer renders");
console.log("provider drawer layout tests passed");
