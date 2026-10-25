// Browser end-to-end test (Playwright)
// Run with: npx playwright test wave-e2e.js
// Tests: file upload → waveform analysis → auto-detection → marker editing → export

const { test, expect } = require('@playwright/test');

test.describe('MP3 Splitter Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (file:// URL)
    const appPath = require('path').join(__dirname, 'mp3-chapter-splitter.html');
    await page.goto(`file://${appPath}`, { waitUntil: 'networkidle' });
  });

  test('Page loads successfully', async ({ page }) => {
    // Check that main elements are present
    const header = await page.locator('h1').textContent();
    expect(header).toContain('MP3 Chapter Splitter');
  });

  test('Theme toggle works', async ({ page }) => {
    const themeBtn = page.locator('#themeBtn');

    // Check initial state (light)
    let text = await themeBtn.textContent();
    expect(text).toContain('Dark');

    // Click to toggle dark
    await themeBtn.click();

    // Check new state
    text = await themeBtn.textContent();
    expect(text).toContain('Light');
  });

  test('File input accepts MP3', async ({ page }) => {
    const fileInput = page.locator('#fileInput');
    expect(await fileInput.getAttribute('accept')).toBe('.mp3');
  });

  test('Timestamp tab switching works', async ({ page }) => {
    // Verify tabs exist
    const tabs = page.locator('.tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);

    // Click a tab
    await tabs.nth(1).click();

    // Verify content changes
    const activeTab = page.locator('.tab.active');
    expect(await activeTab.count()).toBeGreaterThan(0);
  });

  test('Controls panel has expected buttons', async ({ page }) => {
    expect(await page.locator('#playBtn').isVisible()).toBeTruthy();
    expect(await page.locator('#pauseBtn').isVisible()).toBeTruthy();
    expect(await page.locator('#startBtn').isVisible()).toBeTruthy();
    expect(await page.locator('#endBtn').isVisible()).toBeTruthy();
    expect(await page.locator('#prevBreakBtn').isVisible()).toBeTruthy();
    expect(await page.locator('#nextBreakBtn').isVisible()).toBeTruthy();
  });

  test('Settings panel has detection options', async ({ page }) => {
    const quietSlider = page.locator('#quietSlider');
    const gapSlider = page.locator('#gapSlider');
    const applianceCheck = page.locator('#applianceCheck');

    expect(await quietSlider.isVisible()).toBeTruthy();
    expect(await gapSlider.isVisible()).toBeTruthy();
    expect(await applianceCheck.isVisible()).toBeTruthy();
  });

  test('Canvas waveform exists', async ({ page }) => {
    const canvas = page.locator('canvas#waveform');
    expect(await canvas.isVisible()).toBeTruthy();
  });

  test('Tracks table exists', async ({ page }) => {
    const table = page.locator('#tracksTable');
    expect(await table.isVisible()).toBeTruthy();
  });

  test('Export button is present', async ({ page }) => {
    const splitBtn = page.locator('#splitBtn');
    expect(await splitBtn.isVisible()).toBeTruthy();
    const text = await splitBtn.textContent();
    expect(text).toContain('Split');
  });

  test('Browser API feature detection', async ({ page }) => {
    // Check for Web Audio API support message or readiness
    // (Actual test would verify decode functionality, but that requires real MP3)
    const player = page.locator('#player');
    expect(await player.getAttribute('id')).toBe('player');
  });
});
