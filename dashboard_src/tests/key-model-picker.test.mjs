import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseKeyModelScope,
  parseScopedKeySelection,
  keyModelPickerGroups,
  mergeKeyModelSelection,
  filterKeyModelGroups,
  selectionKey,
  selectionScopedIds,
  serializeKeyModelSelection,
} from "../src/key-model-picker.mjs";

assert.deepEqual(parseKeyModelScope("*"), [], "'*' means all models");
assert.deepEqual(parseKeyModelScope("  "), [], "blank means all models");
assert.deepEqual(
  parseKeyModelScope(" a, b ; a\nc "),
  ["a", "b", "c"],
  "comma / semicolon / newline separated ids are trimmed and deduped",
);

const catalog = {
  providers: [
    { name: "alpha", enabled: true, models: ["alpha-model", "shared-model"] },
    { name: "beta", enabled: false, models: ["beta-model"] },
  ],
  models: ["alpha-model", "shared-model", "beta-model", "alias-model"],
};
const groups = keyModelPickerGroups(catalog);
assert.equal(groups.length, 3, "two provider groups + one 'other' group");
assert.deepEqual(groups[0].models, ["alpha-model", "shared-model"]);
assert.equal(groups[1].enabled, false, "disabled provider state is preserved");
assert.deepEqual(groups[2].models, ["alias-model"], "unassigned global alias gets its own group");
assert.equal(groups[2].name, "*");
assert.deepEqual(keyModelPickerGroups({ providers: [], models: [] }), []);

const byModel = filterKeyModelGroups(groups, "BETA");
assert.equal(byModel.length, 1);
assert.deepEqual(byModel[0].models, ["beta-model"], "search is case-insensitive on model ids");
const byProvider = filterKeyModelGroups(groups, "alpha");
assert.equal(byProvider.length, 1);
assert.deepEqual(
  byProvider[0].models,
  ["alpha-model", "shared-model"],
  "a provider-name match keeps the whole group",
);
assert.deepEqual(filterKeyModelGroups(groups, "nothing"), []);

assert.equal(
  serializeKeyModelSelection(["alpha-model"], ["my-custom"]),
  "my-custom, alpha-model",
  "custom entries come first, followed by the picked ids",
);
assert.equal(serializeKeyModelSelection([], []), "", "empty selection writes back 'all models'");
assert.equal(serializeKeyModelSelection(["a", "a", " b "], []), "a, b");
assert.equal(
  mergeKeyModelSelection(["alpha:shared-model"], ["shared-model", "my-custom"]),
  "my-custom, alpha:shared-model",
  "a plain id for the same model is superseded so the provider restriction wins",
);
assert.equal(
  mergeKeyModelSelection([], ["shared-model"]),
  "shared-model",
  "unrelated plain ids are preserved",
);
assert.equal(
  mergeKeyModelSelection(["alias-model"], ["alias-model"]),
  "alias-model",
  "Other/global plain ids are not duplicated",
);

// Every checkbox is independent: two providers listing the same model id
// serialize to two distinct entries, never a de-duplicated plain id.
assert.deepEqual(
  selectionScopedIds([
    selectionKey("alpha", "shared-model"),
    selectionKey("beta", "shared-model"),
  ]),
  ["alpha:shared-model", "beta:shared-model"],
  "selecting one model in two providers writes two scoped entries",
);
assert.deepEqual(
  selectionScopedIds([selectionKey("alpha", "m"), selectionKey("alpha", "m")]),
  ["alpha:m"],
  "duplicate selection keys are de-duplicated",
);
assert.deepEqual(
  selectionScopedIds([selectionKey("*", "alias-model")]),
  ["alias-model"],
  "the synthetic Other/global group stays an unscoped plain id",
);
assert.deepEqual(selectionScopedIds(["loose-string"]), ["loose-string"]);

assert.deepEqual(
  parseScopedKeySelection("alpha:alpha-model, alpha:shared-model", catalog),
  {
    keys: [selectionKey("alpha", "alpha-model"), selectionKey("alpha", "shared-model")],
    custom: [],
  },
  "saved scoped entries restore exactly those (provider, model) boxes",
);
assert.deepEqual(
  parseScopedKeySelection("beta:beta-model", catalog),
  { keys: [selectionKey("beta", "beta-model")], custom: [] },
);
assert.deepEqual(
  parseScopedKeySelection("shared-model", catalog),
  { keys: [], custom: ["shared-model"] },
  "a plain id is kept verbatim instead of being linked to every provider",
);
assert.deepEqual(
  parseScopedKeySelection("alias-model", catalog),
  { keys: [selectionKey("*", "alias-model")], custom: [] },
  "a plain id belonging to the Other/global group restores that one box",
);
assert.deepEqual(
  parseScopedKeySelection("alpha:gone-model, unknown:alpha-model, my-custom", catalog),
  { keys: [], custom: ["alpha:gone-model", "unknown:alpha-model", "my-custom"] },
  "vanished scoped models and hand-typed ids are never silently dropped",
);
assert.deepEqual(parseScopedKeySelection("*", catalog), { keys: [], custom: [] });
assert.deepEqual(parseScopedKeySelection("", catalog), { keys: [], custom: [] });

