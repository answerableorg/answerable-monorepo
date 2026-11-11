# Round 10 design

From `findings.md`. Three changes; the first two answer the owner's first two
points together, the third the third.

## 1. A rest near a scene shows the scene

- `REST` goes from 2% to 12.5% of a stride (4 of the 32 samples) and applies
  to the whole frame, not only to the panel: the copy, the values' index, the
  shutters, the rules, the strip and the paintings all stand still while the
  scroll is within an eighth of a stride of a snap point (58 px on a phone,
  44 px with a mouse). The change plays over the middle three quarters.
- Why an eighth: the rests seen were 4% and 9% off; a phone's toolbar, which
  can hold the visible page that far from the page's layout, is about 12% of
  a phone's stride.
- Cost: a change is a third quicker for the same scroll, and the first 58 px
  under a finger move nothing. The page snaps, so no rest is inside a change.
- Not taken: a script that scrolls a rest back onto its snap point. Where the
  browser's own snap has finished there is nothing to correct, and a script
  that scrolls against a finger is its own defect.

## 2. The marks are not placed by the scroll

- A note leaves the scroll's frames (`frames.ts` no longer makes `note:<n>`).
  It is laid out once for the panel, where its painting rests on its scenes,
  and is hidden while anything moves.
- So no engine can place a mark from one scroll position and its painting
  from another: within the rest band the painting is at rest, and outside it
  the marks are not there.
- The page decides when a scene has arrived (`stage.tsx`): the scroll has
  been still for 140 ms within 10% of a stride of a scene. Then that scene's
  notes are switched on. Any scroll that leaves that band switches them off
  at once, before the picture starts to move at 12.5%.

## 3. The marks are drawn after the picture arrives

- Every mark is one stroke, drawn from its first point to its last
  (`stroke-dashoffset` on a path of length 1): an outline goes round its
  shape, a circle round, a dimension along its line then its witness lines,
  an angle along the table then round its arc. A chain line is revealed
  through a mask drawn the same way, so its dashes do not crawl.
- Order: 160 ms after arrival, the marks in the order the script lists them,
  140 ms apart. A stroke takes 2.2 ms a pixel, between 320 and 900 ms, easing
  out. An outline's squares pop in as its stroke passes them; figures fade in
  when their line is done. The white under a line is drawn with it.
- Leaving: gone at once, and drawn again on the next arrival.
- Reduced motion: no drawing; the marks fade in on arrival.
- The hero's marks wait for the splash to lift.
- It plays only at rest, on a few small SVGs, so it costs the scroll nothing.

## What the owner decides

| #   | Question                                                | Proposed                                                                                     |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D1  | The rest band: an eighth of a stride?                   | Yes; say if the first move under the finger feels dead                                       |
| D2  | The drawing's pace (about a second for a scene's marks) | As above; easy to quicken or slow                                                            |
| D3  | A look on your phone before main                        | Push the branch so Vercel builds a preview address for it                                    |
| D4  | Measure in Firefox 159 here                             | Download it (about 140 MB, mozilla.org) into the scratchpad; the installed 138 is left alone |

## Checks

- By layout, in Chromium, WebKit and Firefox 138: every mark on its painting
  at rest on, and 2% to 10% either side of, every scene; nothing moving
  inside the band.
- The drawing: frames captured through an arrival in each engine.
- Frame times through the values in WebKit and Chromium at phone size, as in
  round 8, since the frames changed.
- Not possible here: Firefox 159 on a phone, where the defect was seen.
