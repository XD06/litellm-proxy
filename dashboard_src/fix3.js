const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

// Normalize line endings for replacement, then write back
code = code.replace(/\r\n/g, '\n');

code = code.split('    `);\n  }').join('    `;\n  }');
code = code.split('    `);\n    const form').join('    `;\n    const form');
code = code.split('    `);\n    if (closeBtn').join('    `;\n    if (closeBtn');

fs.writeFileSync('src/app.js', code);
