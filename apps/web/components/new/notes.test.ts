import { describe, expect, test } from "bun:test"

import {
  ARM,
  FIGURE_GAP,
  noteLine,
  notePlans,
  sceneGeometry,
} from "@/components/new/notes"
import { SCRIPT } from "@/components/new/scenes"
import {
  sheetPlan,
  type SheetPanel,
  type SheetPlan,
} from "@/components/new/sheet"
import type { Point } from "@/lib/stage-math"

/** Panels as measured: the laptop, phones, a tablet, a short and a large one. */
const PANELS: Record<string, SheetPanel> = {
  laptop: { size: { w: 856, h: 907 }, column: true, margin: 32, ratio: 2 },
  phone: { size: { w: 393, h: 392 }, column: false, margin: 24, ratio: 3 },
  small: { size: { w: 375, h: 251 }, column: false, margin: 24, ratio: 2 },
  tablet: { size: { w: 480, h: 736 }, column: true, margin: 16, ratio: 1 },
  short: { size: { w: 632, h: 584 }, column: true, margin: 8, ratio: 1.5 },
  large: { size: { w: 1248, h: 1376 }, column: true, margin: 48, ratio: 2 },
}
const each = Object.entries(PANELS).map(
  ([name, panel]) => [name, panel, sheetPlan(panel, SCRIPT)] as const,
)

/** On a device pixel, to the hundredth of a pixel a path is written in. */
const whole = (value: number, ratio: number) =>
  Math.abs(value * ratio - Math.round(value * ratio)) < 0.02

/** Each note a panel draws, with the view of the painting it is drawn on. */
function drawn(panel: SheetPanel, plan: SheetPlan) {
  return SCRIPT.notes.flatMap((note, order) => {
    const laid = plan.notes[order]
    if (!laid) return []
    const state = SCRIPT.states[note.scenes[0]!]!
    const g = sceneGeometry(panel, plan.lattice, SCRIPT, state)
    const picture = { x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h }
    /** A point of the painting, on the panel. */
    const at = ([x, y]: Point): Point => [g.x + x * g.scale, g.y + y * g.scale]
    return [{ note, laid, g, picture, at }]
  })
}

const NUMBER = "(-?\\d+(?:\\.\\d+)?)"
const LINE = new RegExp(`M${NUMBER} ${NUMBER}L${NUMBER} ${NUMBER}`, "g")
const CIRCLE = new RegExp(`M${NUMBER} ${NUMBER}a${NUMBER} `, "g")
const SWEEP = new RegExp(
  `M${NUMBER} ${NUMBER}A${NUMBER} ${NUMBER} 0 0 [01] ${NUMBER} ${NUMBER}`,
  "g",
)

/** A path's straight lines, on the panel. */
function lines(path: string, corner: { x: number; y: number }) {
  return [...path.matchAll(LINE)].map((match) => {
    const [x1, y1, x2, y2] = match.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
    ]
    return {
      a: [corner.x + x1, corner.y + y1] as Point,
      b: [corner.x + x2, corner.y + y2] as Point,
    }
  })
}

/** How far a point is from the line through two others. */
function off([x, y]: Point, a: Point, b: Point) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.abs(dx * (y - a[1]) - dy * (x - a[0])) / Math.hypot(dx, dy)
}

