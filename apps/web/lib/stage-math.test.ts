import { describe, expect, test } from "bun:test"

import {
  coversPanel,
  lineFrame,
  mixGeometry,
  offsetFrom,
  openGeometry,
  parsePath,
  placePath,
  progressAt,
  rollFrame,
  windowGeometry,
  type WindowLayout,
} from "./stage-math"
import { COMMA_PATH } from "@answerable/ui/lib/logo"

const TOPS = [0, 900, 1800, 2700]
const IMAGE = { w: 1086, h: 1448 }
const COLUMN = { w: 713, h: 870 }
const BAND = { w: 390, h: 250 }
const LAYOUT: WindowLayout = {
  base: 0.36,
  margin: 0.09,
  anchorY: 0.5,
  maxScale: 1.3,
}

describe("unit: stage progress", () => {
  test("reads the scroll as a position among snap points", () => {
    expect(progressAt(0, TOPS)).toBe(0)
    expect(progressAt(450, TOPS)).toBe(0.5)
    expect(progressAt(900, TOPS)).toBe(1)
    expect(progressAt(2250, TOPS)).toBe(2.5)
  })

  test("stops at the ends", () => {
    expect(progressAt(-40, TOPS)).toBe(0)
    expect(progressAt(9000, TOPS)).toBe(3)
    expect(progressAt(300, [0])).toBe(0)
  })

  test("measures from uneven snap points", () => {
    // A last snap point a large viewport tall, as on a phone with its bars.
    expect(progressAt(950, [0, 800, 1000])).toBe(1.75)
  })
})

describe("unit: scene offsets", () => {
  test("is 0 inside a run of scenes and signed outside it", () => {
    expect(offsetFrom(3.4, 2, 7, 10)).toBe(0)
    expect(offsetFrom(1.25, 2, 7, 10)).toBe(-0.75)
    expect(offsetFrom(7.5, 2, 7, 10)).toBe(0.5)
  })

  test("brings the hero back at the last snap point", () => {
    expect(offsetFrom(0, 0, 0, 10)).toBe(0)
    expect(offsetFrom(0.5, 0, 0, 10)).toBe(0.5)
    expect(offsetFrom(9.5, 0, 0, 10)).toBe(-0.5)
    expect(offsetFrom(10, 0, 0, 10)).toBe(0)
    // Other scenes do not loop.
    expect(offsetFrom(9.5, 1, 1, 10)).toBe(8.5)
  })
})

describe("unit: line and roll frames", () => {
  test("a line at rest is in place and opaque", () => {
    expect(lineFrame(0, 0, 3)).toEqual({ opacity: 1, shift: 0 })
    expect(lineFrame(0, 2, 3)).toEqual({ opacity: 1, shift: 0 })
  })

  test("a line enters from below and leaves upwards", () => {
    expect(lineFrame(-1, 0, 1)).toEqual({ opacity: 0, shift: 1 })
    expect(lineFrame(1, 0, 1)).toEqual({ opacity: 0, shift: -1 })
  })

  test("two scenes never show at once halfway", () => {
    expect(lineFrame(-0.5, 0, 1).opacity).toBe(0)
    expect(lineFrame(0.5, 0, 1).opacity).toBe(0)
  })

  test("the first line arrives first and leaves first", () => {
    const entering = [0, 1, 2].map((index) => lineFrame(-0.3, index, 3))
    expect(entering[0]!.opacity).toBeGreaterThan(entering[2]!.opacity)
    const leaving = [0, 1, 2].map((index) => lineFrame(0.3, index, 3))
    expect(leaving[0]!.opacity).toBeLessThan(leaving[2]!.opacity)
  })

  test("a statement rolls a full height and fades only at the ends", () => {
    expect(rollFrame(0)).toEqual({ opacity: 1, shift: 0 })
    expect(rollFrame(-1)).toEqual({ opacity: 0, shift: 1 })
    expect(rollFrame(1)).toEqual({ opacity: 0, shift: -1 })
    expect(rollFrame(-0.9).opacity).toBe(0)
    expect(rollFrame(-0.5).opacity).toBeGreaterThan(0)
  })
})

