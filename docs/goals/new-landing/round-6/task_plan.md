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
zone ticks and labels; a title strip; leaders from details of each painting
to small squares on the lattice; construction lines that continue what is in
the painting. All of it decoration (`aria-hidden`), none of it in the way of
the copy, and none of it costing a frame.

## Done means

- The lattice is drawn on every scene at every size, and every picture edge
  sits on a lattice line at rest (tested, not eyeballed).
- Each scene has its own notes, aligned to the painting to the pixel
  (checked by overlay at 1:1), glued to the painting while it moves.
- Desktop carries the most (labels, key plan, zone labels); the phone band
  carries the lattice, frame, ticks, rules, one construction line and one
  leader.
- Chromium and WebKit are no slower than round 5 (measured), the panel stays
  under 700 keyframes, reduced motion and no-JS still work.
- Gates green: typecheck, lint, `bun --filter web test`, build, knip.

## Phases

| # | Phase | Status |
| - | ----- | ------ |
| 1 | Commit round 5 (`cabe7369`) | done |
| 2 | Study the inspirations, the paintings and the stage code | done |
| 3 | Mock the sheet over real screenshots; write these files | done |
| 4 | Lattice and snap in `lib/stage-math.ts`; rectangular open state; the lattice, frame, ticks, labels and rules in the panel | pending |
| 5 | Notes: leaders, construction lines, labels, title strip, key plan; the commas on the lattice | pending |
| 6 | Every screen size; smoothness in Chromium and WebKit; keyframe count; reduced motion; no-JS | pending |
| 7 | Gates; report with screenshots; owner decisions flagged | pending |

## Owner decisions to flag in the report

1. **The hero is framed.** For "images snap to the grid" to hold on every
   scene, the hero painting covers the lattice, not the whole panel: 792×792
   inside 856×907 on the laptop, 345×302 inside 393×392 on a phone. The
   bleed variant was mocked and rejected (labels illegible over the
   painting, busy).
2. **New words on the page**: the leaders' labels (desktop only), listed in
   `design.md`. One file holds them.

## Not in this round

- Landing on main, the Vercel check, removing the worktree: on the owner's
  go-ahead only.
- A real-iPhone check (still owed from round 5).
