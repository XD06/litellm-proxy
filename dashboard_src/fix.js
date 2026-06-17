const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

code = code.replace(/display: flex\);/g, 'display: flex;');
code = code.replace(/padding: 24px\);/g, 'padding: 24px;');
code = code.replace(/max-width: 800px\);/g, 'max-width: 800px;');

code = code.replace(/updateDOM\(([^,]+), `([\s\S]*?)`;/g, (match, p1, p2) => {
  return 'updateDOM(' + p1 + ', `' + p2 + '`);';
});

fs.writeFileSync('src/app.js', code);