describe("unit: the comma window", () => {
  test("open, the picture covers the panel as object-fit: cover does", () => {
    const open = openGeometry(COLUMN, IMAGE, [543, 724], LAYOUT)
    const scale = 713 / 1086
    expect(open.scale).toBeCloseTo(scale)
    expect(open.x).toBeCloseTo(0)
    expect(open.y).toBeCloseTo((870 - 1448 * scale) / 2)
    expect(coversPanel(open, COLUMN)).toBe(true)
  })

  test("closed, the whole comma stays inside the margin", () => {
    // The signature, at the bottom right of the picture.
    const g = windowGeometry(
      COLUMN,
      IMAGE,
      { focus: [866, 998], span: 250, size: 1 },
      LAYOUT,
    )
    const margin = 0.09 * 713
    expect(g.cx - g.head / 2).toBeGreaterThanOrEqual(margin - 0.01)
    expect(g.cx + g.head / 2).toBeLessThanOrEqual(713 - margin + 0.01)
    // The comma is a head and half a head of tail below it.
    expect(g.cy + g.head).toBeLessThanOrEqual(870 - margin + 0.01)
    expect(coversPanel(g, COLUMN)).toBe(false)
  })

  test("closed, the detail sits at the head's centre", () => {
    const g = windowGeometry(
      BAND,
      IMAGE,
      { focus: [262, 1166], span: 230, size: 0.9 },
      { ...LAYOUT, base: 0.5, margin: 0.07, anchorY: 0.36 },
    )
    expect(g.x + 262 * g.scale).toBeCloseTo(g.cx)
    expect(g.y + 1166 * g.scale).toBeCloseTo(g.cy)
  })

  test("never magnifies past the layout's limit", () => {
    const g = windowGeometry(
      { w: 1273, h: 1410 },
      IMAGE,
      { focus: [296, 800], span: 100, size: 1 },
      LAYOUT,
    )
    expect(g.scale).toBe(1.3)
  })

  test("a transition starts and ends exactly on its states", () => {
    const window = { focus: [478, 600] as const, span: 300, size: 1.1 }
    const open = openGeometry(COLUMN, IMAGE, window.focus, LAYOUT)
    const closed = windowGeometry(COLUMN, IMAGE, window, LAYOUT)
    expect(mixGeometry(open, closed, 0)).toEqual(open)
    const end = mixGeometry(open, closed, 1)
    expect(end.x).toBeCloseTo(closed.x)
    expect(end.scale).toBeCloseTo(closed.scale)
    expect(end.head).toBeCloseTo(closed.head)
    // Halfway the head is the geometric mean: a zoom at an even pace.
    expect(mixGeometry(open, closed, 0.5).head).toBeCloseTo(
      Math.sqrt(open.head * closed.head),
    )
  })
})

describe("unit: the comma path", () => {
  const comma = parsePath(COMMA_PATH)

  test("parses every command of the logo's comma", () => {
    expect(comma.map((segment) => segment.command).join("")).toBe("MVLHCLHLHZ")
  })

  test("at its own size and place it is the logo's comma", () => {
    const d = placePath(comma, [1128, 240], 48, 1128, 240, 48)
    expect(d).toBe(
      "M1152 216L1152 263.83L1127.72 288L1103.79 288C1103.79 288 1117.9 272.42 1124.57 266.99L1124.56 263.83L1104 263.83L1104.01 216L1152 216Z",
    )
  })

  test("moves and scales round the head's centre", () => {
    const d = placePath(comma, [1128, 240], 48, 100, 100, 96)
    // The head's top-right corner: 24 units right and up, doubled.
    expect(d.startsWith("M148 52")).toBe(true)
    // The tail's tip: 24.21 units left and 48 down, doubled.
    expect(d).toContain("L51.58 196")
  })
})
