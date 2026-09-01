'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { fakeFetch, item } = require('./helpers.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');

/**
 * engine.js is browser glue: it reads the modules off `TTR` and hangs the result
 * on `__TTR__.engine`. Running it in a VM with stub globals checks the wiring
 * composes at all — a broken load order or a renamed export fails only in the
 * browser otherwise.
 */
function loadEngine(fetchImpl, { href = '/@mickael_palma/video/7680216047416380704' } = {}) {
  const context = {
    TTR: {
      lib: require('../src/lib.js'),
      api: require('../src/api.js'),
      posts: require('../src/posts.js'),
      runner: require('../src/runner.js'),
      select: require('../src/select.js')
    },
    fetch: fetchImpl,
    navigator: { language: 'en-GB' },
    document: { querySelector: () => (href ? { getAttribute: () => href } : null) },
    setTimeout,
    clearTimeout,
    console
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  return context.__TTR__.engine;
}

const listReply = (items, more = false) =>
  ({ status: 200, json: { status_code: 0, item_list: items, has_more: more, cursor: 30 } });

test('engine exposes exactly what the panel consumes', () => {
  const engine = loadEngine(fakeFetch(listReply([])));
  for (const key of ['state', 'scan', 'run', 'MAX_BATCH']) {
    assert.ok(key in engine, `panel uses E.${key}`);
  }
  assert.equal(engine.MAX_BATCH, 10);
});

test('scan crawls both orders through the real API layer and records state', async () => {
  const pub = item({ item_id: '100', post_time: '300' });
  const priv = item({ item_id: '101', post_time: '200', visibility: 2, status: 140 });

  // Order 2 sees only the public post; order 1 also sees the private one.
  const fetchImpl = fakeFetch((i, url, opts) => {
    const order = JSON.parse(opts.body).query.sort_orders[0].order;
    return listReply(order === 2 ? [pub] : [pub, priv]);
  });

  const engine = loadEngine(fetchImpl);
  const posts = await engine.scan({});

  assert.equal(posts.length, 2, 'private post recovered by the second crawl');
  assert.equal(engine.state.total, 2);
  assert.equal(posts.filter((p) => p.private).length, 1);
  assert.equal(posts[0].url, 'https://www.tiktok.com/@mickael_palma/video/100',
    'handle scraped from the page is used for links');
});

test('run deletes through the API and reports per post', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0 } });
  const engine = loadEngine(fetchImpl);
  const seen = [];

  const { results } = await engine.run(
    [{ id: '7680216047416380704' }, { id: '7680216047416380705' }],
    { dryRun: false, batchSize: 2, delayMs: 0, onItem: (i, p, o) => seen.push(o) }
  );

  assert.deepEqual(seen, ['deleted', 'deleted']);
  assert.equal(results.length, 2);
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[0].url, /post\/edit\/v1/);
  assert.equal(engine.state.running, false, 'running flag is cleared afterwards');
});

test('a dry run through the engine touches the network zero times', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0 } });
  const engine = loadEngine(fetchImpl);
  await engine.run([{ id: '7680216047416380704' }], { dryRun: true, batchSize: 1, delayMs: 0 });
  assert.equal(fetchImpl.calls.length, 0);
});

test('stopRequested halts a run in progress', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0 } });
  const engine = loadEngine(fetchImpl);
  engine.state.stopRequested = false;
  const items = Array.from({ length: 6 }, (_, i) => ({ id: String(7680216047416380704 + i) }));
  const promise = engine.run(items, {
    dryRun: false, batchSize: 2, delayMs: 0,
    onItem: () => { engine.state.stopRequested = true; }
  });
  const { remaining } = await promise;
  assert.ok(remaining.length > 0, 'the rest stay queued');
});

test('engine copes with a page that has no video links yet', async () => {
  const engine = loadEngine(fakeFetch(listReply([item({ item_id: '1' })])), { href: null });
  const posts = await engine.scan({});
  assert.match(posts[0].url, /@me\/video\/1/, 'falls back rather than throwing');
});
