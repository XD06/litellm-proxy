import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

assert.match(
  styles,
  /body:has\(#providersView\.is-active\) \.sidebar\s*\{[^}]*padding:\s*16px/,
  "providers navigation must preserve the shared desktop sidebar geometry",
);
assert.match(
  styles,
  /body:has\(#providersView\.is-active\) \.brand\s*\{[^}]*margin:\s*0 0 24px[^}]*padding:\s*12px 8px/,
  "providers navigation must preserve the shared desktop brand geometry",
);
assert.match(
  styles,
  /body:has\(#providersView\.is-active\) \.workspace\s*\{[^}]*max-width:\s*none[^}]*padding:\s*0/,
  "providers navigation must use the stable full-width workspace shell",
);
assert.match(
  styles,
  /#providersView\.view\.is-active\s*\{[^}]*width:\s*100%[^}]*max-width:\s*1550px[^}]*margin:\s*0 auto[^}]*padding:\s*32px[^}]*min-height:\s*calc\(100dvh - 64px\)[^}]*animation:\s*none/,
  "providers content must share the requests view's unified desktop container",
);
assert.doesNotMatch(
  styles,
  /#providersView\.view\.is-active\s*\{[^}]*max-width:\s*1120px/,
  "providers content must not fall back to the legacy narrow 1120px container",
);

console.log("provider shell stability tests passed");
