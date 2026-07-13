import assert from "node:assert/strict";

import { createMutationBusySetter, liveElementLocator, MutationBusyTracker } from "../src/mutation-ui.mjs";

const original = { isConnected: true, id: "original" };
const replacement = { isConnected: true, id: "replacement" };
let current = replacement;
const locate = liveElementLocator(original, () => current);

assert.equal(locate(), original, "the submitted element is used while it remains mounted");

original.isConnected = false;
assert.equal(
  locate(),
  replacement,
  "after an optimistic re-render the locator follows the replacement element",
);

current = null;
assert.equal(locate(), null, "an absent replacement is handled without retaining a detached element");

const firstRoot = { isConnected: true, id: "first" };
const nextRoot = { isConnected: true, id: "next" };
let liveRoot = firstRoot;
const busyChanges = [];
const tracker = new MutationBusyTracker((element, busy) => {
  if (element) busyChanges.push([element.id, busy]);
});
const finish = tracker.start(() => liveRoot);

assert.deepEqual(busyChanges, [["first", true]], "starting a mutation marks the current root busy");

firstRoot.isConnected = false;
liveRoot = nextRoot;
tracker.refresh();
assert.deepEqual(
  busyChanges.at(-1),
  ["next", true],
  "a render refresh reapplies busy state to the replacement root",
);

finish();
assert.deepEqual(busyChanges.at(-1), ["next", false], "finishing restores the current root");

const enabledControl = { disabled: false };
const disabledControl = { disabled: true };
const attributes = new Map();
const classes = new Set();
const busyRoot = {
  setAttribute: (name, value) => attributes.set(name, value),
  removeAttribute: (name) => attributes.delete(name),
  classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
  },
  matches: () => false,
  querySelectorAll: () => [enabledControl, disabledControl],
};
const setBusy = createMutationBusySetter();

setBusy(busyRoot, true);
assert.equal(enabledControl.disabled, true);
assert.equal(disabledControl.disabled, true);
assert.equal(attributes.get("aria-busy"), "true");
assert.ok(classes.has("is-busy"));

setBusy(busyRoot, false);
assert.equal(enabledControl.disabled, false, "an enabled control is restored after saving");
assert.equal(disabledControl.disabled, true, "a control disabled before saving stays disabled");
assert.equal(attributes.has("aria-busy"), false);
assert.equal(classes.has("is-busy"), false);

console.log("mutation UI tests passed");
