# Design, round 5

Evidence in `findings.md`. The owner took D1 to D4 as proposed; `task_plan.md` records the answers. **As built, three things differ from the proposal below, all for smoothness measured on the build:** the moves between paintings are plain dissolves (no push-in); the square is framed by four sliding white shutters rather than a clip; all six squares share one zoom (a 1,000 px span). The masters are WebP q90, since the build cannot read AVIF ones.

## 1. Three paintings, one per part of the page

| #   | Scene      | Panel                                                                                              |
| --- | ---------- | -------------------------------------------------------------------------------------------------- |
| 0   | Hero       | The meeting, whole                                                                                 |
| 0→1 |            | The camera moves in on the woman's badge; the badge close-up dissolves in and settles, whole       |
| 1   | Programme  | The badge close-up, whole                                                                          |
| 1→2 |            | White closes in to a square round the badge; inside it the badge dissolves into the first detail   |
| 2–7 | Six values | A square on white per value; the camera travels along the panorama from left to right **(D3)**     |
| 7→8 |            | The portraits' white halves cover the panel, then the photographs; the meeting returns behind them |
| 8   | People     | The two portraits, as today                                                                        |
| 8→9 |            | The portraits fade off the meeting, as today                                                       |
| 9   | Join       | The meeting, whole                                                                                 |
| 10  | (Hero)     | The same; the loop stays seamless                                                                  |

- **The coded stamp goes.** `GridFrame`, the panel's `badge` and its frames are removed; each painting carries the badge.
- **Alt text.** The meeting keeps the panel's alt text (no-JS shows it); the badge and the studio are decorative here (`alt=""`), since the copy carries their meaning.

## 2. Moving between paintings

One rule: **a painting never shows its edge.** While it is visible it covers the panel, or the window it is seen through.

- **Meeting → badge (0→1)**: push and dissolve. The meeting scales from whole to 1.3× about its badge; the close-up starts at 1.3× about its own badge and settles to whole; the close-up fades in over the middle of the scroll. Scaling a covering picture up about a point inside the panel keeps it covering, so neither edge shows. A matched zoom (the meeting's badge growing into the close-up's) was tried on paper and dropped: the meeting would be at 8× and the close-up smaller than the panel during the fade.
- **Badge → first value (1→2)**: the badge close-up holds still while the white field closes in to the square round its badge. The first detail fills the closing square from the start (magnified by how much larger the square still is), so it always covers it; it dissolves in over the second half and lands at its zoom.
- **Value to value (2–7)**: the existing camera: the detail point, the square and the zoom interpolate (sizes on a log scale). With details ordered left to right the steps are short, 700 to 1,550 panorama pixels.
- **Into and out of the people**: as today: covered first, then the photographs; the picture behind changes only while covered.
- **Reduced motion**: no camera; each scene's end state, crossfaded through white, as today.

## 3. Bigger squares **(D1, D2)**

- **Squares only.** The comma stays in the logo, the splash and the portraits; the windows become the logo's square alone. This removes the tail: the band clip, its second copy of the picture, the carving shapes, and the colour field layers that now fade white over white.
- **Size**: two thirds of the panel's shorter side (0.64) beside the copy, four fifths (0.8) in the phone band, the same for all six. Owner's laptop panel (848×905): 543 px, was 305. iPhone 15 band (393×243): 194 px, the band's full height inside its gutter, was 122.
- **Placement**: the square sits where its detail sits in the panorama fitted to the panel's width, clamped to the inset: values 1 and 2 to the left, 3 in the middle, 4 to 6 to the right, a little up or down with the detail. The square travels as the camera does.
- **Inset**: measured from a zero-size element at `var(--inset)`, since the stamp that gave it goes.

## 4. Logo

The lockup from 20 to 24 px, the comma and the gap scaling with it (`cap` units). The header row keeps its height rule; the capitals stay on the top line.

## 5. Images at the size each screen needs

- **Masters in the repository**: `apps/web/assets/new/meeting.avif`, `badge.avif`, `studio.avif`, full size, AVIF q70 from the PNGs (888, 762 and 905 KB). `hero.webp` is deleted. If Turbopack's static import cannot read AVIF, WebP q90 (1.8, 1.7 and 1.6 MB). The PNGs stay out of git.
- **Per screen**: Vercel's optimiser, as today, with two more widths so a screen gets the nearest size rather than the next large one: `images.deviceSizes` `[640, 750, 828, 1080, 1200, 1920, 2048, 2560, 3072, 3840, 4800, 6000]`.
- **`sizes`**, from the panel's shape (the `cols` query):
  - Meeting and badge: `50vw` beside the copy, `100vw` in the band. Quality 75: they are never magnified.
  - Studio: `3000px` beside the copy, `1024px` in the band. Quality 85: it is magnified. **(D4)**
- **Order**: the meeting first (high priority, the splash is over it); the badge and the studio at low priority, then decoded ahead of time (`img.decode()`), so the first cut and the first square do not decode mid-scroll.
- **Result** (`findings.md`): 459 KB on an iPhone 15, 889 KB on the owner's laptop, 1,025 KB on a 5K display, 429 KB at 1920×1080. Today: 87 KB, one small picture.

## 6. Code

| File                            | Change                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assets/new/*`                  | Three masters in, `hero.webp` out                                                                                                                                        |
| `components/new/scenes.ts`      | `PAINTINGS` (image, size, alt, quality, sizes); each `PanelState` names a painting; windows are squares (`focus`, `span`); the two cuts' anchors; no `field`, no `badge` |
| `lib/stage-math.ts`             | Square geometry and the placement rule; no tail or band boxes                                                                                                            |
| `components/new/frames.ts`      | A placement and an opacity per painting; the two cuts; no badge, band, covers or fields                                                                                  |
| `components/new/zoom-panel.tsx` | One clip box with the three paintings; the inset probe; no `GridFrame`                                                                                                   |
| `components/new/grid-frame.tsx` | Deleted                                                                                                                                                                  |
| `components/new/lockup.tsx`     | 24 px                                                                                                                                                                    |
| `next.config.mjs`               | `deviceSizes`                                                                                                                                                            |
| Tests                           | Updated; new: no painting shows an edge at any sampled frame of any transition, on laptop and phone panels                                                               |

Worktree `.claude/worktrees/new-landing-r5`, branch `claude/new-landing-r5`, from origin/main.

## 7. Verification

- Every scene and the midpoint of every transition, screenshotted at 375×667, 393×852, 1728×937 and 2560×1440, phone landscape and a tablet; reduced motion; no-JS.
- Frames, as round 4: Playwright Chromium with the real GPU (`--use-angle=metal`) and WebKit, tracing a full loop, with the first cut and the first square measured on a cold load. Keyframe count kept under 1,800.
- Bytes: each screen's requests read from the network log on the build; after landing, Vercel's responses with `curl` as in `findings.md`.
- Gates: typecheck, lint, `bun --filter web test`, build, knip.