// Regression for the reported bug: pick ONE provider's model, save, reopen —
// the same-named model in the other provider must NOT come back selected.
const dupCatalog = {
  providers: [
    { name: "alpha", enabled: true, models: ["shared-model", "alpha-model"] },
    { name: "beta", enabled: true, models: ["shared-model", "beta-model"] },
  ],
  models: ["shared-model", "alpha-model", "beta-model"],
};
const picked = [selectionKey("alpha", "shared-model")];
const saved = serializeKeyModelSelection(selectionScopedIds(picked), []);
assert.equal(saved, "alpha:shared-model");
const reopened = parseScopedKeySelection(saved, dupCatalog);
assert.deepEqual(reopened.keys, [selectionKey("alpha", "shared-model")]);
assert.ok(
  !reopened.keys.includes(selectionKey("beta", "shared-model")),
  "reopening must not select beta's same-named model",
);
assert.equal(
  serializeKeyModelSelection(selectionScopedIds(reopened.keys), reopened.custom),
  saved,
  "save -> reopen -> save is stable",
);

// Searching a model id then "Select all" is the only way to allow it across
// providers: it produces one scoped entry per visible (provider, model) row.
const searchHits = filterKeyModelGroups(keyModelPickerGroups(dupCatalog), "shared-model");
const visibleKeys = searchHits.flatMap(
  (group) => group.models.map((id) => selectionKey(group.name, id)),
);
assert.deepEqual(
  selectionScopedIds(visibleKeys),
  ["alpha:shared-model", "beta:shared-model"],
  "search + Select all covers both providers without implicit linkage",
);

const read = (relative) => readFileSync(
  fileURLToPath(new URL(relative, import.meta.url)), "utf8",
).replace(/\r\n/g, "\n");
const appSource = read("../src/app.js");
const builtApp = read("../../dashboard/app.js");
const i18n = read("../src/i18n.js");
const styles = read("../src/styles.css");

for (const [label, source] of [["source", appSource], ["built", builtApp]]) {
  assert.match(source, /admin\/client-keys\/catalog/, `${label} must read the catalog endpoint`);
  assert.match(source, /data-key-model-picker-open/, `${label} must render the browse button`);
  assert.match(source, /openKeyModelPicker\(form\)/, `${label} must wire the picker to the drawer form`);
  assert.match(
    source,
    /dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/,
    `${label} must mark the drawer dirty so a poll cannot drop the selection`,
  );
  assert.match(source, /key-model-picker-groups/, `${label} must render grouped model checkboxes`);
  assert.match(source, /selected\.has\(selectionKey\(group\.name, id\)\) \? "checked" : ""/, `${label} must render per-provider selection state`);
  assert.match(source, /data-key-model-owner=/, `${label} must record which provider owns each checkbox`);
  assert.match(source, /data-key-model-no-results/, `${label} must show a no-results state without rebuilding`);
  assert.match(source, /syncChecks\(modelId\)/, `${label} must sync only the clicked id`);
  assert.match(source, /applyFilter\(\)/, `${label} must filter by hiding rows`);
  assert.match(source, /groupsEl\.innerHTML = groups\.length/, `${label} must build the list once`);
  assert.doesNotMatch(source, /renderGroups\(\)/, `${label} must not rebuild the whole list on every click`);
  // esbuild inlines the single-use `currentText` const into the call in the
  // built bundle, so match the call shape rather than the exact argument name.
  assert.match(source, /parseScopedKeySelection\([\s\S]{0,160}?catalog\)/, `${label} must restore independent saved selections`);
  assert.match(source, /selectionScopedIds\(selected\)/, `${label} must write provider:model entries on apply`);
  assert.match(source, /mergeKeyModelSelection\(selectionScopedIds\(selected\), custom\)/, `${label} must drop stale plain ids that would defeat the restriction`);
  assert.match(source, /count: selected\.size/, `${label} must count every independent selection`);
  assert.match(source, /selectionKey\(target\.dataset\.keyModelOwner, modelId\)/, `${label} must toggle exactly one checkbox on a model click`);
  assert.match(source, /visibleKeys\.add\(selectionKey\(groupName, id\)\)/, `${label} must track currently visible rows`);
  assert.match(source, /visibleKeys\.forEach\(\(key\) => selected\.add\(key\)\)/, `${label} must make Select all act on search results only`);
  assert.doesNotMatch(source, /data-key-model-only/, `${label} must not render the Only button`);
  assert.doesNotMatch(source, /linkedSelectionKeys/, `${label} must not link same-named models`);
  assert.doesNotMatch(source, /onlyProvider/, `${label} must not have an Only mode state`);
}
assert.match(i18n, /"settings\.keys\.picker_title"/, "picker copy must be translated");
assert.doesNotMatch(i18n, /"settings\.keys\.picker_only/, "the Only button copy must be gone");
assert.match(i18n, /"settings\.keys\.f_models_hint"[\s\S]*?provider:model/, "the model hint must document the provider:model syntax");
assert.match(i18n, /"settings\.keys\.f_models_hint"[\s\S]*?\/v1\/models/, "hint must mention the filtered catalog");
assert.match(i18n, /"settings\.keys\.f_models_hint"[\s\S]*?fails instead of failing over/, "hint must warn that an unavailable provider fails the request");
assert.match(i18n, /"settings\.keys\.picker_subtitle"[\s\S]*?independent/, "subtitle must state that checkboxes are independent");
assert.match(i18n, /"settings\.keys\.picker_empty_hint"[\s\S]*?kept as-is/, "hint must state that plain ids are preserved");
assert.match(styles, /\.key-model-picker-groups\s*\{/, "picker groups must be styled");
assert.match(styles, /\.key-model-scope-row\s*\{/, "the model input row must be styled");
assert.doesNotMatch(styles, /\.key-model-only-btn/, "the Only button styles must be removed");

console.log("key model picker tests passed");
