import assert from "node:assert/strict";

import {
  requestPageTarget,
  requestPayloadMatchesPage,
  requestNavigationPayloadMatchesPage,
} from "../src/request-pagination.mjs";

assert.equal(requestPageTarget(0, 808, "next"), 1, "one click advances exactly one page");
assert.equal(requestPageTarget(1, 808, "next", true), 1, "pending navigation ignores repeated clicks");
assert.equal(requestPageTarget(0, 808, "prev"), 0, "previous cannot move before page one");
assert.equal(requestPageTarget(807, 808, "next"), 807, "next cannot move past the final page");

assert.equal(requestPayloadMatchesPage({ offset: 10 }, 1, 10), true, "target offset is accepted");
assert.equal(requestPayloadMatchesPage({ offset: 0 }, 1, 10), false, "obsolete offset is rejected");
assert.equal(requestPayloadMatchesPage(undefined, 1, 10), true, "missing optional payload is not stale data");
assert.equal(requestNavigationPayloadMatchesPage(undefined, 1, 10), false, "missing payload cannot confirm a pending page navigation");
assert.equal(requestNavigationPayloadMatchesPage({ offset: 10 }, 1, 10), true, "matching payload confirms a pending page navigation");
assert.equal(requestNavigationPayloadMatchesPage({ offset: 0 }, 1, 10), false, "obsolete payload cannot confirm a pending page navigation");

console.log("request pagination tests passed");
