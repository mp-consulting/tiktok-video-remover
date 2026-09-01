/* Timing helpers. Dual-export: CommonJS for tests, TTR.lib for the content script. */
;(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.TTR = root.TTR || {}).lib = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Spread timing so a run does not look metronomic. `random` is injectable for tests. */
  const jitter = (ms, spread = 0.25, random = Math.random) =>
    ms * (1 - spread + random() * spread * 2);

  return { sleep, jitter };
});
