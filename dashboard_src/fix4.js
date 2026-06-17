const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

code = code.replace(/unknown"}\`\);/g, 'unknown"}\`;');

fs.writeFileSync('src/app.js', code);
