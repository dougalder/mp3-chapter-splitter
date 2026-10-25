# Contributing to MP3 Chapter Splitter

Thank you for your interest in contributing! This document outlines guidelines for reporting issues, suggesting features, and submitting pull requests.

## Code of Conduct

Be respectful and constructive. Harassment, discrimination, and bad-faith argumentation are not welcome.

## Reporting Issues

### Before You Report

- Check the [manual](MANUAL.md) for troubleshooting steps
- Search existing GitHub issues to avoid duplicates
- Try the latest version in the main branch

### When Reporting

Provide:
1. **Browser and OS** — e.g., Chrome 120 on macOS 14.2
2. **File details** — MP3 bitrate, sample rate, duration, link if possible
3. **Expected behavior** — What should have happened?
4. **Actual behavior** — What happened instead?
5. **Steps to reproduce** — Can you reliably trigger the issue?
6. **Error message** — Full error text, if any

### Example

```
Browser: Firefox 121 on Ubuntu 22.04
File: 320 kbps stereo, 44100 Hz, 2h 15m podcast MP3

Issue: Auto-detect stops responding after ~30 minutes of analysis.
Expected: Detection completes and shows breaks.
Actual: Page becomes unresponsive; browser tab uses 100% CPU.

Steps:
1. Load a 2h+ MP3 file
2. Open Auto-Detect tab
3. Adjust Min gap to 0.5 sec
4. Click "Detect Breaks"
5. Page freezes after ~30 sec
```

## Suggesting Features

1. **Check existing requests** — Search issues to see if someone already suggested it
2. **Describe the use case** — Why would this feature be useful?
3. **Provide examples** — How would a user interact with it?
4. **Consider scope** — Does this fit the tool's purpose (splitting MP3s)?

### Example

```
Feature: Batch processing (import multiple files and split them all at once)

Use case: I have 50 podcast episodes to split into chapters. Doing them one
at a time is tedious.

Expected UI:
- "Load multiple files" input instead of single file picker
- Queue showing all files and their detection status
- Export all as separate ZIP archives or a single combined folder

Alternative: A command-line tool wrapping the core MP3 module?
```

## Development Setup

```bash
# Clone the repository
git clone https://github.com/dougalder/mp3-chapter-splitter
cd mp3-chapter-splitter

# Install dependencies
npm install

# Build the app
node build.js

# Run tests
npm test

# Run browser tests (requires Playwright)
npx playwright install
npm run test:browser
```

## Making Changes

### Code Style

- Use **ES2020+ features** (const/let, arrow functions, template literals, destructuring)
- Keep functions focused and readable (<50 lines typical)
- Use meaningful variable names (`sampleRate`, not `sr`)
- Add comments for non-obvious logic
- No semicolon requirement (consistent with existing code style)

### Testing

1. **Add or update tests** for any behavior change
2. **Run full test suite** before submitting (`npm test && npm run test:browser`)
3. **Test manually** in multiple browsers if UI changes
4. **Verify backwards compatibility** — existing MP3s should split the same way

### Commits

- **One logical change per commit** — not one commit per file
- **Write clear messages** — "Fix applause detection for quiet crowds" not "Fix bug"
- **Reference issues** — "Closes #42" or "Fixes #99"

Example:

```
Fix applause detection missing loud live recordings

Zero-crossing rate threshold was too aggressive for applause mixed with music.
Adjusted ZCR gate and added regression test for loud crowds (rms -12.3 dB,
zcr 0.39). Closes #87.
```

### Submitting a Pull Request

1. **Fork the repository** and create a feature branch (`git checkout -b fix/applause-detection`)
2. **Make your changes** with commit messages as above
3. **Ensure tests pass** (`npm test`)
4. **Run manual tests** in your browser
5. **Push to your fork** (`git push origin fix/applause-detection`)
6. **Open a PR** with:
   - Clear title ("Fix: applause detection for quiet crowds")
   - Description of the change and motivation
   - Reference to any related issues
   - Checklist of your testing

### PR Review Process

- A maintainer will review within a week
- Feedback will be constructive; iterate as needed
- Once approved, your PR will be merged to `main`
- You'll be credited in the next release

## Project Structure

```
.
├── core.js              # MP3 parsing, cutting, tagging, ZIP
├── analysis.js          # Audio envelope, break detection
├── app.html             # UI (template, markers for core.js/analysis.js)
├── build.js             # Builds mp3-chapter-splitter.html from above
├── test.js              # Unit tests (Node.js)
├── e2e.js               # End-to-end unit test (Node.js)
├── analysis-test.js     # Audio analysis unit tests
├── theme-test.js        # Theme persistence tests
├── wave-e2e.js          # Browser UI tests (Playwright)
├── gen_fixtures.py      # Generate test MP3 files
└── fixtures/            # Test MP3s
```

## Key Algorithms

### MP3 Parsing

Frame headers encode bitrate, sample rate, and frame size. The parser validates sync word (0xFFE) and uses lookup tables for bitrate and sample rate. See `parseHeader()` and `frameIndexAt()` in core.js.

### Break Detection

1. **Envelope** — RMS (dBFS), peak, ZCR in 10 ms buckets
2. **Relative threshold** — 90th percentile of RMS sets music level; silence is ~40 dB below
3. **Applause** — ZCR > 0.22 + RMS near reference level
4. **Placement** — Break placed at gap-end minus lead-in (~0.4 s)

See `buildEnvelope()` and `detectBreaks()` in analysis.js, and the detailed explanation in `claude/how-track-detection-works.md` in the project.

## Questions?

Open an issue with the label `question` or email the maintainer.

---

Thank you for contributing! Your help makes this tool better for everyone.
