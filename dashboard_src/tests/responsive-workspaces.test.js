const fs = require("fs");
const path = require("path");
const assert = require("assert");

const styles = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");

const ownership = styles.slice(styles.indexOf("Final responsive ownership"));
assert.match(ownership, /@media \(max-width: 760px\)[\s\S]*#providersView \.provider-card-grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/, "mobile providers must own a one-column card layout");
assert.match(ownership, /#providersView \.provider-toolbar\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "mobile provider filters must use the available width without horizontal scrolling");
assert.match(ownership, /\.playground-view \.playground-layout\s*\{[\s\S]*flex-direction: column/, "mobile playground must stack setup and chat vertically");
assert.match(ownership, /\.playground-view \.playground-main\s*\{[\s\S]*min-height:/, "mobile playground chat must retain a usable work area");

console.log("responsive workspace tests passed");
