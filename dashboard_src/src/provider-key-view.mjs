export function mergedProviderKeys(runtimeKeys, configKeys) {
  const runtime = Array.isArray(runtimeKeys) ? runtimeKeys : [];
  if (!Array.isArray(configKeys)) return runtime.map((key) => ({ ...key }));

  const availableRuntime = runtime.map((key, position) => ({ key, position }));
  const consumedRuntime = new Set();

  const stableIdentity = (key) => {
    const value = String(key?.key_id || "").trim();
    if (!value || value === "pending") return "";
    return value;
  };
  const stableMasked = (key) => {
    const value = String(key?.masked || "").trim();
    if (!value || value === "pending") return "";
    return value;
  };
  const findRuntime = (configured, configPosition) => {
    const configuredId = stableIdentity(configured);
    const configuredMasked = stableMasked(configured);
    let match = configuredId
      ? availableRuntime.find((entry) => (
          !consumedRuntime.has(entry.position) && stableIdentity(entry.key) === configuredId
        ))
      : null;
    if (!match && configuredMasked) {
      match = availableRuntime.find((entry) => (
        !consumedRuntime.has(entry.position) && stableMasked(entry.key) === configuredMasked
      ));
    }
    if (!match && !configuredId && !configuredMasked && !configured?.pending) {
      const configuredIndex = Number(configured?.index ?? configPosition);
      match = availableRuntime.find((entry) => (
        !consumedRuntime.has(entry.position)
        && Number(entry.key?.index ?? entry.position) === configuredIndex
      ));
    }
    if (match) consumedRuntime.add(match.position);
    return match?.key || null;
  };

  return configKeys.flatMap((configured, configPosition) => {
    if (!configured || configured.pending_delete) return [];
    const runtimeMatch = findRuntime(configured, configPosition);
    if (!runtimeMatch) return [{ ...configured }];
    return [{
      ...runtimeMatch,
      ...configured,
      index: Number(configured.index ?? configPosition),
      key_id: configured.key_id ?? runtimeMatch.key_id ?? "",
      masked: configured.masked ?? runtimeMatch.masked ?? "",
      proxy: configured.proxy ?? runtimeMatch.proxy ?? "",
    }];
  });
}
