import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/app.js", import.meta.url));
const source = readFileSync(appPath, "utf8").replace(/\r\n/g, "\n");
const match = source.match(/  function openFormModal\([\s\S]*?\n  }\n\n  function closeFormModal/);
assert.ok(match, "openFormModal must remain extractable for lifecycle coverage");

const openFormModalSource = match[0].replace(/\n\n  function closeFormModal$/, "");
const renderedHtmlByTarget = new WeakMap();
const createOpenFormModal = new Function(
  "el",
  "state",
  "updateDOM",
  "_renderedHtmlByTarget",
  "document",
  `${openFormModalSource}; return openFormModal;`,
);

const classList = { add() {} };
const body = {
  innerHTML: "<form></form>",
  form: null,
  replaceChildren() {
    this.innerHTML = "";
    this.form = null;
  },
};
const dialog = {
  classList,
  setAttribute() {},
  querySelector() { return null; },
};
const nodes = {
  formModal: dialog,
  formModalBackdrop: { hidden: true },
  formModalBody: body,
  formModalTitle: { textContent: "" },
  formModalSubtitle: { textContent: "" },
  formModalClose: null,
};
const updateDOM = (target, html) => {
  target.innerHTML = html;
  target.form ||= new EventTarget(); // Mirrors morphdom retaining a matching form node.
};
const openFormModal = createOpenFormModal(
  (id) => nodes[id],
  {},
  updateDOM,
  renderedHtmlByTarget,
  { activeElement: null },
);

openFormModal({ title: "flash", bodyHtml: "<form data-provider-model-map-form></form>" });
const firstForm = body.form;
let flashHandlerCalls = 0;
firstForm.addEventListener("submit", () => { flashHandlerCalls += 1; });

openFormModal({ title: "pro", bodyHtml: "<form data-provider-model-map-form></form>" });
const secondForm = body.form;
let proHandlerCalls = 0;
secondForm.addEventListener("submit", () => { proHandlerCalls += 1; });
secondForm.dispatchEvent(new Event("submit"));

assert.notEqual(secondForm, firstForm, "each modal opening must receive a new form node");
assert.equal(flashHandlerCalls, 0, "a prior mapping modal handler must not submit again");
assert.equal(proHandlerCalls, 1, "only the active mapping modal handler may submit");

