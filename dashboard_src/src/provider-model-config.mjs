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

// Variant groups are keyed by the client-facing id they answer to and hold a
// priority-ordered list of upstream models. Ordering mirrors the backend read
// path (`model_registry.resolve_provider_model_candidates`): sort by priority
// descending, then by configuration order, then drop duplicate upstream ids, so
// when one upstream is listed twice the higher-priority entry wins. A null value
// is the overlay tombstone of a deleted group and never yields a row, while an
// explicitly empty list is kept so an inert group stays visible.
export function normalizeVariantGroups(rawGroups) {
  const entries = [];
  if (rawGroups && typeof rawGroups === "object") {
    for (const [canonical, rawVariants] of Object.entries(rawGroups)) {
      const id = String(canonical || "").trim();
      if (!id || rawVariants === null || rawVariants === undefined) continue;
      const ordered = (Array.isArray(rawVariants) ? rawVariants : [])
        .map((entry, index) => {
          const model = modelId(entry);
          if (!model) return null;
          const rawPriority = entry && typeof entry === "object" ? Number(entry.priority ?? 0) : 0;
          return { model, priority: Number.isFinite(rawPriority) ? rawPriority : 0, index };
        })
        .filter(Boolean)
        .sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
      const seen = new Set();
      const variants = [];
      for (const item of ordered) {
        if (seen.has(item.model)) continue;
        seen.add(item.model);
        variants.push({ model: item.model, priority: item.priority });
      }
      entries.push({ id, key: id.toLowerCase(), variants });
    }
  }
  // Case-only duplicates keep their own entry (so the collision is reportable)
  // while byKey resolves the first spelling, which is the one the console edits.
  const byKey = new Map();
  for (const entry of entries) {
    if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
  }
  return { entries, byKey };
}

// The effective resolution chain of a variant group, for example
// "grok-4.3 → xai/grok-4 (50) → xai/grok-4-mini (10)". Language neutral, so it
// can be dropped straight into a title or aria-label attribute.
export function variantChainLabel(id, variants) {
  const chain = [];
  const head = String(id || "").trim();
  if (head) chain.push(head);
  for (const variant of Array.isArray(variants) ? variants : []) {
    const model = String(variant?.model || "").trim();
    if (!model) continue;
    chain.push(`${model} (${Number(variant.priority) || 0})`);
  }
  return chain.join(" → ");
}

// Client-id sources, highest resolution precedence first. A merged catalog row
// reports its sources in this order, and the same order ranks the row's main
// identity: a variant group overrides routing, then a rename, then a static
// declaration, with discovery weakest — exactly the backend resolution order.
export const CATALOG_SOURCE_ORDER = ["variant", "renamed", "static", "discovered"];

/**
 * Merge the four client-id sources into catalog rows: one row per client-facing
 * id, matched case-insensitively, annotated with the sources it came from and
 * with advisory conflict warnings. Nothing here blocks a write — the backend
 * precedence decides what actually routes, and every warning is a hint for the
 * operator (rendered from the returned codes by app.js, never as prose here).
 *
 * @param {object} input
 * @param {Array} input.items Discovered/renamed provider model items (unfiltered).
 * @param {Array} input.staticIds Normalized `static_models` entries.
 * @param {object} input.variantGroups Result of `normalizeVariantGroups`.
 * @param {Array} input.disabledKeys Keys of the saved `provider_model_disabled` map.
 * @returns {Array} Rows sorted variant groups → static → the rest, stable.
 */
