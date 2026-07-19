const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "..", "..", "dashboard", "index.html"), "utf8");

assert.strictEqual(
  (source.match(/<label\b/g) || []).length,
  (source.match(/<\/label>/g) || []).length,
  "dashboard templates must keep label tags balanced",
);

assert.match(source, /data-model-route-priority-apply/, "route cards must expose direct priority controls");
assert.match(
  source,
  /provider_select: "priority_failover"/,
  "saving a model priority must select priority_failover so the override is honored",
);
assert.match(
  source,
  /item\.name === provider[\s\S]{0,180}priority === null \? \{\} : \{ priority \}/,
  "saving one provider priority must preserve the other route providers",
);
assert.match(
  source,
  /priority < -1000 \|\| priority > 1000/,
  "frontend priority bounds must match backend validation",
);
assert.match(index, /name="format_preference"/, "model route editor must expose a format preference override");
assert.match(
  source,
  /format_preference: String\(form\.elements\.format_preference\.value \|\| ""\)\.trim\(\)/,
  "model route mutations must send the format preference override",
);
assert.match(
  source,
  /format_preference: String\(routingForm\.elements\.format_preference\.value \|\| "priority_first"\)\.trim\(\)/,
  "global routing mutations must send the format preference policy",
);
assert.match(
  source,
  /semantic_conversion: String\(routingForm\.elements\.semantic_conversion\.value \|\| "safe"\)\.trim\(\)/,
  "global routing mutations must send the semantic conversion policy",
);

console.log("model route priority tests passed");
