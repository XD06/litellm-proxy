// Pure helpers for the client-key model-scope picker. Framework-free so the
// Node UI tests can exercise parsing, grouping, search, and serialization.
// The picker writes a comma-separated allowlist back into the key drawer's
// `models` input; "*" / blank keeps the existing "all models" meaning.

// Every checkbox is an independent (provider, model id) choice. Ticking one
// never ticks the same id in another provider; to allow a model across
// providers, search for it and use "Select all". Picker selections are
// written back as `provider:model` entries so the backend pins each request
// to that provider. Plain ids (hand-typed / legacy) stay as-is = any provider.
const SEP = "\u0000";

export function selectionKey(group, modelId) {
  return `${group}${SEP}${modelId}`;
}

export function selectionScopedIds(selectedKeys) {
  return [...new Set(
    [...selectedKeys].map((key) => {
      const text = String(key);
      const sep = text.indexOf(SEP);
      if (sep < 0) return text;
      const group = text.slice(0, sep);
      const model = text.slice(sep + 1);
      // "*" is the synthetic "Other / global models" group, not a real
      // provider: keep those ids unscoped so they stay selectable.
      return group === "*" ? model : `${group}:${model}`;
    }),
  )];
}

export function parseKeyModelScope(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "*") return [];
  const seen = new Set();
  const out = [];
  for (const item of text.split(/[\n,;]+/)) {
    const id = item.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function keyModelPickerGroups(catalog) {
  const all = Array.isArray(catalog?.models) ? catalog.models.map(String).filter(Boolean) : [];
  const known = new Set();
  const groups = (Array.isArray(catalog?.providers) ? catalog.providers : [])
    .map((provider) => {
      const models = Array.isArray(provider?.models) ? provider.models.map(String).filter(Boolean) : [];
      models.forEach((id) => known.add(id));
      return {
        name: String(provider?.name || ""),
        enabled: provider?.enabled !== false,
        models: [...new Set(models)],
      };
    })
    .filter((group) => group.name && group.models.length);
  // Global aliases / route keys belong to no single provider: keep them in a
  // dedicated group so no selectable id from the union disappears.
  const other = [...new Set(all)].filter((id) => !known.has(id));
  if (other.length) groups.push({ name: "*", enabled: true, models: other });
  return groups;
}

export function filterKeyModelGroups(groups, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      models: group.name.toLowerCase().includes(needle)
        ? group.models
        : group.models.filter((id) => id.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.models.length);
}

export function parseScopedKeySelection(text, catalog) {
  // Restore a saved allowlist as independent (provider, model) checkboxes.
  // A `provider:model` entry selects exactly that one box; a plain id only
  // selects the synthetic "Other / global models" box when it belongs there.
  // Everything else is preserved verbatim as a custom entry so a discovery
  // refresh or a hand-typed id can never silently change or drop a permission.
  const byName = new Map(
    keyModelPickerGroups(catalog).map((group) => [group.name, new Set(group.models)]),
  );
  const keys = [];
  const custom = [];
  for (const entry of parseKeyModelScope(text)) {
    const sep = entry.indexOf(":");
    if (sep > 0) {
      const provider = entry.slice(0, sep);
      const model = entry.slice(sep + 1);
      if (model && byName.get(provider)?.has(model)) {
        keys.push(selectionKey(provider, model));
        continue;
      }
    } else if (byName.get("*")?.has(entry)) {
      keys.push(selectionKey("*", entry));
      continue;
    }
    custom.push(entry);
  }
  return { keys: [...new Set(keys)], custom };
}

export function serializeKeyModelSelection(selected, custom = []) {
  const merged = [];
  const seen = new Set();
  for (const id of [...(custom || []), ...(selected || [])]) {
    const value = String(id || "").trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      merged.push(value);
    }
  }
  return merged.join(", "); // empty string = all models
}

export function mergeKeyModelSelection(selected, custom = []) {
  // A scoped `provider:model` entry supersedes a plain id for the same model.
  // Keeping both would make the backend treat that model as unrestricted and
  // silently defeat the provider restriction the user just picked.
  const modelOf = (entry) => {
    const text = String(entry);
    const sep = text.indexOf(":");
    return sep > 0 ? text.slice(sep + 1) : text;
  };
  const scopedModels = new Set((selected || []).map(modelOf));
  const keptCustom = (custom || []).filter((entry) => !scopedModels.has(modelOf(entry)));
  return serializeKeyModelSelection(selected, keptCustom);
}
