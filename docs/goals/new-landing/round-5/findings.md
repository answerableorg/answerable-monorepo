# Findings, round 5

Read and measured 9 November 2026 on main c68271da. Nothing changed in code, nothing deployed.

## What arrived

`~/Downloads/OneDrive_1_09-11-2026/`, three gouache paintings as PNG, RGB, no alpha:

| File                                                            | Size    | Pixels    | Role on the page (reading of the request)   |
| --------------------------------------------------------------- | ------- | --------- | ------------------------------------------- |
| `Answerable-AP-Meeting-Gouache-Painting-4K.png`                 | 42.1 MB | 3840×5120 | Landing: the hero, the join scene, the loop |
| `Collaborative-Architecture-Studio-Gouache-Painting-6000px.png` | 32.1 MB | 6000×2162 | The six values, zoomed in squares           |
| `Answerable-AP-Badge-Gouache-Painting-4K.png`                   | 39.8 MB | 3840×5120 | The Answerable AP programme                 |

- **Meeting**: six people round a table in a garden; the woman in the red blazer holds an Answerable AP badge (centre about (1322, 2541), 183 px wide; its lettering is slightly garbled at full size).
- **Badge**: a close-up of the same woman (curly hair, red blazer, cream shirt) pinning the badge; the badge is crisp, centre about (2176, 2785), 1440 px wide. It is the meeting's badge, eight times closer.
- **Studio**: a panorama of an architecture practice at work: hand drawing, measuring a model, presenting at an easel, an Answerable AP plaque placed on a model, a sealed letter passing between two people, a 3D printer beside a laptop.
- All three carry the Answerable AP badge, so the coded stamp (`GridFrame` in the panel's corner) repeats it.

## The page today

- One illustration, `apps/web/assets/new/hero.webp` (1086×1448, 258 KB), drawn in two clip boxes (the window's head and the tail's band), for every scene: whole for the hero, people and join; a comma on the model for the programme; a square or comma per value.
- Windows: `WINDOW_LAYOUTS` base 0.36 of the panel's shorter side in columns (0.5 on phones), times 1 to 1.2 per value: 305 px on the owner's laptop panel (848×905), 122 px on an iPhone 15 band (393×243).
- The stamp: `GridFrame` "Answerable AP" at the panel's inset, shown on the hero only. Its `offsetLeft` is also how the panel measures `--inset`, the margin the windows keep: removing it needs another measure.
- The logo (`Lockup`) is 20 px.
- The comma window costs: a second clip box with the picture again, carving shapes per field colour, a tail term in the geometry and its tests. Every field is white since 8f006912, so the field layers fade white over white.

## How images reach the browser today (measured on www.answerable.org)

- `next/image` with Vercel's optimiser, AVIF first (`images.formats`), `qualities: [75, 85]`, Next's default widths (640 to 3840). The hero asks `sizes="1086px"`, so a retina screen asks for 3840 and gets the 1086 source (the optimiser never enlarges).
- Vercel served the hero at 640: AVIF 31 KB, WebP 70 KB; 1080: AVIF 74 KB, WebP 145 KB; 2048 and 3840: AVIF 87 KB (1086×1448). Immutable, a year's cache.
- **The local encoder predicts Vercel's bytes.** Next's own settings in sharp 0.34.5 (AVIF at quality ×50/80, effort 3; WebP at the quality) gave WebP byte for byte what Vercel served (69.8, 145.5, 189.3 KB) and AVIF within 0 to 15% (31.8 vs 31.1, 64.9 vs 74.4, 82.3 vs 87.0 KB).
- **Vercel's limits**: a source at most 8192 px a side; a transformed image at most 10 MB ([limits](https://vercel.com/docs/image-optimization/limits-and-pricing)). All three paintings fit.
- **Next's limits**: `images.deviceSizes` takes whole numbers from 1 to 10000, at most 25 (`config-schema.js`).

## The masters (what the repository would hold)

Full size, from the PNGs, sharp 0.34.5:

| Painting | WebP q90 | WebP q95 | AVIF q70 | JPEG q92 |
| -------- | -------- | -------- | -------- | -------- |
| Meeting  | 1806 KB  | 2882 KB  | 888 KB   | 2594 KB  |
| Badge    | 1728 KB  | 2725 KB  | 762 KB   | 2410 KB  |
| Studio   | 1649 KB  | 2394 KB  | 905 KB   | 2276 KB  |

Quality against the PNG, as PSNR, for the master and for what the optimiser would then serve at full width (AVIF, quality 85):

| Painting | Master   | Master PSNR | Served PSNR | PNG straight to served |
| -------- | -------- | ----------- | ----------- | ---------------------- |
| Studio   | AVIF q70 | 42.90 dB    | 38.53 dB    | 39.36 dB               |
| Studio   | WebP q90 | 41.52 dB    | 38.38 dB    |                        |
| Meeting  | AVIF q70 | 44.16 dB    | 40.12 dB    | 40.94 dB               |
| Meeting  | WebP q90 | 43.10 dB    | 40.13 dB    |                        |

An AVIF q70 master costs under 1 dB after the second encode and half the bytes of WebP q90: 2.5 MB in all, against 5.2 MB. **Not yet tested**: that Turbopack's static import reads an AVIF (size and blur placeholder). The first build step proves it; WebP q90 is the fallback.

## Bytes per screen

AVIF from the AVIF masters, with Next's encoder settings (Vercel within 15%). The cover paintings at quality 75, the panorama at 85 (it is magnified). Quality 75 against 85 on the cover paintings: about 1 dB less, 20 to 30% smaller (meeting at 1920: 207 against 257 KB).

| Width | Meeting q75 | Badge q75 | Studio q85 |
| ----- | ----------- | --------- | ---------- |
| 640   | 42 KB       | 17 KB     |            |
| 828   | 65 KB       | 30 KB     |            |
| 1080  | 100 KB      | 58 KB     |            |
| 1200  | 116 KB      | 72 KB     |            |
| 1920  | 207 KB      | 153 KB    |            |
| 2048  | 220 KB      | 163 KB    | 175 KB     |
| 2560  | 280 KB      | 216 KB    |            |
| 3072  | 338 KB      | 267 KB    | 271 KB     |
| 3840  |             |           | 338 KB     |
| 4800  |             |           | 423 KB     |
| 6000  |             |           | 529 KB     |

What each screen would download with the `sizes` in `design.md` (meeting first, the other two after it):

| Screen                               | Meeting   | Badge     | Studio    | Total   |
| ------------------------------------ | --------- | --------- | --------- | ------- |
| iPhone 15, 393 wide, 3×              | 1200: 116 | 1200: 72  | 3072: 271 | 459 KB  |
| Older iPhone, 375 wide, 2×           | 828: 65   | 828: 30   | 2048: 175 | 270 KB  |
| 1920×1080, 1×                        | 1080: 100 | 1080: 58  | 3072: 271 | 429 KB  |
| Owner's laptop, 1728 wide, 2×        | 1920: 207 | 1920: 153 | 6000: 529 | 889 KB  |
| 5K display, 2560 wide, 2×            | 2560: 280 | 2560: 216 | 6000: 529 | 1025 KB |
| Today, any retina screen (hero only) | 87        |           |           | 87 KB   |

## Sharpness of the zooms

Source pixels per screen pixel inside a value's square (a 1000 px span of the panorama):

- Today: the 1086 px hero magnified up to 1.3× in CSS, so about 2.6 screen pixels per source pixel on retina.
- Owner's laptop, square 543 px at 2×, panorama at 6000: 1.09 screen pixels per source pixel (sharp). At 4800: 1.36.
- 5K display, square 799 px at 2×: 1.6 at 6000.
- iPhone 15, square 194 px at 3×, panorama at 3072: 1.14.

## The six details

Proposed in the panorama's pixels (6000×2162), left to right, so the values read the painting from left to right. Crops in the report.

| Value                                                            | Detail                                             | Centre       | Span    |
| ---------------------------------------------------------------- | -------------------------------------------------- | ------------ | ------- |
| 1 We hold ourselves answerable for our work.                     | An architect drawing her plan by hand              | (880, 1560)  | 1000 px |
| 2 We use AI only where we are competent to do so.                | Measuring the model with a ruler                   | (1600, 1250) | 1000 px |
| 3 We are honest about how we use AI.                             | Presenting the design at the easel, laptop in hand | (2750, 700)  | 1300 px |
| 4 We respect the intellectual and creative work of others.       | The Answerable AP plaque set on the model          | (4350, 1650) | 1000 px |
| 5 We protect the information entrusted to us.                    | A sealed letter handed over                        | (4250, 650)  | 1000 px |
| 6 We use AI to strengthen our professions, not to diminish them. | A 3D printer beside a laptop                       | (5400, 850)  | 1100 px |

The old illustration's zooms (Laura's) used the same subjects for 1, 2, 4 and 5: signing a plan, a ruler, a name plaque, a sealed letter.

