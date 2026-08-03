import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.js"), "utf8");
const index = fs.readFileSync(path.join(root, "..", "dashboard", "index.html"), "utf8");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source region: ${start}`);
  return source.slice(startIndex, endIndex);
}

const requestMarkup = between(index, '<section id="requestsView"', '<section id="providersView"');
const requestRender = between(app, "function renderRequestsTable", "function requestTone");
const requestPath = between(app, "function requestsPath", "function currentRequestFilters");
const requestDeleteUi = between(app, "function updateRequestSelectionUi", "function bindRequestPagination");
const requestDesktopStyles = styles.slice(styles.lastIndexOf("/* Request logs desktop redesign"));

assert.match(requestMarkup, /class="requests-page-head"[\s\S]*id="requestsPageVitals"/, "request page needs a Demo-aligned title and compact live summary");
assert.match(requestMarkup, /id="requestSearchIcon"[\s\S]*id="filterModel"[\s\S]*id="filterProvider"[\s\S]*id="filterClientIp"/, "primary request search must retain model, provider, and client IP fields");
for (const id of [
  "filterErrorType",
  "filterReason",
  "filterHttpStatus",
  "filterStream",
  "filterClientFormat",
  "filterUpstreamFormat",
  "filterCostStatus",
  "applyFiltersButton",
  "clearFiltersButton",
  "requestToolbarPagination",
  "deleteRequestsButton",
  "requestsTable",
]) {
  assert.match(requestMarkup, new RegExp(`id="${id}"`), `request page must retain #${id}`);
}

assert.match(requestPath, /params\.set\("limit"[\s\S]*params\.set\("offset"[\s\S]*\/-\/admin\/requests\?/, "request list endpoint and pagination query must stay unchanged");
assert.match(requestRender, /modelBrandIconMarkup\(r\.model/, "request rows must preserve model brand icons");
assert.match(requestRender, /providerBrandIconMarkup\(provider/, "request rows must preserve provider brand icons");
assert.match(requestRender, /requestFormatBadge\(r\)/, "request identity must retain client and upstream format");
assert.match(requestRender, /r\.client_ip/, "request identity must retain client IP");
assert.match(requestRender, /r\.stream/, "request identity must retain streaming state");
assert.match(requestRender, /statusBadge\(r\.status, r\.status_code\)/, "request status and HTTP status must remain visible");
assert.match(requestRender, /usage\.total_tokens[\s\S]*usage\.input_tokens[\s\S]*usage\.output_tokens/, "total, input, and output token fields must remain visible");
assert.match(requestRender, /renderCost\([\s\S]*cost_usd/, "cost and pricing state must remain visible");
assert.match(requestRender, /firstByteMsFromRequest\(r\)[\s\S]*r\.duration_ms/, "TTFT and total duration must remain visible");
assert.doesNotMatch(requestMarkup, /requestSelectedCount|data-request-select-page/, "request page must not expose bulk-selection controls");
assert.match(requestMarkup, /advanced-filter-fields[\s\S]*request-advanced-actions[\s\S]*id="deleteRequestsButton"/, "destructive history actions must stay available inside advanced filters");
assert.doesNotMatch(requestRender, /request-select-column|data-request-select=/, "request rows must not reserve a checkbox column");
assert.match(requestRender, /data-request-row=[\s\S]*data-request-open=/, "row and explicit request-detail actions must remain available");
assert.match(requestRender, /items\.length === REQUEST_PAGE_SIZE[\s\S]*is-full-page/, "full request pages must opt into height distribution");
assert.doesNotMatch(requestDeleteUi, /\bcount\b/, "delete action labels must not depend on removed selection state");

assert.match(requestDesktopStyles, /#requestsTable \.request-data-table thead\s*\{[\s\S]*height:\s*auto/, "desktop request table header must be visibly restored");
assert.match(requestDesktopStyles, /#requestsTable \.request-data-table thead th\s*\{[\s\S]*color:\s*#/, "desktop request headers must have visible text");
assert.match(requestDesktopStyles, /#requestsTable \.request-data-table td\s*\{[\s\S]*height:\s*54px/, "desktop request rows must remain compact");
assert.match(requestDesktopStyles, /#requestsTable \.request-data-table\.is-full-page\s*\{[\s\S]*height:\s*100%/, "full request pages must fill the available panel height");
assert.match(requestDesktopStyles, /#requestsTable \.request-identity\s*\{[\s\S]*display:\s*inline-flex/, "request identity must keep a compact flex layout");
assert.match(requestDesktopStyles, /#requestsTable \.request-identity\s*\{[\s\S]*flex-direction:\s*column/, "request metadata must sit below the model name");
assert.match(requestDesktopStyles, /#requestsTable \.request-identity > strong\s*\{[\s\S]*flex:\s*0 0 auto/, "model names must not shrink before secondary metadata");
assert.match(requestDesktopStyles, /#requestsTable \.request-model-mark\s*\{[\s\S]*border:\s*1px solid/, "model brand marks must retain a compact framed treatment");
assert.match(requestDesktopStyles, /#requestsTable \.request-provider-chip,[\s\S]*border:\s*1px solid/, "provider badges must retain a compact framed treatment");
assert.match(requestDesktopStyles, /#requestsTable \.request-token-block\s*\{[\s\S]*flex-direction:\s*column/, "total and input-output token values must remain on separate lines");
assert.match(i18n, /"req\.page_desc"[^\n]+zh:/, "request page description must remain bilingual");

console.log("request page layout tests passed");
