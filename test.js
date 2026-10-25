#!/usr/bin/env node
// Engine tests: timestamp parsing, MP3 parsing, lossless cutting (verified with ffprobe/ffmpeg), tags, zip.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const C = require('./core.js');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const FX = path.join(__dirname, 'fixtures');
if (!fs.existsSync(path.join(FX, 'studio.mp3'))) execFileSync('python3', [path.join(__dirname, 'gen_fixtures.py')], { stdio: 'inherit' });
const load = (n) => new Uint8Array(fs.readFileSync(path.join(FX, n)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mp3split-'));
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]).toString());
const decodeErrors = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function freqOf(file, from, len) {      // dominant frequency by zero crossings of the decoded signal
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(len), '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  const s = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1); let z = 0;
  for (let i = 1; i < s.length; i++) if ((s[i] >= 0) !== (s[i - 1] >= 0)) z++;
  return z / 2 / (s.length / 8000);
}
const pairs = (m) => m.map((x) => [x.time, x.title]);

console.log('timestamps');
t('YouTube markdown links, everything on one line', () => assert.deepStrictEqual(pairs(C.parseTimestamps(
  '[00:00](https://www.youtube.com/watch?v=x) Springtime in Vienna [04:10](https://www.youtube.com/watch?v=x&t=250s) The Luxury [42:55](https://y.com/?t=2575s) Ahead By A Century')),
  [[0, 'Springtime in Vienna'], [250, 'The Luxury'], [2575, 'Ahead By A Century']]));
t('plain lines, dash separators, h:mm:ss', () => assert.deepStrictEqual(pairs(C.parseTimestamps('0:00 Intro\n3:05 - Second Song\n1:02:03 – Last One')),
  [[0, 'Intro'], [185, 'Second Song'], [3723, 'Last One']]));
t('"Title 0:00" layout is auto-detected', () => assert.deepStrictEqual(pairs(C.parseTimestamps('Intro 0:00\nSecond 3:05')), [[0, 'Intro'], [185, 'Second']]));
t('a parenthesised duration is not a marker: "Intro (2:15)"', () => {
  const m = C.parseTimestamps('00:00 Intro (2:15)\n02:15 Song'); assert.strictEqual(m.length, 2); assert.strictEqual(m[1].time, 135); assert.strictEqual(m[0].title, 'Intro');
});
t('a stray earlier time inside a title is dropped (non-decreasing run)', () => {
  const m = C.parseTimestamps('0:00 First\n5:00 Second 1:00 remix\n9:00 Third'); assert.deepStrictEqual(m.map((x) => x.time), [0, 300, 540]);
});
t('empty / no-timestamp input gives []', () => { assert.deepStrictEqual(C.parseTimestamps(''), []); assert.deepStrictEqual(C.parseTimestamps('hello'), []); });
t('sanitizeFilename strips illegal characters, keeps accents, has a fallback', () => {
  assert.strictEqual(C.sanitizeFilename('AC/DC: Back "In" Black?'), 'AC-DC- Back -In- Black-');
  assert.strictEqual(C.sanitizeFilename('Café Über'), 'Café Über'); assert.strictEqual(C.sanitizeFilename('...'), 'track');
});
t('crc32 known value', () => assert.strictEqual(C.crc32(new TextEncoder().encode('123456789')), 0xCBF43926));

console.log('parsing');
for (const [name, sr] of [['studio.mp3', 44100], ['cbr-noxing.mp3', 44100], ['vbr.mp3', 44100], ['mono22.mp3', 22050]]) {
  t(`parseMp3 ${name}: duration within 0.1 s of ffprobe, ${sr} Hz`, () => {
    const info = C.parseMp3(load(name)), d = parseFloat(probe(path.join(FX, name)).format.duration);
    assert.strictEqual(info.samplerate, sr); assert(Math.abs(info.totalDuration - d) < 0.1, `parsed ${info.totalDuration} vs ffprobe ${d}`);
  });
}
t('Xing header frame is detected and excluded (studio has one, cbr-noxing does not)', () => {
  const a = C.parseMp3(load('studio.mp3')), b = C.parseMp3(load('cbr-noxing.mp3'));
  assert.strictEqual(a.hadVbrHeader, true); assert.strictEqual(b.hadVbrHeader, false); assert(Math.abs(a.totalDuration - b.totalDuration) < 0.1);
});
t('vbr.mp3 is reported as VBR, studio.mp3 as CBR', () => { assert.strictEqual(C.parseMp3(load('vbr.mp3')).vbr, true); assert.strictEqual(C.parseMp3(load('studio.mp3')).vbr, false); });
t('ID3v2 in front and ID3v1 at the back are skipped', () => {
  const raw = load('studio.mp3'), id3 = C.buildId3({ TIT2: 'x', TPE1: 'y' }), v1 = new Uint8Array(128); v1.set([0x54, 0x41, 0x47]);
  const wrapped = new Uint8Array(id3.length + raw.length + 128); wrapped.set(id3); wrapped.set(raw, id3.length); wrapped.set(v1, id3.length + raw.length);
  assert(Math.abs(C.parseMp3(wrapped).totalDuration - C.parseMp3(raw).totalDuration) < 1e-6);
});
t('garbage input throws a readable error', () => assert.throws(() => C.parseMp3(new Uint8Array(5000).fill(7)), /MPEG|MP3/));

