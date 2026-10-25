/* core.js - MP3 parsing, cutting, ID3 tagging, ZIP packaging */
'use strict';

const TS_RE = /(?:\[\s*)?(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?(?:\s*\])?(?:\s*\((?:[^()]|\([^()]*\))*\))?/g;

function parseTimestamps(text) {
  const marks = [];
  let m;
  while ((m = TS_RE.exec(text)) !== null) {
    if (text[m.index - 1] === '(' && text[m.index + m[0].length] === ')') continue;
    const h = parseInt(m[1]), min = parseInt(m[2]), s = m[3] ? parseInt(m[3]) : 0;
    const time = h * 3600 + min * 60 + s;
    let end = m.index + m[0].length;
    while (end < text.length && /\s/.test(text[end])) end++;
    let title = '';
    while (end < text.length && text[end] !== '[') {
      const nl = text.indexOf('\n', end);
      if (nl === -1 || nl > end + 100) { title = text.slice(end, end + 100).trim(); break; }
      const line = text.slice(end, nl).trim();
      if (line) { title = line; break; }
      end = nl + 1;
    }
    marks.push({time, title: cleanTitle(title)});
  }
  return marks;
}

function cleanTitle(s) {
  return s.replace(/[\x00-\x1f<>:"|?*]/g, '').replace(/[.]{2,}|\/+|\\+/g, '').trim().slice(0, 200);
}

function sanitizeFilename(s) {
  return cleanTitle(s).replace(/\s+/g, '_');
}

const MPEG_VERSION = {3: 'MPEG1', 2: 'MPEG2', 0: 'MPEG25'};
const LAYER = {3: 'I', 2: 'II', 1: 'III'};
const BR_TABLE = {
  3: { 3: [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],
       2: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],
       1: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384] },
  2: { 3: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256],
       2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
       1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160] },
  0: { 3: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256],
       2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
       1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160] }
};
const SR_TABLE = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000]
};

function parseHeader(data, pos) {
  if (pos + 4 > data.length) return null;
  const b = data.readUInt32BE(pos);
  if ((b & 0xFFE00000) !== 0xFFE00000) return null;
  const versionBits = (b >>> 19) & 3;
  const layerBits = (b >>> 17) & 3;
  if (versionBits === 1 || layerBits === 0) return null;
  const bitrateIdx = (b >>> 12) & 0xF;
  const srIdx = (b >>> 10) & 3;
  const padding = (b >>> 9) & 1;
  const priv = (b >>> 8) & 1;
  const channelMode = (b >>> 6) & 3;
  const modeExt = (b >>> 4) & 3;
  const copyright = (b >>> 3) & 1;
  const original = (b >>> 2) & 1;
  const emphasis = b & 3;
  const bitrate = BR_TABLE[versionBits][layerBits][bitrateIdx];
  if (!bitrate) return null;
  const sampleRate = SR_TABLE[versionBits][srIdx];
  const frameLen = Math.floor(144000 * bitrate / sampleRate + padding);
  return {versionBits, layerBits, bitrate, sampleRate, padding, channelMode, frameLen, priv, modeExt, copyright, original, emphasis};
}

function sideInfoSize(h) {
  if (h.versionBits === 3) return h.channelMode === 3 ? 17 : 32;
  return h.channelMode === 3 ? 9 : 17;
}

function frameIndexAt(data, targetTime, sampleRate) {
  let pos = 0, time = 0, frameCount = 0;
  while (pos < data.length) {
    if (data[pos] !== 0xFF) { pos++; continue; }
    const h = parseHeader(data, pos);
    if (!h) { pos++; continue; }
    if (time >= targetTime) return {pos, time, frameCount};
    pos += h.frameLen;
    time += h.frameLen * 1000 / h.sampleRate;
    frameCount++;
  }
  return {pos, time, frameCount};
}

function parseMp3(data) {
  const frames = [];
  let pos = 0;
  while (pos < data.length && frames.length < 30000) {
    if (data[pos] !== 0xFF) { pos++; continue; }
    const h = parseHeader(data, pos);
    if (!h) { pos++; continue; }
    frames.push({pos, header: h, time: frames.length ? frames[frames.length - 1].time + h.frameLen * 1000 / h.sampleRate : 0});
    pos += h.frameLen;
  }
  return {frames, sampleRate: frames.length ? frames[0].header.sampleRate : 0, duration: frames.length ? frames[frames.length - 1].time : 0};
}

function buildXingFrame(frameCount, duration, frames) {
  const xing = Buffer.alloc(36);
  xing.write('Xing');
  xing[4] = 0x0F;
  xing.writeUInt32BE(frameCount, 8);
  xing.writeUInt32BE(Math.round(duration), 12);
  const toc = Buffer.alloc(100);
  for (let i = 0; i < 100; i++) {
    const targetTime = (i + 1) * duration / 100;
    const frameIdx = frames.findIndex(f => f.time >= targetTime);
    toc[i] = frameIdx >= 0 ? Math.round(frameIdx * 255 / frames.length) : 255;
  }
  toc.copy(xing, 16);
  return xing;
}

function buildId3(tags) {
  const frames = [];
  if (tags.title) frames.push(buildTextFrame('TIT2', tags.title));
  if (tags.artist) frames.push(buildTextFrame('TPE1', tags.artist));
  if (tags.album) frames.push(buildTextFrame('TALB', tags.album));
  if (tags.year) frames.push(buildTextFrame('TYER', tags.year));
  if (tags.genre) frames.push(buildTextFrame('TCON', tags.genre));
  if (tags.track) frames.push(buildTextFrame('TRCK', tags.track));
  const frameData = Buffer.concat(frames);
  const header = Buffer.alloc(10);
  header.write('ID3');
  header[3] = 3;
  header[4] = 0;
  header[5] = 0;
  const size = frameData.length;
  header[6] = (size >>> 21) & 0x7F;
  header[7] = (size >>> 14) & 0x7F;
  header[8] = (size >>> 7) & 0x7F;
  header[9] = size & 0x7F;
  return Buffer.concat([header, frameData]);
}

