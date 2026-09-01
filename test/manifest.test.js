'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest is MV3 and scoped to tiktok.com only', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['https://www.tiktok.com/*']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.tiktok.com/*']);
});

test('every content script listed in the manifest exists', () => {
  for (const file of manifest.content_scripts[0].js.concat(manifest.content_scripts[0].css)) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
});

test('content scripts load in dependency order', () => {
  // engine.js reads TTR.{lib,api,posts,runner}; panel.js reads TTR.select and the
  // engine. A wrong order here fails only in the browser, so pin it here.
  const js = manifest.content_scripts[0].js;
  const at = (name) => js.indexOf(`src/${name}.js`);
  for (const dep of ['lib', 'api', 'posts', 'runner']) {
    assert.ok(at(dep) > -1 && at(dep) < at('engine'), `${dep} must load before engine`);
  }
  assert.ok(at('select') < at('panel'), 'select must load before panel');
  assert.ok(at('engine') < at('panel'), 'engine must load before panel');
});

test('every module parses and exports under Node', () => {
  for (const name of ['lib', 'api', 'posts', 'runner', 'select']) {
    const mod = require(path.join(root, 'src', `${name}.js`));
    assert.ok(mod && Object.keys(mod).length > 0, `${name}.js exports nothing`);
  }
});

test('panel only reaches for exports that actually exist', () => {
  // The panel talks to the engine as E.* and to select.js as S.*. A rename in a
  // module would otherwise surface as a runtime TypeError in the browser only.
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.js'), 'utf8');
  const used = (prefix) =>
    [...new Set([...panel.matchAll(new RegExp(`\\b${prefix}\\.([a-zA-Z_]\\w*)`, 'g'))].map((m) => m[1]))];

  const selectExports = Object.keys(require(path.join(root, 'src', 'select.js')));
  for (const name of used('S')) {
    assert.ok(selectExports.includes(name), `panel uses S.${name}, missing from select.js`);
  }

  // The engine's surface, as assembled by src/engine.js.
  const engineExports = ['state', 'scan', 'run', 'deleteOne', 'MAX_BATCH', 'handle'];
  for (const name of used('E')) {
    assert.ok(engineExports.includes(name), `panel uses E.${name}, not on the engine`);
  }
});

test('manifest and package.json versions stay in step', () => {
  // Two version numbers is one too many; drift breaks a release quietly.
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
});

test('no permission is declared that the code never uses', () => {
  // `storage` sat here unused for a while. Unused permissions get submissions
  // rejected and widen what the extension can reach.
  const sources = ['lib', 'api', 'posts', 'runner', 'select', 'engine', 'panel', 'popup']
    .map((n) => fs.readFileSync(path.join(root, 'src', `${n}.js`), 'utf8')).join('\n');
  for (const perm of manifest.permissions || []) {
    assert.match(sources, new RegExp(`chrome\\.${perm}\\b`), `"${perm}" is declared but never used`);
  }
});

test('every icon the manifest promises is on disk and non-empty', () => {
  const declared = { ...(manifest.icons || {}), ...((manifest.action || {}).default_icon || {}) };
  assert.ok(declared['128'], 'the Web Store requires a 128px icon');
  for (const file of new Set(Object.values(declared))) {
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), `${file} is missing`);
    assert.ok(fs.statSync(full).size > 0, `${file} is empty`);
  }
});

test('the extension declares no remote code and stays same-origin', () => {
  // MV3 forbids remote code; reviewers also check the host list is minimal.
  assert.ok(!manifest.content_security_policy, 'no CSP override needed');
  for (const host of manifest.host_permissions) {
    assert.match(host, /^https:\/\/www\.tiktok\.com\//);
  }
});
