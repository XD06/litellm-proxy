import assert from "node:assert/strict";

import {
  clearLiveFormField,
  mergeStaticModelIds,
  normalizeStaticModelIds,
  normalizeVariantEntries,
  resetLiveForm,
} from "../src/provider-model-config.mjs";

assert.deepEqual(
  normalizeVariantEntries([
    "grok-4.3-console",
    { raw_model: "grok-4.3-low", priority: 10 },
    { model: "grok-4.3-high", priority: 100 },
  ]),
  [
    { model: "grok-4.3-console", priority: 0 },
    { model: "grok-4.3-low", priority: 10 },
    { model: "grok-4.3-high", priority: 100 },
  ],
  "legacy string/raw_model variants must remain editable",
);

assert.deepEqual(
  normalizeStaticModelIds(["plain-model", { id: "legacy-object-model" }]),
  ["plain-model", "legacy-object-model"],
  "legacy object-shaped static models must remain editable",
);

assert.deepEqual(
  mergeStaticModelIds(["existing-model"], "new-model, existing-model, second-model"),
  ["existing-model", "new-model", "second-model"],
  "static model additions must append and de-duplicate",
);

const liveInput = { value: "saved-model" };
const liveForm = { elements: { namedItem: (name) => name === "static_models" ? liveInput : null } };
const root = { querySelector: () => liveForm };
assert.equal(clearLiveFormField(root, ".current-form", "static_models"), true);
assert.equal(liveInput.value, "");
assert.equal(
  clearLiveFormField({ querySelector: () => null }, ".missing-form", "static_models"),
  false,
  "a form replaced by optimistic rendering must not cause an undefined.value error",
);

let resetCount = 0;
assert.equal(
  resetLiveForm({ querySelector: () => ({ reset: () => { resetCount += 1; } }) }, ".live-form"),
  true,
);
assert.equal(resetCount, 1);
assert.equal(
  resetLiveForm({ querySelector: () => null }, ".missing-form"),
  false,
  "key/provider forms replaced by optimistic rendering must be handled safely",
);

console.log("provider model config tests passed");
