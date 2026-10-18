import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Request detail → the three destinations on the result band.
// The band is the first thing a user reads, so its jump affordances must stay
// discoverable (always-visible glyph, real <button>), must degrade to plain
// text when a value is missing, and must never strand the user: every target
// drawer carries a "back to request" affordance.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.js"), "utf8");
const html = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source region: ${start}`);
  return source.slice(startIndex, endIndex);
}

const bandMarkup = between(app, "function requestResultStat", "// ---- Result-band jumps");
const drawerRender = between(app, "function renderDrawer(detail)", "function requestResultHeadlineMarkup");
const jumpHandlers = between(app, "async function jumpToRequestModel", "function handleRequestStatJump");

// --- Band cells: jumpable cells are real buttons, plain cells stay divs ---

assert.match(
  bandMarkup,
  /if \(!jump\) \{[\s\S]*?return \x60<div class="\$\{baseClass\}"\$\{titleAttr\}>\$\{iconSvg\(icon\)\}/,
  "a stat without a destination must stay a plain div instead of a dead button",
);
assert.match(
  bandMarkup,
  /return \x60<button class="\$\{baseClass\} is-jumpable" type="button" data-request-stat-jump=/,
  "a stat with a destination must be a real button carrying its jump kind",
);
assert.match(
  bandMarkup,
  /request-result-stat--\$\{kind\}/,
  "every stat must carry a stable per-kind modifier class",
);
assert.match(
  bandMarkup,
  /aria-label="\$\{escapeHtml\(\x60\$\{label\}: \$\{value \|\| "-"\} — \$\{action\}\x60\)\}"/,
  "the jump button must expose an accessible name that names the destination",
);
assert.match(
  bandMarkup,
  /<small>\$\{escapeHtml\(label\)\}<i class="request-result-jump-glyph"/,
  "the jump glyph must sit inline in the label row so it can never cover the label",
);
assert.match(
  bandMarkup,
  /request-result-jump-glyph/,
  "the jump affordance must render a persistent glyph (hover-only hints are undiscoverable)",
);

// --- Which cells jump, and to what ---

assert.match(
  drawerRender,
  /kind: "model",[\s\S]*?jump: "model",/,
  "the model cell must jump",
);
assert.match(
  drawerRender,
  /kind: "provider",[\s\S]*?jump: "provider",/,
  "the final-provider cell must jump",
);
assert.match(
  drawerRender,
  /kind: "client-key",[\s\S]*?jump: detail\.client_key_id \? "client-key" : "",/,
  "the client-key cell must only jump when the request actually carries a key id",
);
assert.match(
  drawerRender,
  /kind: "latency",[\s\S]*?mono: true,\s*\}\)/,
  "the latency cell must stay non-interactive",
);
assert.match(
  drawerRender,
  /kind: "cost",[\s\S]*?markup: renderCost/,
  "the cost cell must stay non-interactive",
);

// --- Jump routing ---

assert.match(
  jumpHandlers,
  /async function jumpToRequestModel\(model\)[\s\S]*?setView\("config"\);[\s\S]*?switchConfigTab\("models"\);[\s\S]*?switchStatisticsView\("models"\);[\s\S]*?await openUsageModelDrawer\(name\);/,
  "the model jump must land on 配置与统计 → 模型数据 and open that model's usage drawer",
);
assert.match(
  jumpHandlers,
  /function jumpToRequestProvider\(provider\)[\s\S]*?setView\("providers"\);[\s\S]*?openProviderDrawer\(name\);/,
  "the provider jump must land on the providers view and open that provider's drawer",
);
assert.match(
  jumpHandlers,
  /async function jumpToRequestClientKey\(keyId, keyLabel\)[\s\S]*?setView\("settings"\);[\s\S]*?switchSettingsTab\("keys"\);[\s\S]*?ensureClientKeysFresh\(\)[\s\S]*?openKeyDrawer\("edit", record\);/,
  "the client-key jump must land on settings → keys and open that key's editor",
);
assert.match(
  jumpHandlers,
  /if \(!record\) \{[\s\S]*?setNotice\(t\("req\.jump_client_key_missing"/,
  "a deleted key must report why the editor did not open instead of failing silently",
);
assert.match(
  app,
  /function handleRequestStatJump\(kind\) \{\s*const detail = _currentRequestDetail;\s*if \(!detail\) return;/,
  "jump dispatch must read the loaded detail instead of re-parsing rendered DOM",
);

// --- Return affordance ---

for (const [drawerId, buttonId] of [
  ["providerDrawer", "providerDrawerReturnButton"],
  ["modelDrawer", "modelDrawerReturnButton"],
  ["keyDrawer", "keyDrawerReturnButton"],
]) {
  assert.match(
    html,
    new RegExp(`<aside id="${drawerId}"[\\s\\S]*?<button id="${buttonId}" class="drawer-return-button" type="button" hidden>`),
    `${drawerId} must own a return button that starts hidden`,
  );
}

assert.match(
  app,
  /function returnToRequest\(drawerId\)[\s\S]*?if \(drawerId === "providerDrawer"\) closeProviderDrawer\(\);[\s\S]*?setView\("requests"\);[\s\S]*?openRequestDetail\(requestId\);/,
  "the return button must close the target drawer and reopen the original request",
);
assert.match(
  app,
  /function syncDrawerReturnButtons\(\)[\s\S]*?button\.hidden = !requestId;/,
  "return buttons must be shown only while their drawer carries a request id",
);
for (const closer of ["closeProviderDrawer", "closeModelDrawer", "closeKeyDrawer"]) {
  const body = between(app, `function ${closer}`, "\n  }\n");
  assert.match(
    body,
    /clearDrawerReturn\("/,
    `${closer} must drop the return target so a later visit shows no stale "back to request"`,
  );
}

// --- Layout: the metric strip must not depend on cell position ---

assert.doesNotMatch(
  styles,
  /#detailDrawer \.request-result-stat:nth-of-type/,
  "the band changes column count with the client key, so positional selectors are unsafe",
);
assert.match(
  styles,
  /#detailDrawer \.request-result-stats \{\s*display: flex;\s*flex-wrap: wrap;/,
  "the metric strip must wrap instead of squeezing every cell into one fixed row",
);
assert.match(
  styles,
  /#detailDrawer \.request-result-stat\.is-jumpable \{[\s\S]*?cursor: pointer;/,
  "jumpable cells need a pointer affordance",
);
assert.match(
  styles,
  /#detailDrawer \.request-result-stat\.is-jumpable:focus-visible \{/,
  "jumpable cells must keep a visible keyboard focus state",
);
assert.match(
  styles,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?#detailDrawer \.request-result-stat\.is-jumpable/,
  "the hover transition must respect reduced-motion preferences",
);

// --- i18n: both languages, no raw keys on screen ---

for (const key of ["req.jump_model", "req.jump_provider", "req.jump_client_key", "req.back_to_request"]) {
  const line = i18n.split("\n").find((entry) => entry.includes(`"${key}"`)) || "";
  assert.match(line, /en: ".+", zh: ".+"/, `${key} must be translated in both languages`);
}

console.log("request-result-band-jump: ok");
