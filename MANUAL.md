# MP3 Chapter Splitter — User Manual

## Introduction

The MP3 Chapter Splitter is a browser-based tool that takes a single MP3 file and splits it into multiple chapters. You can detect breaks automatically by analyzing the audio, or provide your own timestamps by pasting them from YouTube.

All processing happens in your browser—no files are uploaded anywhere.

## Getting Started

1. **Open the app** — Click `mp3-chapter-splitter.html` in your browser
2. **Load an MP3 file** — Click "Load MP3 File" and select your file
3. **Find breaks** — Choose auto-detection or manual timestamps (see below)
4. **Review chapters** — Edit titles and metadata in the table
5. **Export** — Click "Split & Download" to save chapters as a ZIP archive

## Setting Up Chapters

### Option 1: Automatic Detection

The app analyzes your audio to find natural chapter breaks.

1. Under **Auto-Detect**, adjust the sensitivity sliders:
   - **Quiet threshold** — How far below the average volume must it go to count as a break? Default is −38 dB. Increase (toward −20) to be stricter; decrease (toward −60) to catch quieter breaks.
   - **Min gap** — The shortest silence or applause burst to treat as a chapter break, in seconds. Default is 1.2 s.
   - **Detect applause** — Check this if your file is a live recording. The algorithm will look for applause patterns (lots of zero crossings) even when the volume is similar to the music.

2. Click **Detect Breaks** — the app analyzes the waveform and marks chapter boundaries in the table.

3. **Review and refine** — You can edit chapter titles now, or drag the numbered flags on the waveform to adjust break points.

**How it works:**
- The app measures audio volume (RMS), peak, and texture (zero-crossing rate) in 10 ms buckets.
- A silence or applause burst longer than the minimum gap becomes a candidate break.
- The break is placed just before the sound returns, so the next chapter gets a natural lead-in.

### Option 2: Paste Timestamps

Paste timestamps from YouTube, a blog, or any text format:

```
[00:00] Intro
[05:30] Verse One
[10:15] Chorus
[15:45] Bridge
```

Or YouTube's format with links (timestamps are extracted):
```
[00:00](https://...) Song One
[04:10](https://...) Song Two
```

1. Open the **Paste Timestamps** tab
2. Copy and paste your timestamps into the text area
3. Click **Parse Timestamps** — the table updates with chapter start times and titles

The parser recognizes formats like:
- `[mm:ss]` or `[h:mm:ss]`
- Text immediately after the timestamp becomes the chapter title
- Links in parentheses are ignored

### Option 3: Manual Entry

If you prefer, manually add or edit chapters in the table:
- Click on a chapter title to change it
- Use the **Auto-Detect** slider to adjust a single break point
- The **Start** / **End** buttons jump to the current chapter boundaries for review

## Editing Chapters

### Chapter Titles

