# Round 10 findings

Everything here was read in the code or measured; a guess is marked as one.

## F1. What the owner's two screenshots show

- Value 2 (scene 3): the plaque's outline sits about 22 px to the right of
  the plaque in a 1,024 px wide screenshot, the same size as the plaque.
- Value 5 (scene 6): the envelope's outline sits about 33 px to the left of
  the envelope and a little above it, and it is paler than on Value 2.
- Both fit one reading: the marks are drawn for a scroll a little past the
  scene (3 + δ, 6 + δ) and the painting for the scene itself. Past Value 2
  the painting moves right (the scale rule is to the plaque's left), past
  Value 5 it moves left (the printer is to the envelope's right), and a note
  fades out over the first 5/32 of a change, which is why the second is
  paler. Round 7 matched the owner's earlier phone image the same way: marks
  at 6.08, painting at 6.00.
- So the first two points of the request are one defect seen twice: the
  scroll rests a little off a scene, and the marks and the painting do not
  agree about where it rests.

## F2. What the code does (main, `86bf1110`)

- A note's place is computed from its painting's own placement in the same
  frame (`frames.ts`, `note:<n>`): by the arithmetic a note cannot leave its
  painting at any scroll position.
- A change rests still for `REST = 0.02` of the stride at each end: on a
  phone (stride 60svh, about 440 px) that is about 9 px of scroll. A rest
  further than that from a snap point shows a scene partly changed.
- Two ways to play the frames (`stage.tsx`): where `ScrollTimeline` exists,
  one scroll-driven animation an element, which the browser plays; elsewhere
  a script that writes every element's style in one go on each scroll event.
  With the script every element is written from one scroll position, so the
  marks and the painting cannot part. With scroll-driven animations the
  browser decides, element by element, where each animation runs.
- The page snaps with `scroll-snap-type: y mandatory` on the root, one snap
  point a scene. Nothing in the page corrects a rest that is off a snap point
  (`settle` only wraps the last snap point back to the first).

## F3. Tools on this Mac

- Firefox 138.0.1 is installed (`/Applications/Firefox.app`). It can be run
  headless with a throwaway profile and driven over WebDriver BiDi, with no
  download. Its scroll-driven animations are behind the preference
  `layout.css.scroll-driven-animations.enabled`, off by default in 138.
- An Android SDK with an emulator is installed (`~/Library/Android/sdk`).
  Firefox for Android is not known to be on any of its devices.
- Playwright has Chromium and WebKit only.

## F4. Firefox 138 on this Mac, headless, driven over WebDriver BiDi

Window 412 by 780 CSS px, device pixel ratio 2.61, `pointer: coarse` forced
by preference, so the stride is 60svh (468.05 px). Development server.

- `ScrollTimeline` is not defined, with the scroll-driven animations
  preference off (the default) and on. With it on, CSS
  `animation-timeline: scroll()` is supported but `animation-range` and the
  JavaScript interface are not. So Firefox 138 runs the page's script driver.
- With the script driver, by layout (`getBoundingClientRect`), the outline's
  first handle stays the same 0.94 px from the plaque's corner (Value 2) and
  0.80 px from the envelope's (Value 5) at every rest tried: on the snap
  point, and 2%, 5%, 8% and 12% of a stride past it, 5% and 8% before it.
  The painting itself moves 10.6 px at +5% and 23 px at +8% on Value 2, and
  the marks move with it. The arithmetic of F2 holds in Gecko.
- So Firefox 138 does not show the owner's defect at rest, whatever the
  rest. The owner's Firefox differs in something this one cannot show.

## F5. The reading that fits everything (not proven)

The marks sat where the scroll was (a scene plus 4% to 9% of a stride), the
painting where the scene is. One engine behaviour gives exactly that: scroll
animations played by the browser, the marks' on the compositor at the
position the finger left the page, the studio painting's on the main thread
at the position the page snapped to. Gecko keeps an animation off the
compositor when its element is too large (its limit is 4,096 device pixels a
side); the studio is laid out about 1,900 CSS px wide on a phone, about
5,000 device pixels. Both of the owner's screenshots, and the one in round
7, are of the studio. A toolbar that hides lets a phone's visible page sit up
to its height (about 56 px, 12% of a stride) from where the page's layout
is, which is the size of the offsets seen.

This needs a Firefox that has `ScrollTimeline`, which 138 has not. Whether
the owner's has it is not known: their version is the first thing to ask, or
to read from a real Firefox for Android.

## F6. Firefox began playing scroll animations itself two weeks ago

- Firefox 159, released 27 October 2026, turned scroll-driven animations on
  by default on every platform (MDN's Firefox 159 release notes; web.dev's
  October 2026 roundup; the intent to ship on dev-platform). Before it the
  feature was behind a preference in release, as in the 138 on this Mac.
- So a phone whose Firefox updated itself has had `ScrollTimeline` since the
  end of October, and the page has taken its browser-played path in Gecko
  only since then. The owner's first image of the defect is from 10 November
  (round 7). This is what F5 needed. It is still not seen first-hand: no
  Firefox 159 here.

## F7. The same measurement in Chromium and WebKit (Playwright, phone size)

- Both have `ScrollTimeline` (73 animations). By layout the handle stays
  0.81 px from the plaque's corner and 0.68 px from the envelope's at every
  rest tried, as in Firefox 138. Chromium and WebKit do not show the defect.

## F8. What could not be run

- The Android emulator on this Mac has no system image left (37 MB of a
  1.5 GB image): it does not boot. Firefox for Android was not run.
- Nothing was downloaded. A Firefox 159 for this Mac (about 140 MB from
  mozilla.org, run from the scratchpad, the installed 138 left alone) would
  let Gecko's own playing be measured here; it needs the owner's word.

## F9. What follows for the design

- The marks must not be placed by the scroll at all: then no engine can put
  them somewhere other than on their painting. That is also what the owner
  asks for in the third point (drawn after the picture has arrived).
- A rest near a scene must show the scene: today anything further than 2% of
  a stride from a snap point (9 px on a phone) shows a change begun. The
  offsets seen are 4% to 9%; a phone's toolbar is about 12%.

## F10. After the build (development server, 2026-11-11)

Rests on and off Value 2 and Value 5, phone size, by layout: the outline's
handle against its painting's corner, and the most any of the studio and the
copy's lines has moved from the scene's rest.

| Rest, in strides from the scene | Marks | On their painting                  | Moved                            |
| ------------------------------- | ----- | ---------------------------------- | -------------------------------- |
| 0, +2%, +5%, +9%, -5%, -9%      | on    | yes, to the same 0.8 px as at rest | 0 px                             |
| +11%                            | off   |                                    | 0 px                             |
| +14%, -14%                      | off   |                                    | 3 to 10 px: the change has begun |

The same in Chromium and WebKit (Playwright, scroll animations played by the
browser) and in Firefox 138 (the script driver).

- Keyframes for the whole page: 1,618 on a 1440 by 900 screen (1,790 before),
  1,276 on a phone (1,401), 1,860 at 2560 by 1440. 67 animations (73).
- Frame times through the values at phone size, worst frame of each scroll:
  Chromium 17 ms on all 35. WebKit 18 to 24 ms on most; a long frame (26 to
  56 ms) on some scrolls, with the marks and with them hidden alike (4 of 20
  with, 2 of 20 without), on a Mac at a load of 25 to 50. Not a clean
  measure: to repeat on a quiet machine.
- The drawing, seen frame by frame in Chromium, WebKit and Firefox 138: the
  picture first, then each stroke from its first point, the squares as the
  stroke passes, the figures last. With reduced motion the marks are whole
  at once. The hero's marks come after the splash.
- Not seen: Firefox 159 or later, on a phone or here.