## Constraints

- **The repository is public.** The 42 MB PNGs stay out of git; only the compressed masters go in.
- **A painting must never show its edge** inside the panel or a window while it is visible, or the white field shows through as a hard line. A matched zoom from the meeting's badge (183 px) to the close-up's (1440 px) would need the meeting at 8× and the close-up smaller than the panel during the crossfade: both edges and blur. Rejected for that reason.
- **Compositor only** (round 4): opacity and transform, no per-frame clip or mask; about 1,800 keyframes at most for WebKit.

## Measured on the build (9 November 2026, worktree `claude/new-landing-r5`)

**Masters are WebP q90.** Turbopack's static import of an AVIF reported 100×100 and no blur placeholder, so `next/image` could not size or place it; the WebP masters import at 3840×5120 and 6000×2162 with a blur. Under `bun test` an image import is only its path, so each painting's size is declared in `scenes.ts` and `scenes.test.ts` checks it against the file's WebP header.

**What each screen downloads** (production build, `next start`, fresh browser context, AVIF):

| Screen                        | Meeting   | Badge     | Studio    | Total    |
| ----------------------------- | --------- | --------- | --------- | -------- |
| iPhone 15, 393 wide, 3×       | 1200: 119 | 1200: 99  | 3072: 252 | 470 KB   |
| Older iPhone, 375 wide, 2×    | 750: 49   | 750: 33   | 2048: 136 | 218 KB   |
| 1920×1080, 1×                 | 1080: 98  | 1080: 80  | 3072: 252 | 430 KB   |
| Owner's laptop, 1728 wide, 2× | 1920: 246 | 1920: 212 | 6000: 671 | 1,129 KB |
| 5K display, 2560 wide, 2×     | 2560: 353 | 2560: 307 | 6000: 671 | 1,331 KB |

