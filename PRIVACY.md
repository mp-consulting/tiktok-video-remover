# Privacy Policy

**Bulk Post Cleaner for TikTok**
Last updated: 1 September 2026

## The short version

The extension collects nothing, sends nothing anywhere, and has no server behind
it. It talks to `tiktok.com` and to nothing else.

## What it does with your data

When you press **Load all posts**, the extension asks TikTok for the list of posts
on the account you are signed in to, and shows them in a panel. When you select
posts and confirm a deletion, it asks TikTok to delete exactly those posts.

Both requests go to `https://www.tiktok.com` from your own browser, carrying the
session you are already signed in with — the same thing that happens when you use
TikTok Studio normally. The extension does not see, read, copy or transmit your
password or session cookies; the browser attaches them, as it does for any request
to a site you are logged in to.

The post details it receives (description, date, view and like counts, post id)
are held in memory for as long as the panel is open, and are gone when you close
the tab.

## What it stores

One thing: the width you drag the panel to, saved in your browser's `localStorage`
under the key `ttr:width`, so the panel is the same size next time. That value
never leaves your browser.

Nothing else is stored. There is no database, no cache of your posts, no history
of what you deleted.

## What it does not do

- No analytics, telemetry, crash reporting or usage measurement.
- No servers operated by the developer. There is nowhere for data to be sent.
- No third-party services, SDKs, trackers or advertising.
- No selling or sharing of data, because none is collected.
- No remote code. Everything that runs ships inside the extension package.
- No access to any site other than `tiktok.com`. The extension declares a single
  host permission, `https://www.tiktok.com/*`, and cannot run anywhere else.

## The CSV export

**Export CSV** builds the file in your browser from what is already on screen and
hands it to your downloads folder. It is not uploaded anywhere.

## Deleting posts

Deletion is performed by TikTok, not by this extension — it only asks. TikTok
keeps deleted posts in **Activity centre → Recently deleted** for 30 days, after
which they are permanently gone. What happens to your content after deletion is
governed by [TikTok's privacy policy](https://www.tiktok.com/legal/privacy-policy),
not this one.

## Verifying all of this

The source is public and small enough to read in a sitting:
<https://github.com/mp-consulting/tiktok-video-remover>

- Every network request the extension can make goes through a single request
  site in [`src/api.js`](src/api.js); no other file can reach the network.
- The only stored value is written in [`src/panel.js`](src/panel.js), searchable
  as `ttr:width`.
- [`manifest.json`](manifest.json) declares no `permissions` at all, and a single
  `host_permissions` entry.

A test in [`test/manifest.test.js`](test/manifest.test.js) fails the build if the
extension ever gains a permission it does not use, or reaches a host other than
tiktok.com.

## Changes

Material changes will be recorded here with a new date, and in the repository's
commit history.

## Contact

Questions or concerns: <https://github.com/mp-consulting/tiktok-video-remover/issues>
