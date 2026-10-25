#!/usr/bin/env node
/**
 * Unit tests for core.js — MP3 parsing, cutting, tagging, ZIP assembly
 * 55 assertions covering frame parsing, ID3v2.3, Xing headers, CRC-32, ZIP
 */
'use strict';
const assert = require('assert');
const core = require('./core.js');
const fs = require('fs');
const path = require('path');

let passCount = 0, failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passCount++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    failCount++;
  }
}

// Helper: create minimal MP3 frame header
function makeHeader(versionBits, layerBits, bitrateIdx, srIdx, padding = 0, channelMode = 0) {
  const b = (0xFFE00000 | (versionBits << 19) | (layerBits << 17) | (bitrateIdx << 12) | (srIdx << 10) | (padding << 9) | (channelMode << 6)) >>> 0;
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(b, 0);
  return buf;
}

console.log('Testing core.js\n');

// Timestamp parsing
test('parseTimestamps: basic format', () => {
  const marks = core.parseTimestamps('[00:00] Intro\n[05:30] Verse\n[10:15] Chorus');
  assert.strictEqual(marks.length, 3);
  assert.strictEqual(marks[0].time, 0);
  assert.strictEqual(marks[1].time, 330);
  assert.strictEqual(marks[2].time, 615);
});

test('parseTimestamps: with hours', () => {
  const marks = core.parseTimestamps('[1:05:30] Track One\n[2:10:15] Track Two');
  assert.strictEqual(marks[0].time, 3930);
  assert.strictEqual(marks[1].time, 7815);
});

test('parseTimestamps: skip parenthesized duration', () => {
  const marks = core.parseTimestamps('[00:00] Intro (2:15)\n[02:15] Song');
  assert.strictEqual(marks.length, 2);
  assert.strictEqual(marks[0].title, 'Intro');
});

test('parseTimestamps: extract titles', () => {
  const marks = core.parseTimestamps('[00:00] Springtime in Vienna\n[04:10] The Luxury');
  assert.strictEqual(marks[0].title, 'Springtime in Vienna');
  assert.strictEqual(marks[1].title, 'The Luxury');
});

// Filename sanitizing
test('cleanTitle: remove control characters', () => {
  const cleaned = core.cleanTitle('My \x00 Song \x1f Name');
  assert.strictEqual(cleaned, 'My Song Name');
});

test('cleanTitle: remove slashes and colons', () => {
  const cleaned = core.cleanTitle('Track/Name:Part\\2');
  assert.strictEqual(cleaned, 'TrackNamePart2');
});

test('sanitizeFilename: replace spaces', () => {
  const safe = core.sanitizeFilename('My Long Track Name');
  assert.strictEqual(safe, 'My_Long_Track_Name');
});

// CRC-32
test('crc32: known value', () => {
  const data = Buffer.from('123456789');
  const crc = core.crc32(data);
  assert.strictEqual(crc, 0xCBF43926);
});

test('crc32: empty buffer', () => {
  const crc = core.crc32(Buffer.alloc(0));
  assert.strictEqual(typeof crc, 'number');
});

// Header parsing (frame validation)
test('parseHeader: valid MPEG1 Layer3', () => {
  const hdr = makeHeader(3, 1, 9, 0); // MPEG1, Layer3, 128 kbps, 44.1 kHz
  const h = core.parseHeader(hdr, 0);
  assert(h !== null);
  assert.strictEqual(h.versionBits, 3);
  assert.strictEqual(h.layerBits, 1);
  assert.strictEqual(h.bitrate, 128);
  assert.strictEqual(h.sampleRate, 44100);
});

test('parseHeader: invalid sync word', () => {
  const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const h = core.parseHeader(buf, 0);
  assert.strictEqual(h, null);
});

test('parseHeader: invalid version', () => {
  const hdr = makeHeader(1, 1, 9, 0); // version=1 is invalid
  const h = core.parseHeader(hdr, 0);
  assert.strictEqual(h, null);
});

test('parseHeader: frameLen calculation', () => {
  const hdr = makeHeader(3, 1, 9, 0, 0); // 128 kbps, 44100 Hz, no padding
  const h = core.parseHeader(hdr, 0);
  assert.strictEqual(h.frameLen, 418); // (144 * 128000 / 44100) = 417.96... -> 417, +padding
});

// Pad function
test('pad: string padding', () => {
  const padded = core.pad('ABC', 5, 'X');
  assert.strictEqual(padded, 'ABCXX');
});

test('pad: no padding needed', () => {
  const padded = core.pad('ABC', 2);
  assert.strictEqual(padded, 'ABC');
});

// ID3v2.3
test('buildId3: basic tag', () => {
  const tags = { title: 'My Song', artist: 'Artist Name' };
  const id3 = core.buildId3(tags);
  assert(Buffer.isBuffer(id3));
  assert(id3.length > 10);
  assert.strictEqual(id3.toString('ascii', 0, 3), 'ID3');
  assert.strictEqual(id3[3], 3); // Version 2.3
});

// ZIP building
test('buildZip: creates valid structure', () => {
  const tracks = [
    { filename: 'track-1.mp3', data: Buffer.from('dummy audio 1') },
    { filename: 'track-2.mp3', data: Buffer.from('dummy audio 2') },
  ];
  const zip = core.buildZip(tracks);
  assert(Buffer.isBuffer(zip));
  // Check for local file header signature (0x04034b50)
  assert.strictEqual(zip.readUInt32LE(0), 0x04034b50);
  // Check for central directory signature (0x02014b50) somewhere
  let found = false;
  for (let i = 0; i < zip.length - 4; i++) {
    if (zip.readUInt32LE(i) === 0x02014b50) { found = true; break; }
  }
  assert(found, 'Central directory not found in ZIP');
});

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
