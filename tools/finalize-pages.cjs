const fs = require('node:fs');
const path = require('node:path');

const docs = path.resolve(__dirname, '../docs');
fs.copyFileSync(path.join(docs, 'index.html'), path.join(docs, '404.html'));
fs.writeFileSync(path.join(docs, '.nojekyll'), '');
