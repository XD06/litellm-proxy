import assert from "node:assert/strict";
import { groupRoutingTrace, routingTraceIdentity, routingTraceTone, summarizeFormatTraceStep } from "../src/routing-trace-view.mjs";

const directTrace = [
  { stage: "format_compatibility", code: "format_eligible", target_format: "chat_completions", fidelity: "lossless" },
  { stage: "format_compatibility", code: "format_eligible", target_format: "responses", fidelity: "lossless" },
  { stage: "format_compatibility", code: "format_eligible", target_format: "anthropic_messages", fidelity: "lossless" },
  { stage: "routing", code: "selected", provider: "sensen", key_masked: "sk-**cu", provider_model: "deepseek-v4-flash", upstream_format: "chat_completions" },
  { stage: "upstream_result", code: "attempt_succeeded", provider: "sensen", key_masked: "sk-**cu", provider_model: "deepseek-v4-flash", upstream_format: "chat_completions" },
];

const directSteps = groupRoutingTrace(directTrace);
assert.equal(directSteps.length, 3, "three format events should become one visual step");
assert.equal(directSteps[0].kind, "format_evaluation");
assert.deepEqual(directSteps[0].eligibleFormats, ["chat_completions", "responses", "anthropic_messages"]);
assert.equal(routingTraceTone(directSteps[0]), "ok");
assert.deepEqual(routingTraceIdentity(directSteps[1].event), ["sensen", "sk-**cu", "deepseek-v4-flash", "chat_completions"]);
assert.deepEqual(
  summarizeFormatTraceStep(directSteps[0], { clientFormat: "anthropic_messages", finalFormat: "chat_completions" }),
  {
    mode: "converted",
    sourceFormat: "anthropic_messages",
    targetFormat: "chat_completions",
    path: ["anthropic_messages", "chat_completions"],
    blocked: [],
    transformations: [],
    droppedHints: [],
  },
  "the default path must show the actual conversion instead of every eligible candidate",
);
assert.equal(
  summarizeFormatTraceStep(directSteps[0], { clientFormat: "chat_completions", finalFormat: "chat_completions" }).mode,
  "native",
  "same-format routing must say that no conversion happened",
);
assert.equal(
  summarizeFormatTraceStep(directSteps[0], { clientFormat: "chat_completions" }).mode,
  "unrestricted",
  "when no upstream was selected, compatibility must not claim a native upstream call",
);

const recoveredTrace = [
  { stage: "format_compatibility", code: "format_eligible", target_format: "chat_completions" },
  { stage: "routing", code: "provider_cooldown", provider: "alpha" },
  { stage: "routing", code: "model_unsupported_by_key", provider: "beta", key_id: "key-b" },
  { stage: "routing", code: "selected", provider: "gamma", key_id: "key-g" },
  { stage: "upstream_result", code: "attempt_failed", provider: "gamma", reason: "upstream_5xx" },
  { stage: "routing", code: "selected", provider: "delta", key_id: "key-d" },
  { stage: "upstream_result", code: "attempt_succeeded", provider: "delta" },
];

const recoveredSteps = groupRoutingTrace(recoveredTrace);
assert.deepEqual(recoveredSteps.map((step) => step.kind), ["format_evaluation", "candidate_filter", "event", "event", "event", "event"]);
assert.equal(recoveredSteps[1].eventCount, 2);
assert.deepEqual(recoveredSteps[1].providers, ["alpha", "beta"]);
assert.equal(routingTraceTone(recoveredSteps[1]), "warn");
assert.equal(routingTraceTone(recoveredSteps[3]), "bad");
assert.equal(routingTraceTone(recoveredSteps[5]), "ok");

const separatedFormats = groupRoutingTrace([
  { stage: "format_compatibility", code: "format_eligible", target_format: "chat_completions" },
  { stage: "routing", code: "selected", provider: "alpha" },
  { stage: "format_compatibility", code: "format_blocked_by_parameter", target_format: "responses" },
]);
assert.equal(separatedFormats.length, 3, "non-adjacent format evidence must not be reordered or merged");
assert.equal(routingTraceTone(separatedFormats[2]), "bad");
assert.deepEqual(
  summarizeFormatTraceStep(separatedFormats[2], { clientFormat: "anthropic_messages" }).blocked,
  [{ format: "responses", fields: [] }],
  "blocked targets must remain available for a concise explanation",
);

assert.deepEqual(groupRoutingTrace(null), []);
assert.equal(routingTraceTone(null), "neutral");

console.log("routing trace view tests passed");
