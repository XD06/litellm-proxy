import assert from "node:assert/strict";

import { OptimisticConfigStore, appendPendingKey, appendPendingProvider } from "../src/optimistic-config.mjs";

const store = new OptimisticConfigStore({
  providers: { alpha: { priority: 10, enabled: true } },
});

const mutation = store.begin("provider:alpha", (config) => {
  config.providers.alpha.priority = 100;
});

assert.equal(mutation.config.providers.alpha.priority, 100);
assert.equal(store.config().providers.alpha.priority, 100);
assert.equal(store.confirmedConfig().providers.alpha.priority, 10);

const afterPoll = store.acceptConfirmed({
  providers: {
    alpha: { priority: 10, enabled: true },
    beta: { priority: 20, enabled: true },
  },
});
assert.equal(afterPoll.providers.alpha.priority, 100, "polling must not flash the old pending value");
assert.equal(afterPoll.providers.beta.priority, 20, "new confirmed server data is still accepted");

const concurrent = new OptimisticConfigStore({
  providers: {
    alpha: { priority: 10 },
    beta: { priority: 20 },
  },
});
const alphaMutation = concurrent.begin("provider:alpha", (config) => {
  config.providers.alpha.priority = 100;
});
const betaMutation = concurrent.begin("provider:beta", (config) => {
  config.providers.beta.priority = 200;
});
const afterAlphaResponse = concurrent.confirm(alphaMutation.id, {
  providers: {
    alpha: { priority: 100 },
    beta: { priority: 20 },
  },
});
assert.equal(afterAlphaResponse.providers.alpha.priority, 100);
assert.equal(
  afterAlphaResponse.providers.beta.priority,
  200,
  "an older full-config response must retain another resource's pending value",
);
const afterBetaFailure = concurrent.reject(betaMutation.id);
assert.equal(afterBetaFailure.providers.alpha.priority, 100, "confirmed resources remain committed");
assert.equal(afterBetaFailure.providers.beta.priority, 20, "only the failed mutation rolls back");

const resources = new OptimisticConfigStore({ providers: { alpha: {}, beta: {} } });
assert.ok(resources.begin("provider:alpha", () => {}));
assert.equal(
  resources.begin("provider:alpha", () => {}),
  null,
  "the same resource cannot submit twice while pending",
);
assert.ok(resources.begin("provider:beta", () => {}), "distinct resources can remain pending together");

const reversedResponses = new OptimisticConfigStore({
  providers: { alpha: { priority: 10 }, beta: { priority: 20 } },
});
const olderAlpha = reversedResponses.begin("provider:alpha", (config) => {
  config.providers.alpha.priority = 100;
});
const newerBeta = reversedResponses.begin("provider:beta", (config) => {
  config.providers.beta.priority = 200;
});
reversedResponses.confirm(newerBeta.id, {
  providers: { alpha: { priority: 10 }, beta: { priority: 200 } },
});
const afterLateOlderResponse = reversedResponses.confirm(olderAlpha.id, {
  providers: { alpha: { priority: 100 }, beta: { priority: 20 } },
});
assert.equal(afterLateOlderResponse.providers.alpha.priority, 100);
assert.equal(
  afterLateOlderResponse.providers.beta.priority,
  200,
  "a late older response cannot erase an already successful newer resource mutation",
);
assert.equal(
  reversedResponses.acceptConfirmed({
    providers: { alpha: { priority: 100 }, beta: { priority: 200 } },
  }).providers.beta.priority,
  200,
  "the next authoritative poll reconciles and releases successful overlays",
);

const keys = new OptimisticConfigStore({ providers: { alpha: { keys: [] } } });
keys.begin("provider-key-list:alpha", (config) => {
  appendPendingKey(config, "alpha", {
    key: "raw-super-secret",
    proxy: "http://127.0.0.1:9000",
    models: { alias: "raw-model" },
  });
});
const optimisticKeyConfig = keys.config();
assert.doesNotMatch(JSON.stringify(optimisticKeyConfig), /raw-super-secret/);
assert.deepEqual(optimisticKeyConfig.providers.alpha.keys[0].models, { alias: "raw-model" });
assert.equal(optimisticKeyConfig.providers.alpha.keys[0].pending, true);

const providers = new OptimisticConfigStore({ providers: {} });
providers.begin("provider:new-provider", (config) => {
  appendPendingProvider(config, {
    name: "new-provider",
    base_url: "https://example.test",
    keys: ["provider-raw-secret"],
    priority: 50,
  });
});
const optimisticProviderConfig = providers.config();
assert.equal(optimisticProviderConfig.providers["new-provider"].priority, 50);
assert.equal(optimisticProviderConfig.providers["new-provider"].keys[0].pending, true);
assert.doesNotMatch(JSON.stringify(optimisticProviderConfig), /provider-raw-secret/);

const staleMutation = providers.begin("provider:stale", () => {});
providers.clear();
assert.deepEqual(providers.config(), {}, "logout/reset clears confirmed and pending config state");
providers.confirm(staleMutation.id, { providers: { stale: { enabled: true } } });
assert.deepEqual(providers.config(), {}, "a response from before logout cannot restore cleared config");

console.log("optimistic config tests passed");
