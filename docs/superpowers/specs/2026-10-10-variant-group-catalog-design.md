# Variant Group Catalog Presence Design

## Status

Approved decisions (2026-10-10):

1. **Conflict policy — allow + warn.** The backend keeps "highest priority wins,
   never block"; the console surfaces conflicts as warnings.
2. **Row switch = whole group.** The catalog row's enable/disable toggle writes
   the canonical id (`provider_model_disabled[...][canonical]`); per-upstream
   raw state is read-only.
3. **Violet marker.** A dedicated `--model-variant` token, visually distinct
   from discovered (green), renamed (blue), static (amber) and disabled (grey).
4. **Catalog order** — variant groups, then static, then everything else.
5. **Warnings appear in hover tooltips only**, not as inline notice rows.

## Objective

The provider drawer's model catalog lists discovered models and static fallback
models. It does not list `provider_model_variants` keys, even though the backend
already advertises them as configured client-facing model ids. Operators
therefore cannot see, or switch off, a client id that 1:N routes to several
upstream models.

This work adds variant groups to the catalog with a distinct marker, and — in
the same pass — makes the four id sources (discovered, manual rename, static
declaration, variant group) resolve into single catalog rows with readable
warnings when they overlap.

## Background: the authoritative backend contract

Everything below is already implemented; the console must mirror it rather than
invent its own precedence.

- **Canonical → raw resolution** (`model_registry.py:1015-1021`), first
  non-empty result wins:

  ```
  1. provider_model_variants[provider][canonical]   # 1:many, priority-ordered
  2. key-level manual map (a key's own "models" dict)
  3. provider_model_map[provider][canonical]        # 1:1 manual rename
  4. key-level discovered capabilities
  5. provider_model_capabilities[provider].canonical_map[canonical]
  6. unchanged passthrough [canonical]
  ```

  Each candidate raw is then filtered by `provider_model_disabled`.

- **Asymmetry worth surfacing.** When a variant group exists, the provider-level
  `canonical_map` primary never becomes a candidate: `model_registry.py:1062-1066`
  appends only key-level manual and key-level discovered raws after the variant
  entries. A variant group therefore *shadows* the discovered mapping.

- **Variant keys are already configured client ids.** `_configured_model_ids`
  (`model_registry.py:752-768`) contributes the *keys* of
  `provider_model_variants`, plus `static_models` entries, `provider_model_map`
  keys, `routes` keys and `client_model_map` keys. Variant groups already reach
  `/v1/models`; only the console catalog is missing them.

- **Write path** (`config_manager.py:736-777`) validates ids, caps the list at
  32 entries, de-duplicates by raw model, sorts by `-priority` then original
  index, and writes a tombstone (`None`) for an emptied group that exists in the
  base config. It performs **no cross-source conflict checking**.

- **Disable semantics.** Disabling a canonical (variant key, static id, or map
  key) removes the id from `_configured_model_ids`, i.e. from `/v1/models`.
  Disabling a raw only drops that raw from the variant candidate list, because
  resolution filters candidates individually. `provider_model_request_disabled`
  (`model_registry.py:117-134`) checks the manual map's target first and then
  `provider_model_id_disabled`, which does match a disabled canonical directly.

## Two id namespaces

- **A — client-facing ids** (what a client may put in `model`): discovered
  canonical keys, `provider_model_map` keys, `provider_model_variants` keys,
  `static_models` entries, `routes` keys, `client_model_map` keys.
- **B — upstream/raw ids** (what is sent upstream): discovered raw values,
  `provider_model_map` values, variant entry `model` values, `static_models`
  entries, `routes` provider overrides.

The same string belonging to both namespaces is **normal**, not an error:
`static_models` entries are simultaneously a client id and an upstream
assertion. Only three conflict shapes are real:

| Shape | Example | Consequence |
| --- | --- | --- |
| A–A duplication | an id is both a variant key and a map key | variant wins (1 before 3); the rename is silently inert |
| B sharing | two variant groups target `openai/gpt-5.5` | allowed; both client ids reach the same upstream |
| A/B same string | variant key `grok-4.3` plus a static declaration `grok-4.3` | requests use the variant group; the static entry is not a routing candidate |

Two latent traps belong to the same family: keys differing only by case (some
backend lookups are exact-match, others fall back to lowercase, so one key can
become unreachable) and empty variant groups (`_configured_model_ids` requires a
non-empty entry list, so an empty group is inert).

## Conflict codes

All warnings are advisory. None of them blocks a write, changes a payload, or
alters resolution.

| Code | Trigger | Message direction |
| --- | --- | --- |
| `variant_shadows_manual_map` | same id is a variant key and a map key | "manual rename overridden by the variant group" |
| `variant_shadows_discovered` | same id is a variant key and a discovered canonical | "variant group shadows the discovered mapping" |
| `same_name_static` | same id is a variant key and a static declaration | "same name: the static upstream id is not a candidate" |
| `shared_upstream` | a raw is also used by another group or a rename | "shared upstream: also used by X" |
| `case_only_duplicate` | two ids differ only by case | "differs only by case; one may be unreachable" |
| `stale_upstream_disabled` | a group member raw is disabled | "1 of 3 upstreams disabled" |
| `empty_variant_group` | a configured group has no usable member | "empty group: ignored by routing" |

