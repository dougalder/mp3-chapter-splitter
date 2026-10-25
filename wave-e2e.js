#!/usr/bin/env node
// Real-browser end-to-end test: Playwright + headless Chromium driving the built single-file app.
// Run: node build.js && node wave-e2e.js     (set CHROMIUM_PATH to use a specific Chromium binary)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const FX = path.join(__dirname, 'fixtures'), APP = 'file://' + path.join(__dirname, 'mp3-chapter-splitter.html');
if (!fs.existsSync(path.join(FX, 'demo.mp3'))) execFileSync('python3', [path.join(__dirname, 'gen_fixtures.py')], { stdio: 'inherit' });
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (s) => s.split(':').map(Number).reduce((a, v) => a * 60 + v, 0);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const times = async () => (await page.locator('input[data-time]').evaluateAll((els) => els.map((e) => e.value))).map(secs);
  const titles = () => page.locator('input[data-title]').evaluateAll((els) => els.map((e) => e.value));
  const audioNow = () => page.evaluate(() => { const a = document.getElementById('preview'); return { paused: a.paused, t: a.currentTime }; });
  const ready = () => page.waitForFunction(() => !document.getElementById('btnRedetect').disabled && document.getElementById('waveBusy').classList.contains('hidden'), null, { timeout: 120000 });
  const load = async (name) => { await page.setInputFiles('#file', path.join(FX, name));
    await page.waitForFunction(() => document.getElementById('btnRedetect').disabled, null, { timeout: 10000 }).catch(() => {});   // the new load has started
    await ready(); };
  const setRange = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, String(v)]);
  const flagXY = async (i) => { const t = (await times())[i], b = await page.locator('#wave').boundingBox(), dur = await page.evaluate(() => document.getElementById('preview').duration);
    return { x: b.x + t / dur * b.width + 8, y: b.y + 20 + 7 }; };

  console.log('startup');
  await page.goto(APP);
  ok('page title', (await page.title()) === 'MP3 Chapter Splitter');
  ok('split button disabled before a file is loaded', await page.locator('#btnZip').isDisabled());
  ok('exactly one theme button', (await page.locator('#themeBtn').count()) === 1);

  console.log('load + detect (studio.mp3)');
  await page.setInputFiles('#file', path.join(FX, 'studio.mp3'));
  const sawBar = await page.waitForFunction(() => !document.getElementById('waveBusy').classList.contains('hidden'), null, { timeout: 8000 }).then(() => true, () => false);
  ok('progress overlay shown while the audio is read', sawBar);
  await ready();
  ok('progress overlay hidden when done', await page.locator('#waveBusy').evaluate((e) => e.classList.contains('hidden')));
  ok('workspace visible', await page.locator('#waveCard').isVisible());
  await setRange('sMin', 10); await page.click('#btnRedetect');
  let tm = await times();
  ok('4 tracks at the 3 silences', tm.length === 4 && [0, 32.1, 70.6, 101.1].every((w, i) => near(tm[i], w, 0.7)), JSON.stringify(tm));
  const distinct = await page.evaluate(() => { const c = document.getElementById('wave'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return s.size; });
  ok('waveform canvas is painted', distinct > 6, distinct);
  ok('titles blank with Track N placeholders', (await titles()).every((t) => t === '') && (await page.locator('input[data-title]').first().getAttribute('placeholder')) === 'Track 1');

  console.log('interaction');
  let f = await flagXY(1); await page.mouse.click(f.x, f.y); await sleep(900);
  let a = await audioNow();
  ok('tapping flag 2 plays from that marker', !a.paused && a.t > tm[1] + 0.3 && a.t < tm[1] + 3, JSON.stringify(a));
  await page.click('#btnPlay'); await sleep(200);
  ok('Play button pauses', (await audioNow()).paused);
  f = await flagXY(2); const before = (await times())[2];
  await page.mouse.move(f.x, f.y); await page.mouse.down(); await page.mouse.move(f.x + 40, f.y, { steps: 6 }); await page.mouse.up(); await sleep(150);
  const after = (await times())[2];
  ok('dragging a flag moves the marker and does not start playback', after > before + 1 && (await audioNow()).paused, `${before} -> ${after}`);
  const wb = await page.locator('#wave').boundingBox();
  await page.mouse.dblclick(wb.x + 30, wb.y + 90);
  ok('double-click adds a break', (await times()).length === 5);
  await page.locator('button[data-remove="1"]').click();
  ok('x removes a break', (await times()).length === 4);
  const hh = (id) => page.locator('#' + id).evaluate((e) => e.getBoundingClientRect().height);
  ok('transport buttons are larger than the small tools', (await hh('btnNext')) > (await hh('btnMark')) + 4, `${await hh('btnNext')} vs ${await hh('btnMark')}`);
  const [pp, ps, pe] = [await page.locator('#btnPlay').boundingBox(), await page.locator('#btnStart').boundingBox(), await page.locator('#btnEnd').boundingBox()];
  ok('start/prev/next/end sit on the same row as Play', Math.abs(pp.y - ps.y) < 6 && Math.abs(pp.y - pe.y) < 6);
  const mk = await times();
  await page.click('#btnStart'); ok('Start goes to 0:00', near((await audioNow()).t, 0, 0.1));
  await page.click('#btnNext'); ok('Next break -> break 2', near((await audioNow()).t, mk[1], 0.1), (await audioNow()).t);
  await page.click('#btnNext'); ok('Next break again -> break 3', near((await audioNow()).t, mk[2], 0.1), (await audioNow()).t);
  await page.click('#btnPrev'); ok('Previous break -> break 2', near((await audioNow()).t, mk[1], 0.1), (await audioNow()).t);
  await page.click('#btnEnd'); const dur = await page.evaluate(() => document.getElementById('preview').duration); ok('End goes to the end', near((await audioNow()).t, dur, 0.5), (await audioNow()).t);
  await page.click('#btnZoomIn'); await page.click('#btnZoomIn');
  ok('overview strip appears when zoomed in', await page.locator('#miniWrap').isVisible());
  await page.click('#btnFit'); ok('Fit hides the overview strip again', !(await page.locator('#miniWrap').isVisible()));

  console.log('pasted timestamps, tags, style list, split');
  await page.click('[data-mode="paste"]');
  ok('paste panel replaces the detect panel', await page.locator('#panelPaste').isVisible() && !(await page.locator('#panelDetect').isVisible()));
  await page.fill('#ts', '[00:00](https://www.youtube.com/watch?v=x) Springtime in Vienna [00:32](https://x.test/?t=32s) The Luxury [01:11](https://x.test/?t=71s) Don\'t Wake Daddy: Part/1 [01:41](https://x.test/?t=101s) Ahead By A Century');
  await sleep(300); tm = await times(); const tt = await titles();
  ok('pasted list becomes the track list with titles', tm.length === 4 && tt[2] === "Don't Wake Daddy: Part/1" && tm[3] === 101, JSON.stringify([tm, tt]));
  await page.click('[data-tab="tags"]'); ok('tags tab shown, find tab hidden', await page.locator('#tabTags').isVisible() && !(await page.locator('#tabFind').isVisible()));
  await page.fill('#artist', 'The Tragically Hip'); await page.fill('#album', 'Trouble at the Henhouse'); await page.fill('#year', '1996');
  await page.click('#genreBtn'); const nOpts = await page.locator('#genrePop [data-pick]').count();
  ok('style popup is pre-populated with common styles', nOpts >= 20, nOpts);
  await page.locator('#genrePop [data-pick="Rock"]').click();
  ok('picking a style fills the field', (await page.inputValue('#genre')) === 'Rock');
  await page.fill('#genre', 'Canadian Rock'); await page.locator('#genre').blur();
  ok('a custom style can be typed', (await page.inputValue('#genre')) === 'Canadian Rock');
  ok('filename preview follows the settings', /^01 Springtime in Vienna\.mp3$/.test((await page.textContent('#namePreview')).trim()), await page.textContent('#namePreview'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#btnZip')]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-')), zipPath = path.join(out, 'o.zip'); await dl.saveAs(zipPath);
  console.log('       downloaded as: ' + dl.suggestedFilename());
  execFileSync('unzip', ['-tq', zipPath]); const ex = path.join(out, 'x'); fs.mkdirSync(ex); execFileSync('unzip', ['-qq', '-O', 'UTF-8', zipPath, '-d', ex]);
  const names = fs.readdirSync(ex).sort(); console.log('       files: ' + JSON.stringify(names));
  ok('4 numbered files with filename-safe titles', names.length === 4 && names[0] === '01 Springtime in Vienna.mp3' && names[2] === "03 Don't Wake Daddy- Part-1.mp3", JSON.stringify(names));
  const hz = [262, 330, 392, 494], wantDur = [32, 39, 30, 34.5];
  names.forEach((n, i) => {
    const file = path.join(ex, n), p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', file]).toString()).format;
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '4', '-t', '8', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 }), sm = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
    let z = 0; for (let k = 1; k < sm.length; k++) if ((sm[k] >= 0) !== (sm[k - 1] >= 0)) z++;
    const f0 = z / 2 / (sm.length / 8000), dec = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const tg = p.tags || {};
    ok(`track ${i + 1}: ${hz[i]} Hz song, ${wantDur[i]} s, tags, clean decode`, near(f0, hz[i], 6) && near(parseFloat(p.duration), wantDur[i], 0.35) && tg.artist === 'The Tragically Hip' && tg.album === 'Trouble at the Henhouse' && tg.genre === 'Canadian Rock' && /^\d+(\/4)?$/.test(tg.track || '') && String(tg.track).split('/')[0] == i + 1 && dec === '',
      `${f0.toFixed(0)}Hz ${p.duration}s ${JSON.stringify(tg)} ${dec}`);
  });

  console.log('a new file clears the old labels');
  await load('live.mp3');
  const vals = await Promise.all(['#ts', '#album', '#artist', '#year', '#genre'].map((id) => page.inputValue(id)));
  ok('nothing typed for the previous file survives (album is re-suggested from the new file name)', vals[0] === '' && vals[2] === '' && vals[3] === '' && vals[4] === '' && (vals[1] === '' || vals[1] === 'live'), JSON.stringify(vals));
  ok('old titles gone', (await titles()).every((t) => t === ''), JSON.stringify(await titles()));
  ok('clock shows the new length (2:19), not the old file\'s', /2:19/.test(await page.textContent('#clock')), await page.textContent('#clock'));
  await page.click('[data-tab="find"]'); await page.click('[data-mode="detect"]'); await setRange('sMin', 10);
  await page.click('#btnRedetect'); ok('crowd noise is not a break in plain silence mode', (await page.locator('input[data-time]').count()) === 1, await page.locator('input[data-time]').count());
  await page.check('#optApplause'); await page.click('#btnRedetect'); tm = await times();
  ok('live mode finds the two crowd breaks', tm.length === 3 && near(tm[1], 46.6, 0.8) && near(tm[2], 98.6, 0.8), JSON.stringify(tm));

  console.log('mono / 22.05 kHz, and a 21-minute file');
  await load('mono22.mp3'); ok('mono 22.05 kHz file loads', /0:42/.test(await page.textContent('#clock')), await page.textContent('#clock'));
  const t0 = Date.now(); await load('demo.mp3'); const took = (Date.now() - t0) / 1000;
  tm = await times(); const want = [0, 214.6, 404.6, 661.6, 832.6, 1066.6];
  ok(`21-minute file analysed in ${took.toFixed(1)} s`, took < 90 && /21:03/.test(await page.textContent('#clock')), await page.textContent('#clock'));
  ok('defaults find all 6 songs, each within 1 s of the real gap (time stays aligned over 21 minutes)', tm.length === 6 && tm.every((v, i) => near(v, want[i], 1.0)), JSON.stringify(tm));

  console.log('theme');
  const l1 = (await page.textContent('#themeBtn')).trim(); await page.click('#themeBtn'); const l2 = (await page.textContent('#themeBtn')).trim();
  const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok('one button toggles the theme and flips its label', l1 !== l2 && /dark|light/.test(attr), `${l1} -> ${l2}, ${attr}`);
  await page.reload(); ok('theme persists across a reload', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === attr);
  ok('no console or page errors during the run', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
