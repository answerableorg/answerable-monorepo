# Round 6 design: the drawing sheet

One rule: **a line either belongs to the lattice or continues something in
the painting.** Nothing is decoration for its own sake.

## The sheet, back to front

| Layer | What | Moves? |
| ----- | ---- | ------ |
| Paintings | As round 5: one transform and one opacity each | yes |
| Shutters | Four white sheets framing a rectangle: the square on a detail, or the whole lattice for a whole painting | slide |
| Portraits | Two white halves, the commas on them, on the lattice | fade |
| Lattice | Square modules in sky, across the frame | never |
| Frame | The lattice's outline and the strip's, in ink; ticks at every module; zone labels (numbers across the top, letters down the left, the whole alphabet since round 7) | never |
| Rules | The picture's four edges continued across the lattice, in ink | with the shutters |
| Notes | One small drawing per scene: centre lines, construction lines, outlines, circles | glued to the painting, fade |
| Strip | Sheet number and scene name on the left; the key plan of the studio on the right | fade; the key plan's window slides |

Everything above the portraits is `aria-hidden` and takes no pointer.

## The lattice (`lib/stage-math.ts`, tested)

`lattice(panel, margin, size, ratio)`:

- The frame is exactly `margin` from the panel's four edges.
- `u = W / C`; rows `N = floor((H − 20) / u)`; the strip is what is left
  under row `N`, inside the frame.