assert.match(source, /data-model-map-test[\s\S]*?iconSvg\("activity"\)/, "mapping modal must offer an icon-only model test action");
assert.match(source, /"\/-\/admin\/models\/test"/, "model test action must call the admin model test endpoint");
assert.match(source, /data-model-map-test-result[\s\S]*?is-ok[\s\S]*?is-bad/, "model test outcome must render inline with ok/bad tones");
assert.doesNotMatch(source, /provider-model-key-discovery/, "per-key catalog testing panel must stay removed from the models workspace");
assert.match(source, /data-model-map-key-owners/, "mapping modal must render the per-key ownership row");
assert.match(source, /data-model-map-key-chip/, "each serving key must render as a selectable chip");
assert.match(source, /payload\.key_index = selectedKeyIndex/, "model test must target the selected provider key");
assert.match(source, /modelMapKeyOwnerMaskedLookup\(/, "ownership chips must resolve masked key identities from snapshots");
assert.match(source, /owner\.masked \|\| owner\.key_id/, "chips prefer the real masked key over the hash id");
// The chips helper existing is not enough: it must be interpolated into the
// mapping modal body, or the ownership row silently disappears from the UI.
assert.match(source, /data-model-map-test-panel[\s\S]{0,1500}\$\{modelMapKeyOwnersHtml\(keyOwnerInfo\)\}/, "the mapping modal body must interpolate the ownership row inside the test panel");
assert.match(source, /data-model-map-test[\s\S]{0,400}modal\.mapping_test_action/, "the test action must carry a visible label, not just a glyph");
assert.match(source, /aria-live="polite"/, "the test outcome line must be announced when it changes");
assert.match(source, /role="group"[\s\S]{0,120}modal\.key_owner_title/, "the key row must be a labelled group, not an anonymous div");
assert.match(source, /setAttribute\("aria-pressed"/, "the selected key chip must expose its pressed state");
assert.match(source, /model-map-actions-buttons[\s\S]{0,600}data-model-map-cancel[\s\S]{0,600}type="submit"/, "the mapping modal footer must keep cancel and save in one unbreakable group");
assert.match(source, /data-model-map-test-panel[\s\S]{0,900}data-model-map-test\b/, "the test action must live inside the test panel");
assert.match(source, /markKeyOutcome\(selectedKeyIndex, result\)/, "a finished test must record its outcome on the tested key chip");
assert.match(source, /model-map-key-chip-result/, "each tested key must keep its own outcome next to its chip");
assert.match(source, /data-model-map-key-chip="\$\{Number\(keyIndex\)\}"/, "chip outcomes must be patched by key index, not by list position");
assert.match(source, /providerModelKindStrip\(kind, item, \{ secondary: true \}\)/, "the type strip must not lead the mapping modal");

// Render the ownership row for real: the substring checks above pass even when
// the helper only exists, so execute it and assert the markup it produces.
const chipsMatch = source.match(/  function modelMapKeyOwnersHtml\([\s\S]*?\n  }\n/);
assert.ok(chipsMatch, "modelMapKeyOwnersHtml must remain extractable for render coverage");
const renderKeyOwners = new Function(
  "escapeHtml",
  "t",
  `${chipsMatch[0]}; return modelMapKeyOwnersHtml;`,
)((value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), (key) => key);

const ownersHtml = renderKeyOwners({
  owners: [
    { key_index: 0, key_id: "hash-a", masked: "ms-559**1d", status: "available" },
    { key_index: 2, key_id: "hash-b", masked: "", status: "cooldown" },
  ],
  keyCatalogCount: 3,
});
assert.match(ownersHtml, /data-model-map-key-owners/, "the row renders its container");
assert.match(ownersHtml, /data-model-map-key-chip="0"[\s\S]*?ms-559\*\*1d/, "each owner renders a chip with its masked identity");
assert.match(ownersHtml, /data-model-map-key-chip="2"[\s\S]*?hash-b/, "a chip without a masked identity falls back to the key id");
assert.equal((ownersHtml.match(/data-model-map-key-chip=/g) || []).length, 2, "one chip per owning key, no more");

const noOwnersHtml = renderKeyOwners({ owners: [], keyCatalogCount: 0 });
assert.match(noOwnersHtml, /model-map-key-owners is-empty/, "without per-key owners the row states the provider-level fallback");
assert.doesNotMatch(noOwnersHtml, /data-model-map-key-chip/, "the fallback note must not render chips");

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.match(styles, /\.model-map-action\s*\{[\s\S]*?white-space:\s*nowrap/, "mapping modal actions must never wrap into one-character columns");
assert.match(styles, /\.model-map-action\s*\{[\s\S]*?min-width:\s*36px/, "mapping modal icon actions keep their square hit target");
assert.match(styles, /\.model-map-test-result\.is-ok/, "model test result must expose an ok tone");
assert.match(styles, /\.model-map-key-chip/, "key ownership chips must be styled");
assert.match(styles, /\.model-map-key-chip\.is-ok[\s\S]*?\.model-map-key-chip\.is-bad/, "tested key chips must expose ok/bad tones");
assert.match(styles, /\.model-map-test-panel\s*\{/, "the test panel must be styled");
assert.match(styles, /\.model-map-actions-buttons\s*\{[\s\S]*?flex:\s*0 0 auto/, "the footer button group must not shrink or wrap apart");
assert.match(styles, /\.model-map-kind-strip\.is-secondary/, "the demoted type strip must be styled");

console.log("form modal lifecycle tests passed");
