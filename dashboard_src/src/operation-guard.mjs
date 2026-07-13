export class InFlightActionRegistry {
  #keys = new Set();

  begin(key) {
    const normalized = String(key || "").trim();
    if (!normalized) return () => {};
    if (this.#keys.has(normalized)) return null;
    this.#keys.add(normalized);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#keys.delete(normalized);
    };
  }

  has(key) {
    return this.#keys.has(String(key || "").trim());
  }

  clear() {
    this.#keys.clear();
  }
}

export class ConfigRefreshCoordinator {
  #interactionVersion = 0;
  #mutationDepth = 0;

  markInteraction() {
    this.#interactionVersion += 1;
    return this.#interactionVersion;
  }

  snapshot() {
    return {
      interactionVersion: this.#interactionVersion,
      mutationDepth: this.#mutationDepth,
    };
  }

  beginMutation() {
    this.#mutationDepth += 1;
    const interactionVersion = this.markInteraction();
    let active = true;
    return {
      interactionVersion,
      finish: () => {
        if (!active) return;
        active = false;
        this.#mutationDepth = Math.max(0, this.#mutationDepth - 1);
        this.markInteraction();
      },
    };
  }

  shouldDefer(snapshot, hasProtectedInput = false) {
    if (hasProtectedInput) return true;
    if (this.#mutationDepth > 0) return true;
    if (!snapshot) return false;
    return Number(snapshot.interactionVersion) !== this.#interactionVersion;
  }

  get mutationDepth() {
    return this.#mutationDepth;
  }
}
