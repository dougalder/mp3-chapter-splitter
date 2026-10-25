# Third-party notices

**The application uses no third-party code.** `mp3-chapter-splitter.html` is one self-contained file: no libraries,
no CDN scripts, no web fonts, no network requests. Everything in it is covered by this repository's [MIT licence](LICENSE).

This page records the formats and standards the app reads and writes, and what is known about their licensing.
It is a good-faith summary, **not legal advice**.

| Item | What the app does with it | Status |
|---|---|---|
| **MP3 (MPEG-1/2/2.5 Audio Layer III)** | Reads frame headers, copies audio frames unchanged, writes a Xing/Info header frame. Decoding for the waveform is done by your browser's built-in decoder. | Fraunhofer IIS announced that Technicolor's MP3 licensing programme was terminated on **23 April 2017**, and the format is widely reported to be free of active patent licensing since then ([report](https://gigazine.net/gsc_news/en/20170502-mp3-licensing-program-finished)). The app contains no encoder, and no code from LAME, mpg123 or ffmpeg. |
| **ID3v2.3 tags** | Writes text frames (TIT2, TALB, TPE1, TPE2, TYER, TCON, TRCK, TLEN) as UTF-16 with byte-order mark. Skips existing ID3v2/ID3v1 tags when reading. | The [specification document](https://id3.org/id3v2.3.0) is © Martin Nilsson 1998 and may be copied and used to assist implementation; this repository does not redistribute it. |
| **Xing / Info header** | Writes a frame carrying frame count, byte count and a 100-entry seek table so players show correct lengths for cut VBR audio. | A long-standing de-facto convention rather than a formal standard. Written from scratch; no LAME/Xing source is included. |
| **ZIP** | Writes a standard archive using the *stored* (uncompressed) method, UTF-8 filenames, DOS timestamps. | Format documented publicly in PKWARE's APPNOTE; no library used. |
| **CRC-32** | Checksum for ZIP entries. | The standard CRC-32 (IEEE 802.3) algorithm, implemented in `core.js`. |
| **Browser APIs** | Web Audio (`decodeAudioData`), Canvas 2D, File API, optional File System Access (`showDirectoryPicker`), `localStorage`. | Web standards built into the browser. |
| **Fonts** | `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` and `ui-monospace, Menlo`. | Fonts already on your device; none are bundled. |

## Development tools (not part of the shipped app)

| Tool | Used for | Licence |
|---|---|---|
| [Playwright](https://github.com/microsoft/playwright) | Driving headless Chromium for the browser tests and the manual's screenshots | Apache-2.0 |
| [FFmpeg](https://ffmpeg.org/) (`ffmpeg`, `ffprobe`) | Generating test audio and independently checking the output files in the tests. Invoked as a separate program; nothing from it is included. | LGPL-2.1+ / GPL-2+ depending on build |
| Chromium | Headless browser for tests | BSD-3-Clause and others |

## Your audio

The app never uploads your audio. The only things it stores, in your browser's `localStorage`, are the theme choice
(`mp3splitter.theme`) and any custom music styles you type (`mp3splitter.genres`).

You are responsible for having the right to copy and split any recording you process.
