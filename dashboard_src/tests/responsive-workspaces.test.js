const fs = require("fs");
const path = require("path");
const assert = require("assert");

const styles = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");

const ownership = styles.slice(styles.indexOf("Final responsive ownership"));
assert.match(ownership, /@media \(max-width: 760px\)[\s\S]*#providersView \.provider-card-grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/, "mobile providers must own a one-column card layout");
assert.match(ownership, /#providersView \.provider-toolbar\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "mobile provider filters must use the available width without horizontal scrolling");
assert.match(ownership, /\.playground-view \.playground-layout\s*\{[\s\S]*flex-direction: column/, "mobile playground must stack setup and chat vertically");
assert.match(ownership, /\.playground-view \.playground-main\s*\{[\s\S]*min-height:/, "mobile playground chat must retain a usable work area");

const tabletOwnership = styles.slice(styles.indexOf("Final tablet shell ownership"));
assert.match(tabletOwnership, /@media \(min-width: 761px\) and \(max-width: 1080px\)/, "tablet shell must have its own final breakpoint");
assert.match(tabletOwnership, /\.sidebar\s*\{[\s\S]*grid-template-areas:[\s\S]*"brand actions footer"[\s\S]*"nav nav nav"/, "tablet sidebar must collapse into a compact two-row header");
assert.match(tabletOwnership, /\.sidebar \.nav\s*\{[\s\S]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/, "tablet navigation must stay on one row");
assert.match(tabletOwnership, /\.sidebar-footer\s*\{[\s\S]*display: flex/, "tablet runtime status and language control must remain compact and visible");
assert.match(tabletOwnership, /#requestsTable \.request-summary-row\s*\{[\s\S]*grid-template-areas: none/, "tablet and compact desktop request rows must remain a single aligned row");
assert.match(tabletOwnership, /#requestsTable \.request-row-route\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/, "request routing evidence must stay aligned without wrapping the row");

console.log("responsive workspace tests passed");
