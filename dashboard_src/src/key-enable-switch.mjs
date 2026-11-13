// Pure state derivation for the client-key enable/pause switch. Kept out of
// app.js so the Node UI tests can exercise the enabled / paused / expired
// branches without a DOM.
export function keySwitchState(record) {
  const entry = record || {};
  const expired = Boolean(entry.expired);
  const checked = entry.enabled !== false;
  return {
    checked,
    // An expired key cannot be re-enabled from the switch: editing its expiry
    // is the recovery, so the control stays visibly disabled.
    disabled: expired,
    state: expired ? "expired" : checked ? "active" : "paused",
  };
}
