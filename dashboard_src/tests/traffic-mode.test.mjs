import assert from "node:assert/strict";
import { bindTrafficModeControls } from "../src/traffic-mode.mjs";

class ModeTarget extends EventTarget {
  constructor(tagName, mode) {
    super();
    this.tagName = tagName;
    this.dataset = { trafficMode: mode };
  }

  click() {
    this.dispatchEvent(new Event("click"));
  }
}

const shell = new ModeTarget("DIV", "requests");
const requests = new ModeTarget("BUTTON", "requests");
const tokens = new ModeTarget("BUTTON", "tokens");
const selectors = [];
const root = {
  querySelectorAll(selector) {
    selectors.push(selector);
    return selector === "button[data-traffic-mode]"
      ? [requests, tokens]
      : [shell, requests, tokens];
  },
};

let mode = "requests";
let renders = 0;
bindTrafficModeControls(root, {
  getMode: () => mode,
  setMode: (nextMode) => {
    mode = nextMode;
    renders += 1;
  },
});

tokens.click();
assert.equal(mode, "tokens", "clicking Tokens must keep the selected mode");
assert.equal(renders, 1, "one click must perform one mode transition");
assert.deepEqual(selectors, ["button[data-traffic-mode]"], "the shell must not receive a mode handler");

tokens.click();
assert.equal(renders, 1, "clicking the active mode must not re-render the chart");

console.log("traffic mode tests passed");
