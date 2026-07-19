import assert from "node:assert/strict";

import {
  bindPanelPaginationDelegated,
  changePanelPage,
} from "../src/panel-pagination.mjs";

class FakeRoot {
  constructor() {
    this.listeners = [];
  }

  addEventListener(type, listener) {
    if (type === "click") this.listeners.push(listener);
  }

  contains(node) {
    return node?.inside !== false;
  }

  click(target) {
    this.listeners.forEach((listener) => listener({ target }));
  }
}

function paginationTarget(pageKey, direction) {
  const button = {
    inside: true,
    dataset: { listPageKey: pageKey, listPage: direction },
  };
  return {
    closest(selector) {
      return selector === "[data-list-page-key]" ? button : null;
    },
  };
}

const root = new FakeRoot();
const changes = [];
assert.equal(
  bindPanelPaginationDelegated(root, (change) => changes.push(change)),
  true,
  "the persistent panel root should bind once",
);
assert.equal(
  bindPanelPaginationDelegated(root, (change) => changes.push(change)),
  false,
  "re-rendering must not attach another pagination listener",
);

root.click(paginationTarget("providersPage", "next"));
assert.deepEqual(
  changes,
  [{ pageKey: "providersPage", direction: "next" }],
  "one click must produce exactly one page change",
);

const state = { providersPage: 0 };
assert.equal(changePanelPage(state, "providersPage", "next"), true);
assert.equal(state.providersPage, 1, "next advances exactly one page");
assert.equal(changePanelPage(state, "providersPage", "prev"), true);
assert.equal(state.providersPage, 0, "previous returns exactly one page");
assert.equal(changePanelPage(state, "providersPage", "prev"), false);
assert.equal(state.providersPage, 0, "previous cannot move before the first page");

console.log("panel pagination tests passed");
