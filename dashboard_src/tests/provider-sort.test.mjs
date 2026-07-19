import assert from "node:assert/strict";

import { compareProviderViews } from "../src/provider-sort.mjs";

function view(name, priority, state, usable) {
  return {
    name,
    priority,
    runtimeState: { id: state },
    keyStats: { usable },
  };
}

const degradedHigh = view("degraded-high", 30, "degraded", 1);
const normalLow = view("normal-low", 10, "normal", 1);
const cooldownHigh = view("cooldown-high", 40, "cooldown", 1);
const unavailableHighest = view("unavailable-highest", 100, "unavailable", 0);
const disabledHighest = view("disabled-highest", 200, "disabled", 2);

assert.ok(compareProviderViews(degradedHigh, normalLow) < 0, "usable degraded providers sort by priority");
assert.ok(compareProviderViews(cooldownHigh, normalLow) < 0, "usable cooldown providers sort by priority");
assert.ok(compareProviderViews(normalLow, unavailableHighest) < 0, "providers without usable keys sort after usable providers");
assert.ok(compareProviderViews(normalLow, disabledHighest) < 0, "disabled providers sort after usable providers");
assert.ok(compareProviderViews(unavailableHighest, disabledHighest) < 0, "unavailable providers keep deterministic status ordering");

console.log("provider sort tests passed");
