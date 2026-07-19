const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "app.js"),
  "utf8",
);

function bodyBetween(start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing ${start}`);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing ${end}`);
  return source.slice(startAt, endAt);
}

const requestsRenderer = bodyBetween("function renderRequestsTable", "function requestPageVisuals");
assert.doesNotMatch(
  requestsRenderer,
  /target\.innerHTML\s*=/,
  "request polling must reconcile the existing table instead of replacing it",
);

const configRenderer = bodyBetween("function renderConfig()", "async function loadModelUsage");
assert.match(
  configRenderer,
  /configRenderSignature|lastRenderedConfig/,
  "config polling needs a render guard for unchanged static data",
);

assert.match(source, /getNodeKey\s*\(/, "DOM reconciliation must use stable keys");
assert.match(
  source,
  /_lastRuntimeCoreSignature|runtimeSignature\(/,
  "runtime polling needs a render signature so unchanged polls are DOM no-ops",
);
assert.match(
  source,
  /if \(coreChanged && !viewEntries\.length\) renderAll\(\)/,
  "runtime core and view refreshes must not unconditionally render twice",
);
assert.match(
  source,
  /if \(changed && state\.view === \"providers\"\)/,
  "unchanged capability snapshots must not repaint the providers view",
);
assert.match(
  source,
  /_renderedHtmlByTarget|get\(target\) === nextHtml/,
  "identical generated markup should bypass morphdom",
);

console.log("refresh-render-stability tests passed");
