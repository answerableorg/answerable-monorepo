import { describe, expect, test } from "bun:test"

import {
  COMMA,
  lineFrame,
  mixGeometry,
  offsetFrom,
  openGeometry,
  progressAt,
  rollFrame,
  TAIL,
  windowBoxes,
  windowGeometry,
  type WindowLayout,
} from "./stage-math"
import { COMMA_PATH } from "@answerable/ui/lib/logo"

const TOPS = [0, 900, 1800, 2700]
const IMAGE = { w: 1086, h: 1448 }
const COLUMN = { w: 713, h: 870 }
const BAND = { w: 390, h: 250 }
const LAYOUT: WindowLayout = { base: 0.36, anchorY: 0.5, maxScale: 1.3 }

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

describe("unit: the window", () => {
  const MARGIN = 32
  const square = {
    focus: [866, 998] as const,
    span: 250,
    size: 1,
    shape: "square" as const,
  }
  const comma = { ...square, shape: "comma" as const }

  test("open, the picture covers the panel as object-fit: cover does", () => {
    const open = openGeometry(COLUMN, IMAGE, [543, 724], "comma", LAYOUT)
    const scale = 713 / 1086
    expect(open.scale).toBeCloseTo(scale)
    expect(open.x).toBeCloseTo(0)
    expect(open.y).toBeCloseTo((870 - 1448 * scale) / 2)
    // The head is larger than the panel all round.
    expect(open.cx - open.head / 2).toBeLessThan(0)
    expect(open.cx + open.head / 2).toBeGreaterThan(713)
    expect(open.cy - open.head / 2).toBeLessThan(0)
    expect(open.cy + open.head / 2).toBeGreaterThan(870)
  })

  test("a comma stays inside the margin, tail included", () => {
    // The signature, at the bottom right of the picture.
    const g = windowGeometry(COLUMN, IMAGE, comma, LAYOUT, MARGIN)
    expect(g.tail).toBe(1)
    expect(g.cx + g.head / 2).toBeCloseTo(713 - MARGIN)
    const bottom =
      g.cy + (g.head * COMMA.head.h) / COMMA.head.w / 2 + TAIL * g.head
    expect(bottom).toBeCloseTo(870 - MARGIN)
  })

  test("a square has no tail, so it comes further down", () => {
    // A detail at the very bottom of the picture: both shapes are pulled up.
    const low = { ...square, focus: [866, 1420] as const }
    const s = windowGeometry(COLUMN, IMAGE, low, LAYOUT, MARGIN)
    const c = windowGeometry(
      COLUMN,
      IMAGE,
      { ...low, shape: "comma" },
      LAYOUT,
      MARGIN,
    )
    expect(s.tail).toBe(0)
    const half = (s.head * COMMA.head.h) / COMMA.head.w / 2
    expect(s.cy + half).toBeCloseTo(870 - MARGIN)
    expect(c.cy).toBeLessThan(s.cy)
  })

  test("closed, the detail sits at the head's centre", () => {
    const g = windowGeometry(
      BAND,
      IMAGE,
      { focus: [262, 1166], span: 230, size: 0.9, shape: "square" },
      { ...LAYOUT, base: 0.5, anchorY: 0.36 },
      24,
    )
    expect(g.x + 262 * g.scale).toBeCloseTo(g.cx)
    expect(g.y + 1166 * g.scale).toBeCloseTo(g.cy)
  })

  test("never shows past the picture's edges", () => {
    // The model, low in the picture, with a long tail under it.
    const g = windowGeometry(
      COLUMN,
      IMAGE,
      { focus: [556, 786], span: 760, size: 1.75, shape: "comma" },
      LAYOUT,
      MARGIN,
    )
    const below = (g.head * COMMA.head.h) / COMMA.head.w / 2 + TAIL * g.head
    expect(g.focus[1] + below / g.scale).toBeLessThanOrEqual(1448 + 1e-6)
    // The laptop, near the right edge, magnified to the limit.
    const wide = windowGeometry(
      { w: 1273, h: 1410 },
      IMAGE,
      { focus: [898, 482], span: 380, size: 1.15, shape: "comma" },
      LAYOUT,
      MARGIN,
    )
    expect(wide.focus[0] + wide.head / 2 / wide.scale).toBeLessThanOrEqual(
      1086 + 1e-6,
    )
  })

  test("never magnifies past the layout's limit", () => {
    const g = windowGeometry(
      { w: 1273, h: 1410 },
      IMAGE,
      { ...square, span: 100 },
      LAYOUT,
      MARGIN,
    )
    expect(g.scale).toBe(1.3)
  })

  test("a transition starts and ends exactly on its states", () => {
    const window = {
      focus: [478, 600] as const,
      span: 300,
      size: 1.1,
      shape: "comma" as const,
    }
    const open = openGeometry(COLUMN, IMAGE, window.focus, "comma", LAYOUT)
    const closed = windowGeometry(COLUMN, IMAGE, window, LAYOUT, MARGIN)
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

  test("the tail grows from the square to the comma", () => {
    const a = windowGeometry(COLUMN, IMAGE, square, LAYOUT, MARGIN)
    const b = windowGeometry(COLUMN, IMAGE, comma, LAYOUT, MARGIN)
    expect(mixGeometry(a, b, 0.25).tail).toBeCloseTo(0.25)
  })
})

describe("unit: the window's boxes", () => {
  const g = {
    x: 0,
    y: 0,
    scale: 1,
    cx: 400,
    cy: 300,
    head: 240,
    tail: 1,
    focus: [0, 0] as const,
  }

  test("the head is centred on the window", () => {
    const { unit, head } = windowBoxes(g, 0)
    expect(unit).toBe(5)
    expect(head.x).toBeCloseTo(280)
    expect(head.y).toBeCloseTo(300 - (47.835 / 2) * 5)
  })

  test("the band starts under the head, raised by the overlap", () => {
    const { band, head } = windowBoxes(g, 1)
    expect(band.y).toBeCloseTo(head.y + (47.835 - 1) * 5)
    // The tail's tip sits 0.21 units left of the head.
    expect(band.x).toBeCloseTo(head.x - 0.21 * 5)
  })

  test("a square slides the band up under the head", () => {
    const comma = windowBoxes(g, 1).band
    const square = windowBoxes({ ...g, tail: 0 }, 1).band
    expect(comma.y - square.y).toBeCloseTo(24.167 * 5)
  })
})

describe("unit: the comma's parts match the logo", () => {
  const numbers = COMMA_PATH.match(/-?\d*\.?\d+/g)!.map(Number)

  test("the head and the band come from the logo's comma", () => {
    // M1152 215.998 V263.833 L1127.72 288 H1103.79 C… H1104 L1104.01 215.998
    expect(numbers.slice(0, 3)).toEqual([1152, 215.998, 263.833])
    expect(COMMA.head.x + COMMA.head.w).toBe(1152)
    expect(COMMA.head.y).toBe(215.998)
    expect(COMMA.head.y + COMMA.head.h).toBeCloseTo(263.833)
    expect(COMMA.band.y).toBe(263.833)
    expect(COMMA.band.y + COMMA.band.h).toBe(288)
    expect(COMMA.band.x).toBe(1103.79)
  })

  test("the covers trace the tail's edges", () => {
    // M1152 215.998 V263.833 L1127.72 288 H1103.79
    // C1103.79 288 1117.9 272.422 1124.57 266.992 L1124.56 263.833 …
    const [, , , footX, , tipX, c1x, c1y, c2x, c2y, endX, endY, topX, topY] =
      numbers as number[]
    const n = (value: number) => String(+value.toFixed(3))
    const x = (value: number) => n(value - COMMA.band.x)
    const y = (value: number) => n(value - COMMA.band.y)
    expect(tipX).toBe(COMMA.band.x)
    // The tail's edges, exactly; the rest overhangs the band.
    expect(COMMA.covers).toContain(
      `H${x(topX!)}L${x(endX!)} ${y(endY!)}` +
        `C${x(c2x!)} ${y(c2y!)} ${x(c1x!)} ${y(c1y!)} 0 ${y(288)}`,
    )
    expect(COMMA.covers).toContain(`M${n(COMMA.band.w)} 0`)
    expect(COMMA.covers).toContain(`H${x(footX!)}V${y(288)}Z`)
    expect(y(topY!)).toBe("0")
  })
})
