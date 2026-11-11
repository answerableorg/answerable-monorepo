import { describe, expect, test } from "bun:test"

import {
  fitOf,
  frameAt,
  GHOST,
  latticeOf,
  REST,
  sheetOf,
  travelAt,
  type Frame,
  type Layout,
  type Script,
} from "./frames"
import {
  CUTS,
  NOTES,
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
  notes: NOTES,
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
  { size: { w: 848, h: 905 }, column: true, margin: 32, ratio: 2 },
  { size: { w: 1248, h: 1376 }, column: true, margin: 48, ratio: 2 },
  { size: { w: 480, h: 736 }, column: true, margin: 16, ratio: 1 },
  { size: { w: 393, h: 392 }, column: false, margin: 24, ratio: 3 },
  { size: { w: 375, h: 251 }, column: false, margin: 24, ratio: 2 },
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

/** The rectangle the shutters leave open, on a panel `w` by `h`. */
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

  test("no painting's opacity or place jumps, the loop included", () => {
    for (const panel of PANELS) {
      for (let segment = 0; segment < SCENE_COUNT; segment++) {
        const next = (segment + 1) % SCENE_COUNT
        const end = frameAt(SCRIPT, layout(false, panel), segment, 1)
        const start = frameAt(SCRIPT, layout(false, panel), next, 0)
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

  test("under the portraits, the painting leaving fades where it is", () => {
    for (const panel of PANELS) {
      const measured = layout(false, panel)
      const rest = placed(at(7, measured), "studio")
      for (let n = 0; n <= 64; n++) {
        placed(at(7 + n / 64, measured), "studio").forEach((value, index) =>
          expect(value).toBeCloseTo(rest[index]!, 9),
        )
      }
    }
  })

  test("off show, a painting goes to where it next shows at one pace", () => {
    for (const panel of PANELS) {
      const measured = layout(false, panel)
      // The studio shows from scene 2 to scene 7: three scenes to go back.
      const [fromX, fromY, fromScale] = placed(at(7, measured), "studio")
      const [toX, toY, toScale] = placed(at(2, measured), "studio")
      for (let n = 0; n <= 300; n++) {
        const progress = 8 + (n / 300) * 3
        const frame = at(progress % SCENE_COUNT, measured)
        // Still within the rest at either end of each change, as everything.
        const scene = Math.min(Math.floor(progress), 10)
        const moved = Math.min(
          Math.max((progress - scene - REST) / (1 - 2 * REST), 0),
          1,
        )
        const u = (scene + moved - 8) / 3
        const [x, y, scale] = placed(frame, "studio")
        expect(x).toBeCloseTo(fromX! + (toX! - fromX!) * u, 6)
        expect(y).toBeCloseTo(fromY! + (toY! - fromY!) * u, 6)
        expect(scale).toBeCloseTo(
          fromScale! * Math.pow(toScale! / fromScale!, u),
          9,
        )
        expect(frame["painting:studio"]!.opacity).toBe(GHOST)
      }
      // The meeting and the badge show at one place: they never move.
      for (const key of ["meeting", "badge"] as const) {
        const rest = placed(at(0, measured), key)
        for (const progress of POSITIONS) {
          placed(at(progress, measured), key).forEach((value, index) =>
            expect(value).toBeCloseTo(rest[index]!, 9),
          )
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

  test("from the meeting to the badge, the badge fades in over the meeting", () => {
    const lat = latticeOf(SCRIPT, PANELS[0])
    let last = 0
    for (let n = 0; n <= 40; n++) {
      const frame = at(n / 40)
      const badge = frame["painting:badge"]!.opacity!
      expect(badge).toBeGreaterThanOrEqual(last)
      last = badge
      // Both whole: the picture stays the lattice, from line to line.
      const open = square(frame, PANELS[0].size)
      expect(open.left).toBeCloseTo(lat.xs[0]!, 9)
      expect(open.top).toBeCloseTo(lat.ys[0]!, 9)
      expect(open.right).toBeCloseTo(lat.xs[lat.columns]!, 9)
      expect(open.bottom).toBeCloseTo(lat.ys[lat.rows]!, 9)
    }
    // Halfway, both show, each whole and still: a dissolve.
    const middle = at(0.5)
    expect(middle["painting:badge"]!.opacity).toBeGreaterThan(0)
    expect(middle["painting:meeting"]!.opacity).toBe(1)
    expect(placed(middle, "meeting")).toEqual(placed(at(0), "meeting"))
    expect(placed(middle, "badge")).toEqual(placed(at(1), "badge"))
  })

  test("from the badge to the first value, white closes in and the detail dissolves in", () => {
    const lat = latticeOf(SCRIPT, PANELS[0])
    const side = (frame: Frame) => {
      const open = square(frame, PANELS[0].size)
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
    // Nine modules of the laptop's lattice: what two thirds of it comes to.
    expect(lat.span).toBe(9)
    expect(side(at(2))).toBeCloseTo(lat.xs[lat.span]! - lat.xs[0]!, 9)
  })

  test("at rest, every edge of the picture is a line of the lattice", () => {
    for (const panel of PANELS) {
      const lat = latticeOf(SCRIPT, panel)
      for (let scene = 0; scene <= SCENE_COUNT; scene++) {
        const open = square(at(scene, layout(false, panel)), panel.size)
        const column = lat.xs.indexOf(open.left)
        const row = lat.ys.indexOf(open.top)
        expect(column).toBeGreaterThanOrEqual(0)
        expect(row).toBeGreaterThanOrEqual(0)
        const detail = PANEL_STATES[scene % SCENE_COUNT]!.window
        // A detail: a square of whole modules. A whole painting: the lattice.
        const across = detail ? lat.span : lat.columns
        const down = detail ? lat.span : lat.rows
        if (!detail) expect([column, row]).toEqual([0, 0])
        expect(open.right).toBe(lat.xs[column + across]!)
        expect(open.bottom).toBe(lat.ys[row + down]!)
      }
    }
  })

  test("the rules lie on the picture's four edges, always", () => {
    for (const panel of PANELS) {
      for (const progress of POSITIONS) {
        const frame = at(progress, layout(false, panel))
        const open = square(frame, panel.size)
        // A rule moves along one axis only, and never scales.
        for (const side of ["left", "right"] as const) {
          const rule = frame[`rule:${side}`]!
          expect(rule.x).toBeCloseTo(open[side], 9)
          expect([rule.y, rule.s]).toEqual([0, 1])
        }
        for (const side of ["top", "bottom"] as const) {
          const rule = frame[`rule:${side}`]!
          expect(rule.y).toBeCloseTo(open[side], 9)
          expect([rule.x, rule.s]).toEqual([0, 1])
        }
      }
    }
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

  test("a scene change's travel is how far it carries the painting on show", () => {
    for (const panel of PANELS) {
      const measured = layout(false, panel)
      const travels = VALUES.slice(1).map((_, index) => {
        // Between two details the scale holds, so every point moves as far
        // as the painting's corner.
        const [ax, ay, as] = placed(at(2 + index, measured), "studio")
        const [bx, by, bs] = placed(at(3 + index, measured), "studio")
        expect(bs).toBe(as)
        const travel = travelAt(SCRIPT, measured, 2 + index)
        expect(travel).toBeCloseTo(Math.hypot(bx! - ax!, by! - ay!), 6)
        return travel
      })
      // The longest is from the first value to the second: right across.
      expect(Math.max(...travels)).toBe(travels[0]!)
      // A cut moves no painting on show; one off show does not count, though
      // the studio travels to its first detail under the hero.
      for (const segment of [0, 1, 7, 8, 9])
        expect(travelAt(SCRIPT, measured, segment)).toBeCloseTo(0, 6)
      expect(placed(at(0, measured), "studio")).not.toEqual(
        placed(at(1, measured), "studio"),
      )
    }
  })

  test("nothing travels with reduced motion, or without a panel", () => {
    for (let segment = 0; segment < SCENE_COUNT; segment++) {
      expect(travelAt(SCRIPT, layout(true), segment)).toBe(0)
      expect(travelAt(SCRIPT, layout(false, null), segment)).toBe(0)
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
        panel: { size: { w: 390, h: 0 }, column: false, margin: 24, ratio: 3 },
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

  test("a painting is laid out in whole pixels, as large as it is ever drawn and under a pixel larger", () => {
    for (const panel of PANELS) {
      const fit = fitOf(SCRIPT, panel)
      for (const reduced of [false, true]) {
        const measured = layout(reduced, panel)
        const largest = new Map(KEYS.map((key) => [key, 0]))
        for (const progress of POSITIONS) {
          const frame = at(progress, measured)
          for (const key of KEYS) {
            largest.set(
              key,
              Math.max(largest.get(key)!, frame[`painting:${key}`]!.s!),
            )
          }
        }
        for (const key of KEYS) {
          const size = SCRIPT.paintings[key]
          for (const [side, share] of [
            [size.w, fit[key].x],
            [size.h, fit[key].y],
          ] as const) {
            const laid = side * share
            expect(laid).toBeCloseTo(Math.round(laid), 9)
            // Never drawn larger than it is laid out: never scaled up.
            const spare = laid - side * largest.get(key)!
            expect(spare).toBeGreaterThan(-1e-9)
            expect(spare).toBeLessThan(1)
          }
        }
      }
    }
  })

  test("the studio is laid out at its size on a value, smaller than its own", () => {
    for (const panel of PANELS) {
      const fit = fitOf(SCRIPT, panel)
      const onValue = at(3, layout(false, panel))["painting:studio"]!.s!
      const { w, h } = SCRIPT.paintings.studio
      expect(fit.studio).toEqual({
        x: Math.ceil(w * onValue) / w,
        y: Math.ceil(h * onValue) / h,
      })
      // No panel is as wide as a value's window is in the painting: every
      // painting is laid out smaller than its own size, on every panel.
      for (const key of KEYS) {
        for (const share of [fit[key].x, fit[key].y]) {
          expect(share).toBeGreaterThan(0)
          expect(share).toBeLessThan(1)
        }
      }
    }
  })

  test("a panel's sizes are worked out once", () => {
    expect(fitOf(SCRIPT, PANELS[0])).toBe(fitOf(SCRIPT, PANELS[0]))
  })

  test("a panel without a size lays every painting out at its own size", () => {
    const own = { x: 1, y: 1 }
    expect(
      fitOf(SCRIPT, {
        size: { w: 390, h: 0 },
        column: false,
        margin: 24,
        ratio: 3,
      }),
    ).toEqual({ meeting: own, badge: own, studio: own })
  })
})

describe("unit: the title strip's frames", () => {
  const strips = (frame: Frame) =>
    Array.from(
      { length: SCENE_COUNT },
      (_, scene) => frame[`strip:${scene}`]!.opacity!,
    )

  test("at rest, the strip carries the scene's words and no other", () => {
    for (let scene = 0; scene < SCENE_COUNT; scene++) {
      expect(strips(at(scene))).toEqual(
        Array.from({ length: SCENE_COUNT }, (_, n) => (n === scene ? 1 : 0)),
      )
    }
  })

  test("two scenes' words never show at once, moving or cut", () => {
    for (const reduced of [false, true]) {
      for (const progress of POSITIONS) {
        const showing = strips(at(progress, layout(reduced)))
        expect(showing.filter((opacity) => opacity > 0).length).toBeLessThan(2)
      }
    }
  })

  test("the key plan shows on the studio, its square on the detail in view", () => {
    for (const panel of PANELS) {
      const { keyplan } = sheetOf(SCRIPT, panel).strip
      const measured = layout(false, panel)
      if (!keyplan) {
        expect(at(3, measured).keyplan).toBeUndefined()
        expect(at(3, measured)["keyplan:window"]).toBeUndefined()
        continue
      }
      for (let scene = 0; scene < SCENE_COUNT; scene++) {
        const frame = at(scene, measured)
        const square = keyplan.windows[scene]
        expect(frame.keyplan).toEqual({ opacity: square ? 1 : 0 })
        if (!square) continue
        expect(frame["keyplan:window"]).toEqual({
          x: square.x - keyplan.cell.x,
          y: square.y - keyplan.cell.y,
          s: 1,
        })
      }
    }
    // The laptop and the phone have one; the short phone's strip is too thin.
    expect(sheetOf(SCRIPT, PANELS[0]).strip.keyplan).not.toBeNull()
    expect(sheetOf(SCRIPT, PANELS[3]).strip.keyplan).not.toBeNull()
    expect(sheetOf(SCRIPT, PANELS[4]).strip.keyplan).toBeNull()
  })

  test("the square never jumps while the key plan shows", () => {
    let last: Frame | null = null
    for (const progress of POSITIONS) {
      const frame = at(progress)
      if (last && last.keyplan!.opacity! > 0 && frame.keyplan!.opacity! > 0) {
        const a = last["keyplan:window"]!
        const b = frame["keyplan:window"]!
        expect(Math.hypot(b.x! - a.x!, b.y! - a.y!)).toBeLessThan(3)
      }
      last = frame
    }
  })
})

describe("unit: the rest around a scene", () => {
  test("within an eighth of a stride of a scene the whole frame is the scene's", () => {
    expect(REST).toBe(1 / 8)
    for (const panel of PANELS) {
      for (const reduced of [false, true]) {
        const measured = layout(reduced, panel)
        for (let scene = 0; scene < SCENE_COUNT; scene++) {
          const rest = frameAt(SCRIPT, measured, scene, 0)
          const next = frameAt(SCRIPT, measured, scene, 1)
          for (const t of [0.01, 0.05, 0.1, REST]) {
            expect(frameAt(SCRIPT, measured, scene, t)).toEqual(rest)
            expect(frameAt(SCRIPT, measured, scene, 1 - t)).toEqual(next)
          }
        }
      }
    }
  })

  test("past the rest the change has begun, and halfway it is neither scene", () => {
    for (let scene = 0; scene < SCENE_COUNT; scene++) {
      const rest = frameAt(SCRIPT, layout(), scene, 0)
      const next = frameAt(SCRIPT, layout(), scene, 1)
      expect(frameAt(SCRIPT, layout(), scene, REST + 0.05)).not.toEqual(rest)
      expect(frameAt(SCRIPT, layout(), scene, 1 - REST - 0.05)).not.toEqual(
        next,
      )
      // Halfway through the scroll is halfway through the change.
      expect(frameAt(SCRIPT, layout(), scene, 0.5)).not.toEqual(rest)
      expect(frameAt(SCRIPT, layout(), scene, 0.5)).not.toEqual(next)
    }
  })

  test("no frame places a note: the scroll does not move the marks", () => {
    for (const panel of PANELS) {
      for (const progress of POSITIONS) {
        const keys = Object.keys(at(progress, layout(false, panel)))
        expect(keys.filter((key) => key.startsWith("note"))).toEqual([])
      }
    }
  })
})
