'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fromApi, fetchAll } = require('../src/posts.js');
const { fakeSleep, item, pagedList } = require('./helpers.js');

test('fromApi maps counts, date and identity', () => {
  const post = fromApi(item({
    item_id: '7680216047416380704',
    desc: '  #CapCut  ',
    play_count: '1234',
    like_count: '7',
    post_time: '1788189651'
  }), { user: 'someone' });

  assert.equal(post.id, '7680216047416380704');
  assert.equal(post.label, '#CapCut', 'description is trimmed');
  assert.equal(post.views, 1234);
  assert.equal(post.likes, 7);
  assert.equal(post.url, 'https://www.tiktok.com/@someone/video/7680216047416380704');
  assert.equal(post.dateText, new Date(1788189651 * 1000).toISOString().slice(0, 10));
});

test('fromApi keeps ids as strings — they exceed Number.MAX_SAFE_INTEGER', () => {
  const raw = '7680216047416380704';
  const post = fromApi(item({ item_id: raw }));
  assert.equal(typeof post.id, 'string');
  assert.equal(post.id, raw);
  // Going through a float would corrupt it, which is why nothing here parses ids.
  assert.ok(Number(raw) > Number.MAX_SAFE_INTEGER);
  assert.notEqual(String(Number(raw)), raw, 'a float cannot round-trip this id');
});

test('fromApi falls back when a post has no description', () => {
  assert.equal(fromApi(item({ desc: '' })).label, '(no description)');
});

test('fromApi flags visibility 2 as private', () => {
  assert.equal(fromApi(item({ visibility: 2, status: 140 })).private, true);
  assert.equal(fromApi(item({ visibility: 1 })).private, false);
});

test('fetchAll merges both sort orders so private posts are not missed', async () => {
  // Descending hides the private ones; ascending reveals them. This is the real
  // behaviour of TikTok's endpoint and the reason the crawl runs twice.
  const publicPosts = [item({ item_id: '100', post_time: '300' }), item({ item_id: '101', post_time: '200' })];
  const privatePost = item({ item_id: '102', post_time: '100', visibility: 2, status: 140 });

  const listPage = pagedList({
    2: [{ cursor: 0, items: publicPosts, has_more: false, next: 30 }],
    1: [{ cursor: 0, items: [privatePost, ...publicPosts], has_more: false, next: 30 }]
  });

  const all = await fetchAll({ listPage, sleep: fakeSleep(), pauseMs: 0 });

  assert.equal(all.length, 3, 'union of both directions');
  assert.deepEqual(all.map((p) => p.id), ['100', '101', '102'], 'newest first');
  assert.equal(all.filter((p) => p.private).length, 1);
});

test('fetchAll follows the cursor until has_more is false', async () => {
  const page = (ids, cursor, next, more) =>
    ({ cursor, items: ids.map((id) => item({ item_id: String(id), post_time: String(1000 - id) })), has_more: more, next });

  const listPage = pagedList({
    2: [page([1, 2], 0, 2, true), page([3, 4], 2, 4, true), page([5], 4, 5, false)],
    1: [page([1], 0, 1, false)]
  });

  const all = await fetchAll({ listPage, sleep: fakeSleep(), pauseMs: 0 });
  assert.deepEqual(all.map((p) => p.id), ['1', '2', '3', '4', '5']);
});

test('fetchAll deduplicates posts seen in both directions', async () => {
  const shared = [item({ item_id: '1' }), item({ item_id: '2' })];
  const listPage = pagedList({
    2: [{ cursor: 0, items: shared, has_more: false, next: 30 }],
    1: [{ cursor: 0, items: shared, has_more: false, next: 30 }]
  });
  const all = await fetchAll({ listPage, sleep: fakeSleep(), pauseMs: 0 });
  assert.equal(all.length, 2);
});

test('fetchAll stops early when asked', async () => {
  let pages = 0;
  const listPage = async () => {
    pages++;
    return { item_list: [item({ item_id: String(pages) })], has_more: true, cursor: pages, status_code: 0 };
  };
  await fetchAll({ listPage, sleep: fakeSleep(), pauseMs: 0, shouldStop: () => pages >= 2 });
  assert.equal(pages, 2, 'no further pages after the stop flag');
});
