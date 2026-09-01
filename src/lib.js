/* Small shared helpers. Everything else this file used to hold existed to drive
   TikTok's UI by synthetic clicks; the extension talks to the API instead. */
(() => {
  const NS = (window.__TTR__ = window.__TTR__ || {});
  if (NS.util) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Spread request timing a little so a run does not look metronomic. */
  const jitter = (ms, spread = 0.25) => ms * (1 - spread + Math.random() * spread * 2);

  NS.util = { sleep, jitter };
})();
