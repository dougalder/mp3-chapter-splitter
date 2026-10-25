# Third-Party Notices

## Application Code

The MP3 Chapter Splitter application contains **no third-party dependencies**. All code is original.

## Standards and Formats

The application works with the following open standards and formats:

### MPEG Audio (MP3)

- **Format:** MPEG-1/2/2.5 Layer III
- **Status:** Patent protection expired (Technicolor/Fraunhofer terminated licensing April 2017)
- **Links:** https://www.iso.org/standard/10180.html

The app reads and writes MP3 frame data. It does not use any MPEG-LA licensed code; all frame parsing and synthesis is original.

### ID3 Tag Format

- **Specification:** ID3v2.3
- **Status:** Freely usable (not patented, not encumbered)
- **Links:** https://id3.org/id3v2.3.0

The app writes text frames (TIT2, TPE1, TALB, TYER, TCON, TRCK) in UTF-16 with byte-order mark (BOM).

### Xing/Info VBR Header

- **Status:** Format documentation is public; no licensing required
- **Links:** https://www.vorbis.com/documents/Vorbis_I_spec.html (related spec)

The app synthesizes Xing VBR headers for proper playback position estimation, including 100-entry table of contents (TOC).

### ZIP Archive Format

- **Specification:** PKWARE APPNOTE.TXT (version 6.3.3 and earlier)
- **Status:** Freely documented and implemented
- **Links:** https://pkware.cached.com/webdocs/casestudies/APPNOTE.TXT

The app assembles ZIP archives per the APPNOTE specification, using the DEFLATE store method (no compression) for simplicity.

### CRC-32 Checksum

- **Algorithm:** CRC-32 (Ethernet polynomial)
- **Status:** Public domain (unpatented, widely documented)
- **Links:** https://en.wikipedia.org/wiki/Cyclic_redundancy_check

Used to validate ZIP file integrity.

### Web Audio API

- **Status:** W3C standard, built into all modern browsers
- **Links:** https://www.w3.org/TR/webaudio/

Used for MP3 decoding in the browser.

### File System Access API

- **Status:** WHATWG Living Standard (partial; some features still in development)
- **Links:** https://wicg.github.io/file-system-access/

Used to access the user's filesystem for saving and loading files.

### Canvas 2D

- **Status:** W3C standard, built into all modern browsers
- **Links:** https://html.spec.whatwg.org/multipage/canvas.html

Used for waveform visualization.

## Development Dependencies

### Testing

- **Playwright** — MIT License (https://github.com/microsoft/playwright)
  - Used for browser automation in test suite
  - Not included in the distributed application

## Fonts

The application uses the system font stack:
```css
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

No custom fonts or Google Fonts are loaded.

## Licenses Summary

| Component | Status | License |
|-----------|--------|---------|
| Application code | Original | MIT |
| Test suite (Playwright) | Development only | MIT |
| MP3 format | Patent expired | (Technicolor/Fraunhofer) |
| ID3 tags | Open standard | (Public/unencumbered) |
| ZIP format | Open standard | (Public/PKWARE APPNOTE) |
| CRC-32 | Algorithm | Public domain |
| Web APIs | Browser standard | W3C / WHATWG |

## Compliance

✓ No GPL, LGPL, or copyleft licenses in the distributed application
✓ No proprietary code
✓ All dependencies (if any) are clearly listed and licensed

---

For questions about licensing or third-party compliance, see README.md or open an issue on GitHub.
