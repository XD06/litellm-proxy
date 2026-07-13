import assert from "node:assert/strict";

import { keyModelsPatchValue, parseKeyModelsText } from "../src/key-models.mjs";

assert.deepEqual(
  parseKeyModelsText("grok-4.3=grok-4.3-high, glm-5.2=ZhipuAI/GLM-5.2"),
  {
    "grok-4.3": "grok-4.3-high",
    "glm-5.2": "ZhipuAI/GLM-5.2",
  },
);
assert.equal(
  keyModelsPatchValue(""),
  null,
  "an empty model field means no key-level restriction, not an empty whitelist",
);
assert.deepEqual(
  keyModelsPatchValue("agnes-2.0-flash"),
  { "agnes-2.0-flash": "agnes-2.0-flash" },
);

console.log("key model config tests passed");
