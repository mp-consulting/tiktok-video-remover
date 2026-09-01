# Web Store listing — copy and checklist

Everything below is entered by hand in the developer dashboard. The assets live
next to this file.

## Store listing tab

**Name** (from `manifest.json`)
```
Bulk Post Cleaner for TikTok
```

**Summary** (132 char limit, from `manifest.json`)
```
List every post on your TikTok account and delete the ones you choose, with a dry run first.
```

**Description**
```
Clear out your TikTok posts in bulk, without deleting them one at a time.

Load your whole post list in a side panel, pick what you want gone, and remove it
in a single run.

• See everything — every post on your account, including private ones
• Select precisely — filter by view count or date, sort any column, search descriptions
• Dry run first — preview exactly what would be removed without deleting anything
• Keep a record — export your posts to CSV before you clear them
• Reversible — TikTok keeps deleted posts for 30 days in Recently deleted

Works only on your own account, using the TikTok session you are already signed in
with. No account, sign-up or configuration needed.

Collects no data whatsoever: no analytics, no tracking, no servers. It talks to
tiktok.com and nowhere else. The source is public and the privacy policy explains
exactly what it does.
```

**Category:** Tools (Workflow & Planning also fits)
**Language:** English

**Assets**
| Field | File |
|---|---|
| Screenshots | `screenshot-1-list.png`, `screenshot-2-filter.png`, `screenshot-3-dryrun.png` |
| Small promo tile | `promo/promo-tile-440x280.png` |
| Marquee promo tile | `promo/promo-marquee-1400x560.png` |

**Support URL**
```
https://github.com/mp-consulting/tiktok-video-remover/issues
```

**Homepage URL**
```
https://github.com/mp-consulting/tiktok-video-remover
```

## Privacy tab

**Single purpose**
```
Lets a signed-in TikTok user list the posts on their own account and delete the
ones they select.
```

**Justification — host permission `https://www.tiktok.com/*`**
```
The extension calls TikTok's own post-list and post-delete endpoints on the user's
behalf, using the session they are already signed in with. It runs only on
tiktok.com and requests no other host.
```

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing. Then confirm all three certifications — the
extension collects no data at all, so each is true.

**Privacy policy URL**
```
https://github.com/mp-consulting/tiktok-video-remover/blob/main/PRIVACY.md
```

## Account settings — do this before publishing

**Trader status.** The preview listing currently reads *"Ce développeur ne s'est
pas identifié comme professionnel"*. Publishing under the name **MP Consulting**
while declared a non-trader is a mismatch with the EU rules Google enforces, and
listings do get taken down over it. Set trader status in **Account settings**,
which also requires a contact address and phone number.
