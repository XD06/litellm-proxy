import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "..");
const dashboardDir = path.resolve(rootDir, "..", "dashboard");
const html = fs.readFileSync(path.join(dashboardDir, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(rootDir, "src", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(rootDir, "src", "app.js"), "utf8");

for (const id of [
  "pgModelSearch",
  "pgModel",
  "pgTemperature",
  "pgMaxTokens",
  "pgTopP",
  "pgStream",
  "pgIncludeHistory",
  "pgSystemPrompt",
  "pgChat",
  "pgChatInput",
  "pgClearButton",
  "pgStopButton",
  "pgSendButton",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `playground must preserve #${id}`);
}

for (const format of ["chat_completions", "responses", "anthropic_messages"]) {
  assert.match(html, new RegExp(`data-pg-format="${format}"`), `playground must preserve ${format}`);
}

assert.match(app, /parseFloat\(el\("pgTemperature"\)/, "temperature must remain in the request payload");
assert.match(app, /parseInt\(el\("pgMaxTokens"\)/, "max tokens must remain in the request payload");
assert.match(app, /parseFloat\(el\("pgTopP"\)/, "top-p must remain in the request payload");
assert.match(app, /el\("pgStream"\)\?\.checked/, "stream must remain in the request payload");
assert.match(app, /el\("pgIncludeHistory"\)\?\.checked/, "history control must remain connected");
assert.match(app, /el\("pgSystemPrompt"\)\?\.value/, "system prompt must remain connected");
assert.match(app, /return "\/v1\/messages"/, "Anthropic endpoint must remain unchanged");
assert.match(app, /return "\/v1\/responses"/, "Responses endpoint must remain unchanged");
assert.match(app, /return "\/v1\/chat\/completions"/, "Chat Completions endpoint must remain unchanged");

assert.match(html, /class="playground-page-head"/, "playground must expose the reference page header");
assert.match(html, /id="pgHeaderClearButton"/, "playground header clear action must be available");
assert.match(app, /headerClearBtn\.addEventListener\("click", pgClear\)/, "both clear actions must share the existing behavior");
assert.match(styles, /#playgroundView\.view\.is-active\s*\{[^}]*animation:\s*none/, "playground view must not animate during navigation");
assert.match(styles, /#playgroundView \.playground-layout\s*\{[^}]*grid-template-columns:\s*minmax\(360px, 1fr\) minmax\(0, 2fr\)/, "desktop playground must use the approved 1:2 split");
assert.match(styles, /#playgroundView \.playground-config,[\s\S]*?#playgroundView \.playground-main\s*\{[^}]*border-radius:\s*1rem/, "playground workspaces must use the approved outer radius");
assert.match(styles, /#playgroundView \.pg-input-bar\s*\{[^}]*border-radius:\s*18px[^}]*box-shadow:/, "message composer must use the approved floating surface");
assert.match(styles, /#playgroundView \.pg-input\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*border:\s*0;/, "message input must be integrated into the floating composer");
assert.match(styles, /#playgroundView \.pg-input-actions\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/, "message actions must stay inside the composer footer");
assert.match(html, /id="pgClearButton"[^>]*pg-icon-btn[^>]*aria-label="Clear"/, "clear action must remain accessible after iconification");
assert.match(html, /id="pgStopButton"[^>]*pg-icon-btn[^>]*aria-label="Stop"/, "stop action must remain accessible after iconification");
assert.match(html, /id="pgSendButton"[^>]*pg-icon-btn[^>]*aria-label="Send"/, "send action must remain accessible after iconification");
assert.match(styles, /body:has\(#playgroundView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/, "playground must preserve the shared sidebar geometry");

console.log("playground page layout tests passed");
