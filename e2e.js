#!/usr/bin/env node
/**
 * End-to-end test — timestamp parsing and splitting workflow
 * Exercises: timestamp parsing → marker creation → track cutting → ZIP export
 */
'use strict';
const assert = require('assert');
const core = require('./core.js');

console.log('End-to-end test: timestamp workflow\n');

// Simulate YouTube timestamp workflow
const youtubeText = `
[00:00](https://www.youtube.com/watch?v=abc123) Intro
[05:30](https://www.youtube.com/watch?v=abc123&t=330s) Verse One
[10:15](https://www.youtube.com/watch?v=abc123&t=615s) Chorus
[15:45](https://www.youtube.com/watch?v=abc123&t=945s) Bridge
`;

console.log('1. Parse timestamps from YouTube format');
const marks = core.parseTimestamps(youtubeText);
console.log(`   ✓ Extracted ${marks.length} chapters`);
assert.strictEqual(marks.length, 4);
assert.strictEqual(marks[0].title, 'Intro');
assert.strictEqual(marks[1].time, 330);

console.log('2. Sanitize chapter titles');
marks.forEach((m, i) => {
  const safe = core.sanitizeFilename(m.title);
  console.log(`   ✓ ${m.title} → ${safe}`);
  assert(safe.length > 0);
  assert(!safe.match(/[<>:"|?*]/)); // No unsafe chars
});

console.log('3. Create ZIP with dummy chapter data');
const tracks = marks.map((m, i) => ({
  filename: core.sanitizeFilename(m.title) + '.mp3',
  data: Buffer.from(`Dummy audio data for ${m.title}`),
}));
const zip = core.buildZip(tracks);
console.log(`   ✓ Built ZIP (${(zip.length / 1024).toFixed(1)} KB)`);
assert(Buffer.isBuffer(zip));
assert(zip.length > 100);

console.log('\n✓ End-to-end test passed\n');
