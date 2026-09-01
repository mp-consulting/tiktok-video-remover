'use strict';

/** A fetch stand-in driven by a list of canned responses or a handler function. */
function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    const spec = typeof handler === 'function' ? await handler(calls.length - 1, url, opts) : handler;
    const {
      status = 200,
      json = null,
      text = json === null ? '' : JSON.stringify(json),
      contentType = json === null ? 'text/html' : 'application/json'
    } = spec;
    return {
      status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
      json: async () => JSON.parse(text),
      text: async () => text
    };
  };
  impl.calls = calls;
  return impl;
}

/** Records sleeps instead of performing them, so tests stay instant. */
function fakeSleep() {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  sleep.waits = waits;
  return sleep;
}

/** Build an API list item with sensible defaults. */
function item(overrides = {}) {
  return {
    item_id: '7680000000000000001',
    desc: '',
    post_time: '1788189651',
    create_time: '1788189651',
    play_count: '0',
    like_count: '0',
    comment_count: '0',
    share_count: '0',
    cover_url: ['https://example.invalid/cover.jpg'],
    is_pinned: false,
    visibility: 1,
    status: 102,
    ...overrides
  };
}

/** A listPage stub returning fixed pages per sort order. */
function pagedList(pagesByOrder) {
  return async ({ cursor = 0, order = 2 }) => {
    const pages = pagesByOrder[order] || [];
    const index = pages.findIndex((p) => p.cursor === cursor);
    const page = index >= 0 ? pages[index] : { items: [], has_more: false, next: cursor };
    return { item_list: page.items, has_more: page.has_more, cursor: page.next, status_code: 0 };
  };
}

module.exports = { fakeFetch, fakeSleep, item, pagedList };
