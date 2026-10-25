# Contributing

Bug reports and pull requests are welcome.

## Layout

| File | Role |
|---|---|
| `core.js` | MP3 parsing, cutting, ID3, Xing header, timestamp parsing, ZIP. No dependencies; runs in browsers and Node. |
| `analysis.js` | Loudness envelope (Web Audio) and break detection. `detectBreaks()` is pure and runs in Node. |
| `app.html` | The page and its UI script. Contains the markers `/*__CORE__*/` and `/*__ANALYSIS__*/`. |
| `build.js` | Inlines `core.js` and `analysis.js` into `app.html` and writes **`mp3-chapter-splitter.html`**. |
| `mp3-chapter-splitter.html` | The built, single-file app. **Generated: edit the sources and run `node build.js`.** It is committed so the repo works on GitHub Pages as-is. |
| `index.html` | Landing page that links to the app. |

## Working on it

```bash
npm install                 # Playwright (dev only)
npx playwright install chromium
sudo apt install ffmpeg unzip      # or: brew install ffmpeg
python3 gen_fixtures.py     # generates test audio into fixtures/ (not committed)

node build.js               # rebuild the single file after any change
npm test                    # engine + detection tests (needs ffmpeg/ffprobe/unzip)
npm run test:browser        # drives the built app in headless Chromium
npm run screenshots         # regenerates docs/images/*.png
```

If your Chromium is somewhere unusual, set `CHROMIUM_PATH`.

## Guidelines

- Keep it dependency-free and one-file. No network requests, ever: the promise is that audio never leaves the machine.
- Change behaviour -> add or adjust a test. The engine tests check real cut files with `ffprobe`; please keep that standard.
- If you change the UI, re-run `npm run screenshots` and look at the images before committing them.
- Commit the rebuilt `mp3-chapter-splitter.html` with your source changes (CI fails if it is stale).

## Reporting a problem

Please include browser and OS, the MP3's bitrate / sample rate / length, and what you expected versus what happened. For wrong break suggestions, the three slider values and whether "Break on applause" was on help a lot.
