/*
 * Browser wiring: builds the API client and the queue runner from the modules
 * loaded before this one, and exposes the surface the panel uses.
 *
 * All the logic lives in api.js / posts.js / runner.js / select.js so it can be
 * tested under Node without a browser. This file is only glue.
 */
;(function (global) {
  'use strict';
  const NS = (global.__TTR__ = global.__TTR__ || {});
  if (NS.engine) return;

  const { lib, api: apiModule, posts: postsModule, runner: runnerModule } = global.TTR;

  const state = {
    posts: [],
    running: false,
    stopRequested: false,
    total: null,
    user: null
  };

  const shouldStop = () => state.stopRequested;

  const api = apiModule.createApi({
    fetch: (...args) => global.fetch(...args),
    sleep: lib.sleep,
    language: (global.navigator && global.navigator.language) || 'en-GB'
  });

  const runner = runnerModule.createRunner({ sleep: lib.sleep, jitter: lib.jitter });

  /** The signed-in handle, so exported links point somewhere real. */
  function handle() {
    if (state.user) return state.user;
    const anchor = global.document.querySelector('a[href*="/video/"]');
    const match = anchor && (anchor.getAttribute('href') || '').match(/\/@([^/]+)\/video\//);
    if (match) state.user = match[1];
    return state.user;
  }

  async function scan({ onProgress, log } = {}) {
    const all = await postsModule.fetchAll({
      listPage: (opts) => api.withBackoff(() => api.listPage(opts), {
        log: log || (() => {}), label: 'loading posts', shouldStop
      }),
      sleep: lib.sleep,
      onProgress,
      shouldStop,
      user: handle()
    });
    state.posts = all;
    state.total = all.length;
    return all;
  }

  function run(items, opts) {
    state.running = true;
    state.stopRequested = false;
    return runner.run(items, { ...opts, deleteOne: api.deleteOne, shouldStop })
      .finally(() => { state.running = false; });
  }

  NS.engine = { state, scan, run, deleteOne: api.deleteOne, MAX_BATCH: runner.maxBatch, handle };
})(typeof globalThis !== 'undefined' ? globalThis : self);
