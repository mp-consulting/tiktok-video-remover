/*
 * TikTok Studio's own endpoints. Both take plain cookie auth — no msToken,
 * X-Bogus or X-Gnarly. See README for why signing is not needed.
 */
;(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.TTR = root.TTR || {}).api = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const ORIGIN = 'https://www.tiktok.com';
  const LIST_PATH = '/tiktok/creator/manage/item_list/v1/';
  const EDIT_PATH = '/tiktok/post/edit/v1/';
  const BACKOFF_MS = [5000, 15000, 45000, 90000];
  const PAGE_SIZE = 30;

  /* A WAF block says so in the body; a plain throttle does not. */
  const EDGE_MARKERS = /Access Denied|edgesuite|Reference #/i;

  /**
   * Turn a 403/429 into a typed error. An edge block is far more serious than an
   * API throttle: it locks the whole of tiktok.com for the browser, and further
   * requests extend it.
   */
  function throttleError(status, body) {
    const edge = EDGE_MARKERS.test(body || '');
    const err = new Error(edge
      ? 'blocked at the edge (Akamai) — too many requests too fast'
      : `throttled by TikTok (HTTP ${status})`);
    err.rateLimited = true;
    err.edgeBlocked = edge;
    return err;
  }

  /** Map a delete response onto an outcome string. */
  function deleteOutcome(json) {
    if (!json) return 'refused: empty response';
    if (json.status_code === 0) return 'deleted';
    if (json.status_code === 2053) return 'post not found (already deleted?)';
    return `refused: status_code ${json.status_code}` +
      (json.status_msg ? ` — ${json.status_msg}` : '');
  }

  function createApi({
    fetch: fetchImpl,
    sleep,
    origin = ORIGIN,
    language = 'en-GB',
    backoffs = BACKOFF_MS
  }) {
    const query = () => new URLSearchParams({
      aid: '1988',
      app_name: 'tiktok_creator_center',
      device_platform: 'web_pc',
      channel: 'tiktok_web',
      locale: language
    }).toString();

    async function post(path, body) {
      const res = await fetchImpl(`${origin}${path}?${query()}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 403 || res.status === 429) {
        let text = '';
        try { text = (await res.text()).slice(0, 400); } catch (_) { /* body may be unreadable */ }
        throw throttleError(res.status, text);
      }

      const type = (res.headers && res.headers.get('content-type')) || '';
      if (!type.includes('json')) {
        // TikTok serves the SPA shell for an unmatched route or a dead session.
        throw new Error(`unexpected non-JSON reply (HTTP ${res.status}) — session may have expired`);
      }
      return res.json();
    }

    /** Retry through throttling, waiting longer each time. Never retries an edge block. */
    async function withBackoff(fn, { log = () => {}, label = 'request', shouldStop = () => false } = {}) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          const retryable = err.rateLimited && !err.edgeBlocked;
          if (!retryable || attempt >= backoffs.length || shouldStop()) throw err;
          const wait = backoffs[attempt];
          log(`Throttled on ${label} — waiting ${Math.round(wait / 1000)}s before retrying.`);
          await sleep(wait);
        }
      }
    }

    async function listPage({ cursor = 0, size = PAGE_SIZE, order = 2 } = {}) {
      const json = await post(LIST_PATH, {
        cursor,
        size,
        query: { conditions: [], sort_orders: [{ field_name: 'post_time', order }] }
      });
      if (json.status_code !== 0) {
        throw new Error(json.status_msg || `list failed (status_code ${json.status_code})`);
      }
      return json;
    }

    /** Returns 'deleted' | 'dry-run' | 'rate-limited' | 'edge-blocked' | an error string. */
    async function deleteOne(item, { dryRun = true } = {}) {
      const id = String(item && item.id ? item.id : item);
      if (!/^\d{6,}$/.test(id)) return `not a valid post id: ${id}`;
      if (dryRun) return 'dry-run';
      try {
        return deleteOutcome(await post(EDIT_PATH, {
          aweme_id: id, scene: 1, delete: { delete_type: 1 }
        }));
      } catch (err) {
        if (err.edgeBlocked) return 'edge-blocked';
        if (err.rateLimited) return 'rate-limited';
        return `request failed: ${err.message}`;
      }
    }

    return { post, listPage, deleteOne, withBackoff };
  }

  return { createApi, throttleError, deleteOutcome, ORIGIN, LIST_PATH, EDIT_PATH, BACKOFF_MS, PAGE_SIZE };
});
