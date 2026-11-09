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
| Frame | The lattice's outline and the strip's, in ink; ticks at every module; zone labels (numbers across the top, letters down the left, no I or O) | never |
| Rules | The picture's four edges continued across the lattice, in ink | with the shutters |
| Notes | One small drawing per scene: construction lines, leaders, labels | glued to the painting, fade |
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
  as drawn, the picture's edges, the rules, the leaders' ends, the commas.

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

## Notes (`components/new/sheet.ts`, tested)

A note is data in the painting's own pixels, turned into panel pixels
through the scene's settled placement:

| Mark | Drawn as |
| ---- | -------- |
| `axis` | The line through two points of a feature, continued to the lattice's edges; open squares on the two points |
| `outline` | A feature's corners joined, an open square on each: a shape shown as built |
| `circle` | A circle and its centre-lines (long dash, dot) |
| `leader` | From a point: 45° to the nearest lattice row, then along it to a lattice point outside the picture, ending in a filled square in the scene's colour; beside the copy, a label above the shelf |

Ink is `#2747d6`; any ink over a painting has a 3 px white casing under it.
A note fades out in the first third of a move and in over the last third,
and while it shows it moves with its painting (one transform).

| Scene | Beside the copy | In the band |
| ----- | --------------- | ----------- |
| Hero, Join | The sun's circle and centre-lines; leader from the badge: "ANSWERABLE AP" | The circle; the leader, no label |
| Programme | The badge's edges continued, a square on each corner; the sun's circle | The badge's edges |
| Value 1 | The pen's axis; leaders "PEN", "PLAN" | The pen's axis; one leader |
| Value 2 | The scale rule's axis; leaders "SCALE RULE", "MODEL" | The axis; one leader |
| Value 3 | The easel board's edges; leader "ELEVATION" | The board's top edge; one leader |
| Value 4 | The name plate's outline; leader "NAME PLATE" | The outline; one leader |
| Value 5 | The envelope's outline, a circle on the seal; leader "SEALED LETTER" | The outline; one leader |
| Value 6 | The print bed's line, the dome's circle; leaders "3D PRINT", "PRINT BED" | The bed's line; one leader |
| People | Each comma as a constructed glyph: the head's edges continued, the tail's 45° continued, squares on its corners, the curve's handle | The 45° lines and the corner squares |

Labels are new words on the page (an owner decision). "AP" is never
expanded. They live in `sheet.ts` and nowhere else.

## Tiers

| Where | Lattice, frame, rules | Ticks | Zone labels | Leaders | Labels | Strip text | Key plan |
| ----- | --------------------- | ----- | ----------- | ------- | ------ | ---------- | -------- |
| Beside the copy, inset ≥ 28 px | yes | yes | yes | all | yes | yes | yes |
| Beside the copy, inset < 28 px | yes | if ≥ 12 px | no | all | yes | yes | yes |
| Band | yes | if ≥ 12 px | no | one | no | if the strip ≥ 28 px | if the strip ≥ 28 px |

## Motion and cost

- Only opacity and transform, as everything else on the stage.
- The lattice and frame never animate. The rules are four 1 px elements
  with the shutters' own keyframes.
- New animated elements: 4 rules, 9 notes, 10 strip labels, the key plan
  and its window. Each note's element is its drawing's bounding box, not
  the panel.
- Reduced motion: the picture group crossfades through white as before;
  the lattice and frame stay.
- Without JS: the meeting, whole, as before; no sheet.

## Files

| File | Change |
| ---- | ------ |
| `lib/stage-math.ts` | `lattice`; `Geometry` as a rectangle; `windowGeometry` and `openGeometry` on the lattice |
| `components/new/sheet.ts` (new) | The notes as data; `sheetPlan(script, panel)`: every line, square and label in panel pixels |
| `components/new/frames.ts` | Shutters round a rectangle; `rule:<side>`, `note:<id>`, `strip:<scene>`, `keyplan`, `keyplan:window` |
| `components/new/zoom-panel.tsx` | The sheet's layers; the commas placed on the lattice |
| `components/new/scenes.ts` | `anchorY`; each state's note |
| Tests | Lattice properties at every screen; every resting edge on a lattice line; notes inside the panel; keyframe budget |