- `C` (4 to 24, `u` between 28 and 84 px) minimises
  `2·|S·u − D| / D + |u − target| / target`, with `D` the side round 5 drew
  (`size` × the panel's shorter side), `S = round(D / u)` and `target` 7% of
  the shorter side, kept between 44 and 76 px.
- Every line's position is rounded to a device pixel (`ratio`), and
  everything that sits on the lattice reads those same numbers: the lattice
  as drawn, the picture's edges, the rules, the commas.

## Pictures on the lattice

- **A detail**: a square of `S` modules. Its corner is the round 5 centre
  (the painting at its fit scale, the detail where it falls), rounded to a
  lattice point and kept inside the lattice.
- **A whole painting**: covers the lattice, `anchorY` deciding what is
  cropped (0.3 beside the copy, so the sun stays; 0.36 in the band).
- `Geometry` holds a rectangle (`cx`, `cy`, `w`, `h`), not a square; between
  two states its edges move in straight lines, so a shutter only ever
  slides one way.
- The portraits: each comma's head is `k` by `k` modules (`k` whole, nearest
  to round 5's size), its tail `k / 2`. Beside the copy the opening comma is
  top left and the closing one bottom right; in the band they sit side by
  side on the same rows. The comma is stretched by under 1% so its head is
  exactly on the lattice.

## Notes (`components/new/notes.ts`, tested)

A note is data in the painting's own pixels (`NOTES` in `scenes.ts`), laid
out in panel pixels through the scene's settled placement and cut to the
picture:

| Mark | Drawn as |
| ---- | -------- |
| `axis` | A centre line through two points of a feature, carried past each end, as a chain line |
| `guide` | A construction line between two points: a baseline, an edge carried on; a hairline, as it may cross what it is drawn for |
| `outline` | A feature's corners joined, an open square on each: a shape shown as built |
| `ring` | A circle |
| `cross` | A cross on a point |
| `angle` | The angle at a point between two lines: the line it is measured from, an arc, and its size in degrees |
| `dimension` | A length between two points: a line beside them, a witness line and a stroke at each end, and its size along it |

There are no pointing lines and no labels: the owner removed them on
2026-11-09 ("remove the pointing lines"), and kept the marks on the
paintings ("keep the lines around the badge, those look nice"). The only
figures are measurements: the pen's angle to the table and the scale
rule's length (owner, 2026-11-11: "a visible angle that appears", "on the
ruler some measurements as well").

The marks are meant to be seen (owner, 2026-11-11: "a bit too small /
discreet"): about 1.5 px thick, a whole number of device pixels, in solid
ink on a white line 1 px wider each side, with 7 px squares on an outline's
corners and 15 px crosses. Only a `guide` stays a hairline.

| Scene | On the painting |
| ----- | --------------- |
| Hero, Join | The sun's circle and its two centre lines |
| Programme | The badge's outline with a square on each corner, its lettering's baseline and capitals' line, the sun's circle |
| Value 1 | The pen's axis, a cross on its tip, the table's line under it and the angle between them (56°) |
| Value 2 | The name plate's outline |
| Value 3 | The scale rule's axis, and its length as a dimension above it (300 mm) |
| Value 4 | The pointing arm's axis, a cross on the hand |
| Value 5 | The envelope's outline, a circle on the seal |
| Value 6 | The print's outline, the dome's axis |
| People | None |

Since round 10 the scroll does not place a note (`round-10/design.md`): it
is laid out where its painting rests, switched on once its scene has
arrived, each mark drawn as one stroke, and switched off as soon as the
scroll leaves the scene's rest.

## Colours

The sheet must not take power from the paintings (owner, 2026-11-09: "the
colors are not good, too visible"). Every line of the sheet is see-through;
the marks on a painting alone are solid:

| Token | Value | Used for |
| ----- | ----- | -------- |
| `--sheet-lattice` | `rgb(140 200 220 / 0.45)` | The lattice |
| `--sheet-ink` | `rgb(39 71 214 / 0.34)` | Frame, rules, ticks, strip lines |
| `--sheet-text` | `rgb(39 71 214 / 0.58)` | Strip and zone text |
| `--sheet-note` | `rgb(39 71 214)` | Marks on a painting |

## The copy beside the picture

Every block of copy starts on one line (owner, 2026-11-09): the scenes
share one grid cell, as tall as the tallest, so nothing shifts between
scenes. Where the window is at least 56rem high the hero stands out of that
height, so the form's second step opens downwards and the line stays put.

## Motion and cost

- Only opacity and transform, as everything else on the stage.
- The lattice and frame never animate. The rules are four 1 px elements
  with the shutters' own keyframes.
- 75 animated elements, 1,289 keyframes on a phone and 1,671 to 1,895 on a
  desktop.
- **The stride** (the scroll that plays one change) is 22rem, and 60svh
  under a finger. It was a screen's height; the owner asked for "way
  faster". Not shorter: an ordinary swipe would pass two scenes.
- **A large painting never travels fast, seen or not.** Under the
  portraits the studio fades where it is, then goes back to its first
  detail at one pace over the three scenes that do not show it
  (`waiting` in `frames.ts`). See findings, "A hidden painting's travel".
- Reduced motion: the picture cuts through white; the lattice and frame
  stay.
- Without JS: the page as a document, the meeting whole beside it; no
  sheet.

## Files

| File | Change |
| ---- | ------ |
| `lib/stage-math.ts` | `lattice`; `Geometry` as a rectangle; `windowGeometry` and `openGeometry` on the lattice |
| `components/new/sheet.ts` (new) | `sheetPlan(script, panel)`: the frame, ticks, zones, strip and key plan in panel pixels |
| `components/new/notes.ts` (new) | The marks on the paintings, laid out for a panel |
| `components/new/frames.ts` | Shutters round a rectangle; `rule:<side>`, `note:<n>`, `strip:<scene>`, `keyplan`, `keyplan:window`; `waiting` |
| `components/new/zoom-panel.tsx` | The sheet's layers; the commas placed on the lattice |
| `components/new/stage.tsx`, `app/globals.css` | The stride; the copy on one line; the wrap within two pixels of the last snap |
| `components/new/scenes.ts` | `NOTES` |
| Tests | Lattice properties at every screen; every resting edge on a lattice line; notes inside the picture; keyframe budgets; a hidden painting's pace |
