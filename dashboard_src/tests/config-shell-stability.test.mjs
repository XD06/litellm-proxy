import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/,
  "config navigation must preserve the shared desktop sidebar geometry",
);
assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.brand\s*\{[^}]*margin:\s*0 0 24px[^}]*padding:\s*12px 8px/,
  "config navigation must preserve the shared desktop brand geometry",
);
assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.nav\s*\{[^}]*margin:\s*0[^}]*padding:\s*0/,
  "config navigation must preserve the shared desktop navigation geometry",
);
assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.workspace\s*\{[^}]*max-width:\s*none[^}]*padding:\s*0/,
  "config navigation must use the stable full-width workspace shell",
);
assert.match(
  styles,
  /#configView\.view\.is-active\s*\{[^}]*width:\s*100%[^}]*max-width:\s*1550px[^}]*margin:\s*0 auto[^}]*padding:\s*32px[^}]*animation:\s*none/,
  "config content must share the requests view's unified desktop container",
);
assert.doesNotMatch(
  styles,
  /#configView\.view\.is-active\s*\{[^}]*max-width:\s*1120px/,
  "config content must not fall back to the legacy narrow 1120px container",
);

assert.match(
  styles,
  /html:has\(#configView\.is-active\)\s*\{[^}]*scrollbar-gutter:\s*stable/,
  "config statistics view must reserve the root scrollbar gutter while switching panels",
);

// ---- Merged config tabs (方案 D): five tabs over legacy panel wrappers ----
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

const CONFIG_TAB_MAPPING_SNIPPETS = [
  'models: ["models"],',
  'routing: ["routes", "map"],',
  'providers: ["providers"],',
  'runtime_ops: ["runtime", "proxy", "health"],',
  'advanced: ["advanced"],',
];
for (const snippet of CONFIG_TAB_MAPPING_SNIPPETS) {
  assert.ok(app.includes(snippet), `CONFIG_TAB_PANELS must keep the mapping: ${snippet}`);
}
assert.match(app, /CONFIG_TAB_ALIASES = \{[\s\S]*?routes: "routing"[\s\S]*?proxy: "runtime_ops"/, "old persisted tab keys must keep their alias onto the merged tab");
assert.match(app, /panel\.hidden = !visiblePanels\.includes\(panel\.dataset\.configTabPanel\)/, "tab switching must toggle every legacy panel wrapper from the mapping");
assert.match(app, /normalized === "models"/, "statistics loading side-effects must stay tied to the models tab");

for (const button of ["models", "routing", "providers", "runtime_ops", "advanced"]) {
  assert.match(index, new RegExp(`data-config-tab="${button}"`), `tab bar must expose the ${button} tab`);
}
assert.doesNotMatch(index, /data-config-tab="(routes|map|runtime|proxy|health)"/, "the old seven-tab bar must not come back");

// Functional anchors: every renderer/binding hooks onto these ids — they must
// survive any layout reorganization.
for (const anchor of [
  "configProviders",
  "auditTrail",
  "modelRoutes",
  "providerModelMap",
  "configSummary",
  "globalProxyForm",
  "healthMonitorForm",
  "conversionDiagnosticsStatus",
  "conversionDiagnosticsRecords",
  "overlaySafety",
  "configSnapshot",
  'id="modelRoutesPanel"',
]) {
  assert.match(index, new RegExp(anchor.replaceAll("-", "\\-")), `functional anchor ${anchor} must stay in the DOM`);
}
assert.match(
  index,
  /data-config-tab-panel="providers"[\s\S]*?id="configProviders"[\s\S]*?id="auditTrail"/,
  "the providers tab must own both the provider config list and the audit trail",
);
assert.match(index, /providers-tab-grid/, "providers tab must use the two-column inner grid");

console.log("config shell stability tests passed");
