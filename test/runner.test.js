'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRunner } = require('../src/runner.js');
const { fakeSleep } = require('./helpers.js');

const posts = (n) => Array.from({ length: n }, (_, i) => ({ id: String(1000000 + i) }));
const build = (sleep = fakeSleep()) =>
  ({ sleep, runner: createRunner({ sleep, jitter: (ms) => ms }) });

test('deletes in parallel batches of the requested size', async () => {
  const { runner } = build();
  let inFlight = 0, peak = 0;
  const deleteOne = async () => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setImmediate(r));
    inFlight--;
    return 'deleted';
  };

  const { results } = await runner.run(posts(12), { deleteOne, dryRun: false, batchSize: 5, delayMs: 0 });
  assert.equal(results.length, 12);
  assert.equal(peak, 5, 'five requests genuinely overlap');
});

test('progress indices stay sequential despite parallelism', async () => {
  const { runner } = build();
  const seen = [];
  await runner.run(posts(7), {
    deleteOne: async () => 'deleted', dryRun: false, batchSize: 3, delayMs: 0,
    onItem: (i, item) => seen.push([i, item.id])
  });
  assert.deepEqual(seen.map(([i]) => i), [0, 1, 2, 3, 4, 5, 6]);
});

test('batch size is capped so a typo cannot flood the API', async () => {
  const { runner } = build();
  let peak = 0, inFlight = 0;
  const deleteOne = async () => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setImmediate(r));
    inFlight--;
    return 'deleted';
  };
  await runner.run(posts(50), { deleteOne, dryRun: false, batchSize: 999, delayMs: 0 });
  assert.equal(peak, 10, 'clamped to MAX_BATCH');
});

test('a throttled post is retried, not failed', async () => {
  const { runner, sleep } = build();
  const attempts = new Map();
  const deleteOne = async (item) => {
    const n = (attempts.get(item.id) || 0) + 1;
    attempts.set(item.id, n);
    return n === 1 ? 'rate-limited' : 'deleted';
  };

  const { results, remaining } = await runner.run(posts(3), {
    deleteOne, dryRun: false, batchSize: 3, delayMs: 0
  });

  assert.equal(remaining.length, 0);
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.outcome === 'deleted'), 'all eventually succeed');
  assert.deepEqual(sleep.waits, [5000], 'one backoff round');
});

test('throttling halves the batch size', async () => {
  const { runner } = build();
  const sizes = [];
  let round = 0, inFlight = 0, peak = 0;
  const deleteOne = async () => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setImmediate(r));
    inFlight--;
    return round === 0 ? 'rate-limited' : 'deleted';
  };
  const runnerRun = runner.run(posts(8), {
    deleteOne, dryRun: false, batchSize: 8, delayMs: 0,
    log: (m) => { if (/batch (\d+)/.test(m)) sizes.push(Number(RegExp.$1)); round = 1; }
  });
  await runnerRun;
  assert.deepEqual(sizes, [4], 'halved after the throttle');
});

test('an edge block aborts the run and preserves what is left', async () => {
  const { runner, sleep } = build();
  let calls = 0;
  const deleteOne = async () => (++calls <= 2 ? 'deleted' : 'edge-blocked');

  const logs = [];
  const { results, remaining } = await runner.run(posts(10), {
    deleteOne, dryRun: false, batchSize: 2, delayMs: 0, log: (m) => logs.push(m)
  });

  assert.equal(results.length, 2, 'only the successes before the block are reported');
  assert.equal(remaining.length, 8, 'the rest stay queued for a later run');
  assert.ok(logs.some((m) => /edge/i.test(m)));
  assert.deepEqual(sleep.waits, [], 'never sleeps and retries into a ban');
});

test('gives up after exhausting the backoff schedule, losing nothing', async () => {
  const { runner, sleep } = build();
  const logs = [];
  const { results, remaining } = await runner.run(posts(2), {
    deleteOne: async () => 'rate-limited', dryRun: false, batchSize: 2, delayMs: 0,
    log: (m) => logs.push(m)
  });
  // A throttled post is never reported as failed; it stays queued for a re-run.
  assert.equal(results.length, 0);
  assert.equal(remaining.length, 2, 'nothing lost');
  assert.deepEqual(sleep.waits, [5000, 15000, 45000, 90000]);
  assert.ok(logs.some((m) => /still throttled/i.test(m)));
});

test('stops after five failures that are not throttling', async () => {
  const { runner } = build();
  const { results, remaining } = await runner.run(posts(20), {
    deleteOne: async () => 'refused: status_code 9', dryRun: false, batchSize: 5, delayMs: 0
  });
  assert.equal(results.length, 5, 'one batch of five, then stop');
  assert.equal(remaining.length, 15);
});

test('an exception in deleteOne is captured, not thrown', async () => {
  const { runner } = build();
  const { results } = await runner.run(posts(1), {
    deleteOne: async () => { throw new Error('socket died'); }, dryRun: false, batchSize: 1, delayMs: 0
  });
  assert.match(results[0].outcome, /socket died/);
});

test('shouldStop halts between batches and keeps the remainder', async () => {
  const { runner } = build();
  let done = 0;
  const { results, remaining } = await runner.run(posts(10), {
    deleteOne: async () => { done++; return 'deleted'; },
    dryRun: false, batchSize: 2, delayMs: 0,
    shouldStop: () => done >= 4
  });
  assert.equal(results.length, 4);
  assert.equal(remaining.length, 6);
});

test('a dry run reports every post without deleting', async () => {
  const { runner } = build();
  const { results } = await runner.run(posts(6), {
    deleteOne: async (_i, { dryRun }) => (dryRun ? 'dry-run' : 'deleted'),
    dryRun: true, batchSize: 3, delayMs: 0
  });
  assert.equal(results.length, 6);
  assert.ok(results.every((r) => r.outcome === 'dry-run'));
});

test('pauses between batches but not after the last one', async () => {
  const { runner, sleep } = build();
  await runner.run(posts(6), { deleteOne: async () => 'deleted', dryRun: false, batchSize: 2, delayMs: 2000 });
  assert.deepEqual(sleep.waits, [2000, 2000], 'three batches, two gaps');
});
