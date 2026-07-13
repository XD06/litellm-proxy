import assert from "node:assert/strict";

import { ConfigRefreshCoordinator, InFlightActionRegistry } from "../src/operation-guard.mjs";

const actions = new InFlightActionRegistry();
const finishFirst = actions.begin("key:add:alpha");
assert.equal(typeof finishFirst, "function");
assert.equal(actions.has("key:add:alpha"), true);
assert.equal(actions.begin("key:add:alpha"), null, "the same action key is rejected while in flight");
assert.equal(typeof actions.begin("key:add:beta"), "function", "different action keys can run together");
finishFirst();
assert.equal(actions.has("key:add:alpha"), false);
assert.equal(typeof actions.begin("key:add:alpha"), "function", "the key is available after finish");
actions.clear();

const refresh = new ConfigRefreshCoordinator();
const beforeEdit = refresh.snapshot();
assert.equal(refresh.shouldDefer(beforeEdit, false), false);

refresh.markInteraction();
assert.equal(
  refresh.shouldDefer(beforeEdit, false),
  true,
  "a refresh that started before user input cannot apply config later",
);

const beforeMutation = refresh.snapshot();
const mutation = refresh.beginMutation();
assert.equal(refresh.mutationDepth, 1);
assert.equal(
  refresh.shouldDefer(beforeMutation, false),
  true,
  "a refresh that started before a save began is deferred",
);
assert.equal(
  refresh.shouldDefer(refresh.snapshot(), false),
  true,
  "static config refresh is deferred while a save is still in flight",
);

mutation.finish();
assert.equal(refresh.mutationDepth, 0);
assert.equal(
  refresh.shouldDefer(refresh.snapshot(), false),
  false,
  "new refreshes after the save completes may apply config",
);
assert.equal(
  refresh.shouldDefer(refresh.snapshot(), true),
  true,
  "focused or dirty config inputs still protect against static re-rendering",
);

console.log("operation guard tests passed");
