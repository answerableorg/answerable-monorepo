import { describe, expect, test } from "bun:test"

import { frameAt, GHOST, type Frame, type Layout, type Script } from "./frames"
import {
  CUTS,
  PAINTING_SIZES,
  PAINTINGS,
  PANEL_STATES,
  SCENE_COUNT,
  VALUES,
  WINDOW_LAYOUTS,
  type PaintingKey,
} from "./scenes"

const SCRIPT: Script = {
  sceneCount: SCENE_COUNT,
  states: PANEL_STATES,
  paintings: PAINTING_SIZES,
  cuts: CUTS,
  layouts: WINDOW_LAYOUTS,
  people: 2,
}

/** The page's scenes: hero, programme, values (2 to 7), people, join. */
const SCENES = [
  { from: 0, to: 0, lines: 4 },
  { from: 1, to: 1, lines: 4 },
  { from: 2, to: 7, lines: 3 },
  { from: 8, to: 8, lines: 4 },
  { from: 9, to: 9, lines: 3 },
]

/**
 * Panels the page meets: the owner's laptop, a 5K display, a tablet on its
 * side, an iPhone 15's band and a short phone's.
 */
const PANELS = [
  { size: { w: 848, h: 905 }, column: true, margin: 32 },
  { size: { w: 1248, h: 1376 }, column: true, margin: 48 },
  { size: { w: 480, h: 736 }, column: true, margin: 16 },
  { size: { w: 393, h: 243 }, column: false, margin: 24 },
  { size: { w: 375, h: 251 }, column: false, margin: 24 },
] as const

function layout(reduced = false, panel: Layout["panel"] = PANELS[0]): Layout {
  return {
    reduced,
    lineTravel: 24,
    scenes: SCENES,
    values: {
      from: 2,
      count: VALUES.length,
      travel: 80,
      markX: VALUES.map((_, index) => index * 40),
    },
    panel,
  }
}

/** The frame at a stage position, 0 to `SCENE_COUNT`. */
function at(progress: number, measured = layout()): Frame {
  const segment = Math.min(Math.floor(progress), SCENE_COUNT - 1)
  return frameAt(SCRIPT, measured, segment, progress - segment)
}

const KEYS = PAINTINGS.map(({ key }) => key)

/** Where a painting sits on the panel: its left, top and scale. */
function placed(frame: Frame, key: PaintingKey) {
  const painting = frame[`painting:${key}`]!
  return [painting.x!, painting.y!, painting.s!]
}

/** The square the shutters leave open, on a panel `w` by `h`. */
function square(frame: Frame, { w, h }: { w: number; h: number }) {
  return {
    left: frame["shutter:left"]!.x! + w + 1,
    right: frame["shutter:right"]!.x! - 1,
    top: frame["shutter:top"]!.y! + h + 1,
    bottom: frame["shutter:bottom"]!.y! - 1,
  }
}

/** The highest painting shown fully opaque: what the panel shows on top. */
function onTop(frame: Frame) {
  return KEYS.findLast((key) => frame[`painting:${key}`]!.opacity === 1)
}

const POSITIONS = Array.from({ length: SCENE_COUNT * 40 + 1 }, (_, n) => n / 40)

