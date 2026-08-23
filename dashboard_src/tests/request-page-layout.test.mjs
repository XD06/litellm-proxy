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
assert.match(requestRender, /request-cell-provider[\s\S]*request-provider-chip[\s\S]*request-cell-route[\s\S]*request-route-chip/, "provider and routing outcome must use separate aligned columns");
assert.match(requestRender, /requestFormatBadge\(r\)/, "request identity must retain client and upstream format");
assert.match(requestRender, /request-reasoning-chip effort-\$\{escapeHtml\(reasoningEffortTone\(r\.reasoning_effort\)\)\}/, "reasoning effort must expose a stable intensity class");
assert.match(app, /function reasoningEffortTone\(value\)[\s\S]*case "minimal"[\s\S]*case "low"[\s\S]*case "medium"[\s\S]*case "high"/, "all supported reasoning effort levels must map to a visual tone");
assert.match(requestRender, /<th scope="col">\$\{escapeHtml\(t\("req\.meta_ip"\)\)\}<\/th>/, "request table must expose a dedicated client IP column");
assert.match(requestRender, /request-cell-client-ip[\s\S]*r\.client_ip|r\.client_ip[\s\S]*request-cell-client-ip/, "client IP must render in its own table cell");
assert.match(requestRender, /request-format-chip format-\$\{escapeHtml\(formatTone\)\}/, "request formats must expose a stable color class");
assert.match(requestRender, /const displayFormat = converted \? finalUpstreamFormat : clientFormat/, "converted badges must derive their appearance from the displayed final format");
assert.match(requestRender, /displayFormat === "chat_completions"[\s\S]*\? "chat"/, "Chat requests must use the Chat format tone");
assert.match(requestRender, /displayFormat === "responses"[\s\S]*\? "responses"/, "Responses requests must use the Responses format tone");
assert.match(requestRender, /displayFormat === "anthropic_messages"[\s\S]*\? "messages"/, "Messages requests must use the Messages format tone");
assert.match(requestRender, /r\.client_ip/, "request identity must retain client IP");
assert.doesNotMatch(requestRender, /request-identity[\s\S]*request-meta-chip mono[^\n]*source/, "client IP must not remain mixed into model metadata");
assert.match(requestRender, /r\.stream/, "request identity must retain streaming state");
assert.match(requestRender, /statusBadge\(r\.status, r\.status_code\)/, "request status and HTTP status must remain visible");
assert.match(requestRender, /usage\.total_tokens[\s\S]*usage\.input_tokens[\s\S]*usage\.output_tokens/, "total, input, and output token fields must remain visible");
assert.match(requestRender, /renderCost\([\s\S]*cost_usd/, "cost and pricing state must remain visible");
assert.match(requestRender, /firstByteMsFromRequest\(r\)[\s\S]*r\.duration_ms/, "TTFT and total duration must remain visible");
assert.match(requestRender, /request-latency-chip[\s\S]*fmtCompactMs\(firstByte\)[\s\S]*aria-hidden="true">\/<[\s\S]*fmtCompactMs\(r\.duration_ms\)/, "latency cells must render TTFT before total duration with only a slash separator");
assert.doesNotMatch(requestRender, /t\("req\.ttft_short"\)/, "latency cells must not append explanatory text");
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
assert.match(requestDesktopStyles, /#requestsTable \.request-cell-client-ip\s*\{[\s\S]*white-space:\s*nowrap/, "client IP column must remain compact");
assert.match(requestDesktopStyles, /#requestsTable \.request-data-table th:nth-child\(2\)\s*\{\s*width:\s*12%/, "client IP column must reserve enough width for a complete IPv4 address");
assert.match(requestDesktopStyles, /#requestsTable \.request-identity\s*\{[\s\S]*flex-direction:\s*column/, "request metadata must sit below the model name");
assert.match(requestDesktopStyles, /#requestsTable \.request-identity > strong\s*\{[\s\S]*flex:\s*0 0 auto/, "model names must not shrink before secondary metadata");
assert.match(requestDesktopStyles, /#requestsTable \.request-model-mark\s*\{[\s\S]*border:\s*1px solid/, "model brand marks must retain a compact framed treatment");
assert.match(requestDesktopStyles, /#requestsTable \.request-provider-chip,[\s\S]*border:\s*1px solid/, "provider badges must retain a compact framed treatment");
assert.match(requestDesktopStyles, /#requestsTable \.request-token-block\s*\{[\s\S]*flex-direction:\s*column/, "total and input-output token values must remain on separate lines");
assert.match(requestDesktopStyles, /\.request-format-chip\.format-chat\s*\{[\s\S]*color:\s*#047857/, "Chat format must use restrained green");
assert.match(requestDesktopStyles, /\.request-format-chip\.format-responses\s*\{[\s\S]*color:\s*#2563eb/, "Responses format must use restrained blue");
assert.match(requestDesktopStyles, /\.request-format-chip\.format-messages\s*\{[\s\S]*color:\s*#b45309/, "Messages format must use restrained amber");
assert.match(requestDesktopStyles, /\.request-reasoning-chip\.effort-minimal\s*\{[\s\S]*color:\s*#0f766e/, "minimal reasoning must use its own readable tone");
assert.match(requestDesktopStyles, /\.request-reasoning-chip\.effort-low\s*\{[\s\S]*color:\s*#2563eb/, "low reasoning must use its own readable tone");
assert.match(requestDesktopStyles, /\.request-reasoning-chip\.effort-medium\s*\{[\s\S]*color:\s*#7c3aed/, "medium reasoning must use its own readable tone");
assert.match(requestDesktopStyles, /\.request-reasoning-chip\.effort-high\s*\{[\s\S]*color:\s*#c2410c/, "high reasoning must use its own readable tone");
assert.match(requestRender, /converted \? iconSvg\("arrow-right-left"\)/, "converted formats must use a compact conversion icon");
assert.match(requestRender, /shortFormatLabel\(displayFormat\)/, "converted badges must display only the final format");
assert.match(i18n, /"req\.page_desc"[^\n]+zh:/, "request page description must remain bilingual");

console.log("request page layout tests passed");
