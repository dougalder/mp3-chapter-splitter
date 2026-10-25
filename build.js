#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('app.html', 'utf8');

// Inline core.js and analysis.js
const core = fs.readFileSync('core.js', 'utf8').split('\n').slice(1).join('\n'); // Skip shebang-like comment
const analysis = fs.readFileSync('analysis.js', 'utf8').split('\n').slice(1).join('\n');

let result = html
  .replace('/*__CORE__*/', core)
  .replace('/*__ANALYSIS__*/', analysis);

fs.writeFileSync('mp3-chapter-splitter.html', result);
console.log(`Built mp3-chapter-splitter.html (${(result.length / 1024).toFixed(1)} KB)`);
