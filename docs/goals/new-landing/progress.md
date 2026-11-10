# Progress

## 2026-10-29

- Read `/` (`app/(site)/page.tsx`), its dark root layout, the waitlist form, the logo data in `@answerable/ui`, DESIGN.md and the seven supplied images; measured the images and the accent contrasts (findings.md).
- Wrote the design (design.md) with seven open questions. Waiting for the owner's answers before any code.
- Owner: the banners are references only; images 6 and 7 are the site's images. Copied them to `apps/web/brand-source/` and gave each section its own crop of one of them.
- Owner answered (D1–D7 in design.md): splash once per page load, white comma on random accents, keep the accordion, lockup in code, image right, noindex.
- Worktree `.claude/worktrees/new-landing`, branch `claude/new-landing`, from origin/main f5ac3da7. Images moved to `apps/web/assets/new/`; framings checked on a contact sheet; one `next/image` per file with `object-position`, no baked crops.
- B1 (Sonnet 5.5) built the route group `(new)`, the page, `components/new/*`, the splash (CSS keyframes in `globals.css`), `autoFocus` on the waitlist form and `onValueChange`/`size` on the accordion (`/` unchanged).
- Review in the Browser pane (dev server from the worktree, port 47110): splash scrubbed by pausing a clone's animations — dots at 200/400/600 ms, comma at 1.3 s, the hole concentric with the white comma (CTMs match the overlay centre), the page revealed through the growing comma by 1.75 s; random colour set before paint; opening a section crossfades the image column; phone 375 has no sideways scroll; lockup comma sits on the cap line with its tail below the baseline; no console errors.
- Gates: typecheck 0, lint 0, web test 117 pass, Prettier clean, build lists `/new` as static.
- Browser-pane gotchas: `preview_start` reads the main checkout's `.claude/launch.json`, so a temporary entry with `bun run --cwd <worktree>/apps/web dev` was added and reverted; the hidden pane shows stale frames when animations are scrubbed, so wait a second before each capture and trust `getScreenCTM` over a small screenshot.
- Owner feedback round 1: comma too big; content shifts when a section opens; "Register your interest" did nothing; remove the docs link.
  - Lockup: measured the banner lockup at 4× (comma 1.26 cap tall, top 0.09 cap above the capitals, tail 0.17 cap below the baseline, gap 0.45 cap; Public Sans cap height 0.723 em); the comma is now sized and placed in CSS `cap` units (18.2 px on 20 px text, was 22 px).
  - Shift: with every section closed the page fits a tall window, so opening one adds a scrollbar and both columns lose 15 px (text moved 3.75 px, image rescaled). `scrollbar-gutter: stable` on `<html>` in the `(new)` layout; the heading stays at x 76.25 open or closed.
  - Register link: it worked, but the form is usually on screen already and the page cannot scroll further, so it looked dead. `components/new/register-link.tsx` scrolls the form into view and focuses the email field; `#join` stays as the no-JS fallback; `scroll-mt-8` on the section.
  - Footer: docs link removed.
  - Gates: typecheck 0, lint 0, 117 tests pass, Prettier clean.
- Owner: frame the image with the gutter's width. The image column now has a white frame top, bottom and right as wide as the scrollbar's gutter (15 px here), the gutter itself being the right side; where scrollbars overlay the page the frame is 16 px. This Chrome leaves a `scrollbar-gutter: stable` gutter out of `100vw` (both 1425 px), so CSS cannot measure it: `FRAME_SCRIPT` (in `image-column.tsx`, inlined in the layout) sets `--gutter` and `--frame` before paint, again on DOMContentLoaded and load (the first run read 0) and on resize. Measured: 15 / 15 / 15.
- Owner: the frame was wider on the right on large screens. When the whole page fits the window, `clientWidth` reports no gutter although `scrollbar-gutter: stable` keeps one, so the right side was 16 + 15 px. `FRAME_SCRIPT` now reads `innerWidth - body width`. Measured top / bottom / right = 15 / 15 / 15 at 1440×800, 1440×1300, 1920×1080 and 2560×1440.
- Owner: the same frame around the splash. The colour field now sits inside a white frame as wide as the gutter (15 px top, left and bottom; on the right the gutter, which is outside the fixed overlay). The frame is a border on a transparent box, not a white backdrop, so the comma's hole still shows the page; it fades over 2000–2200 ms as the comma finishes opening, when it lines up with the image column's own frame. Measured 15 / 15 / 15 / 15 at 1440×900.
- Owner approved. Build 0 (`/new` static); landed on main.

