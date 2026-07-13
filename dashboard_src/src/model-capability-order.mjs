function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function providerTimestampMs(snapshot) {
  const providers = snapshot?.providers;
  if (!providers || typeof providers !== "object") return 0;
  let latest = 0;
  Object.values(providers).forEach((entry) => {
    latest = Math.max(latest, finiteNumber(entry?.fetched_at) * 1000);
  });
  return latest;
}

export function modelCapabilitySnapshotMarker(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return { timestamp: 0, version: -1 };
  return {
    timestamp: finiteNumber(snapshot.models_epoch_ms) || providerTimestampMs(snapshot),
    version: finiteNumber(snapshot.models_version, -1),
  };
}

/**
 * Prevent a slower, older capabilities response from replacing a snapshot
 * that the UI already accepted. Process epoch wins across server restarts; the
 * process-local version counter breaks same-millisecond ties.
 */
export function shouldAcceptModelCapabilitySnapshot(current, incoming) {
  if (!incoming || typeof incoming !== "object") return false;
  if (!current || typeof current !== "object") return true;
  const previous = modelCapabilitySnapshotMarker(current);
  const next = modelCapabilitySnapshotMarker(incoming);
  if (next.timestamp > previous.timestamp) return true;
  if (next.timestamp < previous.timestamp) return false;
  if (next.version >= 0 && previous.version >= 0) return next.version >= previous.version;
  // Legacy payloads without ordering metadata remain acceptable so upgrades
  // do not freeze the model panel. New server responses always carry markers.
  return true;
}
