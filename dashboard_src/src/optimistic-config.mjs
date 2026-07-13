function cloneConfig(config) {
  return structuredClone(config && typeof config === "object" ? config : {});
}

export function appendPendingKey(config, provider, metadata = {}) {
  const providerConfig = config?.providers?.[provider];
  if (!providerConfig) return;
  const keys = Array.isArray(providerConfig.keys) ? providerConfig.keys : [];
  const nextIndex = keys.reduce((highest, entry, index) => {
    const configured = Number(entry && typeof entry === "object" ? entry.index : index);
    return Number.isFinite(configured) ? Math.max(highest, configured + 1) : highest;
  }, keys.length);
  const pending = {
    index: nextIndex,
    key_id: "pending",
    masked: "pending",
    pending: true,
  };
  if (metadata.proxy) pending.proxy = metadata.proxy;
  if (metadata.models && typeof metadata.models === "object") pending.models = cloneConfig(metadata.models);
  providerConfig.keys = [...keys, pending];
}

export function appendPendingProvider(config, payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) return;
  if (!config.providers || typeof config.providers !== "object") config.providers = {};
  const provider = cloneConfig(payload);
  delete provider.name;
  const submittedKeys = Array.isArray(provider.keys) ? provider.keys : [];
  provider.keys = [];
  provider.pending = true;
  config.providers[name] = provider;
  for (const entry of submittedKeys) {
    const metadata = entry && typeof entry === "object"
      ? { proxy: entry.proxy, models: entry.models }
      : {};
    appendPendingKey(config, name, metadata);
  }
}

export class OptimisticConfigStore {
  #confirmed;
  #pending = [];
  #settled = [];
  #nextId = 1;

  constructor(config = {}) {
    this.#confirmed = cloneConfig(config);
  }

  confirmedConfig() {
    return cloneConfig(this.#confirmed);
  }

  config() {
    const effective = cloneConfig(this.#confirmed);
    for (const mutation of this.#settled) mutation.apply(effective);
    for (const mutation of this.#pending) mutation.apply(effective);
    return effective;
  }

  acceptConfirmed(config) {
    this.#confirmed = cloneConfig(config);
    if (!this.#pending.length) this.#settled = [];
    return this.config();
  }

  confirm(id, config) {
    const completed = this.#pending.find((mutation) => mutation.id === id);
    if (!completed) return null;
    this.#pending = this.#pending.filter((mutation) => mutation.id !== id);
    this.#settled.push(completed);
    this.#confirmed = cloneConfig(config);
    return this.config();
  }

  reject(id) {
    this.#pending = this.#pending.filter((mutation) => mutation.id !== id);
    return this.config();
  }

  clear() {
    this.#confirmed = {};
    this.#pending = [];
    this.#settled = [];
  }

  begin(resourceKey, apply) {
    const normalizedResourceKey = String(resourceKey || "");
    if (this.#pending.some((mutation) => mutation.resourceKey === normalizedResourceKey)) return null;
    const mutation = {
      id: this.#nextId++,
      resourceKey: normalizedResourceKey,
      apply,
    };
    this.#pending.push(mutation);
    return { id: mutation.id, resourceKey: mutation.resourceKey, config: this.config() };
  }
}
