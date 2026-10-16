import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.js"), "utf8");
const html = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

// --- Shell: the clear affordance lives inside the provider search field ---
assert.match(
  html,
  /<div class="providers-search-shell">\s*<input id="providerSearchInput" class="control"/,
  "the provider search field must keep its own box so the clear action can sit inside it",
);
assert.match(
  html,
  /<input id="providerSearchInput"[\s\S]{0,600}?<button id="clearProviderSearchButton" class="providers-search-clear" type="button" hidden/,
  "the clear button must start hidden, so an empty field shows no affordance",
);
assert.match(
  html,
  /id="clearProviderSearchButton"[\s\S]{0,400}?data-i18n-attr="aria-label:prov\.clear_search,title:prov\.clear_search"/,
  "the clear button must be labelled from i18n (it is icon-only)",
);
assert.match(
  html,
  /id="clearProviderSearchButton"[\s\S]{0,400}?<svg class="icon-svg"[\s\S]{0,200}?<path d="M7 7l10 10"><\/path>/,
  "the clear button must draw its own cross instead of a text glyph",
);

// --- Behaviour: one funnel keeps the field, state and affordance in step ---
assert.match(
  app,
  /function syncProviderSearchClear\(\)\s*\{\s*const input = el\("providerSearchInput"\);\s*const button = el\("clearProviderSearchButton"\);\s*if \(!input \|\| !button\) return;\s*button\.hidden = !input\.value;/,
  "the affordance must be shown exactly while the search field holds text",
);
assert.match(
  app,
  /function syncProviderFiltersFromControls\(\)[\s\S]*?syncProviderSearchClear\(\);[\s\S]*?renderProvidersTable\(\);/,
  "every filter-state sync must refresh the affordance before rendering",
);
assert.match(
  app,
  /el\("clearProviderSearchButton"\)\?\.addEventListener\("click", \(\) => \{[\s\S]{0,200}?input\.value = "";[\s\S]{0,80}?syncProviderFiltersFromControls\(\);[\s\S]{0,80}?input\.focus\(\);/,
  "clicking clear must empty the field, re-apply the filters and keep the caret in the input",
);
assert.match(
  app,
  /el\("providerSearchInput"\)\?\.addEventListener\("input", syncProviderFiltersFromControls\);[\s\S]{0,500}?syncProviderSearchClear\(\);/,
  "init must reconcile the affordance instead of waiting for the first keystroke",
);

// --- Styles: inside the field, and hidden has to win over the layout ---
assert.match(
  styles,
  /\.providers-search-shell\s*\{[\s\S]{0,200}?position: relative/,
  "the search shell must anchor the clear button",
);
assert.match(
  styles,
  /\.providers-search-shell > \.control\s*\{[\s\S]{0,120}?padding-right: 32px/,
  "the input must reserve room for the clear button so long queries stay readable",
);
assert.match(
  styles,
  /\.providers-search-clear\s*\{[\s\S]{0,240}?position: absolute[\s\S]{0,200}?border-radius: 50%/,
  "the clear button must be a round in-field icon button",
);
assert.match(
  styles,
  /\.providers-search-clear\[hidden\]\s*\{\s*display: none;/,
  "the hidden attribute must beat the button's own display value",
);

// --- i18n ---
assert.match(i18n, /"prov\.clear_search": \{ en: ".+", zh: ".+" \}/, "the clear action needs both languages");