describe("the notes' plans", () => {
  test.each(each)(
    "%s: a plan a note, in the script's order",
    (name, _, plan) => {
      expect(plan.notes.length).toBe(SCRIPT.notes.length)
      plan.notes.forEach((laid, order) => {
        if (!laid) return
        const note = SCRIPT.notes[order]!
        expect(laid.scenes).toEqual(note.scenes)
        expect(laid.painting).toBe(SCRIPT.states[note.scenes[0]!]!.painting)
      })
      // Only the shortest band crops a detail away: the sun, off its top.
      expect(plan.notes.map((laid) => laid === null)).toEqual(
        SCRIPT.notes.map((_, order) => name === "small" && order === 0),
      )
    },
  )

  test.each(each)("%s: a note's scenes share one view", (_, panel, plan) => {
    for (const note of SCRIPT.notes) {
      const [first, ...rest] = note.scenes.map((scene) =>
        sceneGeometry(panel, plan.lattice, SCRIPT, SCRIPT.states[scene]!),
      )
      for (const other of rest) expect(other).toEqual(first!)
      const paintings = note.scenes.map((s) => SCRIPT.states[s]!.painting)
      expect(new Set(paintings).size).toBe(1)
    }
  })

  test.each(each)("%s: every box is on the picture", (_, panel, plan) => {
    const { ratio } = panel
    for (const { laid, picture } of drawn(panel, plan)) {
      const { box, clip } = laid
      // Its corner is on a device pixel, as its lines are.
      expect(whole(box.x, ratio)).toBe(true)
      expect(whole(box.y, ratio)).toBe(true)
      // What it draws is clipped to the picture.
      expect(box.x + clip.x).toBeCloseTo(picture.x, 6)
      expect(box.y + clip.y).toBeCloseTo(picture.y, 6)
      expect(clip.w).toBeCloseTo(picture.w, 6)
      expect(clip.h).toBeCloseTo(picture.h, 6)
      // And it holds no more than that: a pixel around, rounded out.
      expect(box.x).toBeGreaterThanOrEqual(picture.x - 3)
      expect(box.y).toBeGreaterThanOrEqual(picture.y - 3)
      expect(box.x + box.w).toBeLessThanOrEqual(picture.x + picture.w + 3)
      expect(box.y + box.h).toBeLessThanOrEqual(picture.y + picture.h + 3)
      expect(box.w).toBeGreaterThan(0)
      expect(box.h).toBeGreaterThan(0)
    }
  })

  test.each(each)("%s: every path is of finite numbers", (_, panel, plan) => {
    const number = NUMBER.replace("(", "(?:")
    const line = `M${number} ${number}L${number} ${number}`
    const arc = `a${number} ${number} 0 1 0 ${number} 0`
    const circle = `M${number} ${number}${arc}${arc}`
    const sweep = `M${number} ${number}A${number} ${number} 0 0 [01] ${number} ${number}`
    for (const { laid } of drawn(panel, plan)) {
      expect(laid.axes).toMatch(new RegExp(`^(?:${line})*$`))
      expect(laid.fine).toMatch(new RegExp(`^(?:${line})*$`))
      expect(laid.construction).toMatch(
        new RegExp(`^(?:${line})*(?:${circle})*(?:${sweep})*$`),
      )
      expect(
        laid.axes.length + laid.fine.length + laid.construction.length,
      ).toBeGreaterThan(0)
    }
  })

  test("a note's line is about a pixel and a half, in whole device pixels", () => {
    expect(noteLine(1)).toBe(2)
    expect(noteLine(1.5)).toBeCloseTo(4 / 3, 9)
    expect(noteLine(2)).toBe(1.5)
    expect(noteLine(3)).toBeCloseTo(5 / 3, 9)
    // And a construction line stays the lattice's hairline.
    for (const [, panel, plan] of each) {
      expect(plan.note).toBe(noteLine(panel.ratio))
      expect(plan.note).toBeGreaterThan(plan.hair)
    }
  })
})

