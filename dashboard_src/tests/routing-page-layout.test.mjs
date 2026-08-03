import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const controls = between("function renderPolicyControls", "function cooldownField");
const bindings = between("function bindPolicyControlForms", "function bindFailurePolicyForms");
const failureCard = between("function failurePolicyCard", "function failurePolicyDescription");

assert.match(index, /class="policy-page-head"/, "routing page must retain a dedicated page heading");
assert.match(index, /class="panel policy-rules-panel"/, "rule table must remain a first-class panel");
assert.match(index, /class="panel policy-failures-panel"/, "failure policies must remain a first-class panel");

for (const name of [
  "default_provider_pool",
  "provider_select",
  "max_attempts",
  "format_preference",
  "semantic_conversion",
  "anthropic_default_max_tokens",
  "connect_timeout_s",
  "read_timeout_s",
  "first_token_timeout_s",
  "retryable_status",
  "key_fatal_status",
  "respect_retry_after",
  "same_key_retries",
  "key_failure_ladder_s",
]) {
  assert.match(controls, new RegExp(`name="${name}"`), `routing UI must preserve ${name}`);
}

for (const name of ["rate_limit", "server_error", "network_error", "key_invalid", "quota_or_balance"]) {
  assert.match(controls, new RegExp(`cooldownField\\("${name}"`), `routing UI must preserve ${name}`);
}

for (const name of ["cooldown_scope", "cooldown_s", "provider_cooldown_s", "disables_key"]) {
  assert.match(failureCard, new RegExp(`name="${name}"`), `failure policy UI must preserve ${name}`);
}

assert.match(bindings, /apiPatch\("\/-\/admin\/routing", payload\)/, "routing save endpoint must remain unchanged");
assert.match(bindings, /apiPatch\("\/-\/admin\/retry", payload\)/, "retry save endpoint must remain unchanged");
assert.match(source, /apiPatch\("\/-\/admin\/retry\/failure-policies", payload\)/, "failure-policy save endpoint must remain unchanged");
assert.match(styles, /#policyView \.policy-control-grid,[\s\S]*grid-template-columns:\s*minmax\(0, 2fr\) minmax\(340px, 1fr\)/, "desktop routing controls must use the approved 2:1 composition");
assert.match(styles, /#policyView \.policy-control-card,[\s\S]*border-radius:\s*1rem/, "routing cards must use the approved outer radius");
assert.match(styles, /body:has\(#policyView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/, "routing must preserve the shared desktop sidebar geometry");
assert.match(styles, /body:has\(#policyView\.is-active\) \.brand\s*\{[^}]*margin:\s*0 0 24px[^}]*padding:\s*12px 8px/, "routing must preserve the shared brand geometry");
assert.match(styles, /#policyView\.view\.is-active\s*\{[^}]*animation:\s*none/, "frequent route changes must not animate the whole workspace");
assert.match(controls, /<textarea class="control" name="default_provider_pool"/, "the provider pool must wrap without changing its field name");
assert.match(controls, /class="policy-routing-footer"/, "advanced routing controls and the compact save action must share a footer");
assert.match(styles, /#policyView #routingControlForm \.policy-routing-footer > \.button\s*\{[^}]*min-width:\s*132px[^}]*min-height:\s*36px[^}]*border-radius:\s*1rem/, "routing save action must stay compact and use the approved radius");
assert.match(styles, /#policyView #retryControlForm > \.button\s*\{[^}]*min-width:\s*132px[^}]*min-height:\s*36px[^}]*align-self:\s*flex-end[^}]*border-radius:\s*1rem/, "retry save action must stay compact, right-aligned, and use the approved radius");

console.log("routing page layout tests passed");
