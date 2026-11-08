# Findings, round 4

Read and measured 8 November 2026. Nothing submitted, nothing deployed.

## What arrived

- **Narrative PDF**, one page. The approach line ("You'll develop an approach you can apply across whichever AI tools your practice uses, now and in the future."), "Built upon six core values" with its intro and the six values, "The people behind the programme" (Keir Regan-Alexander, Sadie Morgan OBE, "Together…"), "Join the founding cohort" (two paragraphs). Every line is already on the page today, word for word.
- **Zip**: `Hero Image - 6 Core Principles.png` (1086×1448, 2.5 MB) and `Zoom 1.png` to `Zoom 6.png` (about 1380×775). **No portraits.**
- **The zooms are slides**: the six values on the left, the active number in colour; on the right, a colour field with a comma-shaped window onto one detail of the hero, the window placed roughly where that detail sits in the full picture.

| Zoom | Value                      | Detail in the hero                             | Window head on the slide | Field           |
| ---- | -------------------------- | ---------------------------------------------- | ------------------------ | --------------- |
| 1    | Answerable for our work    | The older woman signing the plan, bottom right | 164 px, lower right      | Green `#9cad56` |
| 2    | Competent                  | The man measuring the model with a ruler       | 210 px, upper centre     | Coral `#db8c65` |
| 3    | Honest                     | The woman pointing, the man reading, the ruler | 198 px, top centre       | Sky `#b3d7e3`   |
| 4    | Respect others' work       | Hands placing the name plaque on the model     | 132 px, centre left      | Sand `#f0de99`  |
| 5    | Protect information        | The sealed envelope passing between two people | 132 px, bottom left      | Green `#9cad56` |
| 6    | Strengthen our professions | The two at the laptop, upper right             | 223 px, upper right      | Coral `#db8c65` |

The four field colours are the brand's four highlights as they come out of the deck tool (`--highlight-1` to `-4`: `#a8dce8`, `#f3dd8f`, `#98af48`, `#e9895e`). The page uses the tokens, so the splash, the fields and the index share one palette.

## The page today (main 9e0b3cde)

- Two columns from lg: copy on the left (560 px), a framed sticky image on the right that crossfades between three panels as sections pass. Phones: a 2:1 banner above each section.
- Copy: hero paragraph, AI Lead role (3 paragraphs), six values with intro, people (3 paragraphs), AP programme (4 benefits, each a lead and a sentence), join (2 paragraphs, form, note). About 620 words before the form; at 1440×900 the form starts near 1622 px.
- The Answerable AP stamp sits above "Join the founding cohort" at every width (29c5ed26) and on the AP panel. The owner wants the one above the form gone.
- `/` shares `WaitlistForm` and the sheet; `/new` uses `joinFoundingCohort` (email, country, business name, headcount band, all required).

## The comma

`COMMA_PATH` is a square head (48 units) plus a tail with one cubic curve; its box is 48.21×72.002. Translate and uniform scale keep a cubic Bézier a cubic Bézier, so the window can be recomputed each frame as a CSS `clip-path: path(…)` in pixels: no SVG mask, no giant mask raster when it opens over the whole panel.

## Constraints that shape the build

- **iOS keyboard in a sticky stage.** Focusing a field makes Safari scroll and pan to show it; in a scroll-driven stage that would move the scene. Freeze the stage and turn snapping off while a field has focus; restore the hero's position on blur.
- **No-JS.** The stage only exists once a script marks `<html>` before first paint; without it the scenes are ordinary sections, all copy readable, the hero image beside them.
- **Reduced motion.** No camera moves: each scene's end state, crossfaded.
- **The repository is public.** Nothing private in these files.

## Measured on the build (8 November 2026)

**Every scene fits.** Content bottom against the scene area, in px; the lines' own boxes, no transforms.

| Window    | Shape            | Hero     | Programme | Values   | People   | Join     |
| --------- | ---------------- | -------- | --------- | -------- | -------- | -------- |
| 375×667   | band 251         | 345/362  | 332/362   | 268/362  | 296/362  | 216/362  |
| 390×664   | band 248         | 313/362  | 304/362   | 268/362  | 296/362  | 216/362  |
| 390×844   | band 388         | 313/402  | 376/402   | 268/402  | 392/402  | 216/402  |
| 768×1024  | band 471         | 265/499  | 280/499   | 212/499  | 292/499  | 192/499  |
| 844×390   | column 415×360   | 343/344  | 338/344   | 296/344  | 316/344  | 282/344  |
| 1024×600  | column 505×570   | 406/450  | 409/450   | 349/450  | 397/450  | 325/450  |
| 1280×720  | column 633×690   | 418/562  | 425/562   | 385/562  | 425/562  | 369/562  |
| 1440×900  | column 713×870   | 508/742  | 515/742   | 475/742  | 515/742  | 459/742  |
| 2560×1440 | column 1273×1410 | 778/1282 | 785/1282  | 745/1282 | 785/1282 | 729/1282 |

No sideways scroll at any size. The form's second step folds the band on phones: at 375×667 every field and the button show.

**Real input, headless Chromium, real frames.** Desktop 1440×900, alternating Arrow Down and a 600 px wheel; phone 390×664 with touch drags. Each gesture moves exactly one scene: tops 0, 900 … 8100, then the tenth lands on y 0 with the hero current, the eleventh on scene 1. No console errors. Videos: `answerable-new-desktop.webm` (26 s), `answerable-new-mobile.webm` (32 s), sent to the owner, not committed.

