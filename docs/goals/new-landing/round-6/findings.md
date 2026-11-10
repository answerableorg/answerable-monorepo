# Round 6 findings

Measured on the round 5 build (`cabe7369`) and on mocks composed from the
real paintings over real screenshots (scratchpad `scripts/sheet6.mjs`).

## What the inspirations do

| Inspiration | What carries the feeling | What we take |
| ----------- | ------------------------ | ------------ |
| Poster, construction circles | Thin lines that all resolve on shared points; solid dots where they cross; corner registration marks; a small letter-spaced caption | Circles and centre-lines on round things (the sun); every line ends on a lattice point |
| Glyph on a blueprint grid | The outline shown as it was built: anchors as small squares, handles as lines ending in dots; a major and minor grid | The comma as a constructed glyph in the people scene; open anchor squares at the ends of construction lines |
| Stippled hand | A sparse grid behind; "+" marks; leaders from a detail to a small filled square, no words needed | Leaders: a diagonal, then a shelf along a lattice line to a filled square on a lattice point |

None of them decorates: each line says how the thing was made or where to
look. So ours follow one rule: **a line either belongs to the lattice or
continues something in the painting.**

## The screens

| Screen | Panel | Inset `m` | Round 5 square |
| ------ | ----- | --------- | -------------- |
| Laptop 1728×937 | 856×907 at (857, 15) | 32 | 548 px at x 890–1438, y 218–767 (value 2) |
| iPhone 15, 393×852 | 393×392 band at y 57–449 | 24 | 314 px at x 24–338, y 81–395 |
| iPhone SE band | 251 tall | 24 | 200 px |

`--inset` is 16 px below 80rem wide, 32 px from there, 48 px from 120rem,
8 px under 35rem tall; in the band `max(1.5rem, (100% − 560px)/2)`.

## The lattice

Frame exact at the inset on all four sides. Modules are square; the module
`u = W / C` for a whole number of columns, rows `N = floor((H − 20) / u)`,
and what is left under the last row is the title strip. `C` is chosen to
keep the square's side (`S` whole modules) closest to what round 5 drew and
the module near 7% of the panel's shorter side (44 to 76 px).

| Screen | C | N | u (px) | S | Square | Strip |
| ------ | - | - | ------ | - | ------ | ----- |
| Laptop 1728×937 | 13 | 13 | 60.92 | 9 | 548.3 (548 today) | 51 |
| 1440×900 | 13 | 15 | 49.8 | 9 | 448 | 58 |
| 1920×1080 (m 48) | 13 | 14 | 65.8 | 9 | 592 | 32 |
| iPad landscape 1024×768 (m 16) | 11 | 15 | 42.9 | 7 | 300 | 62 |
| 1280×600 | 13 | 11 | 43.7 | 8 | 350 | 25 |
| iPhone 15 band | 8 | 7 | 43.13 | 7 | 301.9 (314 today) | 42 |
| iPhone SE band | 9 | 5 | 36.3 | 5 | 182 (200 today) | 21 |

## The square on the lattice

The square's unsnapped centre is the round 5 one (the painting placed at its
fit scale, the detail where it falls); its corner is then rounded to a
lattice point. Laptop, column and row of the top-left corner: V1 (0, 4),
V2 (0, 3), V3 (2, 1), V4 (4, 4), V5 (4, 1), V6 (4, 2). Phone: V1–V3 column
0, V4–V6 column 1, row 0. So the square still travels with the panorama, in
whole modules.

## Mock findings

| Finding | Decision |
| ------- | -------- |
| Bleed hero (painting under the whole panel): white zone labels and strip text illegible over the painting; busy | Rejected. The hero is framed |
| Framed hero at `anchorY` 0.5 cuts the sun in half | Anchor about 0.3; the construction circle completes the sun in the margin |
| Lattice at alpha 0.9 reads as a cage over faces | About 0.5 over pictures; stronger on white is fine |
| Ink lines vanish on navy | A 3 px white casing under any ink line that crosses a painting |
| A label's plate sat on the extended ruler axis | Labels sit above their shelf, clear of construction lines |
| The recorder crosshair is barely visible, and falls in the strip on a phone | Dropped |
| Key plan dots too small to read | Larger (2 px half-size) |
| "CHECKED TO SCALE" overflowed the panel | Labels are one or two words and name the thing |

## Where things are in the paintings (painting pixels)

Approximate, from 1:1 crops; each is checked by overlay before it ships.

