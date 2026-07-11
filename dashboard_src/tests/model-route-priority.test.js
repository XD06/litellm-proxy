const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");

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

console.log("model route priority tests passed");
