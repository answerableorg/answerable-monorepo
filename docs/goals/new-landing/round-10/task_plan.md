# Round 10: marks that hold their place, a scroll that lands, marks that are drawn

## Goal

Owner, 2026-11-11, with two screenshots from Firefox on a phone (Value 2 and
Value 5, the outline beside its plaque and its envelope):

1. "On mozilla mobile, those aren't well aligned": the marks sit beside the
   details they are drawn for.
2. "A little scroll defect on mobile where the scroll stops not perfectly at
   the right snap and goes a little after or before (so we don't see the
   correct position or it's a bit janky)."
3. "Animate the appear of the lines and details we add (animate the lines
   like if they're drawn) after the image appears (so we see they're above
   and separate!!)."

"Plan with files." Nothing lands on main without the owner's green light.

## Phases

| #   | Phase                                                                              | Status                                                                                                                            |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Worktree `claude/new-landing-r10`, these files                                     | complete                                                                                                                          |
| 2   | Reproduce the misalignment: where the marks and the painting part                  | complete: not reproduced in Firefox 138, Chromium or WebKit; cause read from the screenshots and Firefox 159's release (F1 to F7) |
| 3   | Reproduce the off-snap rest in Gecko                                               | blocked: needs Firefox 159 (F8)                                                                                                   |
| 4   | Design (`design.md`)                                                               | complete                                                                                                                          |
| 5   | Build: rest band for the whole frame, marks off the scroll, marks drawn on arrival | complete                                                                                                                          |
| 6   | Verify in Chromium, WebKit and Firefox 138; gates                                  | complete (F10)                                                                                                                    |
| 7   | The owner's look on a phone with Firefox 159, then the green light                 | pending                                                                                                                           |

## Questions to answer before any code

- Q1. At what scroll progress do the owner's screenshots sit? Round 7 matched
  the same offset to the marks at progress 6.08 with the painting at 6.00.
- Q2. Do the marks and the painting part in every engine when the scroll
  rests off a scene, or only with the script driver (no `ScrollTimeline`)?
- Q3. Why does Firefox on a phone rest off a snap point: the snap itself, the
  toolbar that hides, or what the page does on `scrollend`?
- Q4. What tells the page a scene has arrived, so the marks can be drawn then?
- Q5. What can draw a line "as if drawn" cheaply: `stroke-dashoffset` on a
  path of known length, for chain lines a mask; what runs off the main thread
  does not matter here, as nothing scrolls while it plays.

## Decisions

See `findings.md` (what was measured) and `design.md` (what is proposed).

## Errors

| Error                                                                                   | Attempt | Resolution                                                                                                           |
| --------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| The Android emulator would not boot: "No initial system image"                          | 1       | Its system image is gone from the SDK (37 MB left); not downloaded. Firefox for Android not run                      |
| Firefox 138 has no `ScrollTimeline`, with its preference on or off                      | 1       | It can only run the script driver; Gecko's own playing needs 159                                                     |
| Keyframes of the title strip over the test's limit after the rest band (138, limit 120) | 1       | The strip's word changes moved onto the sample grid: a third to a half of the change is 12/32 to 16/32 of the scroll |
| The painting strayed 0.58 px from its exact path (limit 0.5)                            | 1       | Three quarters of a change's samples fall in the glide now: `REACH` 1,000 to 560                                     |
