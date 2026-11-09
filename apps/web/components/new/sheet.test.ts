import { describe, expect, test } from "bun:test"

import { PEOPLE, SCRIPT } from "@/components/new/scenes"
import { SHEET_COMMA, sheetPlan, type SheetPanel } from "@/components/new/sheet"

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

/** Every rectangle of a path of filled rectangles (`M x y h w v h h -w z`). */
function rects(path: string) {
  return [...path.matchAll(/M(\S+) (\S+)h(\S+)v(\S+)h\S+z/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    w: Number(match[3]),
    h: Number(match[4]),
  }))
}
const whole = (value: number) => Math.abs(value - Math.round(value)) < 0.01
/** The lattice line a position is on, or -1. */
const line = (lines: readonly number[], value: number) =>
  lines.findIndex((at) => Math.abs(at - value) < 1e-6)

describe("the sheet's plan", () => {
  test.each(each)("%s: every line is on device pixels", (_, panel, plan) => {
    const { ratio } = panel
    expect(whole(plan.hair * ratio)).toBe(true)
    expect(whole(plan.ink * ratio)).toBe(true)
    expect(plan.ink).toBeGreaterThanOrEqual(plan.hair)
    const all = [...rects(plan.lines), ...rects(plan.frame)]
    expect(all.length).toBeGreaterThan(8)
    for (const rect of all) {
      for (const value of [rect.x, rect.y, rect.w, rect.h]) {
        expect(whole(value * ratio)).toBe(true)
      }
    }
  })

  test.each(each)("%s: the frame is at the inset", (_, panel, plan) => {
    const { size, margin } = panel
    const { xs, ys, columns, rows, bottom } = plan.lattice
    expect(xs[0]).toBe(margin)
    expect(ys[0]).toBe(margin)
    expect(xs[columns]).toBe(size.w - margin)
    expect(bottom).toBe(size.h - margin)
    expect(plan.strip).toMatchObject({
      x: margin,
      y: ys[rows]!,
      w: size.w - 2 * margin,
      h: bottom - ys[rows]!,
    })
    // Nothing is drawn past the panel.
    for (const rect of rects(plan.frame)) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w).toBeLessThanOrEqual(size.w)
      expect(rect.y + rect.h).toBeLessThanOrEqual(size.h)
    }
  })

  test.each(each)("%s: the rules span the lattice", (_, panel, plan) => {
    const { xs, ys, columns, rows } = plan.lattice
    const across = xs[columns]! - xs[0]! + plan.ink
    const down = ys[rows]! - ys[0]! + plan.ink
    expect(plan.rules.top).toEqual({ x: xs[0]!, y: 0, w: across, h: plan.ink })
    expect(plan.rules.bottom).toEqual(plan.rules.top)
    expect(plan.rules.left).toEqual({ x: 0, y: ys[0]!, w: plan.ink, h: down })
    expect(plan.rules.right).toEqual(plan.rules.left)
  })

  test("zone labels only beside the copy, with room for them", () => {
    const zones = (name: string) => sheetPlan(PANELS[name]!, SCRIPT).zones
    expect(zones("laptop").map((zone) => zone.text)).toEqual([
      ..."1 2 3 4 5 6 7 8 9 10 11 12 13".split(" "),
      ..."ABCDEFGHJKLMN",
    ])
    expect(zones("large")).toHaveLength(33)
    for (const name of ["phone", "small", "tablet", "short"]) {
      expect(zones(name)).toHaveLength(0)
    }
    // Inside the margin, clear of the frame.
    const { margin } = PANELS.laptop!
    for (const zone of zones("laptop")) {
      expect(Math.min(zone.x, zone.y)).toBeLessThan(margin - 6)
      expect(Math.min(zone.x, zone.y)).toBeGreaterThan(8)
    }
  })

  test("ticks only where the inset has room", () => {
    const count = (name: string) =>
      rects(sheetPlan(PANELS[name]!, SCRIPT).frame).length
    // Four sides, the strip's line and its number's, then two ticks a line.
    expect(count("short")).toBe(6)
    expect(count("laptop")).toBe(6 + 4 * 14)
    expect(count("phone")).toBe(6 + 2 * 9 + 2 * 8)
  })
})

