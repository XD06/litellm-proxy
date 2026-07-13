export function bindTrafficModeControls(root, { getMode, setMode }) {
  if (!root || typeof getMode !== "function" || typeof setMode !== "function") return;
  root.querySelectorAll("button[data-traffic-mode]").forEach((button) => {
    if (button.dataset.bounddatatrafficmode) return;
    button.dataset.bounddatatrafficmode = "1";
    button.addEventListener("click", () => {
      const mode = button.dataset.trafficMode;
      if (!mode || getMode() === mode) return;
      setMode(mode);
    });
  });
}
