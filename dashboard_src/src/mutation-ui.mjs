export function liveElementLocator(initialElement, locateCurrent = () => null) {
  return () => {
    if (initialElement?.isConnected) return initialElement;
    return locateCurrent?.() || null;
  };
}

export function createMutationBusySetter() {
  const controlState = new WeakMap();
  return (root, busy) => {
    if (!root) return;
    if (busy) {
      root.setAttribute("aria-busy", "true");
      root.classList.add("is-busy");
    } else {
      root.removeAttribute("aria-busy");
      root.classList.remove("is-busy");
    }
    const controls = new Set(root.querySelectorAll?.("button, input, select, textarea") || []);
    if (root.matches?.("button, input, select, textarea")) controls.add(root);
    controls.forEach((control) => {
      if (busy) {
        if (!controlState.has(control)) controlState.set(control, Boolean(control.disabled));
        control.disabled = true;
      } else if (controlState.has(control)) {
        control.disabled = controlState.get(control);
        controlState.delete(control);
      }
    });
  };
}

export class MutationBusyTracker {
  #locators = new Set();
  #setBusy;

  constructor(setBusy) {
    this.#setBusy = setBusy;
  }

  start(locator) {
    if (typeof locator !== "function") return () => {};
    this.#locators.add(locator);
    this.#setBusy?.(locator(), true);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#locators.delete(locator);
      this.#setBusy?.(locator(), false);
    };
  }

  refresh() {
    for (const locator of this.#locators) this.#setBusy?.(locator(), true);
  }
}