Larger than the estimates above: Next 16.4.3 encodes with its own nested sharp 0.35.5 (libaom 3.15.1), which writes about 20% more than sharp 0.34.5 at the same setting (studio at 6000: 687 against 572 KB from the same master). Vercel's own numbers come after landing.

**Chromium, real GPU (Metal), 11 key presses round the loop, eight cold loads each.**

- With values 3 and 6 at other zooms (spans 1300 and 1100), 3 of 8 loads had one GPU task of 42 to 49 ms as a new part of the panorama came in at a new scale; live had 0 of 8. All six spans are now 1,000: 0 of 8, and 0 in every later run.
- Final build: no GPU task over 30 ms, no main-thread task over 16 ms, one frame over 25 ms per loop (the jump back to the top, which live has too; live has 2 to 3). The frames over 25 ms that remain run with every thread idle (no slice over 3 ms).

**WebKit 26 (Playwright), frames over 20 ms per loop, p99, worst.** Live: desktop 1 to 9, 19 to 21 ms, 21 to 34 ms; phone 2 to 5, 19 to 20 ms, 24 to 26 ms. The first build: desktop 10 to 15, worst 83 to 165 ms; phone 13 to 15, worst 100 to 178 ms. What was found, each by switching one part off in the page:

- Not image size (smaller widths swapped in changed nothing), not keyframe count (1,425 against live's 1,699), not decoding (`img.decode()` ahead of each scene changed nothing).
- A square clip whose scale changes every frame, holding three large paintings each compensating it: switching off the clip's animation halved the worst hitch. The panel now places each painting directly and frames the square with four white shutters that only slide.
- Large layers changing opacity together, and a layer coming back from opacity 0 after a long time: the paintings now follow one rule, only one ever changes opacity at a time (a test checks it), the meeting at the bottom never does, and a painting not on show sits at 0.2% (`GHOST`), never 0.
- The dissolve's push-in (both paintings scaling while fading) cost frames too: the cuts are plain dissolves.

Final build: desktop 2 to 8, 19 to 21 ms, worst 25 to 36 ms (one run of four had a single 153 ms spike); phone 4 to 9, 19 to 21 ms, worst 37 to 89 ms, that worst frame always entering the people scene (live 24 to 26). Switching off every panel animation removes it; no single part does. Not tested on a real iPhone.

**Checked on the build:** every scene and move at 1728×937 (Chromium) and 393×852 (WebKit), no console errors; reduced motion keeps every painting still and changes only while the panel is faded out; without JavaScript the meeting shows whole, no stamp, the six values listed, one `h1`, no sideways scroll; 375×667 band and square fit. Gates: typecheck 0, lint 0, web tests 175 pass, build 0 (`/new` static), knip nothing new.
