/* ============================================================================
   MP3 Chapter Splitter — loudness analysis and automatic break detection
   The envelope builder needs Web Audio; detectBreaks() is pure and runs in node.
   ========================================================================= */

const BUCKET = 0.01; // seconds per analysis bucket (10 ms)

/* -------------------------------------------------------------- decoding -- */

function decodeChunk(actx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const p = actx.decodeAudioData(arrayBuffer, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function makeContext(sampleRate) {
  const AC = (typeof window !== 'undefined') &&
             (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!AC) throw new Error('Web Audio is not available in this browser.');
  try { return new AC(1, 128, sampleRate); }
  catch (e) { return new AC(1, 128, 44100); } // Safari is picky about odd rates
}

/**
 * Walk the file in ~20 s chunks, decoding each one on its own so peak memory
 * stays flat no matter how long the recording is.
 *
 * Returns { bucket, n, duration, rms (dBFS), peak (0..1), zcr (0..1) }.
 */
async function buildEnvelope(bytes, info, onProgress, shouldCancel) {
  const n = Math.max(1, Math.ceil(info.totalDuration / BUCKET));
  const peak = new Float32Array(n);
  const rms = new Float32Array(n);
  const zcr = new Float32Array(n);
  const sumSq = new Float64Array(n);
  const counts = new Uint32Array(n);
  const crossings = new Uint32Array(n);

  const actx = makeContext(info.samplerate);
  const frames = info.frames;
  const CHUNK_SECONDS = 20;
  let idx = 0;

  while (idx < frames.length) {
    if (shouldCancel && shouldCancel()) return null;

    const startTime = frames[idx].startTime;
    let end = idx;
    while (end < frames.length && frames[end].startTime - startTime < CHUNK_SECONDS) end++;
    if (end === idx) end = idx + 1;

    const last = frames[end - 1];
    // slice() copies, which matters: decodeAudioData detaches the buffer it is given.
    const chunk = bytes.slice(frames[idx].offset, last.offset + last.frameLength);

    let audio = null;
    try { audio = await decodeChunk(actx, chunk.buffer); } catch (e) { audio = null; }

    if (audio) {
      const ch0 = audio.getChannelData(0);
      const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
      const sr = audio.sampleRate;
      const perBucket = sr * BUCKET;
      const firstBucket = Math.round(startTime / BUCKET);
      const total = ch0.length;

      for (let b = 0; ; b++) {
        const s0 = Math.round(b * perBucket);
        if (s0 >= total) break;
        const s1 = Math.min(total, Math.round((b + 1) * perBucket));
        const bi = firstBucket + b;
        if (bi < 0 || bi >= n) continue;

        let sq = 0, pk = 0, cross = 0, prev = 0;
        for (let s = s0; s < s1; s++) {
          const v = ch1 ? (ch0[s] + ch1[s]) * 0.5 : ch0[s];
          sq += v * v;
          const a = v < 0 ? -v : v;
          if (a > pk) pk = a;
          if (s > s0 && (v >= 0) !== (prev >= 0)) cross++;
          prev = v;
        }
        sumSq[bi] += sq;
        counts[bi] += (s1 - s0);
        crossings[bi] += cross;
        if (pk > peak[bi]) peak[bi] = pk;
      }
    }

    idx = end;
    if (onProgress) onProgress(Math.min(1, idx / frames.length));
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe
  }

  for (let b = 0; b < n; b++) {
    rms[b] = counts[b] ? 20 * Math.log10(Math.sqrt(sumSq[b] / counts[b]) + 1e-7) : -140;
    zcr[b] = counts[b] ? crossings[b] / counts[b] : 0;
  }
  return { bucket: BUCKET, n, duration: info.totalDuration, rms, peak, zcr };
}

/* ------------------------------------------------------------- detection -- */

function percentile(arr, p) {
  const a = Float32Array.from(arr);
  a.sort();
  const i = Math.floor(p * (a.length - 1));
  return a[Math.max(0, Math.min(a.length - 1, i))];
}

const DETECT_DEFAULTS = {
  quietDropDb: -38,   // how far under the music level counts as "quiet"
  minGap: 1.2,        // seconds of quiet needed before it reads as a break
  minTrack: 45,       // never place two breaks closer together than this
  applause: false,    // also treat sustained crowd noise as a break
  zcrNoise: 0.22,     // zero-crossing rate above which audio reads as noise
  maxTracks: 80,
};

/**
 * Suggest track start times from a loudness envelope.
 * Pure: same envelope and options always give the same answer.
 *
 * Returns { times: number[], gaps: [{from, to, kind}], reference (dBFS) }.
 */
function detectBreaks(env, options) {
  const o = Object.assign({}, DETECT_DEFAULTS, options || {});
  const { n, bucket, duration, rms, zcr } = env;

  // The loud parts of the recording set the reference the threshold hangs off,
  // so this adapts to a quiet transfer as readily as a loud master.
  const reference = percentile(rms, 0.9);
  const quietLevel = reference + o.quietDropDb;

  const flag = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rms[i] < quietLevel) { flag[i] = 1; continue; }              // silence
    // A crowd is identified by its texture, not its level: applause is broadband
    // noise, so it crosses zero far more often than music does (~0.4 vs ~0.02).
    // Real applause is often exactly as loud as the band, so the level test is
    // only here to rule out the loudest peaks, which belong to the music.
    if (o.applause && zcr[i] > o.zcrNoise && rms[i] < reference + 2) flag[i] = 2;
  }

  // Bridge single-bucket dropouts so one stray loud click doesn't split a gap.
  for (let i = 1; i < n - 1; i++) {
    if (!flag[i] && flag[i - 1] && flag[i + 1]) flag[i] = flag[i - 1];
  }

  const minBuckets = Math.max(1, Math.round(o.minGap / bucket));
  const gaps = [];
  let i = 0;
  while (i < n) {
    if (!flag[i]) { i++; continue; }
    let j = i;
    let sawCrowd = false;
    while (j < n && flag[j]) { if (flag[j] === 2) sawCrowd = true; j++; }
    if (j - i >= minBuckets) {
      gaps.push({ from: i * bucket, to: j * bucket, len: (j - i) * bucket,
                  kind: sawCrowd ? 'crowd' : 'silence' });
    }
    i = j;
  }

  // Put the break just before sound returns, so the next track keeps a short
  // lead-in and the previous one keeps its fade-out.
  const edge = Math.min(o.minTrack, 10);
  const candidates = gaps
    .map((g) => ({ time: Math.max(0, g.to - Math.min(0.4, g.len * 0.4)), len: g.len }))
    .filter((c) => c.time > edge && c.time < duration - edge);

  // Strongest gaps win when two fall within minTrack of each other.
  candidates.sort((a, b) => b.len - a.len);
  const chosen = [0];
  for (const c of candidates) {
    if (chosen.length >= o.maxTracks) break;
    let clear = true;
    for (const t of chosen) {
      if (Math.abs(t - c.time) < o.minTrack) { clear = false; break; }
    }
    if (clear) chosen.push(c.time);
  }
  chosen.sort((a, b) => a - b);

  return { times: chosen, gaps, reference };
}

/* ---------------------------------------------------------------- export -- */

const ANALYSIS = { buildEnvelope, detectBreaks, DETECT_DEFAULTS, BUCKET, percentile };
if (typeof module !== 'undefined' && module.exports) module.exports = ANALYSIS;
if (typeof window !== 'undefined') window.MP3Analysis = ANALYSIS;

