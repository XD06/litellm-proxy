import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

assert.doesNotMatch(
  html,
  /id="settingsPricingCatalogMeta"/,
  "pricing tab must not render a redundant catalog heading and count above its toolbar",
);
assert.match(
  app,
  /function bindSettingsPricingPagination\(target\)\s*\{/,
  "pricing pagination must use one stable delegated click listener",
);
assert.match(
  app,
  /target\.addEventListener\("click", \(event\) => \{/,
  "pricing page changes must be delegated from the stable pagination container",
);
assert.doesNotMatch(
  app,
  /paginationTarget\?\.querySelectorAll\("\[data-settings-pricing-page\]"\)\.forEach/,
  "re-rendered pagination buttons must not accumulate direct click listeners",
);
assert.match(
  app,
  /class="settings-ops-form-actions"/,
  "operations save buttons must use a compact action group",
);
assert.match(
  styles,
  /\.settings-ops-form-actions,\s*\.settings-ops-actions\s*\{[^}]*justify-content:\s*flex-end/,
  "operations actions must align as compact controls instead of filling each card",
);

console.log("settings pricing pagination tests passed");
