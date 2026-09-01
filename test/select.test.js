'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPosts, sortPosts, matching, toCsv } = require('../src/select.js');

const post = (o) => ({
  id: '1', url: 'u', label: 'x', dateText: '2026-01-01', views: 0, likes: 0,
  comments: 0, private: false, pinned: false, date: new Date('2026-01-01'), ...o
});

const sample = [
  post({ id: '1', label: 'holiday clip', views: 1200, date: new Date('2026-08-01'), dateText: '2026-08-01' }),
  post({ id: '2', label: '#CapCut', views: 3, date: new Date('2026-07-01'), dateText: '2026-07-01' }),
  post({ id: '3', label: 'Holiday again', views: 40, date: new Date('2026-09-01'), dateText: '2026-09-01', private: true })
];

test('searchPosts is case-insensitive and matches substrings', () => {
  assert.deepEqual(searchPosts(sample, 'holiday').map((p) => p.id), ['1', '3']);
  assert.deepEqual(searchPosts(sample, 'HOLIDAY').map((p) => p.id), ['1', '3']);
});

test('an empty search returns everything, not nothing', () => {
  assert.equal(searchPosts(sample, '   ').length, 3);
  assert.equal(searchPosts(sample, '').length, 3);
});

test('sortPosts orders by date, views and label in both directions', () => {
  assert.deepEqual(sortPosts(sample, 'date', -1).map((p) => p.id), ['3', '1', '2']);
  assert.deepEqual(sortPosts(sample, 'date', 1).map((p) => p.id), ['2', '1', '3']);
  assert.deepEqual(sortPosts(sample, 'views', -1).map((p) => p.id), ['1', '3', '2']);
  // localeCompare is case-insensitive, so "Holiday again" sorts before "holiday clip".
  assert.deepEqual(sortPosts(sample, 'label', 1).map((p) => p.id), ['2', '3', '1']);
});

test('label sorting ignores case rather than grouping capitals first', () => {
  const byLabel = sortPosts(
    [{ label: 'banana' }, { label: 'Apple' }, { label: 'cherry' }], 'label', 1
  ).map((p) => p.label);
  assert.deepEqual(byLabel, ['Apple', 'banana', 'cherry']);
});

test('sortPosts does not mutate its input', () => {
  const before = sample.map((p) => p.id);
  sortPosts(sample, 'views', 1);
  assert.deepEqual(sample.map((p) => p.id), before);
});

test('matching with no criteria selects nothing', () => {
  // Guards a nasty failure mode: an empty filter silently selecting the account.
  assert.deepEqual(matching(sample, {}), []);
  assert.deepEqual(matching(sample, { maxViews: NaN, before: null }), []);
});

test('matching filters on views and date, and combines them with AND', () => {
  assert.deepEqual(matching(sample, { maxViews: 50 }).map((p) => p.id), ['2', '3']);
  assert.deepEqual(matching(sample, { before: new Date('2026-08-15') }).map((p) => p.id), ['1', '2']);
  assert.deepEqual(matching(sample, { maxViews: 50, before: new Date('2026-08-15') }).map((p) => p.id), ['2']);
});

test('matching treats the view threshold as strictly less than', () => {
  assert.deepEqual(matching(sample, { maxViews: 3 }).map((p) => p.id), []);
  assert.deepEqual(matching(sample, { maxViews: 4 }).map((p) => p.id), ['2']);
});

test('toCsv escapes quotes and marks the selection', () => {
  const rows = toCsv([post({ id: '9', label: 'she said "hi", then left', private: true })], new Set(['9']));
  const [header, row] = rows.split('\n');
  assert.match(header, /^"id","url","description"/);
  assert.match(row, /"she said ""hi"", then left"/, 'quotes doubled, comma safely inside the field');
  assert.match(row, /"true"$/, 'selected flag is last');
});

test('toCsv emits one row per post plus a header', () => {
  assert.equal(toCsv(sample, new Set()).split('\n').length, 4);
});
