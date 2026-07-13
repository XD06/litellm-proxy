export const PROVIDER_CALL_BAR_SLOTS = 40;

export function recentProviderActivityEvents(events) {
  const list = Array.isArray(events) ? events : [];
  return list.slice(-PROVIDER_CALL_BAR_SLOTS);
}