console.log('cutting');
for (const name of ['studio.mp3', 'cbr-noxing.mp3', 'vbr.mp3', 'mono22.mp3']) {
  t(`cut ${name}: within one frame of the request, decodes clean, tags readable`, () => {
    const bytes = load(name), info = C.parseMp3(bytes), a = 5.0, b = Math.min(18.3, info.totalDuration - 1);
    const r = C.cutTrack(bytes, info, a, b, { TIT2: 'Tést – テスト', TPE1: 'Artist', TALB: 'Alb', TYER: '1999', TCON: 'Rock', TRCK: '2/9' });
    const f = path.join(tmp, name + '.cut.mp3'); fs.writeFileSync(f, r.data);
    assert(Math.abs(r.actualStart - a) <= 0.0271 && Math.abs(r.actualEnd - b) <= 0.0271, `actual ${r.actualStart}-${r.actualEnd}`);
    const p = probe(f), d = parseFloat(p.format.duration);
    assert(Math.abs(d - (b - a)) < 0.06, `ffprobe duration ${d} vs ${b - a}`);
    assert.strictEqual(p.format.tags.title, 'Tést – テスト'); assert.strictEqual(p.format.tags.track, '2/9');
    assert.strictEqual(p.format.tags.genre, 'Rock'); assert.strictEqual(p.format.tags.date || p.format.tags.TYER, '1999');
    assert.strictEqual(decodeErrors(f).trim(), '');
  });
}
t('cut output re-parses to its own duration (Xing header is valid)', () => {
  const bytes = load('studio.mp3'), info = C.parseMp3(bytes), r = C.cutTrack(bytes, info, 10, 40, { TIT2: 'x' }), again = C.parseMp3(r.data);
  assert.strictEqual(again.hadVbrHeader, true); assert(Math.abs(again.totalDuration - r.duration) < 1e-6, `${again.totalDuration} vs ${r.duration}`);
});
t('opts.id3=false / opts.xing=false are honoured', () => {
  const bytes = load('studio.mp3'), info = C.parseMp3(bytes), r = C.cutTrack(bytes, info, 10, 20, { TIT2: 'x' }, { id3: false, xing: false });
  assert.strictEqual(r.data[0], 0xFF); assert.strictEqual(C.parseMp3(r.data).hadVbrHeader, false);
});
t('cut audio is bit-identical to the source (no re-encode)', () => {
  const bytes = load('studio.mp3'), info = C.parseMp3(bytes), r = C.cutTrack(bytes, info, 10, 20, { TIT2: 'x' }, { id3: false, xing: false });
  const src = info.frames.find((f) => Math.abs(f.startTime - r.actualStart) < 1e-9).offset;
  for (let k = 0; k < 400; k++) assert.strictEqual(r.data[k], bytes[src + k]);
});
t('each song of studio.mp3 contains the right pitch', () => {
  const bytes = load('studio.mp3'), info = C.parseMp3(bytes);
  [[0, 30, 262], [32.5, 68.5, 330], [71, 99, 392], [101.5, 135.5, 494]].forEach(([s, e, hz], i) => {
    const f = path.join(tmp, `s${i}.mp3`); fs.writeFileSync(f, C.cutTrack(bytes, info, s, e, { TIT2: 'x' }).data);
    const got = freqOf(f, 3, 10); assert(Math.abs(got - hz) < 6, `song ${i}: ${got.toFixed(1)} Hz, wanted ${hz}`);
  });
});
t('cutting to the very end keeps the last frame', () => {
  const bytes = load('studio.mp3'), info = C.parseMp3(bytes), r = C.cutTrack(bytes, info, 100, info.totalDuration, { TIT2: 'x' });
  assert(Math.abs(r.actualEnd - info.totalDuration) < 1e-6);
});

console.log('zip');
t('zip passes unzip -t; UTF-8 names and bytes intact', () => {
  const files = [{ name: '01 Café.mp3', data: new Uint8Array([1, 2, 3, 4, 5]) }, { name: '02 テスト.mp3', data: new Uint8Array(70000).map((_, i) => i * 7) }];
  const z = path.join(tmp, 't.zip'); fs.writeFileSync(z, Buffer.concat(C.buildZip(files))); execFileSync('unzip', ['-tq', z]);
  const out = path.join(tmp, 'unz'); fs.mkdirSync(out); execFileSync('unzip', ['-qq', '-O', 'UTF-8', z, '-d', out]);
  const names = fs.readdirSync(out).sort(); assert.deepStrictEqual(names, ['01 Café.mp3', '02 テスト.mp3']);
  assert.deepStrictEqual(new Uint8Array(fs.readFileSync(path.join(out, names[1]))), files[1].data);
});
t('subfolder paths in entry names work', () => {
  const z = path.join(tmp, 'f.zip'); fs.writeFileSync(z, Buffer.concat(C.buildZip([{ name: 'Album/01 A.mp3', data: new Uint8Array([9, 9]) }])));
  assert(execFileSync('unzip', ['-Z1', z]).toString().trim() === 'Album/01 A.mp3');
});

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
