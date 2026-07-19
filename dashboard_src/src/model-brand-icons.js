import { getLobeIconCDN } from "@lobehub/icons/es/features/getLobeIconCDN/index.js";

// Keep matching deliberately conservative: unknown or custom names use the local marker.
const MODEL_ICON_RULES = [
  [/deepseek/i, "deepseek"],
  [/\b(glm|chatglm)/i, "zai"],
  [/(^|[-_/])gpt[-_]|\b(o1|o3|o4|codex)\b/i, "openai"],
  [/claude|anthropic/i, "claude"],
  [/gemini|gemma/i, "gemini"],
  [/grok/i, "grok"],
  [/qwen|qwq|qvq|tongyi/i, "qwen"],
  [/llama/i, "meta"],
  [/mistral|mixtral|codestral|pixtral/i, "mistral"],
  [/minimax|abab/i, "minimax"],
  [/kimi|moonshot/i, "moonshot"],
  [/doubao|\bep-/i, "doubao"],
  [/hunyuan/i, "hunyuan"],
  [/sonar|pplx|perplexity/i, "perplexity"],
  [/command|cohere/i, "cohere"],
  [/jina/i, "jina"],
  [/baichuan/i, "baichuan"],
  [/ernie|wenxin/i, "wenxin"],
  [/internlm|internvl/i, "internlm"],
  [/seed-|bytedance/i, "bytedance"],
  [/nova-/i, "nova"],
  [/mimo-/i, "xiaomimimo"],
];

// LobeHub does not publish a color SVG variant for every brand.
const COLOR_ICON_SLUGS = new Set([
  "deepseek",
  "claude",
  "gemini",
  "qwen",
  "meta",
  "mistral",
  "minimax",
  "doubao",
  "hunyuan",
  "perplexity",
  "cohere",
  "baichuan",
  "wenxin",
  "internlm",
  "bytedance",
  "nova",
]);

const PROVIDER_ICON_ALIASES = new Map([
  ["openai", "openai"],
  ["anthropic", "anthropic"],
  ["claude", "anthropic"],
  ["deepseek", "deepseek"],
  ["google", "google"],
  ["gemini", "google"],
  ["groq", "groq"],
  ["nvidia", "nvidia"],
  ["openrouter", "openrouter"],
  ["modelscope", "modelscope"],
  ["mistral", "mistral"],
  ["moonshot", "moonshot"],
  ["zhipu", "zai"],
  ["bigmodel", "zai"],
  ["zai", "zai"],
  ["qwen", "qwen"],
  ["together", "together"],
  ["perplexity", "perplexity"],
  ["cohere", "cohere"],
]);

export function modelBrandSlug(model) {
  const value = String(model || "").trim();
  if (!value) return "";
  return MODEL_ICON_RULES.find(([pattern]) => pattern.test(value))?.[1] || "";
}

export function modelBrandIconMarkup(model, fallbackMarkup = "") {
  const slug = modelBrandSlug(model);
  if (!slug) {
    return "<span class=\"model-brand-mark is-fallback\" aria-hidden=\"true\">" + fallbackMarkup + "</span>";
  }
  const type = COLOR_ICON_SLUGS.has(slug) ? "color" : "mono";
  const src = getLobeIconCDN(slug, { format: "svg", type, cdn: "unpkg" });
  return "<span class=\"model-brand-mark\" aria-hidden=\"true\"><img class=\"model-brand-icon\" src=\"" + src + "\" alt=\"\" loading=\"lazy\" decoding=\"async\" /><span class=\"model-brand-fallback\">" + fallbackMarkup + "</span></span>";
}

export function providerBrandSlug(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (!value) return "";
  const normalized = value.replace(/[._\s]+/g, "-");
  if (PROVIDER_ICON_ALIASES.has(normalized)) return PROVIDER_ICON_ALIASES.get(normalized) || "";
  const namespace = normalized.split(/[\/:]/, 1)[0];
  return PROVIDER_ICON_ALIASES.get(namespace) || "";
}

export function providerBrandIconMarkup(provider, fallbackMarkup = "") {
  const slug = providerBrandSlug(provider);
  if (!slug) {
    return "<span class=\"model-brand-mark provider-brand-mark is-fallback\" aria-hidden=\"true\">" + fallbackMarkup + "</span>";
  }
  const type = COLOR_ICON_SLUGS.has(slug) || ["anthropic", "google", "groq", "nvidia", "openrouter", "modelscope", "together"].includes(slug)
    ? "color"
    : "mono";
  const src = getLobeIconCDN(slug, { format: "svg", type, cdn: "unpkg" });
  return "<span class=\"model-brand-mark provider-brand-mark\" aria-hidden=\"true\"><img class=\"model-brand-icon\" src=\"" + src + "\" alt=\"\" loading=\"lazy\" decoding=\"async\" /><span class=\"model-brand-fallback\">" + fallbackMarkup + "</span></span>";
}