**A slow, short precise scroll stays on its scene.** A 120 px synthetic wheel returned to y 0: mandatory snapping takes the nearest snap point for an end-position scroll. Keys, mouse wheel notches and flicks move one scene.

**Form, by real clicks at 375×667 with touch emulation:** empty Continue shows "Please enter your email address." and keeps focus; Continue with an address opens step two, focuses Business name, freezes the stage and folds the band; an empty submit shows the three errors and keeps the email and name; a full submit (name `=Acme Architects`) shows the thank-you, unfreezes, returns the band, and the server logged only the address (no sheet in the worktree).

**No-JS** (JavaScript off, 1440 and 390): no `data-stage`, every scene in the column, all four fields and the button visible, the six values listed with their numbers. **Reduced motion:** no line moves; the picture cuts at the midpoint. **Keyboard:** from value 2, Tab goes logo, header link, then the email field, which brings the hero back (y 0); the header link from value 6 and the join button both land on the hero with the email focused; the rail's Value 4 square fades, jumps to y 4500 and fades back.

**iOS Safari 18.3 (simulator, iPhone 16 Pro),** opened with `simctl openurl`: the hero renders above the bottom toolbar (small viewport units hold), the badge on the sky, the form visible. Swipes, the keyboard and the loop are not tested there yet.

**Gates:** typecheck 0, lint 0, web tests 145 pass (18 new in `lib/stage-math.test.ts`), `next build` 0 with `/new` static and one `h1`, knip reports nothing in `apps/web`.

**Not covered:** gestures and the keyboard in real iOS Safari; WebKit's snap feel on a Mac trackpad; the live Google Sheet.

## Performance, alignment and square windows (owner, later on 8 November)

The owner: "it can be a bit slow even on a nice computer", "Think deeply on actual vertical / horizontal alignements", "for the zoom part, we could use also a square not only the comma".

**Where the time went (production build, M1 Pro, Chromium on Metal, nine real scroll gestures, traced).** The main thread was light, p99 task 3.4 ms. The hitch was on the GPU thread: `FinishPaintRenderPass` and GPU tasks of 52 to 195 ms during the first transitions, a 333 ms frame. Cause: the comma was a `clip-path: path()` recomputed each frame over the picture, so the browser re-rendered a mask the size of the panel, or larger while the comma opened past it. The splash measured clean (no frame over 20 ms) and stays as it was.

**What changed.**

- The window is two rectangle clips moved by `transform`: the head, and under it the band that holds the tail, whose curve two static shapes in the field's colour carve out. Each clip holds the same picture, moved by `transform` (one 87 KB AVIF, one decode). No mask, no per-frame paint.
- The field fades one solid layer over another instead of repainting a `color-mix` background.
- The engine writes a style only when it changes, skips scenes that stay off screen, and reads no layout while drawing (sizes measured on resize). Lines, statements and the index get their own layers.
- The drawn progress lags the scroll by 45 ms, not 70.

| Chromium, CPU slowed 4×                    | Before          | After   |
| ------------------------------------------ | --------------- | ------- |
| Script                                     | 1,154 ms        | 276 ms  |
| Style recalculation                        | 352 ms          | 130 ms  |
| Paint                                      | 194 ms          | 86 ms   |
| Pre-paint and layerize                     | 367 ms          | 162 ms  |
| Longest main-thread task                   | 12.9 ms         | 6.5 ms  |
| GPU or compositor tasks over 30 ms (at 1×) | 5, up to 195 ms | 0       |
| Worst frame (at 1×)                        | 333 ms          | 16.8 ms |

| WebKit 26.6 (Playwright), smooth scroll scene to scene | Before        | After        |
| ------------------------------------------------------ | ------------- | ------------ |
| Desktop: frames over 20 ms, p99, worst                 | 5, 20, 25 ms  | 0, 19, 19 ms |
| Phone: frames over 20 ms, p99, worst                   | 22, 22, 25 ms | 0, 19, 20 ms |

**Square or comma.** The comma's head is the logo's square, so a square window is the comma with its tail slid up under the head: the two turn into each other as the reader scrolls. Values 1, 2, 4 and 5 are squares; 3 (honest: the speech mark) and 6 are commas, and so is the programme's black window. Keir's portrait is a square, Sadie's a comma. A window's view is kept inside the picture: the black comma's tail ran past the illustration's bottom, and the laptop window past its right edge on large screens.

**The grid, measured** (logo's capitals top, badge top, rail squares' bottom, each scene's middle):

| Window    | M   | Logo top | Badge top | Rail bottom | Scene middles |
| --------- | --- | -------- | --------- | ----------- | ------------- |
| 1024×600  | 32  | 32       | 32        | 568         | 300 ×5        |
| 1280×720  | 48  | 48       | 48        | 672         | 360 ×5        |
| 1440×900  | 48  | 48       | 48        | 852         | 450 ×5        |
| 1920×1080 | 64  | 64       | 64        | 1016        | 540 ×5        |
| 2560×1440 | 64  | 64       | 64        | 1376        | 720 ×5        |

Phones and tablets: the logo, the copy, the badge and the windows share one edge, 24 px on phones and the copy column's edge on a tablet (97 px at 768×1024). A phone on its side: logo and badge both on y 24. Every scene fits at all eleven sizes, from 375×667 to 2560×1440.
