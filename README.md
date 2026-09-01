# TikTok Bulk Video Remover

A Chrome extension (Manifest V3) that lists every post on your TikTok account in a
docked side panel and deletes the ones you select — by calling TikTok Studio's own
API, not by clicking through the page.

## Install

1. `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → select this folder.
3. Open any **tiktok.com** tab while logged in. The panel opens automatically on the
   TikTok Studio content page; elsewhere use the toolbar button.

## Use

1. **Load all posts** — pages through the API and lists everything with description,
   date, views and likes. Sort by clicking a column header; filter with the search box.
2. Select posts: individually, **Select all shown**, or **Select matching** with a
   "views under" / "posted before" filter.
3. **Export CSV** if you want a record first.
4. Leave **Dry run** ticked and press **Delete selected** to walk the queue without
   deleting. Then untick it to delete for real.
   - **Batch** (default 3) is how many posts are deleted in parallel per round;
     **Pause** (default 2000ms) is the wait between rounds. There is no bulk
     endpoint — TikTok's client deletes one post per request — so a batch is just
     parallel calls.

     These defaults are deliberately modest, and the reason is measured rather
     than theoretical. At batch 10 with no pause (~24 deletes/sec) a run of 173
     posts deleted 168 in seven seconds, then started returning HTTP 403 — and
     shortly after, **Akamai blocked the whole of tiktok.com for that browser**
     ("Access Denied", `errors.edgesuite.net`), which takes 15–60 minutes to
     clear. Batch 3 / 2000ms is ~1.5 deletes/sec and clears 200 posts in about
     two minutes, which is fast enough.
5. **Delete everything** does the whole account, after you type `DELETE` to confirm.

Deleted posts go to **Activity centre → Recently deleted** and are restorable for
**30 days**.

## The API

Both endpoints accept plain cookie auth — no `msToken`, no `X-Bogus`, no `X-Gnarly`:

```
POST /tiktok/creator/manage/item_list/v1/
     {"cursor":0,"size":30,
      "query":{"conditions":[],"sort_orders":[{"field_name":"post_time","order":2}]}}

POST /tiktok/post/edit/v1/
     {"aweme_id":"<id>","scene":1,"delete":{"delete_type":1}}
```

The page's own requests carry signature parameters because TikTok's msSDK patches
`window.fetch`/`XMLHttpRequest`, but the server does not require them — and a content
script's isolated world never sees that patch anyway.

Two traps worth knowing, both found the hard way:

- **`/tiktok/creator/item/delete/v1/` is dead.** It is right there in their bundle
  with a tidy `item_id` signature, and it does nothing. The delete button actually
  posts to `/tiktok/post/edit/v1/`.
- **Sorting by `post_time` descending silently omits private posts.** On the account
  this was built against, `order: 2` returned 158 posts and `order: 1` returned 189,
  the extra 32 being private ones (`status: 140`, `visibility: 2`). A tool that only
  crawls one direction reports "everything deleted" with a third of the account still
  live. `fetchAll()` crawls both directions and merges.

## Layout

The logic lives in dependency-injected modules so it can be tested under Node
without a browser; `engine.js` is the only browser-specific glue.

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — `https://www.tiktok.com/*` host access |
| `src/api.js` | Transport: request shape, 403 classification, backoff, delete outcomes |
| `src/posts.js` | Item mapping and the dual-order catalogue crawl |
| `src/runner.js` | Batched queue runner: parallelism, throttle retry, edge-block abort |
| `src/select.js` | Pure list operations: search, sort, filter, CSV |
| `src/engine.js` | Browser wiring — composes the above, exposes `__TTR__.engine` |
| `src/panel.js` | Docked side panel: list, sort, filter, dry run, log |
| `src/panel.css` | Panel styling |
| `src/lib.js` | `sleep` / `jitter` |
| `src/popup.html/js` | Toolbar popup: open Studio, toggle the panel |

Load order matters — `engine.js` reads the modules off a `TTR` global, and
`manifest.json` lists them accordingly. A test pins that order.

## Development

No dependencies and no build step.

```sh
npm run check   # node --check every source file
npm test        # node --test, 53 tests
```

The tests cover the behaviours that were expensive to learn: that the descending
sort hides private posts, that a 403 means throttling rather than a dead session,
that an edge block must abort rather than retry, and that a dry run never reaches
the network. Everything is injectable — `fetch`, `sleep`, `jitter` — so the suite
runs in about a tenth of a second with no browser and no network.

Nothing leaves the browser: the extension talks only to tiktok.com.

## Caveats

- Only your own posts — the endpoints act on the logged-in account.
- Throttling is handled, not merely reported: an HTTP 403 puts the post back on the
  queue, waits (5s → 15s → 45s → 90s) and halves the batch size. Only a post that
  survives every backoff counts as failed.
- An Akamai edge block is different and **aborts the run immediately** — continuing
  would extend the ban. Wait until tiktok.com loads normally in the browser, then
  re-run; anything left is simply still listed.
- Thumbnails come from TikTok's signed cover URLs and often will not render outside
  their own player; a failed one collapses to a plain tile.
- Bulk deletion is not something TikTok's terms invite. The 30-day restore window is
  your safety net.
