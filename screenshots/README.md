# Screenshots

Screenshots of the MP3 Chapter Splitter application for documentation.

## Generating Screenshots

To generate fresh screenshots:

```bash
# Option 1: Using the automated script (requires Playwright)
npx playwright install chromium
node capture_screenshots.js

# Option 2: Manual capture
# 1. Open mp3-chapter-splitter.html in your browser
# 2. (Light mode) Screenshot the interface with default theme
# 3. Click the theme toggle button
# 4. (Dark mode) Screenshot the interface with dark theme
# 5. Save as:
#    - 01-light-mode.png
#    - 02-dark-mode.png
```

## Screenshots Included

- **01-light-mode.png** — Application in light mode, showing file upload, waveform, and settings
- **02-dark-mode.png** — Same interface in dark mode

These are used in the MANUAL.md documentation and on the GitHub repository page.

## Manual Capture Tips

- Browser width: 1280px (typical desktop)
- Scroll to show the full interface including controls
- Use a clean test MP3 file (any 60+ second file works)
- Make sure the File System Access API permission is allowed (or use the ZIP fallback)

## Notes

- Screenshots are updated for each release
- They serve as documentation of UI/UX and should match the current HTML layout
- If you modify `app.html` significantly, please update the screenshots

---

Run `capture_screenshots.js` in a browser environment with Playwright installed to auto-generate current screenshots.
