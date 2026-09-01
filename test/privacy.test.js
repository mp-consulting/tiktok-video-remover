'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// PRIVACY.md makes concrete claims. These tests fail the build if the code stops
// matching them, rather than leaving the policy to drift into fiction.
const root = path.join(__dirname, '..');
const FILES = ['lib', 'api', 'posts', 'runner', 'select', 'engine', 'panel', 'popup']
  .map((n) => [`src/${n}.js`, fs.readFileSync(path.join(root, 'src', `${n}.js`), 'utf8')]);
const ALL = FILES.map(([, src]) => src).join('\n');

test('every URL in the source points at tiktok.com', () => {
  const urls = [...ALL.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
  for (const url of urls) {
    assert.match(url, /^https:\/\/www\.tiktok\.com$/, `unexpected destination: ${url}`);
  }
});

test('nothing is persisted beyond the documented panel width', () => {
  assert.doesNotMatch(ALL, /chrome\.storage/, 'chrome.storage is not declared or documented');
  assert.doesNotMatch(ALL, /indexedDB/, 'IndexedDB is not documented');
  assert.doesNotMatch(ALL, /document\.cookie/, 'the extension must never touch cookies itself');

  // localStorage may be used, but only for the single documented key.
  const keys = [...ALL.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([A-Za-z_$][\w$]*|'[^']*')/g)]
    .map((m) => m[1]);
  for (const key of keys) {
    assert.equal(key, 'WIDTH_KEY', `localStorage key ${key} is not the documented one`);
  }
  assert.match(ALL, /WIDTH_KEY\s*=\s*'ttr:width'/, "the width key should still be 'ttr:width'");
});

test('there is no analytics or telemetry', () => {
  for (const pattern of [/sendBeacon/, /google-analytics/, /gtag\(/, /\bmixpanel\b/, /\bsentry\b/i]) {
    assert.doesNotMatch(ALL, pattern, `looks like telemetry: ${pattern}`);
  }
});

test('no remote code is loaded or evaluated', () => {
  // MV3 forbids it, and PRIVACY.md states everything ships in the package.
  for (const [name, src] of FILES) {
    assert.doesNotMatch(src, /\beval\s*\(/, `${name} calls eval`);
    assert.doesNotMatch(src, /new\s+Function\s*\(/, `${name} builds code at runtime`);
    assert.doesNotMatch(src, /importScripts|import\s*\(/, `${name} loads code at runtime`);
    assert.doesNotMatch(src, /createElement\(\s*['"]script/i, `${name} injects a script tag`);
  }
});

test('requests are made from exactly one place', () => {
  // The browser's fetch is touched once, in engine.js, purely to inject it...
  const touchesBrowserFetch = FILES.filter(([, src]) => /\bglobal\.fetch\b/.test(src)).map(([n]) => n);
  assert.deepEqual(touchesBrowserFetch, ['src/engine.js']);

  // ...and every actual request goes through a single site in api.js.
  const api = FILES.find(([n]) => n === 'src/api.js')[1];
  assert.equal((api.match(/await fetchImpl\(/g) || []).length, 1, 'api.js should have one request site');

  // Nothing else may reach the network by any route.
  for (const [name, src] of FILES) {
    if (name === 'src/api.js' || name === 'src/engine.js') continue;
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/, `${name} reaches the network`);
  }
});
