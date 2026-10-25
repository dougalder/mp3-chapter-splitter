#!/usr/bin/env node
// Detection tests: synthetic envelopes + real fixtures decoded by ffmpeg (buildEnvelope itself needs a
// browser's Web Audio and is exercised in wave-e2e.js).
'use strict';
const assert = require('assert'), path = require('path'), fs = require('fs');
const { execFileSync } = require('child_process');
const A = require('./analysis.js');
let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('FAIL  ' + n + '\n      ' + e.message); } };
const FX = path.join(__dirname, 'fixtures');
if (!fs.existsSync(path.join(FX, 'studio.mp3'))) execFileSync('python3', [path.join(__dirname, 'gen_fixtures.py')], { stdio: 'inherit' });
const near = (got, want, tol, msg) => assert(Math.abs(got - want) <= tol, `${msg || ''} got ${got}, want ${want}±${tol}`);
const B = A.BUCKET;

// envelope from [seconds, rmsDb, zcr] segments
function env(segs) {
  const n = segs.reduce((a, [s]) => a + Math.round(s / B), 0), rms = new Float32Array(n), zcr = new Float32Array(n), peak = new Float32Array(n);
  let o = 0; for (const [s, db, z] of segs) for (let i = 0; i < Math.round(s / B); i++) { rms[o] = db; zcr[o] = z; o++; }
  return { bucket: B, n, duration: n * B, rms, peak, zcr };
}
const M = [-14, 0.015], times = (e, o) => A.detectBreaks(e, o).times;

console.log('synthetic');
t('silence gaps between songs', () => {
  const b = times(env([[60, ...M], [3, -90, 0], [60, ...M], [3, -90, 0], [60, ...M]]), { minTrack: 20 });
  assert.strictEqual(b.length, 3); near(b[1], 63 - 0.4, 0.05); near(b[2], 126 - 0.4, 0.05);
});
t('a quiet transfer behaves like a loud master (threshold is relative)', () => {
  assert.strictEqual(times(env([[60, -40, 0.015], [3, -110, 0], [60, -40, 0.015]]), { minTrack: 20 }).length, 2);
});
t('a short pause inside a song is ignored (minGap)', () => {
  assert.strictEqual(times(env([[60, ...M], [0.6, -90, 0], [60, ...M]]), { minTrack: 20 }).length, 1);
});
t('the longer gap wins when two fall within minTrack', () => {
  const b = times(env([[60, ...M], [1.5, -90, 0], [10, ...M], [4, -90, 0], [60, ...M]]), { minTrack: 30 });
  assert.strictEqual(b.length, 2); near(b[1], 75.5 - 0.4, 0.1);
});
t('applause as loud as the band is found only in live mode', () => {
  const e = env([[60, ...M], [8, -14.5, 0.42], [60, ...M]]);
  assert.strictEqual(times(e, { minTrack: 20 }).length, 1);
  const r = A.detectBreaks(e, { minTrack: 20, applause: true }); assert.strictEqual(r.times.length, 2); assert.strictEqual(r.gaps[0].kind, 'crowd');
});
t('loud tonal music never trips the applause gate', () => assert.strictEqual(times(env([[120, -6, 0.02]]), { minTrack: 20, applause: true }).length, 1));
t('always includes 0 and honours maxTracks', () => {
  const segs = []; for (let i = 0; i < 20; i++) segs.push([10, ...M], [2, -90, 0]);
  const b = times(env(segs), { minTrack: 5, maxTracks: 6 }); assert.strictEqual(b.length, 6); assert.strictEqual(b[0], 0);
});
t('a single-bucket click inside silence does not split the gap', () => {
  const e = env([[60, ...M], [1.0, -90, 0], [0.01, -20, 0], [1.0, -90, 0], [60, ...M]]);
  assert.strictEqual(times(e, { minTrack: 20 }).length, 2);
});

console.log('real audio (ffmpeg-decoded fixtures)');
function envelopeOf(file) {
  const sr = 22050, raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(FX, file), '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.length >> 2), bl = Math.round(sr * B), n = Math.floor(pcm.length / bl);
  const rms = new Float32Array(n), zcr = new Float32Array(n), peak = new Float32Array(n);
  for (let b = 0; b < n; b++) { let sq = 0, z = 0; for (let i = b * bl; i < (b + 1) * bl; i++) { sq += pcm[i] * pcm[i]; if (i > b * bl && (pcm[i] >= 0) !== (pcm[i - 1] >= 0)) z++; } rms[b] = 20 * Math.log10(Math.sqrt(sq / bl) + 1e-7); zcr[b] = z / bl; }
  return { bucket: bl / sr, n, duration: n * bl / sr, rms, peak, zcr };
}
t('studio.mp3: three breaks at the silences', () => {
  const b = times(envelopeOf('studio.mp3'), { minTrack: 10 });
  assert.strictEqual(b.length, 4); [0, 32.1, 70.6, 101.1].forEach((w, i) => near(b[i], w, 0.6, 'break ' + i));
});
t('vbr.mp3: same result', () => assert.strictEqual(times(envelopeOf('vbr.mp3'), { minTrack: 10 }).length, 4));
t('live.mp3 (white-noise crowd): none in silence mode, two in live mode', () => {
  const e = envelopeOf('live.mp3');
  assert.strictEqual(times(e, { minTrack: 10 }).length, 1);
  const b = times(e, { minTrack: 10, applause: true }); assert.strictEqual(b.length, 3); near(b[1], 46.6, 0.7); near(b[2], 98.6, 0.7);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