export function planCatalogEntries({
  items = [],
  staticIds = [],
  variantGroups = null,
  disabledKeys = [],
} = {}) {
  const key = (value) => String(value || "").trim().toLowerCase();
  const groups = Array.isArray(variantGroups?.entries) ? variantGroups.entries : [];
  const staticList = (Array.isArray(staticIds) ? staticIds : []).map(modelId).filter(Boolean);
  const staticKeys = new Set(staticList.map(key));
  const disabled = new Set(Array.from(disabledKeys, key));
  const remember = (list, value) => {
    if (value && !list.includes(value)) list.push(value);
  };
  const rows = new Map();
  const declare = (value) => {
    const id = String(value || "").trim();
    if (!id) return null;
    const rowKey = id.toLowerCase();
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        id,
        key: rowKey,
        spellings: [],
        variants: [],
        raws: [],
        refs: [],
        warnings: [],
        item: null,
        manualItem: null,
        discoveredItem: null,
        variant: false,
        renamed: false,
        discovered: false,
        static: false,
      });
    }
    const row = rows.get(rowKey);
    remember(row.spellings, id);
    return row;
  };

  // Variant groups claim their client id and the upstreams they resolve to.
  const memberOwners = new Map();
  const renameTargets = new Map();
  for (const group of groups) {
    const row = declare(group?.id);
    if (!row) continue;
    row.variant = true;
    row.variants = (Array.isArray(group.variants) ? group.variants : [])
      .filter((variant) => variant?.model)
      .map((variant) => ({
        model: String(variant.model).trim(),
        priority: Number(variant.priority) || 0,
      }));
    for (const variant of row.variants) {
      const memberKey = key(variant.model);
      if (!memberKey) continue;
      if (!memberOwners.has(memberKey)) memberOwners.set(memberKey, []);
      remember(memberOwners.get(memberKey), row.id);
    }
  }

  // Discovered and renamed models: their own client id plus the upstream they
  // resolve to. A raw never gets a row of its own; when it is independently a
  // client id that id's row carries a read-only reference instead.
  for (const item of Array.isArray(items) ? items : []) {
    const row = declare(item?.label || item?.raw);
    if (!row) continue;
    const raw = providerModelSourceId(item);
    if (item?.manual) {
      row.renamed = true;
      row.manualItem = row.manualItem || item;
      if (raw) {
        remember(row.raws, raw);
        const targetKey = key(raw);
        if (targetKey && targetKey !== row.key) {
          if (!renameTargets.has(targetKey)) renameTargets.set(targetKey, []);
          remember(renameTargets.get(targetKey), row.id);
        }
      }
    } else {
      row.discovered = true;
      row.discoveredItem = row.discoveredItem || item;
      remember(row.raws, raw || row.id);
    }
    row.item = row.manualItem || row.discoveredItem;
  }

  // Static declarations are client ids, so they always own a row.
  for (const id of staticList) declare(id);

  for (const row of rows.values()) {
    // A static declaration also matches when it names one of the row's upstream
    // ids, which is how the drawer has always flagged that state.
    row.static = staticKeys.has(row.key) || row.raws.some((raw) => staticKeys.has(key(raw)));
    row.raw = row.raws[0] || "";
    row.refs = (memberOwners.get(row.key) || []).filter((id) => key(id) !== row.key);
    row.mainSource = row.variant ? "variant" : row.renamed ? "renamed" : row.static ? "static" : "discovered";
    row.sources = CATALOG_SOURCE_ORDER.filter((source) => Boolean(row[source]));

    // A-A duplication: the variant group wins, so the rename is inert.
    if (row.variant && row.renamed) {
      row.warnings.push({ code: "variant_shadows_manual_map", detail: { rename: row.raws[0] || "" } });
    }
    if (row.variant && row.discovered) {
      row.warnings.push({
        code: "variant_shadows_discovered",
        detail: { raw: providerModelSourceId(row.discoveredItem) },
      });
    }
    if (row.variant && staticKeys.has(row.key)) {
      row.warnings.push({ code: "same_name_static", detail: {} });
    }
    // B sharing: another group or a rename sends the same upstream id.
    if (row.variant) {
      for (const variant of row.variants) {
        const memberKey = key(variant.model);
        const others = [];
        (memberOwners.get(memberKey) || []).forEach((id) => {
          if (key(id) !== row.key) remember(others, id);
        });
        (renameTargets.get(memberKey) || []).forEach((id) => {
          if (key(id) !== row.key) remember(others, id);
        });
        if (others.length) {
          row.warnings.push({ code: "shared_upstream", detail: { model: variant.model, by: others } });
        }
      }
    } else if (row.renamed && row.raw) {
      const others = [];
      (memberOwners.get(key(row.raw)) || []).forEach((id) => {
        if (key(id) !== row.key) remember(others, id);
      });
      (renameTargets.get(key(row.raw)) || []).forEach((id) => {
        if (key(id) !== row.key) remember(others, id);
      });
      if (others.length) {
        row.warnings.push({ code: "shared_upstream", detail: { model: row.raw, by: others } });
      }
    }
    // Two ids that differ only by case: one spelling can be unreachable.
    if (row.spellings.length > 1) {
      row.warnings.push({ code: "case_only_duplicate", detail: { ids: row.spellings.slice() } });
    }
    if (row.variant) {
      const off = row.variants.filter((variant) => disabled.has(key(variant.model)));
      if (off.length) {
        row.warnings.push({
          code: "stale_upstream_disabled",
          detail: { disabled: off.length, total: row.variants.length, models: off.map((variant) => variant.model) },
        });
      }
      if (!row.variants.length) {
        row.warnings.push({ code: "empty_variant_group", detail: {} });
      }
    }
  }

  // Variant groups overrode resolution, so they lead the catalog; static
  // declarations follow; everything else keeps discovery order (stable sort).
  const rank = (row) => (row.variant ? 0 : row.static ? 1 : 2);
  return [...rows.values()].sort((a, b) => rank(a) - rank(b));
}

export function mergeProviderModelCatalogItems(discoveredItems, configuredMap) {
  const items = [];
  const seenPairs = new Set();
  const claimedRawModels = new Set();
  const key = (value) => String(value || "").trim().toLowerCase();
  const push = (item) => {
    const label = String(item?.label || item?.raw || "").trim();
    const raw = String(item?.raw || "").trim();
    if (!label) return;
    const pair = `${key(label)}\n${key(raw)}`;
    if (seenPairs.has(pair)) return;
    seenPairs.add(pair);
    items.push({ ...item, label, raw });
  };

  Object.entries(configuredMap || {})
    .filter(([_canonical, raw]) => String(raw || "").trim())
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .forEach(([canonical, raw]) => {
      const label = String(canonical || raw).trim();
      const rawModel = String(raw || "").trim();
      claimedRawModels.add(key(rawModel));
      push({
        label,
        raw: rawModel,
        title: rawModel !== label ? `${label} maps to ${rawModel}` : label,
        manual: true,
      });
    });

  for (const item of Array.isArray(discoveredItems) ? discoveredItems : []) {
    const rawModel = String(item?.raw || item?.label || "").trim();
    if (claimedRawModels.has(key(rawModel))) continue;
    push({ ...item, manual: false });
  }
  return items;
}

export function providerModelSourceId(item) {
  return String(item?.raw || item?.label || "").trim();
}

export function providerModelMappingOldId(item) {
  return item?.manual ? String(item?.label || "").trim() : "";
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
