import assert from "node:assert/strict";

import { mergedProviderKeys } from "../src/provider-key-view.mjs";

const key = (index, id, extra = {}) => ({
  index,
  key_id: id,
  masked: id,
  ...extra,
});

const identities = (keys) => keys.map((entry) => entry.key_id);

const runtimeKey0 = key(0, "key-0", { available: true, runtime_enabled: true });
const runtimeKey1 = key(1, "key-1", { available: true, runtime_enabled: true });
const configKey0 = key(0, "key-0");
const configKey1 = key(1, "key-1");

assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0], [configKey0])),
  ["key-0"],
);

const pendingKey1 = key(1, "pending", { pending: true });
assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0], [configKey0, pendingKey1])),
  ["key-0", "pending"],
  "an optimistic add remains visible while runtime still contains the old key list",
);

assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0], [configKey0, configKey1])),
  ["key-0", "key-1"],
  "a confirmed add remains visible while a delayed runtime snapshot is still missing it",
);

assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0, runtimeKey1], [configKey0, configKey1])),
  ["key-0", "key-1"],
);

const deletingKey1 = key(1, "key-1", { pending_delete: true });
assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0, runtimeKey1], [configKey0, deletingKey1])),
  ["key-0"],
  "an optimistic delete hides the key even while runtime still contains it",
);

assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0, runtimeKey1], [configKey0])),
  ["key-0"],
  "a confirmed delete cannot be revived by a delayed runtime snapshot",
);

assert.deepEqual(
  mergedProviderKeys(
    [key(0, "key-0", { proxy: "http://stale.proxy", available: true, runtime_enabled: true })],
    [key(0, "key-0", { proxy: "" })],
  )[0],
  key(0, "key-0", { proxy: "", available: true, runtime_enabled: true }),
  "saved config fields stay authoritative while runtime contributes health state",
);

const runtimeA = key(0, "key-a", { available: false, runtime_enabled: true });
const runtimeB = key(1, "key-b", { available: true, runtime_enabled: true });
const reindexedConfigB = key(0, "key-b");
const reindexed = mergedProviderKeys([runtimeA, runtimeB], [reindexedConfigB]);
assert.deepEqual(
  identities(reindexed),
  ["key-b"],
  "deleting an earlier key must match the remaining key by identity, not stale index",
);
assert.equal(reindexed[0].index, 0, "actions must use the current config index after reindexing");
assert.equal(reindexed[0].available, true, "runtime health follows the matching key identity");

assert.deepEqual(
  identities(mergedProviderKeys([runtimeKey0], undefined)),
  ["key-0"],
  "runtime keys remain a fallback before the config snapshot has loaded",
);

assert.deepEqual(
  mergedProviderKeys([runtimeKey0], []),
  [],
  "an authoritative empty config cannot be repopulated by stale runtime keys",
);

console.log("provider key view tests passed");
