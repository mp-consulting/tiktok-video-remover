/* Docked side panel: list every post via the API, select, dry-run, delete. */
(() => {
  const NS = (window.__TTR__ = window.__TTR__ || {});
  if (NS.panel) return;
  const U = NS.util, E = NS.engine;

  const STUDIO_URL = 'https://www.tiktok.com/tiktokstudio/content';
  const onStudio = () => /\/tiktokstudio\/(content|post)/.test(location.pathname);
  const WIDTH_KEY = 'ttr:width';

  const selected = new Set();
  let posts = [];       // full catalogue
  let view = [];        // what the list currently shows (filtered + sorted)
  let root = null;
  let sortKey = 'date', sortDir = -1;

  const $ = (sel) => root.querySelector(sel);
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    const { dataset, ...rest } = props;
    Object.assign(n, rest);
    if (dataset) Object.assign(n.dataset, dataset);
    for (const k of [].concat(kids)) n.append(k);
    return n;
  };
  const fmt = (n) => (n == null ? '—' : n.toLocaleString());

  function toggle(id, on) {
    on === undefined ? (selected.has(id) ? selected.delete(id) : selected.add(id))
                     : (on ? selected.add(id) : selected.delete(id));
    const cb = root && root.querySelector(`.ttr-item[data-id="${id}"] input[type="checkbox"]`);
    if (cb) cb.checked = selected.has(id);
    syncCounts();
  }

  /* ------------------------------------------------------------------- build */

  function build() {
    root = el('div', { id: 'ttr-panel' });
    const stored = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10);
    root.style.setProperty('--ttr-w', `${isFinite(stored) ? Math.min(Math.max(stored, 320), 1200) : 480}px`);
    root.innerHTML = `
      <div class="ttr-grip" title="Drag to resize"></div>
      <div class="ttr-head">
        <b>TikTok Bulk Video Remover</b>
        <button data-act="collapse" title="Collapse">⇥</button>
        <button data-act="close" title="Close">✕</button>
      </div>
      <div class="ttr-body">
        <div class="ttr-warn" data-el="place"></div>
        <div class="ttr-row">
          <button class="ttr-btn ttr-primary" data-act="scan">Load all posts</button>
          <span class="ttr-status" data-el="status">Nothing loaded yet.</span>
        </div>
        <input type="search" data-el="search" placeholder="Filter by description…">
        <div class="ttr-row">
          <label>Views under</label><input type="number" data-el="fviews" min="0" placeholder="any">
          <label>Before</label><input type="date" data-el="fdate">
          <button class="ttr-btn" data-act="filter">Select matching</button>
        </div>
        <div class="ttr-row">
          <button class="ttr-btn" data-act="all">Select all shown</button>
          <button class="ttr-btn" data-act="none">Clear</button>
          <button class="ttr-btn" data-act="csv">Export CSV</button>
        </div>
        <div class="ttr-list">
          <div class="ttr-lhead">
            <span></span><span></span>
            <span data-sort="label">Description</span>
            <span data-sort="date">Date</span>
            <span data-sort="views" class="ttr-num">Views</span>
            <span data-sort="likes" class="ttr-num">Likes</span>
            <span></span>
          </div>
          <div data-el="rows"></div>
        </div>
        <div class="ttr-sep"></div>
        <div class="ttr-row">
          <label><input type="checkbox" data-el="dry" checked> Dry run (no deletion)</label>
        </div>
        <div class="ttr-row">
          <label title="Posts deleted in parallel per round">Batch</label>
          <input type="number" data-el="batch" value="3" min="1" max="10" step="1">
          <label title="Pause between rounds">Pause</label>
          <input type="number" data-el="delay" value="2000" min="0" step="250"> ms
        </div>
        <div class="ttr-row">
          <button class="ttr-btn ttr-danger" data-act="start" disabled>Delete selected</button>
          <button class="ttr-btn" data-act="stop" disabled>Stop</button>
          <span class="ttr-status" data-el="progress"></span>
        </div>
        <button class="ttr-btn ttr-danger-alt" data-act="deleteall">Delete everything</button>
        <div class="ttr-log" data-el="log"></div>
      </div>`;
    document.body.append(root);
    root.addEventListener('click', onClick);
    $('[data-el="search"]').addEventListener('input', render);
    $('.ttr-lhead').addEventListener('click', (e) => {
      const key = e.target.dataset && e.target.dataset.sort;
      if (!key) return;
      sortDir = sortKey === key ? -sortDir : (key === 'label' ? 1 : -1);
      sortKey = key;
      render();
    });
    makeResizable();
    updatePlace();
    log('Ready. "Load all posts" pulls your whole catalogue from TikTok\'s own API.');
    log('Deleting calls the API directly — no clicking through the page.');
    log('Dry run is on — nothing is deleted until you turn it off.');
  }

  function makeResizable() {
    const grip = $('.ttr-grip');
    let dragging = false;
    grip.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
    addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = Math.min(Math.max(window.innerWidth - e.clientX, 320), Math.round(window.innerWidth * 0.95));
      root.style.setProperty('--ttr-w', `${w}px`);
    });
    addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      try { localStorage.setItem(WIDTH_KEY, parseInt(root.style.getPropertyValue('--ttr-w'), 10)); } catch (_) {}
    });
  }

  function updatePlace() {
    const box = $('[data-el="place"]');
    if (onStudio()) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.textContent = 'Works from any tiktok.com tab while you are logged in. ';
    box.append(el('a', { href: STUDIO_URL, textContent: 'Open Studio →', style: 'color:#f0c987' }));
  }

  /* ------------------------------------------------------------------ render */

  function visible() {
    const q = ($('[data-el="search"]').value || '').toLowerCase().trim();
    let out = q ? posts.filter((p) => p.label.toLowerCase().includes(q)) : posts.slice();
    out.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (sortKey === 'label') return String(x).localeCompare(String(y)) * sortDir;
      return ((x || 0) - (y || 0)) * sortDir;
    });
    return out;
  }

  function render() {
    view = visible();
    const rows = $('[data-el="rows"]');
    rows.textContent = '';
    for (const p of view) {
      const item = el('div', { className: 'ttr-item', dataset: { id: p.id } });
      const cb = el('input', { type: 'checkbox', checked: selected.has(p.id) });
      cb.addEventListener('change', () => toggle(p.id, cb.checked));
      item.append(cb);
      if (p.thumb) {
        const img = el('img', { src: p.thumb, loading: 'lazy', alt: '' });
        img.addEventListener('error', () => img.replaceWith(el('div', { className: 'ttr-thumb' })), { once: true });
        item.append(img);
      } else {
        item.append(el('div', { className: 'ttr-thumb' }));
      }
      const title = el('div', { className: 'ttr-title' });
      title.append(el('a', { href: p.url, target: '_blank', rel: 'noreferrer',
        textContent: p.label, title: p.label }));
      if (p.pinned) title.append(el('span', { className: 'ttr-pin', textContent: ' 📌' }));
      if (p.private) title.append(el('span', { className: 'ttr-priv', textContent: ' private' }));
      item.append(title);
      item.append(el('div', { className: 'ttr-status', textContent: p.dateText || '—' }));
      item.append(el('div', { className: 'ttr-num', textContent: fmt(p.views) }));
      item.append(el('div', { className: 'ttr-num', textContent: fmt(p.likes) }));
      item.append(el('span', { className: 'ttr-out', dataset: { el: 'out' } }));
      rows.append(item);
    }
    syncCounts();
  }

  function syncCounts() {
    if (!root) return;
    const shown = view.length === posts.length ? `${posts.length}` : `${view.length} of ${posts.length}`;
    $('[data-el="status"]').textContent = `${shown} posts · ${selected.size} selected`;
    $('[data-act="start"]').disabled = selected.size === 0 || E.state.running;
  }

  function log(msg) {
    const box = $('[data-el="log"]');
    box.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    box.scrollTop = box.scrollHeight;
  }

  /* ----------------------------------------------------------------- actions */

  async function doScan(quiet = false) {
    if (!quiet) log('Loading your posts…');
    try {
      posts = await E.scan({ log, onProgress: (n) => { $('[data-el="status"]').textContent = `Loading… ${n} posts`; } });
    } catch (e) {
      log(`Load failed: ${e.message}`);
      return null;
    }
    render();
    if (!quiet) {
      log(`Loaded ${posts.length} posts from TikTok's list API.`);
      if (!posts.length) log('Nothing found. Are you logged in on tiktok.com?');
    }
    return posts;
  }

  function selectAll(on) {
    if (on) view.forEach((p) => selected.add(p.id)); else selected.clear();
    render();
  }

  function applyFilter() {
    const maxViews = parseInt($('[data-el="fviews"]').value, 10);
    const before = $('[data-el="fdate"]').value ? new Date($('[data-el="fdate"]').value) : null;
    if (!isFinite(maxViews) && !before) { log('Set a view threshold or a date first.'); return; }
    selected.clear();
    for (const p of view) {
      if (isFinite(maxViews) && !(p.views < maxViews)) continue;
      if (before && !(p.date && p.date < before)) continue;
      selected.add(p.id);
    }
    render();
    log(`Selected ${selected.size} of ${view.length} shown posts.`);
  }

  function exportCsv() {
    const rows = [['id', 'url', 'description', 'posted', 'views', 'likes', 'comments', 'pinned', 'selected']];
    for (const p of posts) {
      rows.push([p.id, p.url, p.label, p.dateText, p.views, p.likes, p.comments, p.pinned, selected.has(p.id)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `tiktok-posts-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    log(`Exported ${posts.length} posts to CSV.`);
  }

  const settings = () => ({
    dry: $('[data-el="dry"]').checked,
    delayMs: Math.max(0, parseInt($('[data-el="delay"]').value, 10) || 2000),
    batchSize: Math.min(Math.max(1, parseInt($('[data-el="batch"]').value, 10) || 1), E.MAX_BATCH)
  });

  function busy(on) {
    for (const act of ['scan', 'all', 'none', 'filter', 'csv', 'deleteall']) $(`[data-act="${act}"]`).disabled = on;
    for (const el of ['batch', 'delay']) $(`[data-el="${el}"]`).disabled = on;
    $('[data-act="stop"]').disabled = !on;
    $('[data-act="start"]').disabled = on || selected.size === 0;
  }

  async function runQueue(queue, { dry, delayMs, batchSize, prefix = '' }) {
    const rounds = Math.ceil(queue.length / batchSize);
    const eta = Math.round((rounds * delayMs) / 1000);
    log(`${dry ? 'Dry run' : 'DELETING'} — ${queue.length} posts, ${batchSize} at a time, ` +
        `${rounds} round${rounds === 1 ? '' : 's'}, ~${eta}s.`);
    const results = await E.run(queue, {
      dryRun: dry, delayMs, batchSize, log,
      onItem: (i, post, outcome) => {
        const node = root.querySelector(`.ttr-item[data-id="${post.id}"]`);
        if (node) {
          node.classList.add('ttr-done');
          const out = node.querySelector('[data-el="out"]');
          const good = outcome === 'deleted' || outcome === 'dry-run';
          out.className = `ttr-out ${good ? 'ttr-ok' : 'ttr-err'}`;
          out.textContent = outcome === 'dry-run' ? 'ok (dry)'
            : outcome === 'deleted' ? 'deleted'
            : outcome === 'rate-limited' ? 'throttled'
            : outcome === 'edge-blocked' ? 'blocked' : 'failed';
          out.title = outcome;
        }
        if (outcome === 'deleted') {
          selected.delete(post.id);
          posts = posts.filter((p) => p.id !== post.id);
        }
        $('[data-el="progress"]').textContent = `${prefix}${i + 1}/${queue.length}`;
        log(`${post.id}: ${outcome}`);
      }
    });
    const failed = results.filter((r) => r.outcome !== 'deleted' && r.outcome !== 'dry-run');
    log(`${prefix}Finished: ${results.length - failed.length} ok, ${failed.length} failed.`);
    return results;
  }

  async function start() {
    const { dry, delayMs, batchSize } = settings();
    const queue = posts.filter((p) => selected.has(p.id));
    if (!dry && !confirm(
      `Delete ${queue.length} TikTok post(s)?\n\n` +
      `TikTok keeps deleted posts for 30 days — you can restore them from\n` +
      `Activity centre > Recently deleted. After that they are gone for good.`
    )) { log('Cancelled.'); return; }

    const rate = batchSize / Math.max(delayMs / 1000, 0.001);
    if (!dry && rate > 5) {
      log(`Warning: ${batchSize} at a time every ${delayMs}ms is ~${Math.round(rate)} deletes/sec.`);
      log('Around 24/sec got this browser blocked by TikTok\'s edge for the whole site.');
    }

    busy(true);
    E.state.stopRequested = false;
    await runQueue(queue, { dry, delayMs, batchSize });
    if (dry) log('That was a dry run. Uncheck "Dry run" to delete for real.');
    busy(false);
    render();
  }

  async function deleteAll() {
    const { dry, delayMs, batchSize } = settings();
    if (!posts.length) { log('Load your posts first.'); return; }
    if (!dry) {
      const typed = prompt(
        `This deletes all ${posts.length} posts on your account.\n\n` +
        'TikTok keeps them for 30 days (Activity centre > Recently deleted); after that they are gone.\n\n' +
        'Type  DELETE  to confirm:'
      );
      if ((typed || '').trim().toUpperCase() !== 'DELETE') { log('Cancelled — nothing deleted.'); return; }
    }

    busy(true);
    E.state.stopRequested = false;
    selected.clear();
    posts.forEach((p) => selected.add(p.id));
    render();

    const results = await runQueue(posts.slice(), { dry, delayMs, batchSize });
    if (dry) {
      log('Dry run: nothing was deleted. Uncheck "Dry run" to delete for real.');
    } else if (!E.state.stopRequested) {
      log('Re-checking with the API…');
      const before = posts.length;
      const reloaded = await doScan(true);
      if (reloaded === null) {
        log(`Could not re-check (TikTok is still throttling). ${before} were left unconfirmed — press "Load all posts" in a minute.`);
      } else {
        log(posts.length ? `${posts.length} posts still remain — run again to finish them.`
                         : 'Account is empty: every post was deleted.');
      }
    }
    busy(false);
    render();
  }

  function onClick(e) {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'collapse') root.classList.toggle('ttr-collapsed');
    else if (act === 'close') closePanel();
    else if (act === 'scan') doScan();
    else if (act === 'all') selectAll(true);
    else if (act === 'none') selectAll(false);
    else if (act === 'filter') applyFilter();
    else if (act === 'csv') exportCsv();
    else if (act === 'start') start();
    else if (act === 'deleteall') deleteAll();
    else if (act === 'stop') { E.state.stopRequested = true; log('Stopping after the current post…'); }
  }

  /* -------------------------------------------------------------- open/close */

  function closePanel() {
    if (root) root.remove();
    root = null;
  }

  function open() {
    if (root && root.isConnected) { root.classList.remove('ttr-collapsed'); return; }
    build();
    if (posts.length) render();
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _s, reply) => {
      if (msg && msg.type === 'ttr:toggle') {
        root && root.isConnected ? closePanel() : open();
        reply({ ok: true });
      }
      return true;
    });
  } catch (e) {
    console.warn('[TTR] no extension messaging in this context:', e.message);
  }

  NS.panel = { open };
  if (onStudio()) open();
})();
