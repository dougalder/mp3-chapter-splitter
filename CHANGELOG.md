# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning: [SemVer](https://semver.org/).

## [1.0.0] - 2026-10-25

First public release.

### Splitting
- Lossless, frame-accurate cuts: audio frames are copied bit-for-bit, each cut lands within one MPEG frame (about 26 ms) of its marker.
- MPEG-1/2/2.5 Layer III, mono and stereo, CBR and VBR. Leading ID3v2 and trailing ID3v1 tags are skipped; an existing Xing/Info frame is recognised.
- Each track gets ID3v2.3 tags (title, album, artist, album artist, year, style, track n/N, length) and a fresh Xing/Info header so lengths and seeking are right.
- Output as a ZIP (UTF-8 filenames) or, in browsers that support it, straight into a chosen folder. Optional album subfolder; numbered filenames; ID3 and VBR-header writing can be switched off.

### Finding the tracks
- Detect from the audio: a loudness envelope is built in about 20-second chunks (flat memory, long recordings are fine) and quiet gaps are found relative to the music level, so quiet transfers and loud masters behave alike.
- Live recordings: applause is recognised by its texture (zero-crossing rate), not its level.
- Paste timestamps: YouTube descriptions (`[00:00](url) Title`), plain lists, "Title 0:00" layouts, with a time-shift for differing lead-in.
- Sliders for silence threshold, shortest gap and shortest track; detected gaps can be shaded on the waveform.

### Working on the tracks
- Waveform with numbered, tappable play flags; click anywhere to listen; drag markers; double-click to add; zoom with an overview strip.
- Transport buttons next to Play: start, previous break, next break, end. Keyboard shortcuts for all of it.
- Progress bar while the audio is read. Fields are cleared when a new file is loaded.
- Editable start times and titles in the track table. Style picker with common styles; your own styles are remembered.
- Light/dark theme with a single toggle button; the choice is remembered.

### Quality
- Test suites: engine (27 checks, verified against `ffprobe`/`ffmpeg`), detection (11), and a real-browser end-to-end run (46 checks) including a 21-minute file.
