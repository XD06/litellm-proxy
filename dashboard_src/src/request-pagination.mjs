export function requestPageTarget(currentPage, totalPages, direction, pending = false) {
  const current = Math.max(0, Number(currentPage) || 0);
  const lastPage = Math.max(0, (Number(totalPages) || 1) - 1);
  if (pending) return current;
  if (direction === "prev") return Math.max(0, current - 1);
  if (direction === "next") return Math.min(lastPage, current + 1);
  return current;
}

export function requestPayloadMatchesPage(payload, page, pageSize) {
  if (payload === undefined) return true;
  if (!payload || typeof payload !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(payload, "offset")) return true;
  const offset = Number(payload.offset);
  const size = Math.max(1, Number(pageSize) || 1);
  return Number.isFinite(offset) && offset === Math.max(0, Number(page) || 0) * size;
}
