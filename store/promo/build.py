#!/usr/bin/env python3
"""
Builds the Web Store promo images.

Writes three self-contained HTML pages; render each in a browser at the size in
its filename and screenshot the viewport. The 440x280 tile is laid out at 1x but
rendered inside an 880x560 page (Chrome will not make a window narrower than
~500px), then downscaled — which supersamples the text.

  python3 build.py
"""
import base64, pathlib

HERE = pathlib.Path(__file__).parent
b64 = lambda p: base64.b64encode((HERE / p).read_bytes()).decode()
PANEL = b64('panel.png')          # cropped from store/screenshot-3-dryrun.png
ICON = b64('../../icons/icon-128.png')

HERO = '''<!doctype html><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:800px; height:500px; overflow:hidden; }
  body {
    position:relative; background:#08090d;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  /* Magenta bloom from the top-left, cyan counter-glow behind the panel:
     the same chromatic pairing the extension icon uses. */
  .glow-a { position:absolute; left:-300px; top:-330px; width:820px; height:820px; border-radius:50%;
            background:radial-gradient(circle,rgba(254,44,85,.92) 0%,rgba(254,44,85,.34) 30%,rgba(254,44,85,0) 64%); }
  .glow-b { position:absolute; right:-190px; bottom:-300px; width:680px; height:680px; border-radius:50%;
            background:radial-gradient(circle,rgba(37,244,238,.20) 0%,rgba(37,244,238,0) 62%); }
  .vig    { position:absolute; inset:0;
            background:linear-gradient(103deg,rgba(8,9,13,0) 12%,rgba(8,9,13,.55) 44%,rgba(8,9,13,.9) 70%,#08090d 86%); }

  .wrap { position:relative; z-index:2; padding:62px 0 0 56px; width:520px; }

  .badge { display:inline-flex; align-items:center; gap:8px;
           padding:6px 13px 6px 9px; border-radius:999px;
           background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.16);
           font-size:10.5px; font-weight:700; letter-spacing:.11em; color:#25F4EE; text-transform:uppercase; }
  .badge img { width:15px; height:15px; border-radius:4px; }

  h1 { margin:20px 0 0; font-size:30px; line-height:1.18; letter-spacing:-.02em;
       font-weight:700; color:#fff; max-width:500px; white-space:nowrap; }
  p  { margin:16px 0 0; font-size:14px; line-height:1.62; color:rgba(255,255,255,.7); max-width:462px; }

  ul { margin:20px 0 0; list-style:none; }
  li { position:relative; padding-left:17px; margin-bottom:9px;
       font-size:13px; line-height:1.5; color:rgba(255,255,255,.82); max-width:452px; }
  li::before { content:""; position:absolute; left:0; top:7px; width:6px; height:6px;
               border-radius:50%; background:#25F4EE; box-shadow:0 0 9px rgba(37,244,238,.75); }
  li b { color:#fff; font-weight:600; }

  .shot { position:absolute; right:44px; top:66px; width:216px; height:360px; z-index:3;
          border-radius:13px; overflow:hidden;
          border:1px solid rgba(255,255,255,.11);
          box-shadow:0 26px 60px rgba(0,0,0,.72), 0 0 0 1px rgba(0,0,0,.4); }
  .shot img { width:216px; height:360px; object-fit:cover; object-position:top left; display:block; }
</style>
<div class="glow-a"></div><div class="glow-b"></div><div class="vig"></div>

<div class="wrap">
  <span class="badge"><img src="data:image/png;base64,{ICON}">Bulk cleanup in one click</span>
  <h1>Delete your TikTok posts in bulk.</h1>
  <p>Loads every post on your account &mdash; including the private ones &mdash; then
     removes just the ones you pick, in a single run. Nothing is deleted until you say so.</p>
  <ul>
    <li><b>Dry run first.</b> See exactly what would go, delete nothing.</li>
    <li>Filter by views or date, sort any column, export a CSV record.</li>
    <li>Deletions stay restorable for 30 days in Recently deleted.</li>
  </ul>
</div>

<div class="shot"><img src="data:image/png;base64,{PANEL}"></div>
'''

