import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/,
  "config navigation must preserve the shared desktop sidebar geometry",
);
assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.brand\s*\{[^}]*margin:\s*0 0 24px[^}]*padding:\s*12px 8px/,
  "config navigation must preserve the shared desktop brand geometry",
);
assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.nav\s*\{[^}]*margin:\s*0[^}]*padding:\s*0/,
  "config navigation must preserve the shared desktop navigation geometry",
);
assert.match(
  styles,
  /body:has\(#configView\.is-active\) \.workspace\s*\{[^}]*max-width:\s*none[^}]*padding:\s*0/,
  "config navigation must use the stable full-width workspace shell",
);
assert.match(
  styles,
  /#configView\.view\.is-active\s*\{[^}]*width:\s*100%[^}]*max-width:\s*1550px[^}]*margin:\s*0 auto[^}]*padding:\s*32px[^}]*animation:\s*none/,
  "config content must share the requests view's unified desktop container",
);
assert.doesNotMatch(
  styles,
  /#configView\.view\.is-active\s*\{[^}]*max-width:\s*1120px/,
  "config content must not fall back to the legacy narrow 1120px container",
);

assert.match(
  styles,
  /html:has\(#configView\.is-active\)\s*\{[^}]*scrollbar-gutter:\s*stable/,
  "config statistics view must reserve the root scrollbar gutter while switching panels",
);

console.log("config shell stability tests passed");
