#!/usr/bin/env node
/**
 * Capture screenshots of the app for documentation
 * Runs in headless Chromium via Playwright
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = 'screenshots';
const APP_FILE = path.join(__dirname, 'mp3-chapter-splitter.html');
const APP_URL = `file://${APP_FILE}`;

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.createBrowserContext({
    viewport: { width: 1280, height: 1500 },
  });
  const page = await context.newPage();

  // Create screenshots directory
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

  try {
    console.log(`Loading ${APP_URL}`);
    await page.goto(APP_URL, { waitUntil: 'networkidle' });

    // Light mode (default)
    console.log('Capturing light mode...');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-light-mode.png'), fullPage: true });

    // Dark mode
    console.log('Capturing dark mode...');
    await page.click('#themeBtn');
    await page.waitForTimeout(300); // Allow theme transition
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-dark-mode.png'), fullPage: true });

    console.log(`Screenshots saved to ${SCREENSHOTS_DIR}/`);
  } catch (error) {
    console.error('Screenshot capture failed:', error);
  } finally {
    await context.close();
    await browser.close();
  }
}

captureScreenshots();
