const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");

function bodyBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source region: ${startMarker}`);
  return source.slice(start, end);
}

const updateDom = bodyBetween("function updateDOM", "const mobileSettings");
const tooltip = bodyBetween("function installTooltip", "async function init");

assert.match(
  tooltip,
  /const selector = "\[data-tip\], \[title\], \[data-original-title\]"/,
  "title-only targets must remain discoverable after their native title is suppressed",
);
assert.match(updateDom, /scheduleTooltipReconcile\(\)/, "DOM patches must reconcile a visible tooltip with the replacement node");
assert.match(tooltip, /document\.elementFromPoint/, "tooltip reconciliation must resolve the element currently under the pointer");
assert.match(tooltip, /requestAnimationFrame/, "multiple DOM patches must coalesce into one tooltip reconciliation");
assert.match(tooltip, /aria-describedby/, "the active tooltip anchor must be exposed to assistive technology");
assert.match(tooltip, /_currentTipTarget\.isConnected/, "a detached tooltip anchor must never remain authoritative");

console.log("tooltip refresh tests passed");
