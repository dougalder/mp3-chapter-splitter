# MP3 Chapter Splitter

A browser-based tool for splitting MP3 files into chapters, with automatic silence/break detection or manual timestamp parsing.

**Live Demo:** Open `index.html` in your browser and then click through to `mp3-chapter-splitter.html`.

## Features

- **Automatic detection** — analyzes audio to find chapter breaks by detecting silence, applause, and dynamic shifts
- **Manual timestamps** — paste YouTube links with timestamps or enter breaks manually
- **Lossless splitting** — cuts on MP3 frame boundaries; no re-encoding or quality loss
- **Frame-accurate** — breaks land within ~26 ms of the target time
- **Metadata** — set artist, album, year, genre, and chapter titles
- **Playback preview** — scrub through the audio and hear chapters in real time
- **Export to ZIP** — download all chapters as separate MP3 files
- **Dark mode** — theme persists in browser storage
- **No upload** — all processing happens in your browser; nothing is sent to a server

## Architecture

### Core Components

- **`core.js`** — MP3 parsing (frame headers, ID3v2 tags, Xing/VBR headers), frame-boundary cutting, CRC-32, and ZIP assembly
- **`analysis.js`** — Audio envelope analysis (RMS, peak, zero-crossing rate in 10 ms buckets), relative thresholding, and break detection
- **`app.html`** — Web UI (waveform canvas, timeline, controls, settings)

All compiled into a single `mp3-chapter-splitter.html` file for easy distribution.

### MP3 Parsing

The parser reads MPEG-1/2/2.5 Layer III frame headers and builds a frame index. Cuts are aligned to frame boundaries—no mid-frame cuts. This means output audio is bit-for-bit identical to the input (after re-encoding ID3 tags).

#### ID3v2.3 Tagging

Text frames (TIT2, TPE1, TALB, TYER, TCON, TRCK) are written in UTF-16 with BOM. A fresh Xing/Info VBR header is synthesized for each output, with a 100-entry table of contents (TOC) and accurate frame count.

### Audio Analysis

1. **Envelope building** — The file is decoded in ~20-second chunks; each chunk is reduced to 10 ms buckets of RMS (dBFS), peak, and zero-crossing rate (ZCR).
2. **Relative thresholding** — The 90th percentile of RMS sets a "music level" baseline. Anything more than ~40 dB below it counts as silence. This works the same for quiet transfers and loud masters.
3. **Break placement** — A silence longer than the minimum gap becomes a candidate. The break is placed just before the sound returns, so the next chapter gets a short lead-in.
4. **Applause detection** — Live recordings don't go silent between songs. Applause is identified by texture: it crosses zero far more often than music (ZCR 0.39–0.47 vs. music 0.012–0.020). A simple threshold (ZCR > 0.22) catches it.

## Testing

Run the test suite:

```bash
npm test
```

Tests cover:
- MP3 frame parsing (sync, bitrate, sample rate, padding, frame size)
- ID3 and Xing header generation
- Frame-boundary cutting and ZIP assembly
- Audio analysis (synthetic envelopes, silence, applause, mid-song pauses)
- Browser UI (theme toggle, timestamp parsing, auto-detection, marker drag/add)
- End-to-end workflow (file load → detect → edit → split → verify)

## Building from Source

```bash
node build.js
```

This inlines `core.js` and `analysis.js` into `app.html` and produces `mp3-chapter-splitter.html`.

## Licensing

### Application

MIT License © 2024 Doug Alder

See LICENSE file.

### Technology

The app uses:
- **Web Audio API** — standard browser API (W3C spec)
- **File System Access API** — standard browser API
- **Canvas 2D** — standard browser API
- **No third-party libraries** — all code is original

The app reads and writes MP3 data (MPEG-1/2/2.5 Layer III), a patented format. The MPEG patents expired in 2017 (Fraunhofer/Technicolor terminated licensing). The ID3 tag format is open (unsupported but not encumbered). ZIP and CRC-32 are public domain.

## Development

### File Structure

```
.
├── index.html                    # Landing page
├── mp3-chapter-splitter.html     # Built application (single file)
├── app.html                      # UI source template
├── core.js                       # MP3 parsing & cutting
├── analysis.js                   # Audio analysis
├── build.js                      # Build script
├── test.js                       # Unit tests (node)
├── e2e.js                        # End-to-end workflow
├── analysis-test.js              # Audio detection tests
├── theme-test.js                 # Theme persistence
├── wave-e2e.js                   # Browser UI tests (Playwright)
├── gen_fixtures.py               # Test MP3 fixture generator
├── fixtures/                     # Test MP3 files
├── README.md                     # This file
├── MANUAL.md                     # User guide
├── CHANGELOG.md                  # Release history
├── CONTRIBUTING.md               # Development guide
└── LICENSE                       # MIT license
```

### Running Browser Tests

Tests run in headless Chromium via Playwright:

```bash
npm install
npx playwright install
npm run test:browser
```

## Contributing

See CONTRIBUTING.md for guidelines on reporting issues, proposing features, and submitting pull requests.

## Changelog

See CHANGELOG.md for version history.

---

Questions? Open an issue on GitHub: https://github.com/dougalder/mp3-chapter-splitter
