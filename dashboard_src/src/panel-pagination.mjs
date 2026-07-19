const boundPaginationRoots = new WeakSet();

export function bindPanelPaginationDelegated(root, onChange) {
  if (!root || typeof root.addEventListener !== "function" || typeof onChange !== "function") return false;
  if (boundPaginationRoots.has(root)) return false;
  boundPaginationRoots.add(root);
  root.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-list-page-key]");
    if (!target || target.disabled || !root.contains(target)) return;
    const pageKey = String(target.dataset?.listPageKey || "");
    const direction = String(target.dataset?.listPage || "");
    if (!pageKey || (direction !== "prev" && direction !== "next")) return;
    onChange({ pageKey, direction });
  });
  return true;
}

export function changePanelPage(state, pageKey, direction) {
  if (!state || !Object.prototype.hasOwnProperty.call(state, pageKey)) return false;
  const current = Math.max(0, Number(state[pageKey] || 0));
  let next = current;
  if (direction === "prev") next = Math.max(0, current - 1);
  if (direction === "next") next = current + 1;
  if (next === current) return false;
  state[pageKey] = next;
  return true;
}
