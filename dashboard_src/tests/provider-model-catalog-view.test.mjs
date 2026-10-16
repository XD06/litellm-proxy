import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const stateJs = fs.readFileSync(path.join(root, "src", "state.js"), "utf8");
const constants = fs.readFileSync(path.join(root, "src", "constants.js"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.js"), "utf8");

// --- State: mode + persistence (same contract as the providers toggle) ---
assert.match(
  stateJs,
  /providerModelViewMode:\s*"auto"/,
  "model catalog view must default to the size heuristic",
);
assert.match(
  app,
  /localStorage\.setItem\("proxyConsoleProviderModelsView", mode\)/,
  "an explicit catalog view pick must persist to localStorage",
);
assert.match(
  app,
  /const savedModelsView = localStorage\.getItem\("proxyConsoleProviderModelsView"\);/,
  "the catalog view mode must be restored from localStorage on init",
);
assert.match(
  app,
  /if \(savedModelsView === "grid" \|\| savedModelsView === "list"\)/,
  "only an explicit grid/list pick may override the size heuristic on restore",
);

// --- Mode resolution: the explicit pick wins, "auto" keeps today's behavior ---
assert.match(
  app,
  /state\.providerModelViewMode === "grid" \|\| state\.providerModelViewMode === "list"[\s\S]{0,40}?state\.providerModelViewMode[\s\S]{0,40}?\(largeCatalog \? "grid" : "list"\)/,
  "the effective catalog view must be the explicit pick, falling back to catalog size",
);
assert.match(
  app,
  /const largeCatalog = visibleItems\.length > 24/,
  "auto mode must keep the existing large-catalog threshold",
);

// --- Head switch: same segmented grammar as the providers cards/table toggle ---
assert.match(
  app,
  /function providerModelViewToggle\(provider, mode\)/,
  "the catalog view switch must be a dedicated markup helper",
);
assert.match(
  app,
  /function providerModelViewToggle\(provider, mode\)[\s\S]*?class="provider-model-view-toggle" role="group" aria-label=/,
  "the switch must be a labelled segmented group",
);
assert.match(
  app,
  /data-provider-model-view="\$\{option\.id\}"/,
  "each switch button must carry its mode as a data attribute",
);
assert.match(
  app,
  /data-provider-model-view-provider="\$\{escapeHtml\(provider\)\}"/,
  "the switch must stay bound to the provider it was rendered for",
);
assert.match(
  app,
  /aria-pressed="\$\{active \? "true" : "false"\}"/,
  "the switch must expose pressed state",
);
assert.match(
  app,
  /\$\{providerModelViewToggle\(view\.name, viewMode\)\}/,
  "the catalog head must render the switch next to the count and refresh actions",
);
assert.match(
  app,
  /class="provider-model-catalog-head-actions"[\s\S]*?providerModelViewToggle\(view\.name, viewMode\)[\s\S]*?provider-model-refresh-action/,
  "the switch and the refresh action must share the head actions group",
);

// --- Interactions ---
assert.match(
  app,
  /function setProviderModelViewMode\(mode\)[\s\S]*?renderProviderDrawer\(\{ force: true \}\)/,
  "switching the catalog view must re-render the open drawer",
);
assert.match(
  app,
  /const viewButton = event\.target\.closest\("\[data-provider-model-view\]"\)[\s\S]{0,120}?setProviderModelViewMode\(viewButton\.dataset\.providerModelView \|\| ""\)/,
  "the drawer's delegated click binder must own the switch",
);

// --- List rendering: the small-catalog rows, reused for large catalogs ---
assert.match(
  app,
  /\$\{listView \? `\s*<div class="provider-model-rows" role="list">[\s\S]*?providerModelRow\(view\.name, item\)/,
  "list mode must render the existing detailed row component",
);
assert.match(
  app,
  /const listLimit = largeCatalog \? PROVIDER_MODEL_LIST_LIMIT : allItems\.length/,
  "only a large catalog may bound the list window",
);
assert.match(
  constants,
  /export const PROVIDER_MODEL_LIST_LIMIT = \d+;/,
  "the list window size must live with the other console limits",
);
assert.match(
  app,
  /provider-model-overflow-note[\s\S]{0,200}?t\("prov\.models\.more"/,
  "a truncated list must still point at the models it did not render",
);
assert.match(
  app,
  /provider-model-rows" role="list">\s*\$\{listItems\.length \?[\s\S]{0,400}?t\("prov\.models\.no_match"\)/,
  "list mode must keep the empty state instead of rendering an empty box",
);

// --- Styles: switch, and the scroll box the list borrows from the chip wall ---
assert.match(
  styles,
  /\.provider-model-catalog-head-actions\s*\{[\s\S]*?margin-left: auto/,
  "the head actions group must push the switch and refresh action to the right",
);
assert.match(
  styles,
  /\.provider-model-view-toggle\s*\{[\s\S]*?display: inline-flex/,
  "the catalog view switch must use the segmented toggle style",
);
assert.match(
  styles,
  /\.provider-model-view-btn\.is-active\s*\{[\s\S]*?background: var\(--surface\)/,
  "the active catalog view must be visually distinct",
);
assert.match(
  styles,
  /\.provider-model-catalog\.is-large-catalog \.provider-model-rows\s*\{[\s\S]*?max-height:[\s\S]*?overflow-y: auto/,
  "a large catalog's list must scroll inside the drawer like the chip wall",
);
assert.match(
  styles,
  /\.provider-model-catalog\.is-large-catalog \.provider-model-rows\s*\{[\s\S]*?align-content: start/,
  "rows must not stretch to fill the list scroll box",
);
assert.match(
  styles,
  /\.provider-model-row\s*\{[\s\S]*?content-visibility: auto/,
  "off-screen rows must be skipped so a long list stays cheap to render",
);

// --- Translations for every new label ---
for (const key of ["prov.models.view_toggle_label", "prov.models.view_grid", "prov.models.view_list"]) {
  assert.ok(i18n.includes(`"${key}":`), `missing catalog view translation: ${key}`);
}
