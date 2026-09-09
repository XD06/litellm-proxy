const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "app.js"),
  "utf8",
);
const i18nSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "i18n.js"),
  "utf8",
);
const stylesSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "styles.css"),
  "utf8",
);

function bodyBetween(start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing ${start}`);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing ${end}`);
  return source.slice(startAt, endAt);
}

// Proxy-test clicks are delegated on the document: re-renders swap button
// nodes between renderAll passes, so per-button listeners miss clicks on
// fresh nodes (clicks silently no-op until the next bind pass).
assert.match(
  source,
  /document\.addEventListener\("click", \(event\) => \{[\s\S]*?closest\("\[data-proxy-test\]"\)[\s\S]*?handleProxyTestRequest\(button\)/,
  "proxy-test clicks must be handled by the document-level delegation",
);

// Static config loads lazily; the delegated handler must explain the loading
// window instead of silently doing nothing.
const handler = bodyBetween("async function handleProxyTestRequest", "function bindProxyTestButtons");
assert.match(
  handler,
  /if \(state\.staticDataState !== "ready"\) \{\s*setNotice\(t\("notice\.config_loading"\), "info"\);/,
  "a click during the loading window must explain itself instead of no-op",
);

// Buttons are disabled/greyed while the static config is still loading.
const binder = bodyBetween("function bindProxyTestButtons", "const modelUsageRange");
assert.match(
  binder,
  /button\.disabled\s*=\s*!configReady/,
  "proxy-test buttons must be disabled while the static config is loading",
);
assert.match(
  binder,
  /classList\.toggle\("is-waiting-config",\s*!configReady\)/,
  "waiting proxy-test buttons must carry the is-waiting-config marker",
);

assert.match(
  source,
  /notice\.config_loading/,
  "app.js must reference the config-loading notice",
);
assert.match(
  i18nSource,
  /"notice\.config_loading":\s*\{\s*en:\s*"Configuration is still loading[^"]*",\s*zh:\s*"配置尚未加载完成[^"]*"\s*\}/,
  "i18n must provide both locales for the config-loading notice",
);

assert.match(
  stylesSource,
  /\.proxy-test-button\.is-waiting-config/,
  "the waiting state must have a dedicated greyed-out style",
);

console.log("proxy test config-ready tests passed");
