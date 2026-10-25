# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] – 2024-10-25

### Added

- **Core Features**
  - Frame-accurate lossless MP3 splitting (no re-encoding)
  - Automatic chapter break detection using audio analysis
  - Manual timestamp parsing (YouTube format and generic timestamps)
  - Real-time waveform visualization with interactive timeline
  - Chapter title editing and metadata tagging (artist, album, year, genre)
  - Audio preview with playback controls and timeline scrubbing
  - Export to ZIP archive containing separate MP3 files per chapter

- **Audio Analysis**
  - Relative thresholding for silence detection (works on quiet and loud masters)
  - Zero-crossing rate (ZCR) based applause detection for live recordings
  - Configurable detection sensitivity (quiet threshold, minimum gap)
  - 10 ms envelope buckets for efficient memory usage
  - Support for streams up to 47+ minutes with minimal memory footprint

- **MP3 Support**
  - MPEG-1/2/2.5 Layer III frame parsing and validation
  - ID3v2.3 tag writing (UTF-16, text frames: TIT2, TPE1, TALB, TYER, TCON, TRCK)
  - Xing/Info VBR header synthesis with 100-entry table of contents
  - CRC-32 checksums for ZIP integrity
  - Support for mono and stereo, all standard bitrates and sample rates

- **User Interface**
  - Dark mode with persistent theme preference
  - Tabbed interface for detection, timestamps, and metadata
  - Responsive canvas-based waveform with devicePixelRatio support
  - Numbered chapter flags on timeline (click to preview, drag to adjust)
  - Transport buttons (start, end, previous/next break)
  - Progress indicator for file analysis

- **Testing**
  - 55 unit tests (MP3 parsing, frame cutting, ZIP assembly, filename sanitizing)
  - 27 audio analysis tests (synthetic envelopes, silence, applause, edge cases)
  - End-to-end browser tests (Playwright, 90+ assertions)
  - Theme persistence and WCAG contrast ratio validation
  - Cross-bitrate and cross-channel test fixtures (CBR, VBR, mono)

- **Documentation**
  - User manual (MANUAL.md) with screenshots and troubleshooting
  - Developer README with architecture and testing instructions
  - Inline code comments and docstrings
  - Third-party notice and licensing information

### Technical Details

- Zero external dependencies (all code is original)
- Single-file distribution (mp3-chapter-splitter.html)
- Works in all modern browsers with Web Audio API, Canvas, and File System Access API
- MIT Licensed © 2024 Doug Alder

---

## Release Notes

**1.0.0** is the inaugural release, featuring a stable, well-tested implementation of MP3 chapter splitting with both automatic detection and manual timestamp parsing.

### Known Limitations

- Chapter count is capped at 80 to prevent accidental over-splitting
- Chapter titles are limited to 200 characters
- File size is subject to browser memory limits
- Frame-aligned cuts can land within ~26 ms of the exact timestamp (MPEG frame duration)

### Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 15+
- Edge 90+

(Must support Web Audio API, Canvas 2D, File System Access API)

---

For issues, feature requests, or contributions, visit:
https://github.com/dougalder/mp3-chapter-splitter
