/* Pure list operations: what the panel shows, and what it exports. */
;(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.TTR = root.TTR || {}).select = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const CSV_COLUMNS = ['id', 'url', 'description', 'posted', 'views', 'likes', 'comments', 'private', 'pinned', 'selected'];

  function searchPosts(posts, query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return posts.slice();
    return posts.filter((p) => p.label.toLowerCase().includes(q));
  }

  function sortPosts(posts, key = 'date', direction = -1) {
    return posts.slice().sort((a, b) => {
      if (key === 'label') return String(a.label).localeCompare(String(b.label)) * direction;
      const x = key === 'date' ? (a.date ? a.date.getTime() : 0) : (a[key] || 0);
      const y = key === 'date' ? (b.date ? b.date.getTime() : 0) : (b[key] || 0);
      return (x - y) * direction;
    });
  }

  /** Posts matching every supplied criterion. No criteria means no matches, not all. */
  function matching(posts, { maxViews, before } = {}) {
    const hasViews = Number.isFinite(maxViews);
    const hasDate = before instanceof Date && !Number.isNaN(before.getTime());
    if (!hasViews && !hasDate) return [];
    return posts.filter((p) => {
      if (hasViews && !(p.views < maxViews)) return false;
      if (hasDate && !(p.date && p.date < before)) return false;
      return true;
    });
  }

  const cell = (value) => `"${String(value).replace(/"/g, '""')}"`;

  function toCsv(posts, selectedIds = new Set()) {
    const rows = [CSV_COLUMNS.map(cell).join(',')];
    for (const p of posts) {
      rows.push([
        p.id, p.url, p.label, p.dateText, p.views, p.likes, p.comments,
        !!p.private, !!p.pinned, selectedIds.has(p.id)
      ].map(cell).join(','));
    }
    return rows.join('\n');
  }

  return { searchPosts, sortPosts, matching, toCsv, CSV_COLUMNS };
});