describe("the title strip", () => {
  test.each(each)("%s: its cells end on lattice lines", (_, panel, plan) => {
    const { xs, columns } = plan.lattice
    const { strip } = plan
    expect(strip.font).toBe(panel.column ? 9 : 8)
    const number = line(xs, strip.number)
    expect(number).toBeGreaterThan(0)
    // "00 / 00" fits its cell, padded on both sides.
    expect(strip.number - strip.x).toBeGreaterThan(
      2 * strip.pad + 4 * strip.font - 0.01,
    )
    const { keyplan } = strip
    if (!keyplan) return
    // The name keeps two modules between the number and the key plan.
    expect(line(xs, keyplan.cell.x)).toBeGreaterThanOrEqual(number + 2)
    expect(keyplan.cell.x + keyplan.cell.w).toBe(xs[columns]!)
    expect(keyplan.cell.y).toBe(strip.y)
    expect(keyplan.cell.h).toBe(strip.h)
  })

  test.each(each)("%s: the key plan is drawn to scale", (_, panel, plan) => {
    const { keyplan } = plan.strip
    expect(keyplan !== null).toBe(plan.strip.h >= 30)
    if (!keyplan) return
    const { cell, box, windows, dots } = keyplan
    const studio = SCRIPT.paintings.studio
    // The painting's outline, in its proportions, inside its cell.
    expect(Math.abs(box.w / box.h - studio.w / studio.h)).toBeLessThan(0.12)
    expect(box.x).toBeGreaterThanOrEqual(cell.x + plan.strip.pad - 1)
    expect(box.x + box.w).toBeLessThanOrEqual(cell.x + cell.w)
    expect(box.y).toBeGreaterThan(cell.y)
    expect(box.y + box.h).toBeLessThan(cell.y + cell.h)
    // A square for each scene on the studio and for no other.
    expect(windows.map((window) => window !== null)).toEqual(
      SCRIPT.states.map((state) => state.painting === "studio"),
    )
    const scale = box.w / studio.w
    windows.forEach((window, scene) => {
      const dot = dots[scene]
      if (!window || !dot) return expect(dot ?? null).toBeNull()
      const { focus, span } = SCRIPT.states[scene]!.window!
      for (const value of [window.x, window.y, window.w, dot.x, dot.w]) {
        expect(whole(value * panel.ratio)).toBe(true)
      }
      expect(Math.abs(window.w - span * scale)).toBeLessThan(1)
      // On its detail, and inside the outline.
      expect(
        Math.abs(window.x + window.w / 2 - box.x - focus[0] * scale),
      ).toBeLessThan(1.5)
      expect(window.x).toBeGreaterThanOrEqual(box.x - 1)
      expect(window.x + window.w).toBeLessThanOrEqual(box.x + box.w + 1)
      expect(window.y).toBeGreaterThanOrEqual(box.y - 1)
      expect(window.y + window.h).toBeLessThanOrEqual(box.y + box.h + 1)
      // The mark is at its centre, to the device pixel.
      expect(dot.x - window.x).toBeCloseTo(
        window.x + window.w - dot.x - dot.w,
        6,
      )
      expect(dot.y - window.y).toBe(dot.x - window.x)
    })
  })

  test("no words where there is no room for them", () => {
    const thin = {
      size: { w: 200, h: 60 },
      column: false,
      margin: 8,
      ratio: 2,
    }
    const narrow = {
      size: { w: 120, h: 500 },
      column: true,
      margin: 8,
      ratio: 2,
    }
    for (const panel of [thin, narrow]) {
      const { strip, frame } = sheetPlan(panel, SCRIPT)
      expect(strip.font).toBe(0)
      expect(strip.number).toBe(strip.x)
      expect(strip.keyplan).toBeNull()
      // No divider: the four sides and, where there is a strip, its line.
      expect(rects(frame).length).toBeLessThanOrEqual(5)
    }
  })
})

describe("the commas on the sheet", () => {
  test("the tail is exactly half the head", () => {
    const { box, d, viewBox } = SHEET_COMMA
    expect(box.h).toBeCloseTo(47.835 * 1.5, 6)
    expect(viewBox).toBe("1103.79 215.998 48.21 71.753")
    // The tail's flat end is the box's bottom edge.
    expect(d).toContain("287.751H1103.79")
    expect(d.startsWith("M1152 215.998V263.833")).toBe(true)
  })

  test("the opening comma is turned, the closing one is not", () => {
    expect(PEOPLE.map((person) => person.turned)).toEqual([true, false])
  })

  test.each(each)("%s: heads on lattice lines, clear", (_, panel, plan) => {
    const { xs, ys, columns, rows } = plan.lattice
    const [opening, closing] = plan.commas
    for (const { head } of plan.commas) {
      expect(line(xs, head.x)).toBeGreaterThanOrEqual(0)
      expect(line(xs, head.x + head.w)).toBeGreaterThan(0)
      expect(line(ys, head.y)).toBeGreaterThanOrEqual(0)
      expect(line(ys, head.y + head.h)).toBeGreaterThan(0)
    }
    // In the lattice's corners, each the other turned half round.
    expect(opening.head.x).toBe(xs[0]!)
    expect(closing.head.x + closing.head.w).toBe(xs[columns]!)
    const k = line(xs, opening.head.x + opening.head.w)
    const top = line(ys, opening.head.y)
    expect(line(ys, closing.head.y + closing.head.h)).toBe(rows - top)
    expect(line(xs, closing.head.x)).toBe(columns - k)
    // Whole boxes inside the lattice, and the two apart.
    for (const { box } of plan.commas) {
      expect(box.y).toBeGreaterThanOrEqual(ys[0]! - 0.01)
      expect(box.y + box.h).toBeLessThanOrEqual(ys[rows]! + 0.01)
      expect(box.x).toBeGreaterThanOrEqual(xs[0]! - 1)
      expect(box.x + box.w).toBeLessThanOrEqual(xs[columns]! + 1)
    }
    const apart =
      opening.box.x + opening.box.w <= closing.box.x + 0.01 ||
      opening.box.y + opening.box.h <= closing.box.y + 0.01
    expect(apart).toBe(true)
    // The tail is half the head, to the device pixel.
    for (const { box, head } of plan.commas) {
      expect(Math.abs(box.h - head.h * 1.5)).toBeLessThanOrEqual(
        1 / panel.ratio + 0.01,
      )
    }
  })

  test("the laptop's tails end on lattice lines", () => {
    const plan = sheetPlan(PANELS.laptop!, SCRIPT)
    const { ys, rows } = plan.lattice
    expect(plan.commas[0].box.y).toBe(ys[0]!)
    expect(plan.commas[1].box.y + plan.commas[1].box.h).toBe(ys[rows]!)
  })
})