MARQUEE = '''<!doctype html><meta charset="utf-8"><style>
  html,body { width:1400px; height:560px; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { position:relative; background:#08090d; overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased; }
  .glow-a,.glow-b,.vig { position:absolute; }
  .glow-a { border-radius:50%; background:radial-gradient(circle,rgba(254,44,85,.92) 0%,rgba(254,44,85,.34) 30%,rgba(254,44,85,0) 64%); }
  .glow-b { border-radius:50%; background:radial-gradient(circle,rgba(37,244,238,.20) 0%,rgba(37,244,238,0) 62%); }
  .vig { inset:0; }
  .shot { position:absolute; z-index:3; border-radius:13px; overflow:hidden;
          border:1px solid rgba(255,255,255,.11);
          box-shadow:0 26px 60px rgba(0,0,0,.72), 0 0 0 1px rgba(0,0,0,.4); }
  .shot img { display:block; object-fit:cover; object-position:top left; }

  .glow-a { left:-460px; top:-520px; width:1320px; height:1320px; }
  .glow-b { right:-260px; bottom:-380px; width:900px; height:900px; }
  .vig { background:linear-gradient(103deg,rgba(8,9,13,0) 14%,rgba(8,9,13,.55) 46%,rgba(8,9,13,.9) 70%,#08090d 86%); }
  .wrap { position:relative; z-index:2; padding:92px 0 0 96px; width:880px; }
  .badge { display:inline-flex; align-items:center; gap:9px; padding:7px 15px 7px 10px; border-radius:999px;
           background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.16);
           font-size:12px; font-weight:700; letter-spacing:.11em; color:#25F4EE; text-transform:uppercase; }
  .badge img { width:18px; height:18px; border-radius:5px; }
  h1 { margin:26px 0 0; font-size:44px; line-height:1.15; letter-spacing:-.022em; font-weight:700;
       color:#fff; white-space:nowrap; }
  p { margin:20px 0 0; font-size:18px; line-height:1.6; color:rgba(255,255,255,.7); max-width:690px; }
  ul { margin:26px 0 0; list-style:none; }
  li { position:relative; padding-left:22px; margin-bottom:12px; font-size:17px; line-height:1.5;
       color:rgba(255,255,255,.82); }
  li::before { content:""; position:absolute; left:0; top:9px; width:7px; height:7px; border-radius:50%;
               background:#25F4EE; box-shadow:0 0 10px rgba(37,244,238,.75); }
  li b { color:#fff; font-weight:600; }
  .shot { right:84px; top:64px; width:258px; height:430px; }
  .shot img { width:258px; height:430px; }
</style>
<div class="glow-a"></div><div class="glow-b"></div><div class="vig"></div>
<div class="wrap">
  <span class="badge"><img src="data:image/png;base64,{ICON}">Bulk cleanup in one click</span>
  <h1>Delete your TikTok posts in bulk.</h1>
  <p>Loads every post on your account &mdash; including the private ones &mdash; then
     removes just the ones you pick, in a single run. Nothing is deleted until you say so.</p>
  <ul>
    <li><b>Dry run first.</b> See exactly what would go, delete nothing.</li>
    <li>Filter by views or date, sort any column, export a CSV record.</li>
    <li>Deletions stay restorable for 30 days in Recently deleted.</li>
  </ul>
</div>
<div class="shot"><img src="data:image/png;base64,{PANEL}"></div>'''

TILE = '''<!doctype html><meta charset="utf-8"><style>
  html,body { width:880px; height:560px; }
  .scale { width:440px; height:280px; transform:scale(2); transform-origin:top left; position:relative; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { position:relative; background:#08090d; overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased; }
  .glow-a,.glow-b,.vig { position:absolute; }
  .glow-a { border-radius:50%; background:radial-gradient(circle,rgba(254,44,85,.92) 0%,rgba(254,44,85,.34) 30%,rgba(254,44,85,0) 64%); }
  .glow-b { border-radius:50%; background:radial-gradient(circle,rgba(37,244,238,.20) 0%,rgba(37,244,238,0) 62%); }
  .vig { inset:0; }
  .shot { position:absolute; z-index:3; border-radius:13px; overflow:hidden;
          border:1px solid rgba(255,255,255,.11);
          box-shadow:0 26px 60px rgba(0,0,0,.72), 0 0 0 1px rgba(0,0,0,.4); }
  .shot img { display:block; object-fit:cover; object-position:top left; }

  .glow-a { left:-190px; top:-215px; width:520px; height:520px; }
  .glow-b { right:-140px; bottom:-170px; width:400px; height:400px; }
  .vig { background:linear-gradient(115deg,rgba(8,9,13,0) 18%,rgba(8,9,13,.5) 52%,rgba(8,9,13,.88) 82%); }
  .wrap { position:relative; z-index:2; height:280px; display:flex; flex-direction:column;
           justify-content:center; padding:0 34px; }
  .wrap img { width:52px; height:52px; border-radius:13px; }
  h1 { margin:17px 0 0; font-size:25px; line-height:1.18; letter-spacing:-.02em;
       font-weight:700; color:#fff; }
  p { margin:10px 0 0; font-size:13.5px; line-height:1.5; color:rgba(255,255,255,.72); max-width:330px; }
  .tag { margin:15px 0 0; font-size:11px; font-weight:700; letter-spacing:.1em;
         text-transform:uppercase; color:#25F4EE; }
</style>
<div class="scale"><div class="glow-a"></div><div class="glow-b"></div><div class="vig"></div>
<div class="wrap">
  <img src="data:image/png;base64,{ICON}">
  <h1>Delete your TikTok<br>posts in bulk.</h1>
  <p>Every post listed, the ones you pick removed &mdash; with a dry run first.</p>
  <div class="tag">Bulk cleanup in one click</div>
</div></div>'''

for filename, template in [('promo.html', HERO), ('promo-marquee.html', MARQUEE), ('promo-tile.html', TILE)]:
    # str.replace, not str.format: the CSS is full of braces.
    (HERE / filename).write_text(template.replace('{PANEL}', PANEL).replace('{ICON}', ICON))
    print('wrote', filename)