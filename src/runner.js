/* Works through a delete queue in parallel batches, surviving throttling. */
;(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.TTR = root.TTR || {}).runner = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const MAX_BATCH = 10;                                   // 10 parallel deletes answer cleanly
  const BACKOFF_MS = [5000, 15000, 45000, 90000];
  const HARD_FAILURE_LIMIT = 5;

  const isSuccess = (outcome) => outcome === 'deleted' || outcome === 'dry-run';

  function createRunner({ sleep, jitter, backoffs = BACKOFF_MS, maxBatch = MAX_BATCH } = {}) {
    /**
     * Throttling is expected on a large run, not exceptional: ~168 deletes in 7
     * seconds at batch 10 tripped it. A throttled post goes back on the queue,
     * the run backs off and halves the batch, and only a post that survives
     * every backoff counts as failed.
     *
     * An edge block is different — it stops the run outright, because carrying
     * on extends the ban.
     */
    async function run(items, {
      deleteOne,
      dryRun = true,
      delayMs = 2000,
      batchSize = 1,
      onItem = () => {},
      log = () => {},
      shouldStop = () => false
    }) {
      let size = Math.min(Math.max(1, Math.floor(batchSize) || 1), maxBatch);
      const pending = items.slice();
      const results = [];
      let index = 0;
      let hardFailures = 0;
      let throttleRound = 0;

      while (pending.length) {
        if (shouldStop()) {
          log(`Stopped with ${pending.length} of ${items.length} left.`);
          break;
        }

        const chunk = pending.splice(0, size);
        const settled = await Promise.all(chunk.map(async (item) => {
          try { return await deleteOne(item, { dryRun }); }
          catch (err) { return `error: ${err && err.message ? err.message : err}`; }
        }));

        const retry = [];
        let edgeBlocked = false;

        for (let i = 0; i < chunk.length; i++) {
          const item = chunk[i];
          const outcome = settled[i];

          // Throttling is never a verdict on the post — it goes back on the queue.
          // The run as a whole gives up via the backoff schedule below.
          if (outcome === 'edge-blocked') { edgeBlocked = true; retry.push(item); continue; }
          if (outcome === 'rate-limited') { retry.push(item); continue; }

          results.push({ post: item, outcome });
          onItem(index++, item, outcome);
          if (!isSuccess(outcome)) hardFailures++;
        }

        if (edgeBlocked) {
          pending.unshift(...retry);
          log('STOPPED — TikTok blocked this browser at the edge (Akamai), not just the API.');
          log(`Wait 15-60 minutes, confirm tiktok.com loads normally, then re-run. ${pending.length} left.`);
          break;
        }

        if (retry.length) {
          pending.unshift(...retry);
          if (throttleRound >= backoffs.length) {
            log(`STOPPED — still throttled after backing off. Wait a few minutes and re-run. ${pending.length} left.`);
            break;
          }
          const wait = backoffs[throttleRound];
          throttleRound++;
          if (size > 1) {
            size = Math.max(1, Math.floor(size / 2));
            log(`Throttled — backing off ${Math.round(wait / 1000)}s and dropping to batch ${size}.`);
          } else {
            log(`Throttled — backing off ${Math.round(wait / 1000)}s.`);
          }
          await sleep(wait);
          continue;
        }

        if (hardFailures >= HARD_FAILURE_LIMIT) {
          log(`Five failures that were not throttling — stopping with ${pending.length} left.`);
          break;
        }
        if (delayMs > 0 && pending.length) await sleep(jitter(delayMs));
      }

      return { results, remaining: pending };
    }

    return { run, maxBatch };
  }

  return { createRunner, MAX_BATCH, BACKOFF_MS, HARD_FAILURE_LIMIT, isSuccess };
});
