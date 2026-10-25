/* analysis.js - Audio envelope and break detection */
'use strict';

const BUCKET = 0.01; // 10 ms
const DETECT_DEFAULTS = {
  quietDropDb: -38,
  minGap: 1.2,
  minTrack: 45,
  applause: false,
  zcrNoise: 0.22,
  maxTracks: 80,
};

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function buildEnvelope(pcm, sampleRate) {
  const bucketLen = Math.floor(sampleRate * BUCKET);
  const buckets = [];
  for (let i = 0; i < pcm.length; i += bucketLen) {
    const slice = pcm.slice(i, i + bucketLen);
    if (!slice.length) continue;
    let rms = 0, peak = 0, zcr = 0;
    for (let j = 0; j < slice.length; j++) {
      const s = Math.abs(slice[j]);
      rms += s * s;
      peak = Math.max(peak, s);
      if (j > 0 && slice[j - 1] * slice[j] < 0) zcr++;
    }
    rms = Math.sqrt(rms / slice.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const zcrRate = zcr / slice.length;
    buckets.push({rms: rmsDb, peak, zcr: zcrRate, time: i / sampleRate});
  }
  return buckets;
}

function detectBreaks(envelope, opts) {
  opts = {... DETECT_DEFAULTS, ...opts};
  const rms = envelope.map(b => b.rms);
  const reference = percentile(rms, 90);
  const quietLevel = reference + opts.quietDropDb;
  const n = envelope.length;
  const flag = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rms[i] < quietLevel) { flag[i] = 1; continue; }
    if (opts.applause && envelope[i].zcr > opts.zcrNoise && rms[i] < reference + 2) flag[i] = 2;
  }
  const gaps = [];
  let i = 0;
  while (i < n) {
    if (flag[i] > 0) {
      const from = i;
      while (i < n && flag[i] > 0) i++;
      const to = i;
      const len = (to - from) * BUCKET;
      if (len >= opts.minGap) {
        const breakTime = Math.max(0, envelope[to - 1].time - Math.min(0.4, len * 0.4));
        gaps.push({from, to, len, breakTime, time: to * BUCKET});
      }
    } else i++;
  }
  gaps.sort((a, b) => b.len - a.len);
  const chosen = [0];
  for (const g of gaps) {
    const tooClose = chosen.some(idx => Math.abs(g.breakTime - envelope[idx].time) < opts.minTrack);
    if (!tooClose && chosen.length < opts.maxTracks) chosen.push(g.from);
  }
  chosen.sort((a, b) => a - b);
  return chosen.map(i => envelope[i].time);
}

if (typeof module !== 'undefined') module.exports = {buildEnvelope, detectBreaks, DETECT_DEFAULTS, BUCKET, percentile};
if (typeof window !== 'undefined') window.MP3Analysis = {buildEnvelope, detectBreaks, DETECT_DEFAULTS, BUCKET, percentile};
