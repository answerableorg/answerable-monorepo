# Round 6: the panel as a drawing sheet

Owner, 2026-11-09, with three inspirations (a poster of construction circles
on a pale field, a glyph drawn as bezier curves with handles on a blueprint
grid, a stippled hand with leader lines ending in small squares):

> Right now, the right part feels empty. We want to add our own soul on top
> of those images. One idea I've got is to add those "blue print"
> "construction lines" "grid" which would be always visible and images would
> be below them and snap to the grid. […] I like also if we could add
> pointing lines to important details on the image. […] This will be for
> professionals, we want and need this feeling of "this thing has been
> thought out". If the lines can align somehow with the image we would have
> something perfect. […] It should work on every screen size, desktop being
> the one with the most details.

## Goal

The image panel becomes a drawing sheet: a lattice of square modules that is
always visible, with every picture under it and snapped to it; a frame with
zone ticks and labels; a title strip; construction lines that continue what
is in the painting. All of it decoration (`aria-hidden`), none of it in the
way of the copy, and none of it costing a frame.

Changed by the owner while it was built (2026-11-09):

- "The colors are not good, too visible (lines and so on, they should not
  take too much power)": every line is see-through.
- "Not sure why there is an extra line at the bottom": the strip is filled.
- "Could we get faster animations … Should be way faster": the stride.
- "On the left side … there is a shift of where things are started": every
  block of copy starts on one line.
- "Remove the pointing lines", then "keep the lines around the badge, those
  look nice": no leaders and no labels; the marks on the paintings stay.

## Done means

- The lattice is drawn on every scene at every size, and every picture edge
  sits on a lattice line at rest (tested, not eyeballed).
- Each scene has its own notes, aligned to the painting (checked by overlay
  at 1:1), glued to the painting while it moves.
- Desktop carries the most (zone labels, the strip's text, the key plan);
  the phone band carries the lattice, frame, ticks, rules and the notes.
- Chromium and WebKit are no slower than round 5 (measured), reduced motion
  and no-JS still work.
- Gates green: typecheck, lint, `bun --filter web test`, build, knip.

## Phases

| # | Phase | Status |
| - | ----- | ------ |
| 1 | Commit round 5 (`cabe7369`) | done |
| 2 | Study the inspirations, the paintings and the stage code | done |
| 3 | Mock the sheet over real screenshots; write these files | done |
| 4 | Lattice and snap in `lib/stage-math.ts`; rectangular open state; the lattice, frame, ticks, labels and rules in the panel | done (`d4f031b4`) |
| 5 | Notes on the paintings, title strip, key plan; the commas on the lattice | done |
| 6 | The owner's changes: quiet colours, the strip filled, no pointing lines, the copy on one line, the stride | done |
| 7 | Every screen size; smoothness in Chromium and WebKit; keyframe count; reduced motion; no-JS | done |
| 8 | Gates; report with screenshots; owner decisions flagged | done |

## Owner decisions to flag in the report

1. **The hero is framed.** For "images snap to the grid" to hold on every
   scene, the hero painting covers the lattice, not the whole panel: 792×792
   inside 856×907 on the laptop, 345×302 inside 393×392 on a phone. The
   bleed variant was mocked and rejected (text illegible over the painting,
   busy).
2. **The marks that are not round the badge** (the sun's circle and centre
   lines, the axes of the pen, rule and arm, the outlines of the plate,
   envelope and print) were kept under "keep the lines around the badge".
   Each is one entry of `NOTES` in `scenes.ts` and comes out alone.
3. **The marks' strength**: `--sheet-note` is ink at 0.75. The lattice and
   frame are far quieter; this one is the owner's to tune.
4. **The stride** (22rem with a wheel or trackpad, 60svh under a finger)
   was measured with a wheel and keys only. A real trackpad's momentum and
   a real phone's swipe are the owner's to judge.
5. **The splash** is still 2.2 s. "Way faster" was read as the scroll; the
   splash can be shortened in one place (`globals.css`).
6. **The people scene has no note.**

## Not in this round

- Landing on main, the Vercel check, removing the worktree: on the owner's
  go-ahead only.
- A real-iPhone check (still owed from round 5).
