const assert = require("node:assert/strict");

function appendStreamText(current, incoming) {
  const base = String(current || "");
  const text = String(incoming || "");
  if (!text) return base;
  if (!base) return text;
  if (text.startsWith(base)) return text;
  return base + text;
}

function fold(parts) {
  return parts.reduce((acc, part) => appendStreamText(acc, part), "");
}

assert.equal(fold(["你", "能", "做什么？"]), "你能做什么？");
assert.equal(fold(["你", "你能", "你能做什么？"]), "你能做什么？");
assert.equal(fold(["The user's", "The user's question", "The user's question is in Chinese."]), "The user's question is in Chinese.");
assert.equal(fold(["我是 Grok", "，由 xAI 构建"]), "我是 Grok，由 xAI 构建");

console.log("playground stream tests passed");
