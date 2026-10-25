#!/usr/bin/env node
// Inlines core.js and analysis.js into app.html -> mp3-chapter-splitter.html (one self-contained file).
const fs = require('fs'), path = require('path');
const d = __dirname, read = (f) => fs.readFileSync(path.join(d, f), 'utf8');
let html = read('app.html');
for (const [marker, file] of [['/*__CORE__*/', 'core.js'], ['/*__ANALYSIS__*/', 'analysis.js']]) {
  const src = read(file);
  if (/<\/script/i.test(src)) throw new Error(file + ' contains </script>');
  if (!html.includes(marker)) throw new Error('marker missing: ' + marker);
  html = html.replace(marker, () => src.replace(/\n$/, ''));
}
fs.writeFileSync(path.join(d, 'mp3-chapter-splitter.html'), html);
console.log(`built mp3-chapter-splitter.html (${(html.length / 1024).toFixed(1)} KB)`);
