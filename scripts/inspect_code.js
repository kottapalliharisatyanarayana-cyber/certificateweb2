const fs = require('fs');

const adminJs = fs.readFileSync('public/js/admin.js', 'utf8');

// Find all occurrences of currentTemplateType
let idx = 0;
while ((idx = adminJs.indexOf('currentTemplateType', idx)) !== -1) {
  console.log(`--- Match at ${idx} ---`);
  console.log(adminJs.substring(Math.max(0, idx - 50), Math.min(adminJs.length, idx + 250)));
  idx += 19;
}