| Painting | Feature | Position |
| -------- | ------- | -------- |
| Meeting | Sun | centre (3101, 585), r 322 |
| Meeting | Badge | (1322, 2541) |
| Badge | Sun | centre (3291, 505), r 263 |
| Badge | Badge corners | (1470, 2480), (2907, 2607), (2852, 3138), (1434, 3010) |
| Studio V1 | Pen | top (925, 1772), tip (1083, 2000) |
| Studio V2 | Scale rule | (1450, 1503) to (1917, 1433) |
| Studio V2 | Model | roof y 1510, base y 1650–1700 |
| Studio V3 | Easel board | top y 240, right x 3070–3100; fingertip (2775, 462) |
| Studio V4 | Name plate | (4222, 1742), (4552, 1750), (4548, 1860), (4218, 1850) |
| Studio V5 | Envelope | (4222, 707), (4372, 730), (4357, 817), (4208, 795); seal (4287, 763) r 17 |
| Studio V6 | Printer opening | 5290–5625 × 740–1040; bed y 1005; dome centre (5482, 920) |

## What WebKit allows (from round 5)

- Only opacity and transform animate. No clip-path, no blend mode.
- No two large layers fade at once; nothing large returns from opacity 0.
- The main thread slows from about 1,800 keyframes page-wide; the panel's
  stay under 700 (a test holds this).

So the lattice is static (never animated), the notes are small SVGs (each
its content's bounding box, not the panel), and each fades alone.
Round 6 adds one: **a large layer must not travel fast, even unseen** (see
"A hidden painting's travel").

## As built: what was measured (2026-11-10)

On the production build, driven by Playwright (scratchpad `smooth6.mjs`,
`hitch7.mjs`, `wrap6.mjs`). No real iPhone and no real trackpad.

### Speed

The stride went from a screen's height to 22rem (60svh under a finger).

| Chromium 1728×937 | Before | After |
| ----------------- | ------ | ----- |
| A key or a rail click to the next scene | 510 ms | 283 ms |
| Two wheel notches to the next scene | | 229 ms |

WebKit takes about 183 ms for the same change.

### Frames over every scene

| Browser, screen | Keyframes | Frames over 20 ms | Over 33 ms | Worst |
| --------------- | --------- | ----------------- | ---------- | ----- |
| WebKit 1440×900 @2x | 1,671 | 4 | 0 | 23 ms |
| WebKit 2560×1440 | 1,880 | 2 | 0 | 22 ms |
| WebKit phone (stride 511 px) | 1,289 | 5 | 0 | 28 ms |
| Chromium 1440×900 | 1,667 | none over 16.8 ms | | |
| Chromium 2560×1440 | 1,895 | none over 16.8 ms | | |

The tests hold the panel's shutters and paintings under 700 keyframes, the
strip and key plan under 120 and the notes under 130.

### A hidden painting's travel

Entering the people scene hitched on the WebKit phone: worst frame and
frames over 25 ms, five runs, **32/3, 66/1, 33/2, 24/0, 30/1**. The studio
painting (6,000 px wide) was fading out and, in the same half second,
travelling back to its first detail under the portraits. WebKit re-rasters
a large layer that moves fast, whether it is seen or not.

Now a large painting never travels fast (`waiting` in `frames.ts`): under
the portraits it fades where it is, then goes back at one pace over the
three scenes that do not show it, the loop included. Same five runs:
**19/0, 19/0, 19/0, 20/0, 20/0**. Two tests pin it.

### The loop's wrap

The last snap wraps to the top once the scroll settles within two pixels of
it (a phone's scroll rests a fraction of a pixel short, and never wrapped
before). On the WebKit phone the wrap costs two frames of 33 to 47 ms, at
rest, after the join scene has arrived (it was 60 to 252 ms before the fix
above); on the WebKit desktop 19 to 20 ms. Switching snapping off round the
wrap did not change it, so it is recorded and left.

### Other modes

- Reduced motion rests on each scene and cuts through the bare lattice.
- Without JavaScript the page is a document with the meeting painting.
- The splash opens onto the framed hero, already measured.
- Seven screens (laptop, 2560×1440, tablet, portrait tablet, short window,
  phone, small phone) at seven scenes each: every picture on the lattice,
  the copy on one line.

### A tool quirk, not the page

A headless Chromium screenshot at 2560×1440 timed out once in about forty.
The page's own frames at that size are 17 to 33 ms after a jump and the
smoothness run shows none slow; a longer wait before the capture avoids it.
