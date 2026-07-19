const STATUS_ORDER = {
  normal: 0,
  degraded: 1,
  cooldown: 2,
  unavailable: 3,
  disabled: 4,
};

export function providerSortGroup(view) {
  const usableKeys = Number(view?.keyStats?.usable || 0);
  const disabled = view?.runtimeState?.id === "disabled";
  return !disabled && usableKeys > 0 ? 0 : 1;
}

export function compareProviderViews(a, b) {
  const groupDelta = providerSortGroup(a) - providerSortGroup(b);
  if (groupDelta !== 0) return groupDelta;

  if (providerSortGroup(a) === 0) {
    const priorityDelta = Number(b?.priority || 0) - Number(a?.priority || 0);
    if (priorityDelta !== 0) return priorityDelta;
  } else {
    const aStatus = STATUS_ORDER[a?.runtimeState?.id] ?? 99;
    const bStatus = STATUS_ORDER[b?.runtimeState?.id] ?? 99;
    if (aStatus !== bStatus) return aStatus - bStatus;
    const priorityDelta = Number(b?.priority || 0) - Number(a?.priority || 0);
    if (priorityDelta !== 0) return priorityDelta;
  }

  return String(a?.name || "").localeCompare(String(b?.name || ""));
}
