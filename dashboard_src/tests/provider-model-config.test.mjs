import assert from "node:assert/strict";

import {
  CATALOG_SOURCE_ORDER,
  clearLiveFormField,
  mergeProviderModelCatalogItems,
  mergeStaticModelIds,
  normalizeStaticModelIds,
  normalizeVariantEntries,
  normalizeVariantGroups,
  planCatalogEntries,
  planStaticModelSave,
  planVariantGroupSave,
  providerModelMappingOldId,
  providerModelSourceId,
  resetLiveForm,
  variantChainLabel,
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

const conflictingModels = mergeProviderModelCatalogItems(
  [
    { label: "deepseek-v4-flash", raw: "deepseek-v4-flash" },
    { label: "deepseek-v4-flash-free", raw: "deepseek-v4-flash-free" },
  ],
  { "deepseek-v4-flash": "deepseek-v4-flash-free" },
);
assert.deepEqual(
  conflictingModels.map((item) => [item.label, item.raw, item.manual]),
  [
    ["deepseek-v4-flash", "deepseek-v4-flash-free", true],
    ["deepseek-v4-flash", "deepseek-v4-flash", false],
  ],
  "a manual alias must not hide a different same-named upstream model",
);
assert.equal(providerModelSourceId(conflictingModels[0]), "deepseek-v4-flash-free");
assert.equal(providerModelSourceId(conflictingModels[1]), "deepseek-v4-flash");
assert.equal(providerModelMappingOldId(conflictingModels[0]), "deepseek-v4-flash");
assert.equal(
  providerModelMappingOldId(conflictingModels[1]),
  "",
  "editing an automatic model must not delete a same-named manual mapping",
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


// --- variant groups in the model catalog ---------------------------------
// A variant group is a client id the backend already advertises, so the console
// must list, mark and switch it off like any other catalog row.
const rowCodes = (row) => row.warnings.map((warning) => warning.code);

assert.deepEqual(
  normalizeVariantGroups({
    "grok-4.3": [
      { model: "xai/grok-4-mini", priority: 10 },
      { raw_model: "xai/grok-4", priority: 50 },
      "xai/grok-4-console",
    ],
    "removed-4.3": null,
    "empty-4.3": [],
  }).entries,
  [
    {
      id: "grok-4.3",
      key: "grok-4.3",
      variants: [
        { model: "xai/grok-4", priority: 50 },
        { model: "xai/grok-4-mini", priority: 10 },
        { model: "xai/grok-4-console", priority: 0 },
      ],
    },
    { id: "empty-4.3", key: "empty-4.3", variants: [] },
  ],
  "variant groups must order members by priority, drop tombstones and keep an empty group visible",
);

assert.deepEqual(
  normalizeVariantGroups({
    g: [
      { model: "up/a", priority: 5 },
      { model: "up/a", priority: 60 },
      { model: "up/b", priority: 5 },
    ],
  }).entries[0].variants,
  [
    { model: "up/a", priority: 60 },
    { model: "up/b", priority: 5 },
  ],
  "a duplicated upstream must resolve to its highest-priority entry, not the first",
);

const caseGroups = normalizeVariantGroups({
  "Grok-4.3": [{ model: "up/a" }],
  "grok-4.3": [{ model: "up/b" }],
});
assert.equal(caseGroups.entries.length, 2, "case-only duplicate group keys must both stay reportable");
assert.equal(caseGroups.byKey.get("grok-4.3").variants[0].model, "up/a", "byKey must resolve the first spelling");

assert.equal(
  variantChainLabel("grok-4.3", [
    { model: "xai/grok-4", priority: 50 },
    { model: "xai/grok-4-mini", priority: 10 },
  ]),
  "grok-4.3 → xai/grok-4 (50) → xai/grok-4-mini (10)",
  "the tooltip chain must show the effective resolution order",
);

const shadowed = planCatalogEntries({
  items: [
    { label: "grok-4.3", raw: "xai/grok-4", manual: true },
    { label: "grok-4.3", raw: "xai/grok-4-alt", manual: false },
    { label: "s-4.3", raw: "s-4.3", manual: false },
  ],
  staticIds: ["s-4.3", "static-only"],
  variantGroups: normalizeVariantGroups({
    "grok-4.3": [{ model: "xai/grok-4", priority: 50 }],
    "s-4.3": [{ model: "s-4.3", priority: 1 }],
  }),
});
assert.deepEqual(
  shadowed.map((row) => [row.id, row.mainSource, row.sources, rowCodes(row)]),
  [
    ["grok-4.3", "variant", ["variant", "renamed", "discovered"], ["variant_shadows_manual_map", "variant_shadows_discovered"]],
    ["s-4.3", "variant", ["variant", "static", "discovered"], ["variant_shadows_discovered", "same_name_static"]],
    ["static-only", "static", ["static"], []],
  ],
  "a variant group must own its client id and report every source it shadows",
);
assert.deepEqual(
  shadowed[0].warnings[1].detail,
  { raw: "xai/grok-4-alt" },
  "the shadowed discovered mapping must be named in the warning",
);
assert.equal(shadowed[0].raw, "xai/grok-4", "a variant row still reports the rename target it shadows");
assert.deepEqual(CATALOG_SOURCE_ORDER, ["variant", "renamed", "static", "discovered"]);

const shared = planCatalogEntries({
  items: [
    { label: "shared-up", raw: "shared-up", manual: false },
    { label: "alias-4", raw: "shared-up", manual: true },
  ],
  variantGroups: normalizeVariantGroups({
    "group-a": [
      { model: "shared-up", priority: 30 },
      { model: "up/only-a", priority: 20 },
    ],
    "group-b": [{ model: "shared-up", priority: 5 }],
    "empty-group": [],
  }),
  disabledKeys: ["up/only-a"],
});
const sharedById = new Map(shared.map((row) => [row.id, row]));
assert.deepEqual(shared.map((row) => row.id), ["group-a", "group-b", "empty-group", "shared-up", "alias-4"]);
assert.deepEqual(
  rowCodes(sharedById.get("group-a")),
  ["shared_upstream", "stale_upstream_disabled"],
  "a group must report shared upstreams and disabled members",
);
assert.deepEqual(sharedById.get("group-a").warnings[0].detail, { model: "shared-up", by: ["group-b", "alias-4"] });
assert.deepEqual(sharedById.get("group-a").warnings[1].detail, {
  disabled: 1,
  total: 2,
  models: ["up/only-a"],
});
assert.deepEqual(rowCodes(sharedById.get("alias-4")), ["shared_upstream"], "a rename sharing a group upstream must warn too");
assert.deepEqual(rowCodes(sharedById.get("empty-group")), ["empty_variant_group"]);
assert.deepEqual(
  sharedById.get("shared-up").refs,
  ["group-a", "group-b"],
  "a client id used as an upstream must name the groups that reference it",
);
assert.deepEqual(rowCodes(sharedById.get("shared-up")), [], "a referenced client id keeps its own row without a warning");

const caseless = planCatalogEntries({
  items: [
    { label: "Grok-4.3", raw: "Grok-4.3", manual: false },
    { label: "grok-4.3", raw: "grok-4.3", manual: false },
  ],
});
assert.equal(caseless.length, 1, "ids that differ only by case must merge into one row");
assert.deepEqual(rowCodes(caseless[0]), ["case_only_duplicate"]);
assert.deepEqual(caseless[0].warnings[0].detail, { ids: ["Grok-4.3", "grok-4.3"] });

const casedVariant = planCatalogEntries({
  items: [{ label: "GROK-4.3", raw: "GROK-4.3", manual: false }],
  variantGroups: normalizeVariantGroups({ "grok-4.3": [{ model: "up/a" }] }),
});
assert.equal(casedVariant.length, 1, "a case-only variant key must merge with the discovered id");
assert.equal(casedVariant[0].mainSource, "variant");
assert.ok(rowCodes(casedVariant[0]).includes("case_only_duplicate"));

const ordered = planCatalogEntries({
  items: [
    { label: "a1", raw: "a1", manual: false },
    { label: "a2", raw: "a2", manual: true },
  ],
  staticIds: ["z-static"],
  variantGroups: normalizeVariantGroups({ "v-group": [{ model: "up/1" }] }),
});
assert.deepEqual(
  ordered.map((row) => row.id),
  ["v-group", "z-static", "a1", "a2"],
  "variant groups lead the catalog, then static declarations, then discovery order",
);
assert.deepEqual(planCatalogEntries(), [], "an empty provider must not invent catalog rows");
assert.deepEqual(normalizeVariantGroups(null).entries, [], "a provider without variant groups must stay empty");


// --- catalog edits: write plans ------------------------------------------
const groupPlan = planVariantGroupSave({
  canonical: "grok-4.3",
  variants: [
    { model: "xai/grok-4-mini", priority: 10 },
    { model: "xai/grok-4", priority: 50 },
    { model: "xai/grok-4-mini", priority: 99 },
  ],
  taken: [{ id: "gpt-5.5", source: "static" }],
});
assert.deepEqual(groupPlan.writes, [{ model: "grok-4.3", variants: [
  { model: "xai/grok-4", priority: 50 },
  { model: "xai/grok-4-mini", priority: 10 },
] }], "an untouched name writes one key with the members the backend will store");
assert.equal(groupPlan.renamed, false);
assert.equal(groupPlan.clash, null);

const renamePlan = planVariantGroupSave({
  canonical: "grok-4.3",
  nextModel: "grok-4.3-fast",
  variants: [{ model: "xai/grok-4", priority: 50 }],
});
assert.deepEqual(
  renamePlan.writes,
  [
    { model: "grok-4.3-fast", variants: [{ model: "xai/grok-4", priority: 50 }] },
    { model: "grok-4.3", variants: [] },
  ],
  "a rename must write the new key first and only then empty the old one",
);
assert.equal(renamePlan.renamed, true);
assert.equal(renamePlan.clash, null, "an unused name needs no confirmation");

const clashPlan = planVariantGroupSave({
  canonical: "grok-4.3",
  nextModel: "GPT-5.5",
  variants: [{ model: "xai/grok-4", priority: 50 }],
  taken: [{ id: "gpt-5.5", source: "variant" }],
});
assert.deepEqual(clashPlan.clash, { id: "gpt-5.5", source: "variant" }, "a taken name must be reported for confirmation");
assert.equal(clashPlan.writes.length, 2, "the confirmed rename still performs both writes");

assert.deepEqual(
  planVariantGroupSave({ canonical: "", nextModel: "x" }).writes,
  [],
  "an edit without a canonical id must not write anything",
);
assert.deepEqual(
  planVariantGroupSave({ canonical: "grok-4.3", variants: [] }).writes,
  [{ model: "grok-4.3", variants: [] }],
  "clearing every member writes the empty group, which removes the alias",
);
assert.deepEqual(
  planVariantGroupSave({ canonical: "grok-4.3", nextModel: "GROK-4.3", variants: [] }).writes.length,
  1,
  "a case-only difference is the same client id, not a rename",
);

const staticRename = planStaticModelSave({ existing: ["a", "b", "c"], model: "b", nextModel: "b2" });
assert.deepEqual(staticRename.models, ["a", "b2", "c"], "a static rename must keep the operator's order");
assert.equal(staticRename.renamed, true);
assert.equal(staticRename.clash, null);

const staticClash = planStaticModelSave({ existing: ["a", "b"], model: "b", nextModel: "a" });
assert.deepEqual(staticClash.clash, { id: "a", source: "static" });
assert.deepEqual(staticClash.models, ["a", "b"], "a clashing static rename must leave the list untouched");
assert.equal(staticClash.renamed, false);

const staticRemove = planStaticModelSave({ existing: ["a", "b"], model: "B", remove: true });
assert.deepEqual(staticRemove.models, ["a"], "removing an entry matches case-insensitively");
assert.equal(staticRemove.removed, true);
assert.deepEqual(
  planStaticModelSave({ existing: ["a"], model: "missing", nextModel: "x" }),
  { models: ["a"], renamed: false, removed: false, clash: null },
  "editing an entry the list does not hold must be a no-op",
);

console.log("provider model config tests passed");
