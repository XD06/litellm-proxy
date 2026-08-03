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
  /#providersView\.view\.is-active\s*\{[^}]*width:\s*calc\(100% - 80px\)[^}]*max-width:\s*1120px[^}]*margin:\s*12px auto 48px[^}]*animation:\s*none/,
  "providers content must retain its existing desktop geometry without a page-entry shift",
);

console.log("provider shell stability tests passed");
