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

for (const id of ["authChecking", "authCheckingText", "loginGate", "app"]) {
  assert.match(html, new RegExp(`id="${id}"`), `authentication flow must preserve #${id}`);
}

assert.match(html, /class="login-card auth-card"[^>]*role="status"[^>]*aria-live="polite"/, "loading state must remain accessible");
assert.match(styles, /\.auth-checking \.auth-card\s*\{[^}]*grid-template-columns:\s*38px minmax\(0, 1fr\)[^}]*border-radius:\s*1rem/, "desktop loading card must use the compact approved geometry");
assert.match(styles, /\.auth-checking \.auth-progress::after\s*\{[^}]*animation:\s*auth-progress-refined/, "loading progress must retain an indeterminate state");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.auth-checking \.auth-card/, "loading motion must respect reduced-motion preferences");
assert.match(app, /el\("authChecking"\)\?\.removeAttribute\("hidden"\)/, "authentication checking behavior must remain connected");
assert.match(app, /document\.body\.classList\.add\("is-auth-checking"\)/, "authentication checking body state must remain connected");

console.log("loading state tests passed");
