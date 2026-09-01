/*
 * Talks to TikTok Studio's own endpoints directly — no clicking through the UI.
 *
 *   list    POST /tiktok/creator/manage/item_list/v1/
 *           {cursor, size, query:{conditions:[], sort_orders:[{field_name:'post_time', order:2}]}}
 *   delete  POST /tiktok/post/edit/v1/
 *           {aweme_id, scene:1, delete:{delete_type:1}}
 *
 * Both accept plain cookie auth: no msToken, no X-Bogus, no X-Gnarly. (The page's
 * own requests carry those because TikTok's msSDK patches window.fetch/XHR, but the
 * server does not require them, and a content script's isolated world never sees
 * that patch anyway.)
 *
 * Note /tiktok/creator/item/delete/v1/ also exists in their bundle but is dead —
 * the UI's delete button posts to /tiktok/post/edit/v1/.
 */
(() => {
  const NS = (window.__TTR__ = window.__TTR__ || {});
  if (NS.engine) return;
  const U = NS.util;

  const ORIGIN = 'https://www.tiktok.com';
  const LIST_PATH = '/tiktok/creator/manage/item_list/v1/';
  const EDIT_PATH = '/tiktok/post/edit/v1/';
  const VIDEO_HREF = /\/video\/(\d{6,})/;
  const MAX_BATCH = 10;   // 10 parallel deletes returned cleanly; higher is untested
  const BACKOFF_MS = [5000, 15000, 45000, 90000];

  const state = {
    posts: [],
    cache: new Map(),
    running: false,
    stopRequested: false,
    total: null,
    user: null
  };

  const qs = () => new URLSearchParams({
    aid: '1988',
    app_name: 'tiktok_creator_center',
    device_platform: 'web_pc',
    channel: 'tiktok_web',
    locale: (navigator.language || 'en-GB')
  }).toString();

  async function post(path, body) {
    const res = await fetch(`${ORIGIN}${path}?${qs()}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    // Sustained deleting earns a 403 from the edge — this is throttling, not a
    // dead session. Measured: ~168 deletes in 7s at batch 10 tripped it.
    if (res.status === 403 || res.status === 429) {
      // Two different things return 403: TikTok's API throttle, and Akamai's WAF
      // blocking the whole site after a burst. The second is far more serious —
      // it locks you out of tiktok.com in the browser too.
      let body = '';
      try { body = (await res.text()).slice(0, 400); } catch (_) {}
      const edge = /Access Denied|edgesuite|Reference #/i.test(body);
      const err = new Error(edge
        ? 'blocked at the edge (Akamai) — too many requests too fast'
        : `throttled by TikTok (HTTP ${res.status})`);
      err.rateLimited = true;
      err.edgeBlocked = edge;
      throw err;
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) {
      // TikTok serves the SPA shell when a route does not match, or when the
      // session is gone.
      throw new Error(`unexpected non-JSON reply (HTTP ${res.status}) — session may have expired`);
    }
    return res.json();
  }

  /** Retry a call through throttling, backing off further each time. */
  async function withBackoff(fn, { log = () => {}, label = 'request' } = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!err.rateLimited || attempt >= BACKOFF_MS.length || state.stopRequested) throw err;
        const wait = BACKOFF_MS[attempt];
        log(`Throttled on ${label} — waiting ${Math.round(wait / 1000)}s before retrying.`);
        await U.sleep(wait);
      }
    }
  }

  /* -------------------------------------------------------------------- read */

  /** The signed-in handle, so exported links point somewhere real. */
  function handle() {
    if (state.user) return state.user;
    const a = document.querySelector('a[href*="/video/"]');
    const m = a && (a.getAttribute('href') || '').match(/\/@([^/]+)\/video\//);
    if (m) state.user = m[1];
    return state.user;
  }

  function fromApi(it) {
    const secs = parseInt(it.post_time || it.create_time, 10);
    const date = isFinite(secs) ? new Date(secs * 1000) : null;
    const num = (v) => { const n = parseInt(v, 10); return isFinite(n) ? n : 0; };
    return {
      id: String(it.item_id),
      url: `${ORIGIN}/@${handle() || 'me'}/video/${it.item_id}`,
      thumb: (it.cover_url || [])[0] || '',
      label: (it.desc || '').trim() || '(no description)',
      views: num(it.play_count),
      likes: num(it.like_count),
      comments: num(it.comment_count),
      shares: num(it.share_count),
      date,
      dateText: date ? date.toISOString().slice(0, 10) : '',
      pinned: !!it.is_pinned,
      visibility: it.visibility,
      status: it.status,
      private: it.visibility === 2
    };
  }

  async function listPage(cursor = 0, size = 30, order = 2, log) {
    const json = await withBackoff(() => post(LIST_PATH, {
      cursor, size,
      query: { conditions: [], sort_orders: [{ field_name: 'post_time', order }] }
    }), { log: log || (() => {}), label: 'loading posts' });
    if (json.status_code !== 0) {
      throw new Error(json.status_msg || `list failed (status_code ${json.status_code})`);
    }
    return json;
  }

  /**
   * Every post on the account, newest first.
   *
   * Crawled in BOTH sort directions and merged, which is not paranoia: sorting by
   * post_time descending silently omits private posts (status 140 / visibility 2)
   * — on this account 158 of 190. Ascending returns them. Miss that and the tool
   * cheerfully reports "everything deleted" while a third of the account remains.
   */
  async function fetchAll({ onProgress, log } = {}) {
    const byId = new Map();

    const crawl = async (order) => {
      let cursor = 0;
      for (let page = 0; page < 500; page++) {
        const json = await listPage(cursor, 30, order, onProgress && log);
        for (const it of json.item_list || []) {
          const p = fromApi(it);
          byId.set(p.id, p);
          state.cache.set(p.id, p);
        }
        onProgress && onProgress(byId.size);
        if (!json.has_more || state.stopRequested) break;
        cursor = json.cursor;
        await U.sleep(150);
      }
    };

    await crawl(2);
    if (!state.stopRequested) await crawl(1);

    const all = Array.from(byId.values())
      .sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
    state.posts = all;
    state.total = all.length;
    return all;
  }

  const scan = (opts) => fetchAll(opts);

  /* ------------------------------------------------------------------ delete */

  /** Returns 'deleted' | 'dry-run' | an error string. */
  async function deleteOne(item, { dryRun = true } = {}) {
    const id = String(item && item.id ? item.id : item);
    if (!/^\d{6,}$/.test(id)) return `not a valid post id: ${id}`;
    if (dryRun) return 'dry-run';
    let json;
    try {
      json = await post(EDIT_PATH, { aweme_id: id, scene: 1, delete: { delete_type: 1 } });
    } catch (e) {
      if (e.edgeBlocked) return 'edge-blocked';
      if (e.rateLimited) return 'rate-limited';
      return `request failed: ${e.message}`;
    }
    if (json.status_code === 0) {
      state.cache.delete(id);
      return 'deleted';
    }
    if (json.status_code === 2053) return 'post not found (already deleted?)';
    return `refused: status_code ${json.status_code}${json.status_msg ? ' — ' + json.status_msg : ''}`;
  }

  /**
   * Work through a queue, deleting `batchSize` posts concurrently per round and
   * pausing between rounds. There is no bulk endpoint — TikTok's own client
   * deletes one post per request — so a batch is just parallel calls.
   *
   * Throttling (HTTP 403) is expected on a large run rather than exceptional:
   * ~168 deletes in 7 seconds at batch 10 tripped it. A throttled post is put
   * back on the queue, not failed — the run backs off, halves the batch size,
   * and carries on. Only a post that survives every backoff is a real failure.
   */
  async function run(posts, opts) {
    const { dryRun, delayMs, batchSize = 1, onItem, log } = opts;
    state.running = true;
    state.stopRequested = false;

    let size = Math.min(Math.max(1, Math.floor(batchSize) || 1), MAX_BATCH);
    const pending = posts.slice();
    const attempts = new Map();
    const results = [];
    let index = 0;
    let hardFailures = 0;
    let throttleRound = 0;
    let edgeBlocked = false;

    while (pending.length) {
      if (state.stopRequested) { log(`Stopped with ${pending.length} of ${posts.length} left.`); break; }

      const chunk = pending.splice(0, size);
      const settled = await Promise.all(chunk.map(async (item) => {
        try { return await deleteOne(item, { dryRun }); }
        catch (err) { return `error: ${err && err.message ? err.message : err}`; }
      }));

      const retry = [];
      for (let k = 0; k < chunk.length; k++) {
        const item = chunk[k];
        const outcome = settled[k];
        const id = String(item.id || item);

        if (outcome === 'edge-blocked') { edgeBlocked = true; retry.push(item); continue; }
        if (outcome === 'rate-limited') {
          const n = (attempts.get(id) || 0) + 1;
          attempts.set(id, n);
          if (n <= BACKOFF_MS.length) { retry.push(item); continue; }
        }
        results.push({ post: item, outcome });
        onItem(index++, item, outcome);
        if (outcome !== 'deleted' && outcome !== 'dry-run') hardFailures++;
      }

      if (edgeBlocked) {
        pending.unshift(...retry);
        log('STOPPED — TikTok blocked this browser at the edge (Akamai), not just the API.');
        log(`Wait 15–60 minutes, confirm tiktok.com loads normally, then re-run. ${pending.length} left.`);
        break;
      }

      if (retry.length) {
        pending.unshift(...retry);
        if (throttleRound >= BACKOFF_MS.length) {
          log(`STOPPED — still throttled after backing off. Wait a few minutes and re-run. ${pending.length} left.`);
          break;
        }
        const wait = BACKOFF_MS[Math.min(throttleRound, BACKOFF_MS.length - 1)];
        throttleRound++;
        if (size > 1) {
          size = Math.max(1, Math.floor(size / 2));
          log(`Throttled — backing off ${Math.round(wait / 1000)}s and dropping to batch ${size}.`);
        } else {
          log(`Throttled — backing off ${Math.round(wait / 1000)}s.`);
        }
        await U.sleep(wait);
        continue;
      }

      if (hardFailures >= 5) {
        log(`Five failures that were not throttling — stopping with ${pending.length} left.`);
        break;
      }
      if (delayMs > 0 && pending.length) await U.sleep(U.jitter(delayMs));
    }

    state.running = false;
    return results;
  }

  /* ---------------------------------------- small DOM helpers for the overlay */

  function postIdFrom(a) {
    const m = (a.getAttribute('href') || '').match(VIDEO_HREF);
    return m ? m[1] : null;
  }

  /** The element representing a whole post row, for drawing a checkbox on it. */
  function rowFor(anchor) {
    let cur = anchor;
    for (let i = 0; i < 15 && cur.parentElement; i++) {
      const p = cur.parentElement;
      if (p === document.body) break;
      const ids = new Set(Array.from(p.querySelectorAll('a[href*="/video/"]')).map(postIdFrom).filter(Boolean));
      if (ids.size > 1) return cur;
      cur = p;
    }
    return cur;
  }

  NS.engine = { state, MAX_BATCH, scan, fetchAll, listPage, deleteOne, run, rowFor, postIdFrom, handle };
})();
