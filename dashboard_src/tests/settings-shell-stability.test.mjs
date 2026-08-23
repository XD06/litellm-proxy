import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

assert.match(
  styles,
  /body:has\(#requestsView\.is-active, #settingsView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/,
  "settings must share the Requests desktop sidebar geometry",
);
assert.match(
  styles,
  /body:has\(#requestsView\.is-active, #settingsView\.is-active\) \.brand\s*\{[^}]*margin:\s*0 0 24px[^}]*padding:\s*12px 8px/,
  "settings must share the Requests brand geometry",
);
assert.match(
  styles,
  /#settingsView\.view\.is-active\s*\{[^}]*min-height:\s*100vh[^}]*padding:\s*24px[^}]*animation:\s*none/,
  "settings content must use the stable Requests page frame",
);
assert.match(
  styles,
  /\.settings-ops-card\s*\{[^}]*border-radius:\s*16px/,
  "operations cards must retain the shared configuration-card shape",
);
assert.match(
  app,
  /if \(viewChanged\) window\.scrollTo\(0, 0\)/,
  "primary view navigation must reset shared document scroll",
);
assert.match(
  html,
  /id="settingsPricingPagination" class="settings-pricing-pagination" aria-live="polite"/,
  "pricing pagination must have a dedicated top-toolbar container",
);
assert.match(
  app,
  /const paginationTarget = el\("settingsPricingPagination"\)/,
  "pricing pagination must render into its top-toolbar container",
);
assert.match(
  app,
  /updateDOM\(paginationTarget, pagination\)/,
  "pricing pagination must not be appended beneath the pricing table",
);
assert.match(
  styles,
  /grid-template-areas:\s*"proxy runtime"\s*"overlay runtime"\s*"security security"/,
  "operations cards must give runtime controls a dedicated main column and security a full row",
);
assert.match(
  styles,
  /\.settings-ops-card--security\s*\{\s*grid-area:\s*security;/,
  "security card must span the desktop operations grid",
);
assert.match(
  styles,
  /grid-template-areas:\s*none;[\s\S]*?\.settings-ops-card--security\s*\{\s*grid-area:\s*auto;/,
  "operations card placement must reset for the single-column layout",
);

console.log("settings shell stability tests passed");