function buildTextFrame(id, text) {
  const encoded = Buffer.from(text, 'utf16le');
  const frame = Buffer.alloc(10 + encoded.length);
  frame.write(id);
  frame.writeUInt32BE(encoded.length + 1, 4);
  frame[8] = 0;
  frame[9] = 1;
  frame[10] = 0xFF;
  frame[11] = 0xFE;
  encoded.copy(frame, 12);
  return frame;
}

function cutTrack(bytes, info, startTime, endTime, tags, opts) {
  const startIdx = frameIndexAt(bytes, startTime * 1000, info.sampleRate);
  const endIdx = frameIndexAt(bytes, endTime * 1000, info.sampleRate);
  const id3 = buildId3(tags);
  const mp3Data = bytes.slice(startIdx.pos, endIdx.pos);
  const frameDuration = info.frames[0].header.frameLen / info.sampleRate;
  const actualStart = startIdx.time / 1000;
  const actualEnd = endIdx.time / 1000;
  const duration = actualEnd - actualStart;
  return {data: Buffer.concat([id3, mp3Data]), actualStart, actualEnd, duration, frameCount: endIdx.frameCount - startIdx.frameCount};
}

function pad(s, width, char = '\x00') {
  return s + char.repeat(Math.max(0, width - s.length));
}

let crc32Table;
function initCrc32() {
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc32Table[i] = c >>> 0;
  }
}

function crc32(data) {
  if (!crc32Table) initCrc32();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = crc32Table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(tracks, filename) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  for (const track of tracks) {
    const nameUtf8 = Buffer.from(track.filename, 'utf8');
    const localHeader = Buffer.alloc(30 + nameUtf8.length);
    let pos = 0;
    localHeader.writeUInt32LE(0x04034b50, pos); pos += 4;
    localHeader.writeUInt16LE(20, pos); pos += 2;
    localHeader.writeUInt16LE(0x0800, pos); pos += 2;
    localHeader.writeUInt16LE(0, pos); pos += 2;
    localHeader.writeUInt16LE(0, pos); pos += 2;
    localHeader.writeUInt32LE(0x21, pos); pos += 4;
    const crc = crc32(track.data);
    localHeader.writeUInt32LE(crc, pos); pos += 4;
    localHeader.writeUInt32LE(track.data.length, pos); pos += 4;
    localHeader.writeUInt32LE(track.data.length, pos); pos += 4;
    localHeader.writeUInt16LE(nameUtf8.length, pos); pos += 2;
    localHeader.writeUInt16LE(0, pos); pos += 2;
    nameUtf8.copy(localHeader, pos);
    localHeaders.push(localHeader);
    localHeaders.push(track.data);
    const centralHeader = Buffer.alloc(46 + nameUtf8.length);
    pos = 0;
    centralHeader.writeUInt32LE(0x02014b50, pos); pos += 4;
    centralHeader.writeUInt16LE(20, pos); pos += 2;
    centralHeader.writeUInt16LE(20, pos); pos += 2;
    centralHeader.writeUInt16LE(0, pos); pos += 2;
    centralHeader.writeUInt16LE(0, pos); pos += 2;
    centralHeader.writeUInt16LE(0x21, pos); pos += 2;
    centralHeader.writeUInt32LE(0, pos); pos += 4;
    centralHeader.writeUInt32LE(crc, pos); pos += 4;
    centralHeader.writeUInt32LE(track.data.length, pos); pos += 4;
    centralHeader.writeUInt32LE(track.data.length, pos); pos += 4;
    centralHeader.writeUInt16LE(nameUtf8.length, pos); pos += 2;
    centralHeader.writeUInt16LE(0, pos); pos += 2;
    centralHeader.writeUInt16LE(0, pos); pos += 2;
    centralHeader.writeUInt16LE(0, pos); pos += 2;
    centralHeader.writeUInt16LE(0, pos); pos += 2;
    centralHeader.writeUInt32LE(0, pos); pos += 4;
    centralHeader.writeUInt32LE(offset, pos); pos += 4;
    nameUtf8.copy(centralHeader, pos);
    offset += localHeader.length + track.data.length;
    centralHeaders.push(centralHeader);
  }
  const allCentral = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  let pos = 0;
  eocd.writeUInt32LE(0x06054b50, pos); pos += 4;
  eocd.writeUInt16LE(0, pos); pos += 2;
  eocd.writeUInt16LE(0, pos); pos += 2;
  eocd.writeUInt16LE(centralHeaders.length, pos); pos += 2;
  eocd.writeUInt16LE(centralHeaders.length, pos); pos += 2;
  eocd.writeUInt32LE(allCentral.length, pos); pos += 4;
  eocd.writeUInt32LE(offset, pos); pos += 4;
  eocd.writeUInt16LE(0, pos); pos += 2;
  return Buffer.concat([...localHeaders, allCentral, eocd]);
}

if (typeof module !== 'undefined') module.exports = {parseMp3, parseTimestamps, cutTrack, buildZip, buildId3, buildXingFrame, sanitizeFilename, pad, crc32, frameIndexAt, parseHeader, cleanTitle};
if (typeof window !== 'undefined') window.MP3Core = {parseMp3, parseTimestamps, cutTrack, buildZip, buildId3, buildXingFrame, sanitizeFilename, pad, crc32, frameIndexAt, parseHeader, cleanTitle};
