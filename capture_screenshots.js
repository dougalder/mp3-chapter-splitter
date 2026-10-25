#!/usr/bin/env node
// Captures the manual's screenshots with headless Chromium, using generated demo audio (no real music).
// Run: node build.js && node capture_screenshots.js     (set CHROMIUM_PATH to use a specific Chromium)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const FX = path.join(__dirname, 'fixtures'), OUT = path.join(__dirname, 'docs', 'images');
const APP = 'file://' + path.join(__dirname, 'mp3-chapter-splitter.html');
if (!fs.existsSync(path.join(FX, 'demo.mp3'))) execFileSync('python3', [path.join(__dirname, 'gen_fixtures.py')], { stdio: 'inherit' });
fs.mkdirSync(OUT, { recursive: true });
const TITLES = ['Morning Light', 'Harbour Lights', 'Slow River', 'The Long Way Home', 'Paper Boats', 'Last Train'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  const shot = async (name, target) => { const p = path.join(OUT, name + '.png'); await (target || page).screenshot(Object.assign({ path: p }, target ? {} : { fullPage: true })); console.log('wrote docs/images/' + name + '.png'); };
  const card = (sel) => page.locator(sel).locator('xpath=ancestor-or-self::div[contains(@class,"card")][1]');
  const ready = () => page.waitForFunction(() => !document.getElementById('btnRedetect').disabled && document.getElementById('waveBusy').classList.contains('hidden'), null, { timeout: 120000 });
  const setRange = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, String(v)]);

  const pausePlayback = async () => { if (!(await page.evaluate(() => document.getElementById('preview').paused))) { await page.click('#btnPlay'); await sleep(250); } };
  await page.goto(APP);
  await shot('01-start');                                   // empty app

  // --- progress bar, caught mid-analysis
  await page.setInputFiles('#file', path.join(FX, 'demo.mp3'));
  await page.waitForFunction(() => { const t = document.getElementById('busyPct').textContent; const n = parseInt(t, 10); return n >= 35 && n <= 85; }, null, { timeout: 30000, polling: 20 });
  await shot('02-progress', page.locator('#waveCard'));
  await ready();

  // --- name the tracks, fill the tags
  for (let i = 0; i < TITLES.length; i++) await page.fill(`input[data-title="${i}"]`, TITLES[i]);
  await page.click('[data-tab="tags"]');
  await page.fill('#artist', 'Example Band'); await page.fill('#album', 'Demo Sessions'); await page.fill('#year', '2024');
  await page.click('#genreBtn'); await page.locator('#genrePop [data-pick="Indie Rock"]').click();
  await page.click('[data-tab="find"]');
  // park the playhead mid-way through track 3
  const wb = await page.locator('#wave').boundingBox();
  await page.mouse.click(wb.x + wb.width * (500 / 1263), wb.y + 70); await sleep(300); await pausePlayback();
  await page.mouse.move(5, 5);
  await shot('03-overview-light');

  // --- zoomed view of one track, with the overview strip
  await page.click('td[data-focus="2"]'); await sleep(300); await page.mouse.move(5, 5);
  await shot('04-zoomed-track', page.locator('#waveCard'));
  await page.click('#btnFit');

  // --- find-breaks panel, paste panel, tags panel with the style list open
  await page.mouse.move(5, 5);
  await shot('05-find-breaks', card('#tabFind'));
  await page.click('[data-mode="paste"]');
  await page.fill('#ts', '[00:00](https://www.youtube.com/watch?v=abc123) Morning Light\n[03:34](https://www.youtube.com/watch?v=abc123&t=214s) Harbour Lights\n[06:44](https://www.youtube.com/watch?v=abc123&t=404s) Slow River\n[11:01](https://www.youtube.com/watch?v=abc123&t=661s) The Long Way Home\n[13:52](https://www.youtube.com/watch?v=abc123&t=832s) Paper Boats\n[17:46](https://www.youtube.com/watch?v=abc123&t=1066s) Last Train');
  await sleep(300); await page.evaluate(() => { document.getElementById('ts').scrollTop = 0; document.getElementById('ts').blur(); }); await page.mouse.move(5, 5);
  await shot('06-paste-timestamps', card('#tabFind'));
  await page.click('[data-mode="detect"]'); await page.click('[data-tab="tags"]');
  await page.fill('#genre', ''); await sleep(150);
  if (await page.locator('#genrePop').evaluate((e) => e.classList.contains('hidden'))) await page.click('#genreBtn');
  await sleep(200);   // empty field -> the whole list shows
  { const b = await card('#tabTags').boundingBox();   // taller than the card so the open list is not clipped
    await page.screenshot({ path: path.join(OUT, '07-tags-and-styles.png'), fullPage: true, clip: { x: b.x, y: b.y, width: b.width, height: b.height + 290 } }); console.log('wrote docs/images/07-tags-and-styles.png'); }
  await page.keyboard.press('Escape'); await page.fill('#genre', 'Indie Rock'); await page.mouse.click(5, 5);

  // --- split and show the results
  await page.click('[data-tab="find"]'); await page.click('[data-mode="detect"]');   // back to the detect view
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btnZip')]);
  await dl.path(); await sleep(500); await page.mouse.move(5, 5);
  await shot('08-split-results', card('#btnZip'));

  // --- live-recording mode with applause shaded
  await page.setInputFiles('#file', path.join(FX, 'live.mp3'));
  await page.waitForFunction(() => document.getElementById('btnRedetect').disabled, null, { timeout: 10000 }).catch(() => {});
  await ready(); await setRange('sMin', 10); await page.check('#optApplause'); await page.click('#btnRedetect'); await sleep(400); await page.mouse.move(5, 5);
  await shot('09-live-recording', page.locator('#waveCard'));

  // --- dark theme, full page (back to the demo)
  await page.setInputFiles('#file', path.join(FX, 'demo.mp3'));
  await page.waitForFunction(() => document.getElementById('btnRedetect').disabled, null, { timeout: 10000 }).catch(() => {});
  await ready();
  for (let i = 0; i < TITLES.length; i++) await page.fill(`input[data-title="${i}"]`, TITLES[i]);
  await page.click('[data-tab="tags"]'); await page.fill('#artist', 'Example Band'); await page.fill('#album', 'Demo Sessions'); await page.fill('#year', '2024'); await page.fill("#genre", "Indie Rock"); await page.click('[data-tab="find"]');
  await page.mouse.click(wb.x + wb.width * (500 / 1263), wb.y + 70); await sleep(300); await pausePlayback();
  await page.click('#themeBtn'); await sleep(400); await page.mouse.move(5, 5);
  await shot('10-overview-dark');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
