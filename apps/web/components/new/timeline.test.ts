import { describe, expect, test } from "bun:test"

import type { Frame } from "./frames"
import {
  css,
  keyframes,
  paintingTolerance,
  sample,
  simplify,
  STEPS,
  type Series,
} from "./timeline"

/** Two segments over offsets 0 to 1, half each. */
const half = (segment: number, t: number) => (segment + t) / 2

/** The straight-line value of a simplified series at an offset. */
function valueAt(series: Series, offset: number, key: "opacity" | "x") {
  const { offsets, styles } = series
  let index = offsets.findLastIndex((value) => value <= offset)
  if (index === offsets.length - 1) index -= 1
  const a = offsets[index]!
  const b = offsets[index + 1]!
  const t = b === a ? 1 : (offset - a) / (b - a)
  return (
    styles[index]![key]! + (styles[index + 1]![key]! - styles[index]![key]!) * t
  )
}

describe("unit: the timeline's keyframes", () => {
  test("samples every segment at even steps, in scroll order", () => {
    const series = sample(
      (segment, t) => ({ a: { opacity: segment + t } }),
      2,
      4,
      half,
    )
    expect(series.get("a")!.offsets).toEqual([
      0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1,
    ])
  })

  test("keeps a jump between segments as two keyframes at one offset", () => {
    const frame = (segment: number): Frame => ({ a: { opacity: segment } })
    const { offsets, styles } = simplify(
      sample((segment) => frame(segment), 2, 4, half).get("a")!,
    )
    expect(offsets).toEqual([0, 0.5, 0.5, 1])
    expect(styles.map((style) => style.opacity)).toEqual([0, 0, 1, 1])
  })

  test("drops a keyframe a straight line reproduces", () => {
    const series = sample(
      (segment, t) => ({ a: { x: (segment + t) * 100 } }),
      2,
      32,
      half,
    ).get("a")!
    expect(simplify(series).offsets).toEqual([0, 1])
  })

  test("keeps a curve within the tolerance between kept keyframes", () => {
    const curve = (offset: number) => Math.sin(offset * Math.PI) * 400
    const series = sample(
      (segment, t) => ({ a: { x: curve(half(segment, t)) } }),
      2,
      64,
      half,
    ).get("a")!
    const simple = simplify(series)
    expect(simple.offsets.length).toBeLessThan(series.offsets.length)
    for (const [index, offset] of series.offsets.entries()) {
      expect(
        Math.abs(valueAt(simple, offset, "x") - series.styles[index]!.x!),
      ).toBeLessThanOrEqual(0.25)
    }
  })

  test("writes a transform the compositor can run, and an opacity", () => {
    expect(css({ opacity: 0.5, x: 1, y: -2.345, s: 1.5 })).toEqual({
      opacity: "0.5000",
      transform: "translate3d(1.00px, -2.35px, 0px) scale(1.500000)",
    })
    expect(css({ opacity: 1 })).toEqual({ opacity: "1.0000" })
    expect(
      keyframes({ offsets: [0, 1], styles: [{ x: 0 }, { x: 10 }] }),
    ).toEqual([
      {
        offset: 0,
        transform: "translate3d(0.00px, 0.00px, 0px) scale(1.000000)",
      },
      {
        offset: 1,
        transform: "translate3d(10.00px, 0.00px, 0px) scale(1.000000)",
      },
    ])
  })
})

