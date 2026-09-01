'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi, throttleError, deleteOutcome } = require('../src/api.js');
const { fakeFetch, fakeSleep } = require('./helpers.js');

const build = (handler, sleep = fakeSleep()) =>
  ({ api: createApi({ fetch: fakeFetch(handler), sleep }), sleep });

test('throttleError tells an edge block apart from an API throttle', () => {
  const plain = throttleError(403, '{"status_code":1}');
  assert.equal(plain.rateLimited, true);
  assert.equal(plain.edgeBlocked, false);

  // Verbatim shape of the Akamai page that locked the browser out of tiktok.com.
  const edge = throttleError(403, 'Access Denied\nYou don\'t have permission to access ...\nReference #18.88263017');
  assert.equal(edge.rateLimited, true);
  assert.equal(edge.edgeBlocked, true);
  assert.match(edge.message, /edge/i);
});

test('deleteOutcome maps the status codes we have actually seen', () => {
  assert.equal(deleteOutcome({ status_code: 0 }), 'deleted');
  assert.match(deleteOutcome({ status_code: 2053 }), /not found/);
  assert.match(deleteOutcome({ status_code: 7, status_msg: 'nope' }), /refused: status_code 7 — nope/);
});

test('deleteOne posts the shape TikTok expects', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0 } });
  const api = createApi({ fetch: fetchImpl, sleep: fakeSleep() });

  assert.equal(await api.deleteOne({ id: '7680216047416380704' }, { dryRun: false }), 'deleted');
  const call = fetchImpl.calls[0];
  assert.match(call.url, /\/tiktok\/post\/edit\/v1\//, 'the live delete endpoint, not item/delete');
  assert.deepEqual(call.body, { aweme_id: '7680216047416380704', scene: 1, delete: { delete_type: 1 } });
  assert.equal(call.opts.credentials, 'include');
});

test('deleteOne in dry run sends nothing at all', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0 } });
  const api = createApi({ fetch: fetchImpl, sleep: fakeSleep() });
  assert.equal(await api.deleteOne({ id: '7680216047416380704' }, { dryRun: true }), 'dry-run');
  assert.equal(fetchImpl.calls.length, 0, 'a dry run must never reach the network');
});

test('deleteOne rejects a malformed id before sending', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0 } });
  const api = createApi({ fetch: fetchImpl, sleep: fakeSleep() });
  assert.match(await api.deleteOne({ id: 'nope' }, { dryRun: false }), /not a valid post id/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('deleteOne reports throttling and edge blocks distinctly', async () => {
  const throttled = createApi({ fetch: fakeFetch({ status: 403, text: 'slow down', contentType: 'text/plain' }), sleep: fakeSleep() });
  assert.equal(await throttled.deleteOne({ id: '123456' }, { dryRun: false }), 'rate-limited');

  const blocked = createApi({ fetch: fakeFetch({ status: 403, text: 'Access Denied Reference #18.1', contentType: 'text/html' }), sleep: fakeSleep() });
  assert.equal(await blocked.deleteOne({ id: '123456' }, { dryRun: false }), 'edge-blocked');
});

test('a non-JSON 200 reads as a dead session, not as throttling', async () => {
  const api = createApi({ fetch: fakeFetch({ status: 200, text: '<!doctype html>', contentType: 'text/html' }), sleep: fakeSleep() });
  const outcome = await api.deleteOne({ id: '123456' }, { dryRun: false });
  assert.match(outcome, /session may have expired/);
  assert.doesNotMatch(outcome, /logged in\?/, 'the old wording blamed login for what was throttling');
});

test('withBackoff retries a throttle on the documented schedule', async () => {
  const sleep = fakeSleep();
  let attempts = 0;
  const api = createApi({ fetch: fakeFetch({ status: 200, json: { status_code: 0 } }), sleep });

  const value = await api.withBackoff(async () => {
    if (++attempts <= 2) throw throttleError(403, '');
    return 'done';
  });

  assert.equal(value, 'done');
  assert.equal(attempts, 3);
  assert.deepEqual(sleep.waits, [5000, 15000], 'backs off further each attempt');
});

test('withBackoff never retries an edge block', async () => {
  const sleep = fakeSleep();
  const api = createApi({ fetch: fakeFetch({ status: 200, json: {} }), sleep });
  let attempts = 0;

  await assert.rejects(
    () => api.withBackoff(async () => { attempts++; throw throttleError(403, 'Access Denied'); }),
    /edge/i
  );
  assert.equal(attempts, 1, 'retrying an edge block extends the ban');
  assert.deepEqual(sleep.waits, []);
});

test('listPage raises a non-zero status_code instead of returning junk', async () => {
  const api = createApi({ fetch: fakeFetch({ status: 200, json: { status_code: 5, status_msg: 'bad' } }), sleep: fakeSleep() });
  await assert.rejects(() => api.listPage(), /bad/);
});

test('listPage asks for both sort orders correctly', async () => {
  const fetchImpl = fakeFetch({ status: 200, json: { status_code: 0, item_list: [], has_more: false } });
  const api = createApi({ fetch: fetchImpl, sleep: fakeSleep() });
  await api.listPage({ cursor: 30, size: 30, order: 1 });
  assert.deepEqual(fetchImpl.calls[0].body, {
    cursor: 30, size: 30,
    query: { conditions: [], sort_orders: [{ field_name: 'post_time', order: 1 }] }
  });
});
