# Round 4: one scene at a time

The root `task_plan.md`, `findings.md` and `progress.md` belong to the customer-app sign-in audit. This round's files live here; the session log stays in `../progress.md`.

**Goal.** Rebuild `/new` so a practice registers for the first cohort of Answerable Accredited Professionals. The page stops reading like a slide deck: one scene on screen at a time, moved by the scroll, the form first, the hero illustration zooming in on each value, the team added, and the end of the page running back into the top.

Worktree `.claude/worktrees/new-landing-r4`, branch `claude/new-landing-r4`, from origin/main 9e0b3cde.

## The feedback, as given (owner, 8 November 2026)

- "the general impression is that right now, the website looks like a powerpoint."
- "We also drawn the visitor is too much information."
- The aim: companies submit their information for the first cohort of Answerable Accredited professionals. "we help company justify how responsable and answerable they're with their AI usage."
- "I want the scrollable part to be splitted into section, that are scroll bound and sticky, so only on section is displayed at once. make this scroll satisfying. Spend the time, no corner cut."
- Review the copy: "maybe too much quantity, we need to show things that people want to see only when needed."
- "the form should be top, not bottom hence this is the main action we want them to perform."
- "When scrolling and being at the very bottom, they end up at the top again, (infinite loop, seemless)."
- The narrative PDF (`~/Downloads/Narrative - Landing Page.pdf`): six values, the people behind the programme, join the founding cohort.
- The team: "the two member (two pics, be creative with the design, so it's not too boring, follow what we've done so far)."
- "The main hero is being displayed and then on other sections, we have "zooms" on the hero image that represents each the values." Images: `~/Downloads/OneDrive_2_08-11-2026.zip`.
- "We should be value first on the hero, suggest a copy. Enterprise NEEDS to want their employees to be part of this certification."
- "above the form, remove the certification stamps (we already have it on the right side, it's too much!)"
- "this should work on mobile perfectly as well as desktop". Illustrations will change later; not the focus.

## Phases

| #   | Phase                                                                             | Status                                                        |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Read the PDF, the seven images, the current page and its history                  | complete                                                      |
| 2   | Plan: this file, `findings.md`, `design.md` (scenes, motion, copy)                | complete                                                      |
| 3   | Scene engine: sticky stage, snap points, scrubbed progress, loop                  | complete                                                      |
| 4   | Zoom panel: the hero, comma window, colour field, AP badge, team layer            | complete                                                      |
| 5   | Scenes and copy: hero with the two-step form, programme, six values, people, join | complete                                                      |
| 6   | Phones: layout, keyboard, iOS Safari in the simulator                             | complete; gestures in the simulator wait on the owner's grant |
| 7   | Accessibility: no-JS, reduced motion, keyboard, screen reader order, one `h1`     | complete                                                      |
| 8   | Verify: browser at 375×667 to 2560×1440, phone landscape, tablet; gates           | complete                                                      |
| 9   | Show the owner; land on main after approval; check Vercel; remove the worktree    | in progress                                                   |
| 10  | Owner: performance, alignment, square windows: measure, rebuild the window, grid  | complete                                                      |

## Open with the owner

- **Team portraits.** The zip holds the hero and six zooms only. The people scene ships with placeholder monograms until two portraits arrive (one line each in `scenes.ts`).
- **Hero copy.** Suggested in `design.md`, with two alternatives.
- **A larger hero file.** 1086×1448 px; the zooms magnify it up to about 1.6×, so a 2× export would keep the details sharp on retina screens.

## Errors encountered

| Error                                                                    | Attempt                                                                          | Resolution                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `sharp` crashed in wasm (`Out of bounds memory access`)                  | `bun` script in the scratchpad resolved sharp from Bun's cache, the wasm32 build | Run the script with Node and `createRequire` from `apps/web`, which loads the native darwin-arm64 build |
| `preview_start` served the main checkout                                 | It reads the main checkout's `.claude/launch.json`                               | Temporary `web-r4` entry running `bun run --cwd <worktree>/apps/web dev`; reverted at the end           |
| Hidden Browser pane starves `requestAnimationFrame` and throttles timers | Screenshots lagged a scene behind                                                | A `MessageChannel` shim in the pane for state checks; real frames from headless Playwright Chromium     |
| `has-[[data-current][data-form-step=2]]` compiled to `:has(:is())`       | Tailwind dropped the attribute list                                              | The band-fold rule is plain CSS under `@variant band`                                                   |
| A failed submit emptied the fields                                       | React resets a form after its `action`, errors or not                            | Submit through `startTransition` from `onSubmit`; `action` stays for a submit before hydration          |
| Rail squares did nothing                                                 | An edit lost the `goToRef` assignment                                            | Rail squares use the same `data-go` delegation as the links                                             |
| Synthetic 120 px wheel did not move                                      | Mandatory snapping returns a short precise scroll to the current scene           | Expected, as a slow short trackpad drag; tests use keys and long gestures                               |
| Simulator panel refused                                                  | The owner has not granted access to the simulator                                | Rendered with `simctl openurl` and `simctl io screenshot`; gestures wait on the grant                   |
| GPU stalls up to 195 ms on the first transitions                         | A per-frame `clip-path: path()` re-rendered a panel-sized mask                   | Two rectangle clips moved by `transform`, the tail carved by static shapes                              |
| The black comma's tail showed the field                                  | Its view ran past the illustration's bottom edge                                 | `windowGeometry` moves the detail in so a window never shows past the picture                           |
| Faint lines along the tail band                                          | The band's clip edge and the carving shapes' edge anti-aliased together          | The carving shapes overhang the band by 2 units; the clip trims both                                    |
| Portraits filled a phone's half                                          | Sized by height alone                                                            | Sized by the half's smaller side (`container-type: size`)                                               |
| Lint: `react-hooks/immutability` on the panel's parts                    | A `useState` object mutated by callback refs                                     | The parts live in a ref; drawing moved to module functions                                              |
