
const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');
code = code.replace(/if \\(isUserReadingTooltip\\(\\)\\) return;/g, '');
code = code.replace(/target\\.innerHTML = ([\s\S]*?);/g, (match, p1) => {
  return 'updateDOM(target, ' + p1 + ');';
});
fs.writeFileSync('src/app.js', code);