## 2026-10-29, round 2

- Team feedback on the live `/new` (four points, quoted in `round-2/task_plan.md`) and Laura's six examples (`round-2/laura-examples.webp`). Worktree `.claude/worktrees/new-landing-r2`, branch `claude/new-landing-r2`, from 80adc027.
- Measured Laura's marks (3.5 % of a tile), the live page's form position at four window sizes, three probed layouts (edited live in the browser), the phone banner at 4:3, 2:1 and 5:2, and white-text contrast over the current image with and without a scrim (`round-2/findings.md`).
- Wrote the design with decisions R1–R6 (`round-2/design.md`). Report next; no code before the owner's answers.
- Report published: https://claude.ai/artifact/J77ySnQK2QoYB4GYTcqRbb (mock-ups of the five panels, contrast and form-position tables, R1–R6). Waiting for the owner's answers.
- Owner answered R1–R4 with the recommendations (panel per state, gradient scrim, option A, AP lockup on the panel and above the form). R5 (3.5 % marks) and R6 (2:1 phone banner) on the recommendation, to confirm with the go-ahead.
- Owner: go ahead, R5 3.5 % marks, R6 2:1 phone banner.
- C1 (Sonnet 5.5) built the panel system: `panels.ts`, `panel.tsx` (image, statement, window; `column`, `banner`, `responsive` shapes), `grid-frame.tsx`, `frame-script.ts`; deleted `framings.ts`, `panel-image.tsx`, `image-column.tsx`. One `<h1>` in the built HTML.
- Coordinator fixes after review: the Answerable AP lockup above the form cost 45 px and pushed the button to 904 px, so from lg it sits on the heading's line (button back to 860 px); on phones it stays above the heading. Phone section panels drop their title (`bare`), which the accordion shows right above.
- Measured in the Browser pane: button bottom 860 px at 1280, 1440 and 1920 wide; marks 22 / 25 / 33 px (3.5 % of 633 / 713 / 953 px panels); headline 40.6 px at 1440, 48 px at 1920, 24 px on a phone; phone banner 188 px, sections at 530 px, join at 754 px; one `h1`; no sideways scroll at 375; all five panels render. The pane sometimes captured the hero image unpainted on first load below lg and at 1920; a plain reload painted it, and hiding the other panels showed it was a missed repaint in the pane, not layout. Gates: typecheck 0, lint 0, 117 tests, Prettier clean, knip no new findings.
- Owner approved round two. Build 0 (`/new` static, one `h1`); landed on main.

## 2026-11-02, round 3

