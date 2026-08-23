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

console.log("form modal lifecycle tests passed");
