import { describe, expect, test } from "bun:test"

import type { Frame } from "./frames"
import {
  css,
  keyframes,
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
  test("the picture keeps within half a pixel of its exact path", async () => {
    const { frameAt, KINKS } = await import("./frames")
    const { PANEL_STATES, SCENE_COUNT, WINDOW_LAYOUTS } =
      await import("./scenes")
    const script = {
      sceneCount: SCENE_COUNT,
      states: PANEL_STATES,
      image: { w: 1086, h: 1448 },
      layouts: WINDOW_LAYOUTS,
      people: 2,
    }
    for (const [size, column] of [
      [{ w: 704, h: 868 }, true],
      [{ w: 390, h: 300 }, false],
    ] as const) {
      const layout = {
        reduced: false,
        lineTravel: 24,
        scenes: [{ from: 0, to: 0, lines: 1 }],
        values: null,
        panel: { size, column, margin: 24 },
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
      const head = simplify(series.get("head")!)
      const image = simplify(series.get("headImage")!)
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
        // Hidden under the portraits' colours, the picture is not seen.
        if (frame["half:0"]!.opacity! >= 0.999) continue
        const offset = progress / SCENE_COUNT
        const h = {
          x: along(head, offset, "x"),
          y: along(head, offset, "y"),
          s: along(head, offset, "s"),
        }
        const i = {
          x: along(image, offset, "x"),
          y: along(image, offset, "y"),
          s: along(image, offset, "s"),
        }
        const e = frame.head!
        const ei = frame.headImage!
        for (const [x, y] of [
          [0, 0],
          [1086, 1448],
          [543, 724],
        ] as const) {
          const drawn = [
            h.x + (i.x + i.s * x) * h.s,
            h.y + (i.y + i.s * y) * h.s,
          ]
          const truth = [
            e.x! + (ei.x! + ei.s! * x) * e.s!,
            e.y! + (ei.y! + ei.s! * y) * e.s!,
          ]
          worst = Math.max(
            worst,
            Math.hypot(drawn[0]! - truth[0]!, drawn[1]! - truth[1]!),
          )
        }
      }
      expect(worst).toBeLessThan(0.5)
    }
  })
})
