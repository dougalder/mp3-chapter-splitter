/* ============================================================================
   MP3 Chapter Splitter — core engine
   Zero dependencies. Runs identically in a browser and in node.
   ========================================================================= */

/* ---------------------------------------------------------------- tables -- */

const BITRATES = {
  // [versionGroup][layer][index]  versionGroup: 1 = MPEG1, 2 = MPEG2/2.5
  1: {
    1: [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448,-1],
    2: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,-1],
    3: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,-1],
  },
  2: {
    1: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,-1],
    2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,-1],
    3: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,-1],
  },
};

const SAMPLERATES = {
  3: [44100, 48000, 32000, -1], // MPEG1
  2: [22050, 24000, 16000, -1], // MPEG2
  0: [11025, 12000,  8000, -1], // MPEG2.5
};

const SAMPLES_PER_FRAME = {
  1: { 1: 384, 2: 384 },
  2: { 1: 1152, 2: 1152 },
  3: { 1: 1152, 2: 576 },
};

/* ------------------------------------------------------------ mpeg header -- */

/**
 * Parse a 4-byte MPEG audio frame header at `pos`.
 * Returns null if this is not a plausible header.
 */
function parseHeader(buf, pos) {
  if (pos + 4 > buf.length) return null;
  if (buf[pos] !== 0xff) return null;
  if ((buf[pos + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (buf[pos + 1] >> 3) & 0x03; // 3=MPEG1 2=MPEG2 0=MPEG2.5
  const layerBits   = (buf[pos + 1] >> 1) & 0x03; // 3=I 2=II 1=III
  if (versionBits === 1 || layerBits === 0) return null;

  const layer      = 4 - layerBits;                   // 1, 2 or 3
  const versionGrp = versionBits === 3 ? 1 : 2;
  const crc        = (buf[pos + 1] & 0x01) === 0;

  const brIndex = (buf[pos + 2] >> 4) & 0x0f;
  const srIndex = (buf[pos + 2] >> 2) & 0x03;
  const padding = (buf[pos + 2] >> 1) & 0x01;
  if (brIndex === 0 || brIndex === 15 || srIndex === 3) return null;

  const bitrate    = BITRATES[versionGrp][layer][brIndex] * 1000;
  const samplerate = SAMPLERATES[versionBits][srIndex];
  if (!bitrate || bitrate < 0 || !samplerate || samplerate < 0) return null;

  const channelMode = (buf[pos + 3] >> 6) & 0x03; // 3 = mono
  const samples     = SAMPLES_PER_FRAME[versionBits === 3 ? 3 : (versionBits === 2 ? 2 : 2)][layer === 3 ? 2 : 1];

  // samples-per-frame, done explicitly to avoid the table gymnastics above
  let spf;
  if (layer === 1) spf = 384;
  else if (layer === 2) spf = 1152;
  else spf = versionBits === 3 ? 1152 : 576;

  let frameLength;
  if (layer === 1) {
    frameLength = Math.floor((12 * bitrate / samplerate + padding) * 4);
  } else {
    frameLength = Math.floor((spf / 8) * bitrate / samplerate) + padding;
  }
  if (frameLength < 8) return null;

  return {
    offset: pos, frameLength, bitrate, samplerate, layer, versionBits,
    versionGrp, channelMode, crc, padding, samples: spf,
    duration: spf / samplerate,
  };
}

/** Scan forward for the next 0xFF sync byte. Returns -1 if none. */
function findSync(buf, from, end) {
  for (let i = from; i < end - 1; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

/** A header is trusted once `n` consecutive frames chain cleanly from it. */
function chainValid(buf, pos, end, n = 3) {
  let p = pos;
  for (let i = 0; i < n; i++) {
    const h = parseHeader(buf, p);
    if (!h) return false;
    p += h.frameLength;
    if (p > end) return i >= 1; // ran off the end but chained at least once
  }
  return true;
}

/* -------------------------------------------------------------- id3 skip -- */

function syncsafe(buf, pos) {
  return ((buf[pos] & 0x7f) << 21) | ((buf[pos + 1] & 0x7f) << 14) |
         ((buf[pos + 2] & 0x7f) << 7) | (buf[pos + 3] & 0x7f);
}

/** Byte offset where audio data begins, skipping any ID3v2 tag. */
function audioStartOffset(buf) {
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    let size = 10 + syncsafe(buf, 6);
    if (buf[5] & 0x10) size += 10; // footer present
    return size;
  }
  return 0;
}

/** Byte offset where audio data ends, excluding a trailing ID3v1 tag. */
function audioEndOffset(buf) {
  let end = buf.length;
  if (end >= 128) {
    const p = end - 128;
    if (buf[p] === 0x54 && buf[p + 1] === 0x41 && buf[p + 2] === 0x47) end = p;
  }
  return end;
}

/* ------------------------------------------------------- xing / info tag -- */

function sideInfoSize(h) {
  if (h.versionBits === 3) return h.channelMode === 3 ? 17 : 32; // MPEG1
  return h.channelMode === 3 ? 9 : 17;                            // MPEG2/2.5
}

/** True if this frame carries a Xing/Info/VBRI header rather than audio. */
function isVbrHeaderFrame(buf, h) {
  const tagAt = (off, s) => {
    if (h.offset + off + 4 > buf.length) return false;
    for (let i = 0; i < 4; i++) if (buf[h.offset + off + i] !== s.charCodeAt(i)) return false;
    return true;
  };
  const base = 4 + sideInfoSize(h) + (h.crc ? 2 : 0);
  if (tagAt(base, 'Xing') || tagAt(base, 'Info')) return true;
  if (tagAt(4 + 32, 'VBRI')) return true; // Fraunhofer, fixed offset
  return false;
}

/* --------------------------------------------------------------- parsing -- */

/**
 * Walk every MPEG frame in the file.
 * Returns { frames, totalDuration, vbr, samplerate, ... }
 */
function parseMp3(bytes) {
  const buf = bytes;
  const end = audioEndOffset(buf);
  let pos = audioStartOffset(buf);

  // Lock on to the first genuine frame.
  while (pos < end) {
    if (parseHeader(buf, pos) && chainValid(buf, pos, end)) break;
    const nxt = findSync(buf, pos + 1, end);
    if (nxt < 0) { pos = end; break; }
    pos = nxt;
  }
  if (pos >= end) throw new Error('No MPEG audio frames found — is this really an MP3?');

  const frames = [];
  let totalDuration = 0;
  let headerFrame = null;
  let first = true;
  let minBitrate = Infinity, maxBitrate = 0;

  while (pos + 4 <= end) {
    const h = parseHeader(buf, pos);
    if (!h) {
      const nxt = findSync(buf, pos + 1, end);
      if (nxt < 0) break;
      if (!chainValid(buf, nxt, end, 2)) { pos = nxt + 1; continue; }
      pos = nxt;
      continue;
    }
    if (pos + h.frameLength > end) break; // truncated final frame

    if (first) {
      first = false;
      if (isVbrHeaderFrame(buf, h)) { headerFrame = h; pos += h.frameLength; continue; }
    }

    h.startTime = totalDuration;
    frames.push(h);
    totalDuration += h.duration;
    if (h.bitrate < minBitrate) minBitrate = h.bitrate;
    if (h.bitrate > maxBitrate) maxBitrate = h.bitrate;
    pos += h.frameLength;
  }

  if (!frames.length) throw new Error('No MPEG audio frames found — is this really an MP3?');

  return {
    frames,
    totalDuration,
    vbr: minBitrate !== maxBitrate,
    minBitrate, maxBitrate,
    samplerate: frames[0].samplerate,
    channelMode: frames[0].channelMode,
    versionBits: frames[0].versionBits,
    layer: frames[0].layer,
    hadVbrHeader: !!headerFrame,
  };
}

/** Index of the frame whose start time is nearest to `t` seconds. */
function frameIndexAt(frames, t) {
  if (t <= 0) return 0;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].startTime < t) lo = mid + 1; else hi = mid;
  }
  // `lo` is the first frame at or past t; pick whichever boundary is closer.
  if (lo > 0 && Math.abs(frames[lo - 1].startTime - t) < Math.abs(frames[lo].startTime - t)) return lo - 1;
  return lo;
}

/* --------------------------------------------------- xing frame building -- */

/** Build a valid Xing/Info header frame describing a freshly cut track. */
function buildXingFrame(info, trackFrames, audioByteLength, vbr) {
  const proto = trackFrames[0];
  const sis = sideInfoSize(proto);
  const need = 4 + sis + 4 + 4 + 4 + 4 + 100; // header + sideinfo + tag + flags + frames + bytes + TOC

  // Pick the smallest legal bitrate whose frame is large enough.
  const table = BITRATES[proto.versionGrp][proto.layer];
  let brIndex = -1, frameLength = 0;
  for (let i = 1; i < 15; i++) {
    const kbps = table[i];
    if (kbps <= 0) continue;
    const len = Math.floor((proto.samples / 8) * (kbps * 1000) / proto.samplerate);
    if (len >= need) { brIndex = i; frameLength = len; break; }
  }
  if (brIndex < 0) return null; // no bitrate can hold the tag; skip it

  const out = new Uint8Array(frameLength); // zero-filled: side info stays empty
  out[0] = 0xff;
  out[1] = 0xe0 | (proto.versionBits << 3) | ((4 - proto.layer) << 1) | 0x01; // no CRC
  out[2] = (brIndex << 4) | (indexOfSamplerate(proto) << 2);                  // no padding
  out[3] = (proto.channelMode << 6);

  let p = 4 + sis;
  const tag = vbr ? 'Xing' : 'Info';
  for (let i = 0; i < 4; i++) out[p++] = tag.charCodeAt(i);

  const w32 = (v) => { out[p++] = (v >>> 24) & 0xff; out[p++] = (v >>> 16) & 0xff; out[p++] = (v >>> 8) & 0xff; out[p++] = v & 0xff; };
  w32(0x0007);                                  // flags: frames | bytes | TOC
  w32(trackFrames.length);                      // frame count, excluding this one
  w32(audioByteLength + frameLength);           // total stream bytes, including this one

  // TOC: 100 entries mapping percent-of-duration to percent-of-bytes.
  const t0 = trackFrames[0].startTime;
  const dur = trackFrames[trackFrames.length - 1].startTime + trackFrames[trackFrames.length - 1].duration - t0;
  const b0 = trackFrames[0].offset;
  for (let i = 0; i < 100; i++) {
    const target = t0 + dur * (i / 100);
    const idx = frameIndexAt(trackFrames, target);
    const rel = trackFrames[idx].offset - b0;
    out[p++] = Math.min(255, Math.floor(256 * rel / audioByteLength));
  }
  return out;
}

function indexOfSamplerate(h) {
  const list = SAMPLERATES[h.versionBits];
  const i = list.indexOf(h.samplerate);
  return i < 0 ? 0 : i;
}

/* ------------------------------------------------------------ id3 writer -- */

function utf16Bytes(str) {
  const out = [0xff, 0xfe]; // BOM, little-endian
  for (const ch of str) {
    let c = ch.codePointAt(0);
    if (c > 0xffff) { // surrogate pair
      c -= 0x10000;
      const hi = 0xd800 + (c >> 10), lo = 0xdc00 + (c & 0x3ff);
      out.push(hi & 0xff, hi >> 8, lo & 0xff, lo >> 8);
    } else {
      out.push(c & 0xff, c >> 8);
    }
  }
  return out;
}

/** An ID3v2.3 tag from {TIT2, TPE1, TALB, TRCK, TLEN, TYER, TCON, ...}. */
function buildId3(fields) {
  const frames = [];
  for (const [id, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    const data = [0x01, ...utf16Bytes(String(value))]; // 0x01 = UTF-16 w/ BOM
    const f = [];
    for (let i = 0; i < 4; i++) f.push(id.charCodeAt(i));
    const n = data.length;
    f.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    f.push(0x00, 0x00); // frame flags
    frames.push(...f, ...data);
  }
  if (!frames.length) return new Uint8Array(0);

  const pad = 256; // room for players that edit tags in place
  const size = frames.length + pad;
  const head = [
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00,
    (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f,
  ];
  return new Uint8Array([...head, ...frames, ...new Array(pad).fill(0)]);
}

/* ------------------------------------------------------------- splitting -- */

/**
 * Cut one track. Returns a Uint8Array holding a complete, playable MP3.
 * `opts`: { id3, xing } booleans plus tag field values.
 */
function cutTrack(bytes, info, startTime, endTime, tags, opts = {}) {
  const { frames } = info;
  const i = frameIndexAt(frames, startTime);
  let j = endTime >= info.totalDuration ? frames.length : frameIndexAt(frames, endTime);
  if (j <= i) j = Math.min(i + 1, frames.length);

  const trackFrames = frames.slice(i, j);
  const byteStart = trackFrames[0].offset;
  const last = trackFrames[trackFrames.length - 1];
  const byteEnd = last.offset + last.frameLength;
  const audio = bytes.subarray(byteStart, byteEnd);

  const actualStart = trackFrames[0].startTime;
  const actualEnd = last.startTime + last.duration;
  const durationMs = Math.round((actualEnd - actualStart) * 1000);

  const parts = [];
  if (opts.id3 !== false) {
    parts.push(buildId3({ ...tags, TLEN: String(durationMs) }));
  }
  if (opts.xing !== false) {
    const x = buildXingFrame(info, trackFrames, audio.length, info.vbr);
    if (x) parts.push(x);
  }
  parts.push(audio);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }

  return { data: out, actualStart, actualEnd, duration: actualEnd - actualStart, frameCount: trackFrames.length };
}

/* ------------------------------------------------- timestamp list parser -- */

const TS_RE = /(?:\[\s*)?(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?(?:\s*\])?(?:\s*\((?:[^()]|\([^()]*\))*\))?/g;

function toSeconds(a, b, c) {
  return c === undefined
    ? Number(a) * 60 + Number(b)
    : Number(a) * 3600 + Number(b) * 60 + Number(c);
}

function cleanTitle(s) {
  return s
    .replace(/^[\s ]*[-–—·•|:.]+[\s ]*/, '')  // leading separator
    .replace(/[\s ]*[-–—·•|]+[\s ]*$/, '')     // trailing separator
    .replace(/\((?:\d{1,3}:[0-5]\d(?::[0-5]\d)?)\)\s*$/, '') // trailing (4:10)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract {time, title} pairs from pasted text.
 * Handles "[00:00](url) Title", "00:00 Title", "00:00 - Title" and
 * (auto-detected) "Title 00:00" layouts, on one line or many.
 */
function parseTimestamps(text, opts = {}) {
  const matches = [];
  TS_RE.lastIndex = 0;
  let m;
  while ((m = TS_RE.exec(text)) !== null) {
    // "Intro (2:15)" — a bare timestamp wrapped in parens is a stated
    // duration, not a chapter mark. Linked forms like "[0:00](url)" are
    // unaffected: the regex has already eaten the URL group by this point.
    if (text[m.index - 1] === '(' && text[m.index + m[0].length] === ')') continue;
    matches.push({
      time: toSeconds(m[1], m[2], m[3]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  if (!matches.length) return [];

  // Keep only a non-decreasing run, so a stray "4:10" inside a title is dropped.
  const kept = [];
  let lastTime = -1;
  for (const mm of matches) {
    if (mm.time >= lastTime) { kept.push(mm); lastTime = mm.time; }
  }

  // Decide whether titles follow their timestamp or precede it.
  let titleFirst = opts.titleFirst;
  if (titleFirst === undefined) {
    const tail = text.slice(kept[kept.length - 1].end).trim();
    const head = text.slice(0, kept[0].start).trim();
    titleFirst = tail.length === 0 && head.length > 0;
  }

  const out = [];
  for (let i = 0; i < kept.length; i++) {
    let raw;
    if (titleFirst) {
      raw = text.slice(i === 0 ? 0 : kept[i - 1].end, kept[i].start);
    } else {
      raw = text.slice(kept[i].end, i + 1 < kept.length ? kept[i + 1].start : text.length);
    }
    out.push({ time: kept[i].time, title: cleanTitle(raw) });
  }
  return out;
}

/* ------------------------------------------------------------- filenames -- */

function sanitizeFilename(name, fallback = 'track') {
  let s = String(name)
    .replace(/[\/\\:*?"<>|]/g, '-')      // illegal on Windows/macOS
    .replace(/[\x00-\x1f\x7f]/g, '')     // control characters
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');              // Windows dislikes trailing dot/space
  if (!s) s = fallback;
  if (s.length > 150) s = s.slice(0, 150).trim();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) s = '_' + s;
  return s;
}

function pad(n, width) { return String(n).padStart(width, '0'); }

/* ----------------------------------------------------------- zip writing -- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Build a ZIP archive (stored, no compression — MP3 is already compressed). */
function buildZip(entries) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const n = e.data.length;

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);         // version needed
    lv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
    lv.setUint16(8, 0, true);          // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, n, true);
    lv.setUint32(22, n, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, n, true);
    cv.setUint32(24, n, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);

    locals.push(lh, e.data);
    centrals.push(ch);
    offset += lh.length + n;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return [...locals, ...centrals, eocd];
}

/* ---------------------------------------------------------------- export -- */

const API = {
  parseMp3, parseTimestamps, cutTrack, buildZip, buildId3, buildXingFrame,
  sanitizeFilename, pad, crc32, frameIndexAt, parseHeader, cleanTitle,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MP3Core = API;

