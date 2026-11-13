import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { keySwitchState } from "../src/key-enable-switch.mjs";

assert.deepEqual(
  keySwitchState({ enabled: true, expired: false }),
  { checked: true, disabled: false, state: "active" },
);
assert.deepEqual(
  keySwitchState({ enabled: false, expired: false }),
  { checked: false, disabled: false, state: "paused" },
);
assert.deepEqual(
  keySwitchState({ enabled: true, expired: true }),
  { checked: true, disabled: true, state: "expired" },
  "an expired key cannot be flipped on from the switch",
);
assert.deepEqual(keySwitchState({}), { checked: true, disabled: false, state: "active" });
assert.deepEqual(keySwitchState(null), { checked: true, disabled: false, state: "active" });

const read = (relative) => readFileSync(
  fileURLToPath(new URL(relative, import.meta.url)), "utf8",
).replace(/\r\n/g, "\n");
const appSource = read("../src/app.js");
const builtApp = read("../../dashboard/app.js");
const i18n = read("../src/i18n.js");
const styles = read("../src/styles.css");

for (const [label, source] of [["source", appSource], ["built", builtApp]]) {
  assert.match(source, /keySwitchState\(entry\)/, `${label} must derive switch state from the record`);
  assert.match(source, /role="switch"/, `${label} must expose an accessible switch`);
  assert.match(source, /aria-checked="\$\{switchState\.checked\}"/, `${label} must reflect checked state`);
  assert.match(source, /data-toggle-key-id=/, `${label} must render a togglable row control`);
  assert.match(source, /switchState\.disabled \? "disabled"/, `${label} must disable the expired branch`);
  assert.match(source, /encodeURIComponent\(id\)\}/, `${label} must target the key id in the PATCH URL`);
  assert.match(
    source,
    /\{ enabled: next \}/,
    `${label} must PATCH the enabled flag, not delete the key`,
  );
  const toggleBlock = source.match(
    /function bindSettingsKeyRows\(target\) \{[\s\S]*?target\.querySelectorAll\("\[data-copy-masked-key\]"\)/,
  )?.[0] || "";
  assert.ok(toggleBlock, `${label} toggle handler must remain extractable`);
  assert.match(toggleBlock, /classList\.toggle\("is-on", next\)/, `${label} must patch the switch in place`);
  assert.match(toggleBlock, /closest\("\.settings-key-status"\)/, `${label} must patch only this row`);
  assert.match(toggleBlock, /dataset\.busy/, `${label} must guard re-entrancy without losing focus`);
  assert.match(toggleBlock, /setAttribute\("aria-checked", String\(next\)\)/, `${label} must sync the switch state`);
  assert.doesNotMatch(toggleBlock, /badge\.className/, `${label} must not flip the badge style between states`);
  assert.doesNotMatch(toggleBlock, /renderSettingsKeys\(\)/, `${label} must not re-render the whole table on toggle`);
  assert.doesNotMatch(toggleBlock, /\.focus\(\)/, `${label} must not re-focus / scroll the row on toggle`);
  assert.doesNotMatch(toggleBlock, /button\.disabled = true/, `${label} must not blur the switch while busy`);
  assert.match(source, /is-busy/, `${label} must expose a pending state`);
}
assert.match(i18n, /"settings\.keys\.switch_pause_tip"/);
assert.match(i18n, /"settings\.keys\.switch_failed"/);
assert.match(styles, /\.key-switch:focus-visible\s*\{/, "keyboard focus must be visible");
assert.match(styles, /\.key-switch:disabled\s*\{/, "disabled state must be styled");
assert.match(styles, /\.key-switch\.is-busy\s*\{/, "pending state must be styled");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/, "motion preferences must be honored");
assert.match(styles, /\.settings-key-status\s*\{/, "switch + badge row must be laid out");
assert.match(
  styles,
  /\.settings-key-status \.badge\s*\{[^}]*min-width:\s*72px/,
  "status badge must keep a fixed slot so the row cannot shift on a label change",
);

// Monochrome: no success green in the switch or in the status dot.
const switchCss = styles.match(/\.key-switch\s*\{[\s\S]*?@keyframes key-switch-pulse/)?.[0] || "";
assert.ok(switchCss, "switch CSS must remain extractable");
assert.doesNotMatch(switchCss, /--success/, "the switch must be black & white, not success green");
assert.match(
  switchCss,
  /\.key-switch\.is-on\s*\{[^}]*background:\s*var\(--text\)/,
  "on state is a black track",
);
assert.match(
  switchCss,
  /\.key-switch\.is-on \.key-switch-thumb\s*\{[^}]*background:\s*var\(--surface\)/,
  "on state has a white thumb",
);
assert.doesNotMatch(
  styles,
  /\.settings-keys-table \.badge\.ok::before\s*\{[^}]*--success/,
  "the status dot must not carry an accent color",
);
assert.match(
  i18n,
  /"settings\.keys\.status_active": \{ en: "Enabled", zh: "已启用" \}/,
  "status labels must share one 已X wording",
);
for (const [label, source] of [["source", appSource], ["built", builtApp]]) {
  const rowBlock = source.match(/function settingsKeyRow\(key\) \{[\s\S]*?function bindSettingsKeyRows/)?.[0] || "";
  assert.ok(rowBlock, `${label} key row renderer must remain extractable`);
  assert.doesNotMatch(rowBlock, /badge ok/, `${label} status badge must stay neutral in all states`);
  assert.match(rowBlock, /class="badge"/, `${label} status badge uses the shared neutral badge`);
  assert.match(rowBlock, /class="settings-key-models"/, `${label} model scope cell must be compact`);
  assert.match(rowBlock, /settings\.keys\.models_count/, `${label} model scope must show a count summary`);
  assert.match(rowBlock, /escapeHtml\(modelsFull\)/, `${label} full allowlist must stay in the tooltip / accessible name`);
  assert.doesNotMatch(
    rowBlock,
    /<td>\$\{escapeHtml\(models\)\}<\/td>/,
    `${label} must not dump the whole allowlist into the cell and stretch the row`,
  );
}

assert.match(
  i18n,
  /"settings\.keys\.models_count": \{ en: "\{count\} models", zh: "\{count\} 个模型" \}/,
  "compact model count must be translated",
);
assert.match(
  styles,
  /\.settings-key-models\s*\{[^}]*white-space:\s*nowrap/,
  "the model scope cell must never wrap",
);
assert.match(styles, /\.settings-key-models-summary\s*\{/, "the compact summary must be styled");

console.log("key enable switch tests passed");
