import { describe, expect, test } from "bun:test"

import {
  coverReach,
  LAND,
  lineFrame,
  mixGeometry,
  offsetFrom,
  openGeometry,
  progressAt,
  pushed,
  rollFrame,
  scrub,
  windowGeometry,
  type Placement,
  type Size,
  type WindowLayout,
} from "./stage-math"

const TOPS = [0, 900, 1800, 2700]
/** The studio panorama and the portrait paintings, in their own pixels. */
const STUDIO = { w: 6000, h: 2162 }
const PORTRAIT = { w: 3840, h: 5120 }
/** The owner's laptop panel, and an iPhone 15's band. */
const COLUMN = { w: 848, h: 905 }
const BAND = { w: 393, h: 243 }
const LAYOUT: WindowLayout = { size: 0.64, anchorY: 0.5 }
const BAND_LAYOUT: WindowLayout = { size: 0.8, anchorY: 0.36 }

/** Whether a placed painting covers a rectangle, to a hundredth of a pixel. */
function covers(
  at: Placement,
  image: Size,
  box: { left: number; top: number; right: number; bottom: number },
) {
  const e = 0.01
  return (
    at.x <= box.left + e &&
    at.y <= box.top + e &&
    at.x + image.w * at.scale >= box.right - e &&
    at.y + image.h * at.scale >= box.bottom - e
  )
}
const whole = (panel: Size) => ({
  left: 0,
  top: 0,
  right: panel.w,
  bottom: panel.h,
})

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

  test("two scenes never show at once, however many lines", () => {
    for (const count of [1, 2, 3, 5]) {
      for (let index = 0; index < count; index++) {
        for (const offset of [-1, -0.75, -0.5, 0.5, 0.75, 1]) {
          expect(lineFrame(offset, index, count).opacity).toBe(0)
        }
      }
    }
  })

  test("a scene's copy is in place before the scroll's slow end", () => {
    for (let index = 0; index < 3; index++) {
      expect(lineFrame(-(1 - LAND), index, 3)).toEqual({
        opacity: 1,
        shift: 0,
      })
    }
    expect(rollFrame(-(1 - LAND))).toEqual({ opacity: 1, shift: 0 })
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

describe("unit: the scrub's pace", () => {
  test("runs from 0 to 1 and mirrors itself", () => {
    expect(scrub(0)).toBe(0)
    expect(scrub(1)).toBe(1)
    expect(scrub(0.5)).toBe(0.5)
    expect(scrub(0.2) + scrub(0.8)).toBeCloseTo(1, 10)
    expect(scrub(-1)).toBe(0)
    expect(scrub(2)).toBe(1)
  })

  test("moves with the first pixel, at half speed", () => {
    expect(scrub(0.01) / 0.01).toBeCloseTo(0.5, 1)
    expect(scrub(0.99) - scrub(0.98)).toBeCloseTo(0.005, 3)
  })
})

describe("unit: the square window", () => {
  const MARGIN = 32
  /** Value 1, low on the left of the panorama; value 6, on its right. */
  const left = { focus: [880, 1560] as const, span: 1000 }
  const right = { focus: [5400, 850] as const, span: 1100 }

  test("open, the painting covers the panel as object-fit: cover does", () => {
    const open = openGeometry(COLUMN, PORTRAIT, [1322, 2541], LAYOUT)
    const scale = 848 / 3840
    expect(open.scale).toBeCloseTo(scale)
    expect(open.x).toBeCloseTo(0)
    expect(open.y).toBeCloseTo((905 - 5120 * scale) / 2)
    // The square is larger than the panel all round.
    expect(open.cx - open.side / 2).toBeLessThan(0)
    expect(open.cx + open.side / 2).toBeGreaterThan(848)
    expect(open.cy - open.side / 2).toBeLessThan(0)
    expect(open.cy + open.side / 2).toBeGreaterThan(905)
  })

  test("a square of twice the cover reach covers the panel from any centre", () => {
    for (const [cx, cy] of [
      [0, 0],
      [848, 905],
      [-200, 450],
      [424, 1400],
    ] as const) {
      const half = coverReach(COLUMN, cx, cy)
      expect(cx - half).toBeLessThanOrEqual(0)
      expect(cx + half).toBeGreaterThanOrEqual(848)
      expect(cy - half).toBeLessThanOrEqual(0)
      expect(cy + half).toBeGreaterThanOrEqual(905)
    }
  })

  test("closed, the square is its share of the shorter side, the detail at its centre", () => {
    const g = windowGeometry(COLUMN, STUDIO, left, LAYOUT, MARGIN)
    expect(g.side).toBeCloseTo(0.64 * 848)
    expect(g.scale).toBeCloseTo(g.side / 1000)
    expect(g.x + 880 * g.scale).toBeCloseTo(g.cx)
    expect(g.y + 1560 * g.scale).toBeCloseTo(g.cy)
  })

  test("the square keeps inside the margin, and fills a phone's band to it", () => {
    for (const [panel, layout, margin] of [
      [COLUMN, LAYOUT, MARGIN],
      [BAND, BAND_LAYOUT, 24],
    ] as const) {
      for (const window of [left, right]) {
        const g = windowGeometry(panel, STUDIO, window, layout, margin)
        expect(g.cx - g.side / 2).toBeGreaterThanOrEqual(margin - 1e-9)
        expect(g.cx + g.side / 2).toBeLessThanOrEqual(panel.w - margin + 1e-9)
        expect(g.cy - g.side / 2).toBeGreaterThanOrEqual(margin - 1e-9)
        expect(g.cy + g.side / 2).toBeLessThanOrEqual(panel.h - margin + 1e-9)
      }
    }
    // The band is 243 tall: 0.8 of it is 194.4, inside its 24 px margins.
    const g = windowGeometry(BAND, STUDIO, left, BAND_LAYOUT, 24)
    expect(g.side).toBeCloseTo(194.4)
  })

  test("sits where its detail sits in the painting fitted to the panel", () => {
    const a = windowGeometry(COLUMN, STUDIO, left, LAYOUT, MARGIN)
    const b = windowGeometry(COLUMN, STUDIO, right, LAYOUT, MARGIN)
    // Value 1 is at the left edge of its range, value 6 at the right.
    expect(a.cx).toBeCloseTo(MARGIN + a.side / 2)
    expect(b.cx).toBeCloseTo(848 - MARGIN - b.side / 2)
    // Up and down with the detail: value 1 is the lower.
    expect(a.cy).toBeGreaterThan(b.cy)
    // A detail at the middle of the painting sits at the panel's middle.
    const middle = windowGeometry(
      COLUMN,
      STUDIO,
      { focus: [3000, 1081], span: 1000 },
      LAYOUT,
      MARGIN,
    )
    expect(middle.cx).toBeCloseTo(424)
    expect(middle.cy).toBeCloseTo(452.5)
  })

  test("never shows past the painting's edges", () => {
    // A detail in the very corner moves in by half the span.
    const g = windowGeometry(
      COLUMN,
      STUDIO,
      { focus: [5990, 2150], span: 1000 },
      LAYOUT,
      MARGIN,
    )
    expect(g.focus).toEqual([5500, 1662])
    const at = { x: g.x, y: g.y, scale: g.scale }
    expect(
      covers(at, STUDIO, {
        left: g.cx - g.side / 2,
        top: g.cy - g.side / 2,
        right: g.cx + g.side / 2,
        bottom: g.cy + g.side / 2,
      }),
    ).toBe(true)
  })

  test("a transition starts and ends exactly on its states", () => {
    const open = openGeometry(COLUMN, STUDIO, left.focus, LAYOUT)
    const closed = windowGeometry(COLUMN, STUDIO, left, LAYOUT, MARGIN)
    expect(mixGeometry(open, closed, 0)).toEqual(open)
    const end = mixGeometry(open, closed, 1)
    expect(end.x).toBeCloseTo(closed.x)
    expect(end.scale).toBeCloseTo(closed.scale)
    expect(end.side).toBeCloseTo(closed.side)
    // Halfway the side is the geometric mean: a zoom at an even pace.
    expect(mixGeometry(open, closed, 0.5).side).toBeCloseTo(
      Math.sqrt(open.side * closed.side),
    )
  })
})

describe("unit: moving between paintings", () => {
  const open = openGeometry(COLUMN, PORTRAIT, [1322, 2541], LAYOUT)

  test("a push keeps its anchor in place and the painting over the panel", () => {
    for (const k of [1, 1.15, 1.3, 2]) {
      const at = pushed(open, [1322, 2541], k)
      expect(at.scale).toBeCloseTo(open.scale * k)
      expect(at.x + 1322 * at.scale).toBeCloseTo(open.x + 1322 * open.scale)
      expect(at.y + 2541 * at.scale).toBeCloseTo(open.y + 2541 * open.scale)
      expect(covers(at, PORTRAIT, whole(COLUMN))).toBe(true)
    }
    // Even about an anchor the panel crops away.
    const corner = pushed(open, [10, 10], 1.3)
    expect(covers(corner, PORTRAIT, whole(COLUMN))).toBe(true)
  })
})