describe("unit: the stage's timeline", () => {
  test("the painting on top keeps within half a pixel of its exact path", async () => {
    const { frameAt, KINKS, SHUTTERS } = await import("./frames")
    const {
      CUTS,
      PAINTING_SIZES,
      PAINTINGS,
      PANEL_STATES,
      SCENE_COUNT,
      WINDOW_LAYOUTS,
    } = await import("./scenes")
    const script = {
      sceneCount: SCENE_COUNT,
      states: PANEL_STATES,
      paintings: PAINTING_SIZES,
      cuts: CUTS,
      layouts: WINDOW_LAYOUTS,
      people: 2,
    }
    for (const [size, column] of [
      [{ w: 848, h: 905 }, true],
      [{ w: 1248, h: 1376 }, true],
      [{ w: 393, h: 243 }, false],
    ] as const) {
      const layout = {
        reduced: false,
        lineTravel: 24,
        scenes: [{ from: 0, to: 0, lines: 1 }],
        values: null,
        panel: { size, column, margin: 24, ratio: 2 },
      }
      const exact = (progress: number) => {
        const segment = Math.min(Math.floor(progress), SCENE_COUNT - 1)
        return frameAt(script, layout, segment, progress - segment)
      }
      const series = sample(
        (segment, t) => frameAt(script, layout, segment, t),
        SCENE_COUNT,
        STEPS,
        (segment, t) => (segment + t) / SCENE_COUNT,
        KINKS,
      )
      // As the stage simplifies them.
      const shutters = new Map(
        SHUTTERS.map((side) => [
          side,
          simplify(series.get(`shutter:${side}`)!),
        ]),
      )
      const paintings = new Map(
        PAINTINGS.map(({ key, size: image }) => [
          key,
          simplify(series.get(`painting:${key}`)!, paintingTolerance(image)),
        ]),
      )
      const keyframes = [...shutters.values(), ...paintings.values()].reduce(
        (sum, s) => sum + s.offsets.length,
        0,
      )
      // WebKit's main thread slows past about 1,800 for the whole page.
      expect(keyframes).toBeLessThan(700)
      // The title strip changes its words in straight lines, between samples:
      // a handful of keyframes for each scene's.
      const strip = [...series]
        .filter(([key]) => /^(strip|keyplan)/.test(key))
        .reduce((sum, [, entry]) => sum + simplify(entry).offsets.length, 0)
      expect(strip).toBeLessThan(120)

      const along = (simple: Series, offset: number, key: "x" | "y" | "s") => {
        const { offsets, styles } = simple
        let index = offsets.findLastIndex((value) => value <= offset)
        if (index >= offsets.length - 1) index = offsets.length - 2
        const a = offsets[index]!
        const b = offsets[index + 1]!
        const t = b === a ? 1 : (offset - a) / (b - a)
        return (
          styles[index]![key]! +
          (styles[index + 1]![key]! - styles[index]![key]!) * t
        )
      }
      let worst = 0
      for (let n = 0; n <= SCENE_COUNT * 600; n++) {
        const progress = n / 600
        const frame = exact(progress)
        // Under the portraits' white halves nothing else is seen.
        if (frame["half:0"]!.opacity! >= 0.999) continue
        const offset = progress / SCENE_COUNT
        // The shutters' edges.
        for (const side of SHUTTERS) {
          const key = side === "top" || side === "bottom" ? "y" : "x"
          const exactly = frame[`shutter:${side}`]![key]!
          // Only an edge inside the panel is seen.
          const extent = key === "x" ? size.w : size.h
          const edge =
            side === "top" || side === "left"
              ? exactly + extent + 1
              : exactly - 1
          if (edge < 0 || edge > extent) continue
          const drawn = along(shutters.get(side)!, offset, key)
          worst = Math.max(worst, Math.abs(drawn - exactly))
        }
        // The painting on top, at the open square's corners and middle.
        const key = PAINTINGS.map(({ key }) => key).findLast(
          (key) => frame[`painting:${key}`]!.opacity! > 0.5,
        )
        if (!key) continue
        const e = frame[`painting:${key}`]!
        const p = paintings.get(key)!
        const d = {
          x: along(p, offset, "x"),
          y: along(p, offset, "y"),
          s: along(p, offset, "s"),
        }
        const left = Math.max(0, frame["shutter:left"]!.x! + size.w + 1)
        const right = Math.min(size.w, frame["shutter:right"]!.x! - 1)
        const top = Math.max(0, frame["shutter:top"]!.y! + size.h + 1)
        const bottom = Math.min(size.h, frame["shutter:bottom"]!.y! - 1)
        for (const [sx, sy] of [
          [left, top],
          [right, top],
          [left, bottom],
          [right, bottom],
          [(left + right) / 2, (top + bottom) / 2],
        ] as const) {
          // The painting's own point drawn there exactly, and where the
          // simplified keyframes draw it.
          const px = (sx - e.x!) / e.s!
          const py = (sy - e.y!) / e.s!
          worst = Math.max(
            worst,
            Math.hypot(d.x + d.s * px - sx, d.y + d.s * py - sy),
          )
        }
      }
      expect(worst).toBeLessThan(0.5)
    }
  })
})
