import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");

assert.match(
  styles,
  /body:has\(#requestsView\.is-active, #settingsView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/,
  "settings must share the Requests desktop sidebar geometry",
);
assert.match(
  styles,
  /body:has\(#requestsView\.is-active, #settingsView\.is-active\) \.brand\s*\{[^}]*margin:\s*0 0 24px[^}]*padding:\s*12px 8px/,
  "settings must share the Requests brand geometry",
);
assert.match(
  styles,
  /#settingsView\.view\.is-active\s*\{[^}]*min-height:\s*100vh[^}]*padding:\s*24px[^}]*animation:\s*none/,
  "settings content must use the stable Requests page frame",
);
assert.match(
  styles,
  /\.settings-ops-card\s*\{[^}]*border-radius:\s*16px/,
  "operations cards must retain the shared configuration-card shape",
);
assert.match(
  app,
  /if \(viewChanged\) window\.scrollTo\(0, 0\)/,
  "primary view navigation must reset shared document scroll",
);

console.log("settings shell stability tests passed");