- Owner and cofounder feedback (quoted in `round-3/task_plan.md`): no click to expand, the image follows the scroll, the rectangular AP badge back, words large and in the middle, business name and headcount on the form.
- Measured the live page at five window sizes, white-text contrast in the middle of each crop, and how the sheet library treats formula strings (`round-3/findings.md`). Wrote the design with decisions E1–E4 (`round-3/design.md`). No code.
- Report published: https://claude.ai/artifact/3yjMeYyeEv9uyom5tpA2YV (working scroll mock-up, the five panels, contrast and scroll tables, E1–E4).
- Owner answered E1–E4 with the recommendations: images in the flow on phones, words in the middle on every panel, the six values on the left, business fields required with headcount bands.
- Owner: build it, show before landing. Worktree `.claude/worktrees/new-landing-r3`, branch `claude/new-landing-r3`, from origin/main 583454a6 (local main is 4 commits ahead with unpushed ID and Next work, so it is not the base). Built inline, not through Codex: about 15 files with tight browser checks. Temporary `web-r3` entry in the main checkout's `.claude/launch.json`, to revert.
- Measured on the build, by walking the real page in 5 px steps. Scroll per panel (hero, AI Lead, values, people, AP): 1280×720 60/295/400/360/745; 1440×900 55/280/370/340/615; 1920×1080 50/260/340/315/515; 2560×1440 40/210/285/255/330. Order always hero to AP. One `h1`, no sideways scroll, no console errors. Phone 375×812: page 4574 px, join at 3731.
- Form, by real clicks at 1440 and 375: empty submit shows all four errors; a missing country is refused; a full submit with the name `=Acme Architects` succeeds and logs only the address. The worktree has no `.env`, so nothing reached the live sheet. `/` still has four accordion triggers, 14 px titles and only email and country.
- Found on the build: at 2:1 a 3:2 image has no room to crop, so the AI Lead banner was the hero's picture again. Added `bannerZoom` (1.8) for that panel on phones.
- Gates: typecheck 0, lint 0, web test 0, Prettier clean, `next build` 0 with `/new` static. Not covered: the live Google Sheet; the formula fix rests on the library probe (`stringValue`) and the `Cell` type, which no longer has `value`.
- Owner approved. Landed on main, only this work: local main's four unpushed commits stay local.
- Owner: remove the AI Lead illustration on desktop and phones, "it's too much". The panel, its phone banner and `bannerZoom` are gone; the section keeps its visible heading, and the hero panel stays until the values section.
- Owner: the Answerable AP stamp goes above "Join the founding cohort" at every width, not on its line from lg.

## 2026-11-08, round 4