describe("the notes' marks", () => {
  test.each(each)(
    "%s: a handle sits on its outline's corner",
    (_, panel, plan) => {
      const { ratio } = panel
      for (const { note, laid, picture, at } of drawn(panel, plan)) {
        const corners = note.marks.flatMap((mark) =>
          mark.kind === "outline" ? mark.points.map(at) : [],
        )
        expect(laid.handles.length).toBeLessThanOrEqual(corners.length)
        for (const handle of laid.handles) {
          const x = laid.box.x + handle.x
          const y = laid.box.y + handle.y
          // A square on device pixels, inside the picture.
          expect(handle.w).toBe(handle.h)
          for (const value of [x, y, handle.w]) {
            expect(whole(value, ratio)).toBe(true)
          }
          expect(x).toBeGreaterThanOrEqual(picture.x)
          expect(y).toBeGreaterThanOrEqual(picture.y)
          expect(x + handle.w).toBeLessThanOrEqual(picture.x + picture.w)
          expect(y + handle.h).toBeLessThanOrEqual(picture.y + picture.h)
          // Centred on a corner of the painting's own shape, to the pixel.
          const miss = Math.min(
            ...corners.map(([cx, cy]) =>
              Math.max(
                Math.abs(cx - x - handle.w / 2),
                Math.abs(cy - y - handle.h / 2),
              ),
            ),
          )
          expect(miss).toBeLessThanOrEqual(plan.note + 0.01)
        }
      }
    },
  )

  test.each(each)("%s: a circle is the painting's own", (_, panel, plan) => {
    for (const { note, laid, g, at } of drawn(panel, plan)) {
      const rings = note.marks.filter((mark) => mark.kind === "ring")
      const circles = [...laid.construction.matchAll(CIRCLE)]
      expect(circles.length).toBeLessThanOrEqual(rings.length)
      for (const match of circles) {
        const [x, y, r] = match.slice(1).map(Number) as [number, number, number]
        const fits = rings.some((ring) => {
          const [cx, cy] = at(ring.at)
          return (
            Math.abs(laid.box.x + x + r - cx) < 0.02 &&
            Math.abs(laid.box.y + y - cy) < 0.02 &&
            Math.abs(r - ring.r * g.scale) < 0.01
          )
        })
        expect(fits).toBe(true)
      }
    }
  })

  test.each(each)(
    "%s: a centre line runs through its points",
    (_, panel, plan) => {
      const { ratio } = panel
      for (const { note, laid, g, at } of drawn(panel, plan)) {
        const axes = note.marks.filter((mark) => mark.kind === "axis")
        const shown = lines(laid.axes, laid.box)
        expect(shown.length).toBeLessThanOrEqual(axes.length)
        for (const { a, b } of shown) {
          const length = Math.hypot(b[0] - a[0], b[1] - a[1])
          const axis = axes.find((mark) => {
            const from = at(mark.from)
            const to = at(mark.to)
            const span = Math.hypot(to[0] - from[0], to[1] - from[1])
            return (
              off(from, a, b) <= plan.note &&
              off(to, a, b) <= plan.note &&
              Math.abs(length - span - 2 * mark.extend * g.scale) < 0.05
            )
          })
          expect(axis).toBeDefined()
          // An upright or level line stays so, on a device pixel, not across
          // two.
          if (axis!.from[0] === axis!.to[0]) {
            expect(a[0]).toBe(b[0])
            expect(whole(a[0] - plan.note / 2, ratio)).toBe(true)
          }
          if (axis!.from[1] === axis!.to[1]) {
            expect(a[1]).toBe(b[1])
            expect(whole(a[1] - plan.note / 2, ratio)).toBe(true)
          }
        }
      }
    },
  )

  test.each(each)(
    "%s: a construction line is fine, and runs through its points",
    (_, panel, plan) => {
      let guides = 0
      for (const { note, laid, at } of drawn(panel, plan)) {
        const marks = note.marks.filter((mark) => mark.kind === "guide")
        const shown = lines(laid.fine, laid.box)
        expect(shown.length).toBeLessThanOrEqual(marks.length)
        guides += shown.length
        for (const { a, b } of shown) {
          const guide = marks.find(
            (mark) =>
              off(at(mark.from), a, b) < 0.02 && off(at(mark.to), a, b) < 0.02,
          )
          expect(guide).toBeDefined()
        }
      }
      // The badge's lettering lines, on every panel.
      expect(guides).toBe(2)
    },
  )

  test.each(each)(
    "%s: the pen's angle is an arc from the table's line to the pen's, with its size in figures",
    (_, panel, plan) => {
      const angles = drawn(panel, plan).flatMap(({ note, laid, g, at }) =>
        note.marks.flatMap((mark) =>
          mark.kind === "angle" ? [{ mark, laid, g, at }] : [],
        ),
      )
      // One, on the first value, on every panel.
      expect(angles.length).toBe(1)
      const { mark, laid, g, at } = angles[0]!
      const tip = at(mark.at)
      const far = (point: Point) =>
        Math.hypot(point[0] - tip[0], point[1] - tip[1])

      const sweeps = [...laid.construction.matchAll(SWEEP)]
      expect(sweeps.length).toBe(1)
      const [x0, y0, r, , x1, y1] = sweeps[0]!.slice(1).map(Number) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ]
      const start: Point = [laid.box.x + x0, laid.box.y + y0]
      const end: Point = [laid.box.x + x1, laid.box.y + y1]
      expect(Math.abs(r - mark.r * g.scale)).toBeLessThan(0.01)
      // From the table's line, level through the tip, to the pen's.
      expect(Math.abs(start[1] - tip[1])).toBeLessThan(0.02)
      expect(Math.abs(far(start) - r)).toBeLessThan(0.02)
      expect(off(end, tip, at(mark.to))).toBeLessThan(0.02)
      expect(Math.abs(far(end) - r)).toBeLessThan(0.02)

      // The table's line: level, on a device pixel, from its far end to past
      // the tip.
      const table = lines(laid.construction, laid.box).filter(
        ({ a, b }) => a[1] === b[1] && b[0] - a[0] > 2 * ARM + 1,
      )
      expect(table.length).toBe(1)
      const { a, b } = table[0]!
      expect(whole(a[1] - plan.note / 2, panel.ratio)).toBe(true)
      expect(Math.abs(a[1] - tip[1])).toBeLessThanOrEqual(plan.note)
      expect(Math.abs(a[0] - at(mark.from)[0])).toBeLessThan(0.02)
      expect(Math.abs(b[0] - tip[0] - mark.past * g.scale)).toBeLessThan(0.02)

      // Its size in whole degrees, beyond the arc, as far from one line as
      // from the other.
      expect(laid.labels.map((label) => label.text)).toEqual(["56°"])
      const figures: Point = [
        laid.box.x + laid.labels[0]!.x,
        laid.box.y + laid.labels[0]!.y,
      ]
      expect(Math.abs(far(figures) - r - FIGURE_GAP)).toBeLessThan(0.02)
      expect(
        Math.abs(
          Math.abs(figures[1] - tip[1]) - off(figures, tip, at(mark.to)),
        ),
      ).toBeLessThan(0.02)
    },
  )

  test.each(each)("%s: a cross is centred on its point", (_, panel, plan) => {
    const { ratio } = panel
    let crosses = 0
    for (const { note, laid, at } of drawn(panel, plan)) {
      const points = note.marks.flatMap((mark) =>
        mark.kind === "cross" ? [at(mark.at)] : [],
      )
      // Its level arm: twice `ARM` long, which no outline's side and no
      // angle's line is.
      const level = lines(laid.construction, laid.box).filter(
        ({ a, b }) => a[1] === b[1] && Math.abs(b[0] - a[0] - 2 * ARM) < 1e-6,
      )
      expect(level.length).toBeLessThanOrEqual(points.length)
      crosses += level.length
      for (const { a, b } of level) {
        expect(whole(a[1] - plan.note / 2, ratio)).toBe(true)
        const centre: Point = [(a[0] + b[0]) / 2, a[1]]
        const miss = Math.min(
          ...points.map(([x, y]) =>
            Math.max(Math.abs(x - centre[0]), Math.abs(y - centre[1])),
          ),
        )
        expect(miss).toBeLessThanOrEqual(plan.note + 0.01)
      }
    }
    // One on the first value's line and one on the third's, on every panel.
    expect(crosses).toBe(2)
  })

  test("a note off the picture draws nothing and keeps its place", () => {
    const panel = PANELS.laptop!
    const plan = sheetPlan(panel, SCRIPT)
    const plans = notePlans(
      panel,
      plan.lattice,
      {
        ...SCRIPT,
        notes: [
          { scenes: [2], marks: [{ kind: "cross", at: [0, 0] }] },
          SCRIPT.notes[1]!,
        ],
      },
      plan.note,
      plan.hair,
    )
    expect(plans[0]).toBeNull()
    expect(plans[1]).toEqual(plan.notes[1]!)
  })

  test("an outline's corner off the picture has no handle", () => {
    const panel = PANELS.laptop!
    const plan = sheetPlan(panel, SCRIPT)
    const g = sceneGeometry(panel, plan.lattice, SCRIPT, SCRIPT.states[2]!)
    // The middle of the first value's square, in the painting's pixels.
    const x = (g.cx - g.x) / g.scale
    const y = (g.cy - g.y) / g.scale
    const far = 20_000
    const [laid] = notePlans(
      panel,
      plan.lattice,
      {
        ...SCRIPT,
        notes: [
          {
            scenes: [2],
            marks: [
              {
                kind: "outline",
                points: [
                  [x, y],
                  [x + far, y],
                  [x + far, y + far],
                ],
              },
            ],
          },
        ],
      },
      plan.note,
      plan.hair,
    )
    expect(laid!.handles.length).toBe(1)
    // The side that never crosses the picture is not drawn.
    expect(lines(laid!.construction, laid!.box).length).toBe(2)
  })
})
