/* Mapping raw API items to posts, and crawling the full catalogue. */
;(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.TTR = root.TTR || {}).posts = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const ORIGIN = 'https://www.tiktok.com';
  const PRIVATE_VISIBILITY = 2;

  const toInt = (value) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  };

  /** One API item -> the shape the panel renders. */
  function fromApi(item, { user, origin = ORIGIN } = {}) {
    const seconds = parseInt(item.post_time || item.create_time, 10);
    const date = Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
    return {
      id: String(item.item_id),
      url: `${origin}/@${user || 'me'}/video/${item.item_id}`,
      thumb: (item.cover_url || [])[0] || '',
      label: (item.desc || '').trim() || '(no description)',
      views: toInt(item.play_count),
      likes: toInt(item.like_count),
      comments: toInt(item.comment_count),
      shares: toInt(item.share_count),
      date,
      dateText: date ? date.toISOString().slice(0, 10) : '',
      pinned: !!item.is_pinned,
      visibility: item.visibility,
      status: item.status,
      private: item.visibility === PRIVATE_VISIBILITY
    };
  }

  const newestFirst = (a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);

  /**
   * Every post on the account, newest first.
   *
   * Crawled in BOTH sort directions and merged, which is not belt-and-braces:
   * sorting by post_time descending silently omits private posts (status 140 /
   * visibility 2). On the account this was built against that was 158 of 190.
   * Crawl one direction only and the tool reports "everything deleted" with a
   * third of the account still live.
   */
  async function fetchAll({
    listPage,
    sleep,
    onProgress = () => {},
    shouldStop = () => false,
    user,
    pageSize = 30,
    pauseMs = 150,
    maxPages = 500
  }) {
    const byId = new Map();

    const crawl = async (order) => {
      let cursor = 0;
      for (let page = 0; page < maxPages; page++) {
        const json = await listPage({ cursor, size: pageSize, order });
        for (const item of json.item_list || []) {
          const post = fromApi(item, { user });
          byId.set(post.id, post);
        }
        onProgress(byId.size);
        if (!json.has_more || shouldStop()) return;
        cursor = json.cursor;
        if (pauseMs) await sleep(pauseMs);
      }
    };

    await crawl(2);
    if (!shouldStop()) await crawl(1);

    return Array.from(byId.values()).sort(newestFirst);
  }

  return { fromApi, fetchAll, newestFirst, PRIVATE_VISIBILITY };
});