- Owner feedback (quoted in `round-4/task_plan.md`): reads like a slide deck, too much copy, one scroll-bound sticky section at a time, form first, a seamless loop from the bottom to the top, the narrative PDF, the team, the hero's zooms per value, a value-first hero, no stamp above the form, phones as good as desktop.
- Read the PDF and the seven images; sampled the zoom fields (the brand's four highlights). No portraits in the zip. Wrote `round-4/` plan, findings and design. Worktree `.claude/worktrees/new-landing-r4`, branch `claude/new-landing-r4`, from origin/main 9e0b3cde. Owner said go ahead, so building without a report first.
- Built inline in the worktree: `stage.tsx` (engine), `zoom-panel.tsx`, `scenes.ts`, `cohort-form.tsx`, `lib/stage-math.ts` with tests, `lib/waitlist-rules.ts`; the old panels, landing, register link, scroll rule and both photographs deleted; `WaitlistForm` lost its cohort mode. Temporary `web-r4` entry in the main checkout's `.claude/launch.json`.
- Found and fixed while measuring: phone scenes overflowed (band now gives way, spare lines drop, rail only in columns); phone landscape overflowed (`cols` covers it); the form's second step did not fit (band folds); value statements ghosted at the midpoint (odometer roll in a clipped box); portrait halves opened a gap (one sheet); a failed submit emptied the fields (transition submit); rail squares did nothing (delegation).
- Measured: every scene fits from 375×667 to 2560×1440; real input walks one scene per gesture and loops to y 0; form, no-JS, reduced motion and keyboard as in `round-4/findings.md`. iOS Safari in the simulator renders the hero; gestures wait on the owner's grant.
- Gates: typecheck 0, lint 0, web test 145 pass, build 0 (`/new` static, one `h1`), knip clean in `apps/web`. Committed on `claude/new-landing-r4`; not pushed. Waiting for the owner: approval to land, two portraits, the hero line.
- Owner: "NICE", then performance ("a bit slow even on a nice computer"), alignment, and a square window as well as the comma. Measured on a production build with traces (Chromium, Metal) and in WebKit 26.6 (Playwright's, installed for this): the hitch was GPU-side, a per-frame `clip-path` mask, up to 195 ms. Rebuilt the window as two transform-moved rectangle clips with static carving shapes; square and comma morph into each other; fields crossfade; the engine writes only changes and reads no layout per frame. Worst frame 333 → 16.8 ms; script at 4× 1,154 → 276 ms; WebKit phone frames over 20 ms 22 → 0. Set a margin grid: logo and badge on the top line, rail on the bottom line, scenes on the middle; phones on one gutter. Numbers in `round-4/findings.md`. Gates: typecheck 0, lint 0 (no warnings), web test 150 pass, build 0, knip clean.
- Landed on main 7fbe3e00 and live on www.answerable.org/new once Vercel was reconnected to `answerableorg/answerable-monorepo`.
- Owner sent Keir's and Sadie's portraits (black and white, 400×400). Converted to greyscale WebP (14 KB, 19 KB) in `assets/new/`; the placeholder monograms are gone. Sadie's photograph sits at `30% 50%` so her face fills the comma's head and her black top its tail. Found while checking: on a phone the band's bottom edge is fractional (442.69 px) and the portrait halves rounded a pixel short, showing a line of the illustration; the halves now overhang the panel's clip by a pixel. Checked at 1440×900, 1280×720, 834×1194 and 390×844: no console errors, both photographs loaded.

## 2026-11-09, round 4 follow-up

- Owner: still some slowness on prod; too many colours, no black background (white for now); no slide up and down on the right (owner chose: the portraits' slide only); both portraits in commas, like quote marks.
- Measured prod first. Headless Chromium on the M1 Pro GPU: every frame 16.7 ms, none over 25 ms, longest main-thread task 5.5 ms; WebKit clean. The owner's Chrome 155 (60 Hz, 5K display, 1728×937 at 2×): no dropped frames either. The slowness was the feel, measured on the owner's own smooth-scroll curve (937 px in 704 ms, its last tenth taking about 300 ms): smootherstep over the browser's eased snap moved the panel 0.25% by a tenth of the scroll, and the 45 ms smoothing left the drawing moving 100 to 117 ms after the scroll stopped.
- Changed: no smoothing (the stage draws the scroll's exact position each frame); a half-linear `scrub` pace in place of smootherstep; the copy lands by 92% of the scroll (`LAND`); line opacity now never shows two scenes at once for any line count (the old timing let multi-line scenes overlap faintly at the midpoint). Replayed on the owner's curve: panel moves at 133 ms (was 183), halfway at 217 (267), new copy in at 433 (617), last change at 583 (717).
- Found while measuring the build: one dropped frame at every arrival, caused by the rail squares' `background-color` transition (a paint; 0 drops with it switched off, 10 with it). The squares now scale and fade a colour layer, compositor only. Result, production build, Chromium desktop: 0 frames over 25 ms, script 152 ms against prod's 302, paint 24 against 55. At 4× CPU: desktop 3 drops (prod 2), phone 1 (prod 1), script 659 (prod 815). WebKit second runs clean for both.
- Programme field white. On white the tail showed two hairlines: where the picture and the covers were clipped at one edge, and where the band rises beside the head. The tail's picture is now clipped inside the band with the covers running past it, and a cover hides the rise; 0 non-white pixels left of the window.
- Portraits: both in the logo's comma, Keir's turned over (the opening quote mark, top left in the column), Sadie's as the logo (closing, bottom right). A turned comma with the photograph running through it cut Keir's head at eye level (no headroom in either photograph), so the photograph sits in the comma's head and the tail continues its edge tone: Keir's grey wall (#838383, with a fade), Sadie's black coat (#111). The portraits no longer slide: the colours fade in first, then the photographs, so a face never shows over the illustration; the picture behind moves only while covered.
- Gates: typecheck 0, lint 0, web test 153 pass, build 0 (`/new` static), knip clean.

## 2026-11-09, the stage on the compositor

- Owner: yes to moving the scroll animation off the main thread, after seeing frames missed at 120 Hz in their Chrome under load.
- Probes first, Playwright Chromium and WebKit 26.6: both have `ScrollTimeline`, read `rangeStart`/`rangeEnd` in pixels, step on two keyframes at one offset, and pause, resume and rebuild cleanly. In full headless Chromium, a 600 ms main-thread block mid-scroll froze a script-moved box while a scroll-timeline box kept moving every frame.
- Built: `components/new/frames.ts` gives every moving element's opacity and transform at any point of the scroll, from the same maths as before (colour changes become one solid layer per field colour, and per value colour in the index highlight); `timeline.ts` samples it into keyframes (32 a transition plus the curves' corners, simplified within 1% opacity and a quarter pixel). The stage plays them as one animation per element on a scroll timeline from the first snap point to the last; without scroll timelines it draws the same frames by script. Scene switches, the rail and the loop stay on scroll events. Tests: 16 new (frames at rest and between scenes, no jumps where transitions meet, two scenes never at once, reduced motion, and the picture within half a pixel of its exact path).
- Found and fixed: the panel's transitions rest for 2% at each end, a corner that sampling at 64 or 128 steps cut by 1 to 2 px; sampling the corners brought it under 0.5 px at any density. A panel folded away for the form measured as nothing and lost its animations; it now keeps its last size.
- WebKit's main thread slowed with keyframe count: 3,300 keyframes gave 80 to 92 frames over 20 ms across nine scenes, 1,800 gave 0 to 10, as the live page does. Hence 32 samples and the looser tolerance.
- Measured against live (www, the script driver): pixel-identical at rest bar text antialiasing (0 to 0.4% desktop, up to 1.7% phone); script fallback 0% different; WebKit 0 to 0.1%. With the main thread blocked 600 ms mid-transition, live's panel moved in 0 of 23 frames and jumped after; the new one moved in 14 of 22. No dropped frames on real gestures in Chromium; paint on the main thread 32 → 3 ms (phone at 4×: 102 → 2). The phone form freezes and thaws with the animations paused and resumed; rail, loop and reduced motion as before.
- Gates: typecheck 0, lint 0, web test 169 pass, build 0 (`/new` static), knip clean.

## 2026-11-09, a white panel

- Owner: no colour behind the picture while scrolling; the Answerable AP stamp only on the first scene, beside the form.
- Every value's field is white, as the programme's is, and the portraits sit on white halves (their comma tails keep the photographs' own grey and black). Neighbouring scenes in one field colour now share a layer, so the panel has one white field and one tail cover instead of seven of each. The stamp shows on the hero only, fading out over the first scroll and back in on the loop.
- Left as they were, not asked: the values' index highlight and rail squares in the four colours, and the people's coloured squares beside their names.
- Checked at 13 positions on desktop and phone: white panel throughout, stamp opacity 1 at the hero and 0 from the programme on, no console errors. Gates: web test 171 pass, typecheck, lint, build, knip clean.

## 2026-11-09, hero line

- Owner: hero headline "The professional standard for responsible AI."; the line under it ends "Register to join the founding cohort."; the programme title's "A" should start the second line, not end the first.
- The programme title sets each sentence on its own line, so "A practice that can answer for its AI." always starts a line.

## 2026-11-09, round 5: three paintings (plan)

- Owner: three new gouache paintings in `~/Downloads/OneDrive_1_09-11-2026/` (landing, the values as a panorama, the Answerable AP programme); remove the coded stamp; logo a bit bigger; bigger squares when zooming; images sized per screen and compressed; plan with files and report before coding.
- Plan in `round-5/` (`task_plan.md`, `findings.md`, `design.md`). Probes, all in the scratchpad: masters in four formats with PSNR against the PNGs; per-width AVIF and WebP with Next's encoder settings, calibrated against Vercel's live responses (WebP identical, AVIF within 15%); six detail crops; panel mock-ups at the owner's laptop and iPhone 15 sizes.
- Nothing changed in code. Waiting on the owner's answers to D1 to D4.

## 2026-11-09, round 5: built

- Owner took D1 to D4 as proposed. Built in worktree `.claude/worktrees/new-landing-r5` (branch `claude/new-landing-r5`, from c68271da), nothing committed yet: three paintings, squares only at 0.64 (0.8 in the band), the stamp and `GridFrame` gone, logo 24 px, `images.deviceSizes` up to 6000, per-painting `sizes` and quality.
- Measured on the production build (details in `round-5/findings.md`): images per screen 218 KB to 1,331 KB; Chromium better than live (no GPU stall, one slow frame per loop against live's 2 to 3); WebKit level with live except one frame of 37 to 89 ms at phone size entering the people scene.
- To get there: one zoom for all six values (Chromium GPU stalls); the square clip replaced by four sliding white shutters, one painting changing opacity at a time, hidden paintings at 0.2% rather than 0, plain dissolves (WebKit).
- Gates: typecheck 0, lint 0, web tests 175 pass, build 0, knip nothing new. Not tested on a real iPhone. Temporary `web-r5` entry (port 47150) in the main checkout's `.claude/launch.json`, to revert at the end.

## 2026-11-09, round 5: Safari, then committed

- Owner: "Fix Safari first". The WebKit work above; round 5 committed as `cabe7369` on `claude/new-landing-r5`.

## 2026-11-10, round 6: the panel as a drawing sheet

- Owner, with three inspirations: the right side "feels empty"; blueprint construction lines and a grid, always visible, the images below them and snapped to the grid; lines aligned with the image; pointing lines to details; "this thing has been thought out"; every screen size, desktop with the most detail; plan with files.
- Plan in `round-6/` (`task_plan.md`, `findings.md`, `design.md`). One rule: a line either belongs to the lattice or continues something in the painting.
- Built (`d4f031b4`, then this entry's commit): a lattice of square modules exactly at the panel's inset, every picture edge on a lattice line at rest (tested at every screen); a frame with zone ticks and labels; four rules carrying the picture's edges across the sheet; a title strip with the sheet number, the scene's name and a key plan of the studio; the commas on the lattice; on each painting the marks that continue it (the sun's circle and centre lines, the badge's outline and lettering lines, the axes of the pen, rule and arm, the outlines of the plate, envelope and print).
- Owner while it was built: lines "too visible … should not take too much power" (every colour see-through); "an extra line at the bottom" (the strip filled); "way faster" (the stride 22rem, 60svh under a finger); the copy shifted between scenes (every block now starts on one line); "remove the pointing lines" (leaders and labels gone); "keep the lines around the badge, those look nice" (the marks on the paintings kept).
- Measured on the production build (`round-6/findings.md`): a scene change 283 ms in Chromium (was 510) and about 183 ms in WebKit; no frame over 16.8 ms in Chromium and none over 33 ms in WebKit across every scene at desktop, large and phone sizes; the WebKit phone hitch entering the people scene gone (19 to 20 ms; it was 24 to 66 ms), because a large painting no longer travels fast while hidden; the loop wraps on a phone now, at a cost of two frames of 33 to 47 ms at rest on the WebKit phone.
- Gates: typecheck, lint, web tests 287 pass, web build, knip clean. Not tested on a real iPhone or with a real trackpad. Not landed: on `claude/new-landing-r5`, waiting on the owner. The temporary `web-r5` entry in the main checkout's `.claude/launch.json` is still to revert.
- Owner approved on 2026-11-10 ("land it on main please", "deploy it"). Rounds 5 and 6 landed on main together (`cabe7369`, `d4f031b4`, `94448464`), after typecheck, lint, the web tests and the full build on that tree. The temporary `web-r5` entry is out of the main checkout's `.claude/launch.json`.

## 2026-11-10, round 7: small points

- Owner, with a desktop and a phone image of Value 5: "i" and "o" missing down the Y axis; small alignment issues on the letter; the form should also ask for the full name; the values' numbers should be clickable.
- Zone letters: the whole alphabet now (`sheet.ts`), so I and O are there; a drawing sheet skips them, a reader counts them as missing.
- Envelope: its outline's four corners and the ruler's axis moved onto the painting (`scenes.ts`), measured against the master. The larger offset in the owner's phone image was not reproduced: it equals the marks at progress 6.08 with the painting at 6.00 on a 412 dp-wide screen, and did not show at rest in Playwright Chromium or WebKit, Safari on iOS 26.3, with reduced motion, with the script driver, or after resizes mid-scroll. Nothing changed for it; the owner is asked which phone and browser.
- Values' numbers: each is a button to its value (`data-go`, as the rail), named "Value n", `aria-current` on the one showing; its padding gives a finger 40 px. Checked on desktop Chromium, phone Chromium and phone WebKit.
- Full name: first field of the form's second step, focused after Continue; required, 200 characters at most, trimmed; written to a new `full_name` column, the sheet's last, which `ensureHeader` appends to the live sheet's header on the first signup after the deploy. Never logged.
- Five fields on a short screen: at the second step the heading gives way under 42rem of height on phones, the hero's paragraph under 40rem on wide screens, the disclaimer under 35rem on phones. Form bottom measured inside the screen at 320×568, 360×500, 360×560, 360×640, 375×667, 390×753, 412×775, 600×700, 768×1024, 844×390, 1024×600, 1280×640, 1280×720 and 1440×900.
- Flow proven against the local server, which has no sheet and only logs: an empty second step shows "Please enter your full name." under its field; 201 characters, the length message; a valid name, the thank-you line.
- Gates: typecheck, lint, web tests 295 pass, build. Not landed: on `claude/new-landing-r7`, waiting on the owner. Not tested on a real phone.

## 2026-11-10, round 8: the details the values show

- Owner, with six captioned crops of the studio painting: values 2, 3 and 4 focus on other details; values 1, 5 and 6 stay ("as is"). The words, numbers and colours keep their order.
- Value 2 now shows the hands setting the "Answerable AP" plaque on the model, value 3 the scale rule held to the model, value 4 the print on the easel (`scenes.ts`); the marks drawn on each detail moved with it, and the key plan follows.
- The picture travels further between values now: value 1 to 2 crosses about 1,680 px on a laptop's panel and 2,380 px on a large one (the longest was about 1,000 and 1,480). A change takes as many samples as its travel needs (`stepsFor`, `travelAt`), so the path stays within a quarter pixel.
- On a phone in WebKit those long pans gave frames of 83 to 123 ms: at its own size the studio is a layer 6,000 px wide that WebKit paints in tiles on the main thread as it pans. Each painting is now laid out as large as the page ever shows it on the panel, and its scale divided by the same shares (`fitOf` in `frames.ts`, `css` in `timeline.ts`): the studio 2,659 by 958 px on a 1440 by 900 screen, 1,812 by 653 px on a phone.
- Whole pixels, a scale each way and `object-fit: fill`, because Chromium draws an image into its box's whole pixels: in a box 2658.462 px wide the studio sat up to 0.37 px from its place on a value.
- Measured on the production build. Placement, a screenshot against the file resampled where the transform puts it: Chromium at 1440 by 900 within 0.16 device pixel on scenes 0 to 7 (own size: 0.13); phone Chromium, desktop WebKit and phone WebKit the same as at own size; the same with `ScrollTimeline` removed, so the script driver draws.
- Frames, worst per scroll: WebKit phone, 220 scrolls between values (the seven changes and the longest pan there and back): 214 with every frame under 25 ms, six with one or two long frames (26 to 124 ms, four of them in the first eleven scrolls after the load), on a Mac at a load of 11 to 13. WebKit desktop 33 of 35 under 25 ms, two with 30 and 38 ms. Chromium 17 ms, two stray 33s on the phone.
- Gates: typecheck, lint, web tests 305 pass, build. Not landed: on `claude/new-landing-r7` with round 7, waiting on the owner. Not measured on a real iPhone or in Firefox.
- Owner approved on 2026-11-10 ("Land on main", "push to prod too"). Rounds 7 and 8 landed on main together (`61f51b9f`, `e17bb51d`), after typecheck, lint, the web tests, the full build and knip on that tree. Production is Vercel's deployment of main; no ship tag is involved.