describe("unit: the stage's frames", () => {
  test("at rest, the scene on screen is in place and every other is out", () => {
    for (let scene = 0; scene <= SCENE_COUNT; scene++) {
      const frame = at(scene)
      const on = SCENES.findIndex(
        ({ from, to }) =>
          (scene >= from && scene <= to) ||
          (scene === SCENE_COUNT && from === 0),
      )
      SCENES.forEach(({ lines }, index) => {
        for (let line = 0; line < lines; line++) {
          const style = frame[`line:${index}:${line}`]!
          expect(style.opacity).toBe(index === on ? 1 : 0)
          if (index === on) expect(style.y).toBe(0)
        }
      })
    }
  })

  test("two scenes' copy never shows at once", () => {
    for (const progress of POSITIONS) {
      const frame = at(progress)
      const showing = SCENES.filter((scene, index) =>
        Array.from({ length: scene.lines }).some(
          (_, line) => frame[`line:${index}:${line}`]!.opacity! > 0,
        ),
      )
      expect(showing.length).toBeLessThanOrEqual(1)
    }
  })

  test("the painting on top never jumps where one transition meets the next", () => {
    for (const panel of PANELS) {
      for (let segment = 0; segment < SCENE_COUNT - 1; segment++) {
        const end = frameAt(SCRIPT, layout(false, panel), segment, 1)
        const start = frameAt(SCRIPT, layout(false, panel), segment + 1, 0)
        const key = onTop(end)!
        expect(onTop(start)).toBe(key)
        const a = placed(end, key)
        const b = placed(start, key)
        a.forEach((value, index) => expect(value).toBeCloseTo(b[index]!, 6))
      }
    }
  })

  test("the copy never jumps where one transition meets the next", () => {
    for (let segment = 0; segment < SCENE_COUNT - 1; segment++) {
      const end = frameAt(SCRIPT, layout(), segment, 1)
      const start = frameAt(SCRIPT, layout(), segment + 1, 0)
      for (const key of Object.keys(end)) {
        if (!/^(line|step|mark|tint|highlight)/.test(key)) continue
        expect(end[key]).toEqual(start[key]!)
      }
    }
  })

  test("at rest on a value, the highlight sits on its number in its colour", () => {
    VALUES.forEach((_, value) => {
      const frame = at(2 + value)
      expect(frame.highlight!.x).toBe(value * 40)
      expect(frame[`tint:${value}`]!.opacity).toBe(1)
      // No colour above it shows.
      for (let k = value + 1; k < VALUES.length; k++) {
        expect(frame[`tint:${k}`]!.opacity).toBe(0)
      }
      expect(frame[`mark:${value}`]!.opacity).toBe(1)
      expect(frame[`step:${value}`]!.opacity).toBe(1)
    })
  })

  test("at rest, each scene shows its own painting, over the meeting, the rest ghosts", () => {
    for (let scene = 0; scene <= SCENE_COUNT; scene++) {
      const frame = at(scene)
      const own = PANEL_STATES[scene % SCENE_COUNT]!.painting
      expect(onTop(frame)).toBe(own)
      for (const key of KEYS) {
        expect(frame[`painting:${key}`]!.opacity).toBe(
          key === own || key === KEYS[0] ? 1 : GHOST,
        )
      }
    }
  })

  test("only one painting changes opacity at a time", () => {
    for (const panel of PANELS) {
      for (let n = 1; n < SCENE_COUNT * 400; n++) {
        // Changing at this point: moving either side of it.
        const a = at(n / 400 - 1e-5, layout(false, panel))
        const b = at(n / 400 + 1e-5, layout(false, panel))
        const changing = KEYS.filter(
          (key) =>
            Math.abs(
              a[`painting:${key}`]!.opacity! - b[`painting:${key}`]!.opacity!,
            ) > 1e-7,
        )
        expect(changing.length).toBeLessThanOrEqual(1)
      }
    }
  })

  test("the meeting, at the bottom, never changes opacity", () => {
    expect(KEYS[0]).toBe("meeting")
    for (const progress of POSITIONS) {
      expect(at(progress)["painting:meeting"]!.opacity).toBe(1)
    }
  })

  test("no painting's opacity or place jumps, except at the loop", () => {
    for (const panel of PANELS) {
      for (let segment = 0; segment < SCENE_COUNT - 1; segment++) {
        const end = frameAt(SCRIPT, layout(false, panel), segment, 1)
        const start = frameAt(SCRIPT, layout(false, panel), segment + 1, 0)
        for (const key of KEYS) {
          expect(end[`painting:${key}`]!.opacity).toBeCloseTo(
            start[`painting:${key}`]!.opacity!,
            9,
          )
          placed(end, key).forEach((value, index) =>
            expect(value).toBeCloseTo(placed(start, key)[index]!, 6),
          )
        }
      }
      // Within the move into the people, everything changes by small steps.
      for (let n = 1; n <= 64; n++) {
        const a = at(7 + (n - 1) / 64, layout(false, panel))
        const b = at(7 + n / 64, layout(false, panel))
        for (const key of KEYS) {
          const step = Math.abs(
            a[`painting:${key}`]!.opacity! - b[`painting:${key}`]!.opacity!,
          )
          expect(step).toBeLessThan(0.15)
        }
      }
    }
  })

  test("a painting changes only in a cut or under the portraits", () => {
    PANEL_STATES.forEach((a, index) => {
      const b = PANEL_STATES[(index + 1) % SCENE_COUNT]!
      if (a.painting === b.painting) return
      const cut = CUTS.some(
        ({ from, to }) => from === a.painting && to === b.painting,
      )
      expect(cut || a.team || b.team).toBe(true)
    })
  })

  test("no painting ever shows its edge, on any panel", () => {
    for (const panel of PANELS) {
      const { w, h } = panel.size
      for (let n = 0; n <= SCENE_COUNT * 200; n++) {
        const frame = at(n / 200, layout(false, panel))
        // Under the portraits' white halves nothing else is seen.
        if (frame["half:0"]!.opacity! >= 0.999) continue
        // What shows: the square, inside the panel.
        const open = square(frame, panel.size)
        const left = Math.max(0, open.left)
        const top = Math.max(0, open.top)
        const right = Math.min(w, open.right)
        const bottom = Math.min(h, open.bottom)
        // The opaque painting on top, and any fading in above it: what is
        // under them is covered.
        for (const key of KEYS.slice(KEYS.indexOf(onTop(frame)!))) {
          if (frame[`painting:${key}`]!.opacity! <= GHOST) continue
          const [x, y, scale] = placed(frame, key) as [number, number, number]
          const size = PAINTING_SIZES[key]
          expect(x).toBeLessThanOrEqual(left + 0.01)
          expect(y).toBeLessThanOrEqual(top + 0.01)
          expect(x + size.w * scale).toBeGreaterThanOrEqual(right - 0.01)
          expect(y + size.h * scale).toBeGreaterThanOrEqual(bottom - 0.01)
        }
      }
    }
  })

  test("from the meeting to the badge, the badge fades in while both move in", () => {
    let last = 0
    for (let n = 0; n <= 40; n++) {
      const frame = at(n / 40)
      const badge = frame["painting:badge"]!.opacity!
      expect(badge).toBeGreaterThanOrEqual(last)
      last = badge
      // Both whole: the shutters stay out of the panel.
      const open = square(frame, { w: 848, h: 905 })
      expect(open.left).toBeLessThanOrEqual(0)
      expect(open.top).toBeLessThanOrEqual(0)
      expect(open.right).toBeGreaterThanOrEqual(848)
      expect(open.bottom).toBeGreaterThanOrEqual(905)
    }
    // Halfway, both show, each whole and still: a dissolve.
    const middle = at(0.5)
    expect(middle["painting:badge"]!.opacity).toBeGreaterThan(0)
    expect(middle["painting:meeting"]!.opacity).toBe(1)
    expect(placed(middle, "meeting")).toEqual(placed(at(0), "meeting"))
    expect(placed(middle, "badge")).toEqual(placed(at(1), "badge"))
  })

  test("from the badge to the first value, white closes in and the detail dissolves in", () => {
    const size = { w: 848, h: 905 }
    const side = (frame: Frame) => {
      const open = square(frame, size)
      return open.right - open.left
    }
    let last = Infinity
    let seen = false
    for (let n = 0; n <= 40; n++) {
      const frame = at(1 + n / 40)
      expect(side(frame)).toBeLessThanOrEqual(last + 1e-9)
      last = side(frame)
      // The detail waits at its zoom and shows only once inside the square.
      expect(placed(frame, "studio")).toEqual(placed(at(2), "studio"))
      if (frame["painting:studio"]!.opacity! > 0) seen = true
    }
    expect(seen).toBe(true)
    expect(side(at(2))).toBeCloseTo(0.64 * 848)
  })

  test("the portraits show only around the people scene, colours before faces", () => {
    for (const progress of POSITIONS) {
      const frame = at(progress)
      const colours = frame["half:0"]!.opacity!
      const faces = frame["comma:0"]!.opacity!
      if (progress <= 7 || progress >= 9) expect(colours).toBe(0)
      if (progress === 8) expect([colours, faces]).toEqual([1, 1])
      // A face only ever shows on a colour that is already solid.
      if (faces > 0) expect(colours).toBe(1)
    }
  })

  test("reduced motion moves nothing and cuts through white", () => {
    const reduced = layout(true)
    for (const progress of POSITIONS) {
      const frame = at(progress, reduced)
      for (const [key, style] of Object.entries(frame)) {
        if (key.startsWith("line:") || key.startsWith("step:")) {
          expect(style.y).toBe(0)
        }
      }
    }
    expect(at(4.5, reduced).panel!.opacity).toBe(0)
    expect(at(4, reduced).panel!.opacity).toBe(1)
    // Either side of the cut, the panel holds one scene's view.
    expect(placed(at(4.2, reduced), "studio")).toEqual(
      placed(at(4, reduced), "studio"),
    )
    expect(placed(at(4.8, reduced), "studio")).toEqual(
      placed(at(5, reduced), "studio"),
    )
    // Between paintings too: no camera, no dissolve, one or the other.
    expect(onTop(at(0.4, reduced))).toBe("meeting")
    expect(at(0.4, reduced)["painting:badge"]!.opacity).toBe(GHOST)
    expect(onTop(at(0.6, reduced))).toBe("badge")
  })

  test("a panel without a size draws nothing", () => {
    const frame = frameAt(
      SCRIPT,
      {
        ...layout(),
        panel: { size: { w: 390, h: 0 }, column: false, margin: 24 },
      },
      3,
      0.5,
    )
    expect(frame["shutter:top"]).toBeUndefined()
    expect(frame["line:2:0"]).toBeDefined()
  })

  test("every number is finite, on every panel", () => {
    for (const panel of PANELS) {
      for (const progress of POSITIONS) {
        for (const style of Object.values(at(progress, layout(false, panel)))) {
          for (const value of Object.values(style)) {
            expect(Number.isFinite(value)).toBe(true)
          }
        }
      }
    }
  })
})
