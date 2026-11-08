# Design, round 4

Evidence in `findings.md`.

## 1. One scene at a time

The page is a **stage**: one screen, sticky, that never scrolls itself. Under it, a track of eleven snap points, one screen apart. The scroll position between two snap points is the progress between two scenes, so every change is scrubbed by the reader's own hand and comes to rest on a scene.

| #   | Scene      | Copy column                                  | Image panel                                                                |
| --- | ---------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| 0   | Hero       | Headline, one line, the form                 | The whole hero, the Answerable AP badge on its sky                         |
| 1   | Programme  | What a practice gets, four lines             | Black field closes in to a comma window on the model; badge turns white    |
| 2–7 | Six values | One value at a time, index 1 to 6            | Coloured field, the window travels to that value's detail and magnifies it |
| 8   | People     | Keir and Sadie, one line each                | Two colour fields slide up, one portrait window each                       |
| 9   | Join       | Join the founding cohort, one line, a button | The fields slide away; the whole hero again                                |
| 10  | (Hero)     | Same as 0                                    | Same as 0; on rest the page jumps to 0, which looks identical              |

- **Snap points** are `scroll-snap-align: start` with `scroll-snap-stop: always`, so a flick never skips a scene and a wheel notch moves one.
- **Progress** is read from the snap points' measured positions, so `svh`, address bars and zoom never drift it. The drawn progress follows the real one with a short exponential lag (about 60 ms), which smooths wheel steps without detaching from the hand.
- **The loop**: when the scroll settles on the last snap point, `scrollTo(0)` without animation. The stage shows the hero at both ends, the same DOM, the form keeping what was typed.
- **Going to the form** (header link, Join button): two scenes or fewer away, smooth scroll; further, a 120 ms fade, a jump, a 200 ms fade back. The email field takes focus.
- **Keyboard**: tabbing into a hidden scene scrolls to it first. Only the scene on screen takes pointer events.

## 2. Motion

- **Copy**: each scene's lines enter from 24 px below and leave 24 px up, fading over the middle of the transition, each line 5 % behind the one before. Nothing moves while a scene is at rest.
- **The values** are one block for scenes 2 to 7. Its title and index stay; only the statement rolls, and the highlight square slides along the index from number to number, its colour blending.
- **The window**: the comma's head is a square. Open, it is larger than the panel; at a value, it is a quarter to a third of the panel's width, centred where the detail sits in the full picture, clamped inside the panel. The picture magnifies around the detail while the field closes in, so the camera zooms in place. Between two values the detail point, the window and the zoom interpolate together (size and zoom on a log scale), so the window glides and the picture pans under it.
- **Field colour** blends in OKLab between scenes.
- **Compositor first**: the picture moves by `transform` only; the window is a `clip-path: path()` recomputed per frame at the panel's size.
- **Reduced motion**: no lag, no zoom or pan: each scene's end state, crossfaded over the same scroll.

## 3. Layout

- **`cols`** (64rem wide, or 40rem wide and landscape): copy column on the left (header, scene centred, progress squares at the foot), the framed image panel on the right, as now. Phones held sideways get this shape too.
- **`band`** (the rest): header, the panel as a band, the scene under it. The band takes what the copy leaves, `clamp(10rem, 100svh - 26rem, 46svh)`, and folds away while the form's second step is open. Closing lines drop on short screens; the rail shows only in `cols`. Every scene fits in a 375×667 window.
- **Progress squares**: ten 6 px squares, the brand's marks, the current one black or in its value's colour; each a link to its scene. Not on phones, where the band needs the room.
- **No-JS**: an inline script marks `<html>` before first paint. Without it the scenes are plain sections in a column beside the hero image, every word readable.

## 4. The form, first

- In the hero, at every width.
- **Two steps.** Work email and Continue; then business name, headcount and country, and Register interest. Same action (`joinFoundingCohort`), same required fields, same sheet. The second step replaces the lede so the hero never grows past the screen.
- **No stamp above it.** The badge lives on the image panel only.
- **While a field has focus** the stage freezes and snapping turns off, so the phone keyboard cannot move the scene; on blur the hero's position comes back.

## 5. Copy

About 200 words in all, down from about 620. Values and the cohort lines are the narrative's own words.

**Hero.**

- Headline: **Make your use of AI a reason clients choose you.**
- Line: Answerable trains and accredits the people who lead AI in professional practices. Put yours forward for the founding cohort.
- Note under the form: Places are limited. Registering does not commit you to enrol.
- Alternatives: "Your clients will ask how you use AI. Give them an answer you can stand behind." · "Use AI in a way your practice can answer for."

**Programme.** Kicker "The Answerable AP programme". Title: One accredited AI Lead. A practice that can answer for its AI.

- The skills to lead your practice's approach to AI
- An AI policy and handbook shaped around how you work
- A credential your clients can verify
- A community of AI Leads beyond the programme
- Foot: It works across whichever AI tools you use, now and in the future.

**Values.** Kicker "Built upon six core values". Line: Everything we teach and assess is rooted in six commitments. Then the six, verbatim.

**People.** Kicker "The people behind the programme".

- Keir Regan-Alexander: has helped more than 100 AEC firms develop their approach to AI over the past three years.
- Sadie Morgan OBE: co-founder of Stirling Prize-winning dRMM and founder of the Quality of Life Foundation.
- Together, they are developing a programme for professionals who want to take an active part in how AI shapes their work.

**Join.** Join the founding cohort. Be among the first to earn the Answerable AP credential. We're keeping the cohort small, so every participant gets the support and assessment the programme requires. Button: Register your interest.

## 6. Files

- `components/new/stage.tsx` (client): the engine, the stage, the track, the loop, focus handling.
- `components/new/zoom-panel.tsx` (client): picture, window, field, badge, team layer; written to by the engine.
- `components/new/scenes.ts`: the scene list, panel states and value details. A new illustration is one file and one line.
- `components/new/cohort-form.tsx`: the two-step form.
- `lib/stage-math.ts` with tests: progress from snap points, easing, interpolation, the comma path at any size.
- Deleted: `landing.tsx`, `panel.tsx`, `panels.ts`, `framed-image.tsx`, `register-link.tsx`, `lib/scroll-panel.ts` and its test; `WaitlistForm`'s `cohort` mode; the two old photographs.
