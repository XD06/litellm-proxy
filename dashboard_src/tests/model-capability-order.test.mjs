import assert from "node:assert/strict";
import {
  modelCapabilitySnapshotMarker,
  shouldAcceptModelCapabilitySnapshot,
} from "../src/model-capability-order.mjs";

const fresh = {
  models_epoch_ms: 2000,
  models_version: 12,
  providers: { alpha: { fetched_at: 2, models: ["new-model"] } },
};
const delayedOld = {
  models_epoch_ms: 1000,
  models_version: 10,
  providers: { alpha: { fetched_at: 1, models: ["old-model"] } },
};

assert.equal(shouldAcceptModelCapabilitySnapshot(null, fresh), true);
assert.equal(
  shouldAcceptModelCapabilitySnapshot(fresh, delayedOld),
  false,
  "an older GET that arrives late must not replace the accepted model list",
);
assert.equal(
  shouldAcceptModelCapabilitySnapshot(fresh, { ...fresh, models_version: 11 }),
  false,
  "the version counter must reject same-millisecond stale responses",
);
assert.equal(
  shouldAcceptModelCapabilitySnapshot(fresh, { ...fresh, models_version: 13 }),
  true,
  "a same-millisecond final discovery response must replace pending data",
);
assert.equal(
  shouldAcceptModelCapabilitySnapshot(fresh, { ...delayedOld, models_epoch_ms: 3000, models_version: 1 }),
  true,
  "a newer wall-clock snapshot must be accepted after a server restart even if its version resets",
);

assert.deepEqual(
  modelCapabilitySnapshotMarker({ providers: { alpha: { fetched_at: 7 }, beta: { fetched_at: 9 } } }),
  { timestamp: 9000, version: -1 },
  "legacy snapshots should fall back to the latest provider fetched_at",
);
assert.equal(shouldAcceptModelCapabilitySnapshot(fresh, null), false);

console.log("model capability ordering tests passed");
