
const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

// Also replace body.innerHTML, el('id').innerHTML
code = code.replace(/(body|el\([^\)]+\)|deleteButton|closeBtn)\.innerHTML = ([\s\S]*?);/g, (match, p1, p2) => {
  return 'updateDOM(' + p1 + ', ' + p2 + ');';
});
fs.writeFileSync('src/app.js', code);

