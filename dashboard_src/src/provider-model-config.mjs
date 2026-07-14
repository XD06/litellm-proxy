function modelId(value) {
  if (value && typeof value === "object") {
    return String(value.id || value.model || value.raw_model || "").trim();
  }
  return String(value || "").trim();
}

export function normalizeStaticModelIds(entries) {
  const seen = new Set();
  const models = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = modelId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }
  return models;
}

export function mergeStaticModelIds(existing, rawAdditions) {
  const additions = String(rawAdditions || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalizeStaticModelIds([...normalizeStaticModelIds(existing), ...additions]);
}

export function normalizeVariantEntries(entries) {
  const seen = new Set();
  const variants = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const model = modelId(entry);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    const rawPriority = entry && typeof entry === "object" ? Number(entry.priority || 0) : 0;
    variants.push({
      model,
      priority: Number.isFinite(rawPriority) ? rawPriority : 0,
    });
  }
  return variants;
}

export function clearLiveFormField(root, selector, fieldName) {
  const form = root?.querySelector?.(selector);
  const elements = form?.elements;
  const control = elements?.namedItem?.(fieldName) || elements?.[fieldName];
  if (!control) return false;
  control.value = "";
  return true;
}

export function resetLiveForm(root, selector) {
  const form = root?.querySelector?.(selector);
  if (!form || typeof form.reset !== "function") return false;
  form.reset();
  return true;
}
