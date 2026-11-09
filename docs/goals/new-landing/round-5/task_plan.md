# Round 5: three paintings

The root `task_plan.md`, `findings.md` and `progress.md` belong to the customer-app sign-in audit. This round's files live here; the session log stays in `../progress.md`.

**Goal.** Replace the one hero illustration on `/new` with three gouache paintings, each in its own part of the stage, served at the size each screen needs. Remove the coded Answerable AP stamp, since every painting now carries the badge. Make the logo a little larger and the value zooms larger.

Plan and report first; no code until the owner has read the report and answered the decisions.

## The request, as given (owner, 9 November 2026)

- "we have new images to use in the download folder. Look at "OneDrive_1_09-11-2026"."
- "We have three images, one for when we land."
- "One, which is landscape like, where we have our value, we could zoom on parts of the images."
- "and one image for the "answerable AP" part (remove the one we have in code, because now the badge appears on the images)."
- "Display the logo a bit bigger please and when we "zoom" let's display the zoom in bigger squares."
- "We want to have images size opitimised per screen sizes (compress them)."
- "Take the time." "Let's do a good work, plan with files and report before coding."

## Phases

| #   | Phase                                                                               | Status                          |
| --- | ----------------------------------------------------------------------------------- | ------------------------------- |
| 1   | Read the three paintings, the current stage and how images are served today         | complete                        |
| 2   | Probe: compression and per-screen bytes, the details to zoom on, the matched cuts   | complete                        |
| 3   | Report with decisions; owner answers                                                | complete                        |
| 4   | Masters: compressed sources in `apps/web/assets/new/`, the old hero removed         | complete                        |
| 5   | Panel: one picture per scene part, the cut between paintings, no coded stamp        | complete                        |
| 6   | Values: six details in the panorama, larger windows; logo larger                    | complete                        |
| 7   | Per-screen sizes: `sizes` per painting, bytes measured per screen                   | complete                        |
| 8   | Verify: 375×667 to 2560×1440, phone landscape, reduced motion, no-JS, frames; gates | complete; one WebKit frame open |
| 9   | Show the owner; land on main after approval; check Vercel; remove the worktree      | pending                         |

## Decisions

Asked with the report (https://claude.ai/artifact/L3mphBzURR1bC56NtjXKfS, private); the owner took every recommendation on 9 November 2026.

| #   | Question           | Answer                                                                               |
| --- | ------------------ | ------------------------------------------------------------------------------------ |
| D1  | Window shape       | Squares only; the comma stays in the logo, the splash and the portraits              |
| D2  | Square size        | Two thirds of the panel's shorter side (0.64) beside the copy; 0.8 in the phone band |
| D3  | The six details    | The six proposed, left to right across the panorama                                  |
| D4  | Panorama sharpness | Up to the full 6,000 px on laptops and large screens                                 |

Not asked, read from the request: the meeting is the landing painting (by elimination) and returns for the join scene.

## Errors encountered

| Error                                                   | Attempt                             | Resolution                                                               |
| ------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| AVIF masters came through as 100×100 with no blur       | Turbopack's static import           | WebP q90 masters                                                         |
| `PAINTING_SIZES` all NaN in tests                       | Under Bun an image import is a path | Sizes declared in `scenes.ts`, checked against the WebP header in a test |
| Byte estimates 20% low                                  | Estimated with sharp 0.34.5         | Next bundles sharp 0.35.5; measured on the build instead                 |
| Chromium GPU stalls of 42 to 49 ms, 3 loads in 8        | Values at three different zooms     | One zoom for all six (span 1,000)                                        |
| WebKit hitches up to 178 ms                             | Scaled clip holding three paintings | Paintings placed directly; four sliding white shutters frame the square  |
| WebKit hitches as paintings came back or faded together | Opacity 0 and simultaneous fades    | One opacity change at a time, the meeting always opaque, `GHOST` not 0   |
| `object-fit: fill` once measured                        | To let WebKit composite the bitmap  | No gain; reverted                                                        |
| Studio at the bottom of the stack                       | So it never changes opacity         | Worse in both engines; reverted                                          |
