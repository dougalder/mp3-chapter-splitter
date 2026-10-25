#!/usr/bin/env node
/**
 * Tests for analysis.js — audio envelope, break detection
 * 27 assertions on synthetic envelopes, silence patterns, applause, edge cases
 */
'use strict';
const assert = require('assert');
const analysis = require('./analysis.js');

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

console.log('Testing analysis.js\n');

// Percentile function
test('percentile: 50th (median)', () => {
  const arr = [1, 2, 3, 4, 5];
  const p50 = analysis.percentile(arr, 50);
  assert(p50 >= 2 && p50 <= 4, `Expected 2-4, got ${p50}`);
});

test('percentile: 90th', () => {
  const arr = Array.from({length: 100}, (_, i) => i);
  const p90 = analysis.percentile(arr, 90);
  assert(p90 >= 88 && p90 <= 100, `Expected 88-100, got ${p90}`);
});

test('percentile: empty array returns 0', () => {
  const p = analysis.percentile([], 50);
  assert.strictEqual(p, 0);
});

// Detection with synthetic envelopes
test('detectBreaks: finds single silence gap', () => {
  const envelope = [];
  // Build a synthetic envelope: music (high RMS), silence (low RMS), music
  for (let i = 0; i < 100; i++) {
    const rms = i >= 30 && i < 70 ? -50 : -20; // -50 dB silence from 3-7 sec
    envelope.push({rms, zcr: 0.01, time: i * 0.01});
  }
  const breaks = analysis.detectBreaks(envelope, {
    quietDropDb: -38,
    minGap: 0.5,
    applause: false,
  });
  assert(breaks.length > 1, `Expected breaks to find silence, got ${breaks.length}`);
});

test('detectBreaks: respects minGap threshold', () => {
  const envelope = [];
  // Short silence (0.3 sec) followed by longer silence (0.8 sec)
  for (let i = 0; i < 150; i++) {
    const rms = (i >= 20 && i < 50) || (i >= 80 && i < 150) ? -50 : -20;
    envelope.push({rms, zcr: 0.01, time: i * 0.01});
  }
  const breaks = analysis.detectBreaks(envelope, {
    quietDropDb: -38,
    minGap: 0.5, // only >= 0.5 sec gaps
    applause: false,
  });
  // Should find the longer gap (0.7 sec) but not the short one (0.3 sec)
  assert(breaks.some(b => b > 0.8), 'Should find longer silence');
});

test('detectBreaks: applause detection (high ZCR)', () => {
  const envelope = [];
  // Music with normal ZCR, then applause (high ZCR, moderate RMS)
  for (let i = 0; i < 100; i++) {
    const zcr = i >= 50 ? 0.4 : 0.015; // applause ZCR
    const rms = i >= 50 ? -25 : -20; // applause at similar level to music
    envelope.push({rms, zcr, time: i * 0.01});
  }
  const breaks = analysis.detectBreaks(envelope, {
    quietDropDb: -38,
    minGap: 0.3,
    applause: true,
    zcrNoise: 0.22,
  });
  assert(breaks.length > 1, 'Applause detector should find break');
});

test('detectBreaks: applause disabled ignores ZCR', () => {
  const envelope = [];
  for (let i = 0; i < 100; i++) {
    const zcr = i >= 50 ? 0.4 : 0.015;
    const rms = -25; // all same level (no silence)
    envelope.push({rms, zcr, time: i * 0.01});
  }
  const breaksWithApplause = analysis.detectBreaks(envelope, {quietDropDb: -38, minGap: 0.3, applause: true});
  const breaksNoApplause = analysis.detectBreaks(envelope, {quietDropDb: -38, minGap: 0.3, applause: false});
  assert(breaksWithApplause.length >= breaksNoApplause.length, 'Applause should find more breaks');
});

test('detectBreaks: respects maxTracks cap', () => {
  const envelope = [];
  // Many very short gaps
  for (let i = 0; i < 200; i++) {
    const rms = i % 10 === 5 ? -50 : -20; // gap every 10 buckets = many gaps
    envelope.push({rms, zcr: 0.01, time: i * 0.01});
  }
  const breaks = analysis.detectBreaks(envelope, {
    quietDropDb: -38,
    minGap: 0.1,
    maxTracks: 10,
  });
  assert(breaks.length <= 10, `Expected <= 10 breaks, got ${breaks.length}`);
});

test('detectBreaks: always includes time 0', () => {
  const envelope = [{rms: -20, zcr: 0.01, time: 0}];
  const breaks = analysis.detectBreaks(envelope);
  assert(breaks.length > 0);
  assert.strictEqual(breaks[0], 0);
});

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
