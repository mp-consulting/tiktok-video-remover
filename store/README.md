# Web Store listing assets

Screenshots are 1280x800, captured from the extension running against a real
signed-in TikTok Studio account. All three were taken with **Dry run** enabled —
nothing was deleted to produce them.

| File | Shows |
|---|---|
| `screenshot-1-list.png` | The whole catalogue loaded, three posts picked by hand |
| `screenshot-2-filter.png` | "Views under 3" selecting the low performers in one click |
| `screenshot-3-dryrun.png` | A dry run finishing: per-post results and the activity log |

Regenerate by loading the unpacked extension, opening TikTok Studio at a
1280x800 viewport, and capturing the viewport.

## Promo images

Modelled on the reference layout, recoloured to this extension's palette: TikTok's
near-black ground with the cyan/magenta pairing the icon uses — a contained
magenta bloom top-left and a cyan counter-glow behind the panel.

| File | Size | Where it goes |
|---|---|---|
| `promo/promo-tile-440x280.png` | 440x280 | Small promo tile (required for the listing) |
| `promo/promo-marquee-1400x560.png` | 1400x560 | Marquee tile (only used if featured) |
| `promo/promo-800x500.png` | 800x500 | General presentation image, matches the reference |

`promo/panel.png` is the panel cropped out of `screenshot-3-dryrun.png`.

To regenerate: `python3 promo/build.py` writes three self-contained HTML pages;
open each in a browser at the size in its filename and screenshot the viewport.
The 440x280 tile is laid out at 1x but rendered in an 880x560 page — Chrome will
not make a window narrower than ~500px — then downscaled to 440x280.