## Scope

### In scope

- Pure helpers in `dashboard_src/src/provider-model-config.mjs` that derive
  variant groups and merge catalog sources.
- `providerDrawerCatalogItems` / `providerModelRow` / chip rendering in
  `dashboard_src/src/app.js`.
- The violet token, variant chip/row states, and tooltip content in
  `dashboard_src/src/styles.css`.
- Node tests: pure-function coverage plus an extension of the drawer runtime
  guard.

### Explicitly out of scope

- **Any Python change.** No new endpoint, payload field, validation or
  blocking. Phase 2 (optional, not part of this design's implementation) may
  return the same warning codes from the variants PATCH response for non-UI
  callers.
- Per-raw enable/disable writes.
- Automatic normalisation, renaming or deletion of colliding ids.
- `/v1/models` output and routing behaviour (already correct).
- Warnings on the static / manual-map write paths.

## Data model

One catalog row per **client-facing id**, matched case-insensitively:

```
entry = {
  id: "grok-4.3",
  sources: Set<"variant" | "renamed" | "static" | "discovered">,
  variants: [{ model: "xai/grok-4", priority: 50 }, ...],  // variant groups only
  warnings: [{ code, detail }],
}
```

Merge rules:

- **Main identity precedence**: variant group → renamed → static → discovered.
  This mirrors the backend routing precedence (variants 1, rename 3, discovered
  5); static carries no routing priority and therefore sorts after renames.
- **Ordering**: rows whose main identity is a variant group come first, then
  static rows, then the remaining rows in their existing order. Sorting is
  stable so discovery order is preserved inside the remaining group.
- **Raw ids never get their own row.** When a raw is independently a
  client-facing id (a discovered canonical or a rename key), that id keeps its
  own row and gains a read-only hint naming the group that references it
  (for example `被 grok-4.3 引用`).
- **Empty groups stay visible.** A configured group with no usable member is
  still rendered as a row, so it cannot silently linger unnoticed, and carries
  the `empty_variant_group` warning with no chain. The backend ignores such a
  group entirely, which the tooltip states outright.
- Members are ordered exactly as the backend orders them: `-priority`, then
  configuration order; duplicates by raw collapse to the highest-priority
  occurrence, because `model_registry.resolve_provider_model_candidates` sorts
  before it de-duplicates.

## Rendering

- **Chip mode**: violet dot, badge `变体 N`, and a `title` carrying the
  effective chain `grok-4.3 → xai/grok-4 (50) → xai/grok-4-mini (10)`.
- **Rows mode**: violet dot, `small` line `变体组 · N 个上游`, the same badge and
  the same tooltip.
- **Tooltip** (hover only, per the approved decision) contains, in order: the
  effective resolution chain, then one line per warning, then the disabled
  member count. Example:

  ```
  grok-4.3 → xai/grok-4 (50) → xai/grok-4-mini (10)
  手动映射被变体组覆盖(变体优先)
  3 个上游中 1 个已禁用
  ```

- **Accessibility note**: because details live in `title`, the row's
  `aria-label` carries the variant wording and the warning *count*
  (`变体组,3 个上游,1 个警告`). Screen readers therefore learn that a conflict
  exists even though the detail requires hover.
- **Row switch**: the existing eye/power toggle writes
  `data-provider-model-disable-model="${canonical}"`, exactly like a static
  row writes its own id. No per-raw write path is added.
- `--model-variant` is declared **once** in the base `:root` (the same pattern
  as `--model-static` and `--route-info`), so it stays stable across the
  stylesheet's four `:root` theme blocks. Value: `#6b46c1`.

## Testing

- `dashboard_src/tests/provider-model-config.test.mjs` — pure-function tests for
  each conflict code, merge precedence, ordering, case-insensitive identity,
  empty groups and disabled-member counting.
- `dashboard_src/tests/provider-drawer-layout.test.js` — extend the runtime
  render guard: a provider with a variant group must render `is-variant`, the
  variant badge and the chain tooltip; reverse-verify by removing the marker and
  confirming the guard fails.
- `npm run build` and `npm test` (currently 34/34). The backend is untouched, so
  pytest is not part of the verification for this change.

## Risks and accepted trade-offs

- **Tooltip-only warnings** are unavailable on touch devices and to screen
  readers. Accepted, mitigated by the warning count in `aria-label`.
- **CLI/curl writes can still create conflicts silently.** The console warns;
  the API stays permissive by decision. Phase 2 could return the codes.
- **Catalog order changes** relative to the 2026-10-10 static-first ordering
  commit: variant groups now precede static rows. Deliberate, because a variant
  group overrides routing while a static declaration does not.
- **A variant group shadowing a discovered mapping** is the most surprising
  outcome for operators; the tooltip states it explicitly rather than relying on
  the operator to know the resolution order.