Click on any title in the table to edit it. Titles are trimmed to 200 characters and special characters (like `/`, `\`, `:`) are removed to avoid filesystem issues.

### Metadata

Before exporting, optionally set:
- **Genre** — Music style or category (optional)
- **Artist** — Performer or speaker
- **Album** — Album or series title
- **Year** — Release or recording year

This metadata is embedded in each output MP3 file as ID3 tags, visible in music players.

## Previewing

The **Waveform** shows a visual representation of your audio volume over time.

- **Play** / **Pause** — Standard playback controls
- **Click on the waveform** — Jump to that time in the track
- **Numbered flags** — Mark each chapter boundary; drag to adjust or click to jump to that chapter
- **Transport buttons** — Navigate between chapters:
  - **Start** — Jump to the beginning of the current chapter
  - **End** — Jump to the end of the current chapter
  - **← Prev Break** — Move to the previous chapter
  - **Next Break →** — Move to the next chapter

The **Time Display** shows the current playback position and total file duration.

## Exporting

Once you're happy with your chapters:

1. Click **Split & Download** at the bottom
2. A ZIP file downloads containing one MP3 file per chapter
3. Each file is:
   - **Bit-for-bit identical to the original** MP3 data (no re-encoding)
   - **Named by chapter title** (special characters removed)
   - **Tagged with metadata** (artist, album, year, genre, track number, title)
   - **Valid MP3** with proper frame boundaries and VBR headers

The ZIP approach avoids browser download limitations. Extract the files on your computer, and import them into your media player or library.

## Theme

Click the **🌙 Dark** or **☀️ Light** button in the top-right to toggle dark mode. Your choice is saved in browser storage and will persist on future visits.

## Troubleshooting

### "Decode error" or "Failed to load file"
- Make sure the file is a valid MP3 (not corrupted, not another audio format disguised as .mp3)
- Try with a smaller file first to test

### Auto-detect finds too many (or too few) breaks
- **Too many:** Increase the **Quiet threshold** slider (toward −20) or raise **Min gap**
- **Too few:** Decrease **Quiet threshold** (toward −60) or lower **Min gap**
- **For live audio with applause:** Check the **Detect applause** box

### Chapter titles look wrong in the ZIP
- The app removes filesystem-unsafe characters. Long titles are trimmed to 200 characters.
- Rename the files after extracting if you need a different name

### Playback sounds glitchy
- This is usually a browser cache or codec issue. Try:
  - Refreshing the page (Ctrl+R or Cmd+R)
  - Clearing browser cache
  - Trying a different browser

## Advanced: How Automatic Detection Works

The algorithm uses **relative audio analysis**, which means it works the same way on a quiet acoustic recording and a loud rock concert.

1. **Envelope** — For every 10 milliseconds of audio, the app measures:
   - RMS (average volume in dB)
   - Zero-crossing rate (how often the waveform crosses from positive to negative)

2. **Relative threshold** — The 90th percentile of all RMS values sets the "music level." Silence is anything 38–40 dB quieter than that.

3. **Break candidates** — Any silence (or applause, if enabled) lasting longer than the minimum gap becomes a candidate.

4. **Smart placement** — The break is placed just before the sound returns, not in the middle of the silence. This gives the next chapter a natural lead-in of ~0.4 seconds.

5. **Applause detector** — Live recordings have applause between songs, not silence. Applause is "broadband noise"—it crosses zero very often. The detector looks for ZCR > 0.22, while music typically has ZCR < 0.02. This works even when applause and music have similar volumes.

### Measured on Real Audio

| Content | RMS | Zero-crossing rate |
|---------|-----|-----|
| Tonal music | −28.5 dB | 0.012–0.020 |
| Applause | −29.6 dB | 0.39–0.47 |

Notice the levels are nearly identical (1 dB apart), but the texture is strikingly different—a factor of twenty in ZCR. That's why the detector works.

## Performance

- **Decoding:** A 47-minute file decodes in about 1.5 seconds
- **Analysis:** Break detection runs on the same 1.5 seconds, with minimal memory overhead
- **Splitting:** Exporting 10 chapters takes ~0.5 seconds
- **Memory:** The app uses streaming decode, so even very long files stay memory-efficient

## Limits

- **File size:** Your browser's memory limit (usually 500 MB to 2 GB)
- **Chapter count:** Capped at 80 (to prevent accidental over-splitting)
- **Title length:** 200 characters per chapter

## Privacy

- **No uploads** — Your files never leave your computer
- **No tracking** — No analytics, ads, or cookies
- **Open source** — Code is available on GitHub; you can audit and self-host if desired
- **Browser storage only** — Theme preference is saved to browser storage (not sent anywhere)

## Getting Help

See the README for technical details, test coverage, and development info. For questions or issues, visit the GitHub repository:

https://github.com/dougalder/mp3-chapter-splitter

---

**Version:** 1.0  
**License:** MIT © 2024 Doug Alder
