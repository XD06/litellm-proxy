import assert from "node:assert/strict";

import {
  PROVIDER_CALL_BAR_SLOTS,
  recentProviderActivityEvents,
} from "../src/provider-activity-window.mjs";

const events = Array.from({ length: 48 }, (_, index) => ({ id: index + 1 }));
const recent = recentProviderActivityEvents(events);

assert.equal(PROVIDER_CALL_BAR_SLOTS, 40, "the provider strip exposes 40 visual slots");
assert.equal(recent.length, 40, "a busy provider fills every visual slot");
assert.deepEqual(
  recent.map((event) => event.id),
  Array.from({ length: 40 }, (_, index) => index + 9),
  "the strip keeps the newest 40 events in chronological order",
);
assert.deepEqual(
  recentProviderActivityEvents(events.slice(0, 3)),
  events.slice(0, 3),
  "a short activity window keeps every event",
);
assert.deepEqual(recentProviderActivityEvents(null), [], "missing activity is an empty window");

console.log("provider activity window tests passed");
