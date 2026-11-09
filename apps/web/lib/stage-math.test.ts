import { describe, expect, test } from "bun:test"

import {
  LAND,
  lattice,
  latticeRect,
  lineFrame,
  mixGeometry,
  offsetFrom,
  openGeometry,
  progressAt,
  pushed,
  rollFrame,
  scrub,
  STRIP_MIN,
  windowGeometry,
  type Placement,
  type Size,
  type WindowLayout,
} from "./stage-math"

const TOPS = [0, 900, 1800, 2700]
/** The studio panorama and the portrait paintings, in their own pixels. */
const STUDIO = { w: 6000, h: 2162 }
const PORTRAIT = { w: 3840, h: 5120 }
/** The owner's laptop panel, and an iPhone 15's band, as measured. */
const COLUMN = { w: 856, h: 907 }
const BAND = { w: 393, h: 392 }
const LAYOUT: WindowLayout = { size: 0.64, anchorY: 0.3, fitY: 0.5 }
const BAND_LAYOUT: WindowLayout = { size: 0.8, anchorY: 0.36, fitY: 0.36 }
/** Their lattices: a 32 px inset at 2x, a 24 px inset at 3x. */
const SHEET = lattice(COLUMN, 32, LAYOUT.size, 2)
const BAND_SHEET = lattice(BAND, 24, BAND_LAYOUT.size, 3)

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
/** The picture a geometry shows, as a box. */
const picture = (g: { cx: number; cy: number; w: number; h: number }) => ({
  left: g.cx - g.w / 2,
  top: g.cy - g.h / 2,
  right: g.cx + g.w / 2,
  bottom: g.cy + g.h / 2,
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

describe("unit: the lattice", () => {
  /** Panels the page meets, with their inset and the screen's pixel ratio. */
  const SHEETS = [
    [COLUMN, 32, 0.64, 2],
    [{ w: 1248, h: 1376 }, 48, 0.64, 2],
    [{ w: 712, h: 870 }, 32, 0.64, 1],
    [{ w: 480, h: 736 }, 16, 0.64, 2],
    [{ w: 632, h: 584 }, 8, 0.64, 1.5],
    [BAND, 24, 0.8, 3],
    [{ w: 375, h: 251 }, 24, 0.8, 2],
    [{ w: 820, h: 420 }, 130, 0.8, 2],
  ] as const

  test("the laptop's is thirteen modules square, a phone's eight by seven", () => {
    expect([SHEET.columns, SHEET.rows, SHEET.span]).toEqual([13, 13, 9])
    expect(SHEET.unit).toBeCloseTo(792 / 13)
    expect([BAND_SHEET.columns, BAND_SHEET.rows, BAND_SHEET.span]).toEqual([
      8, 7, 7,
    ])
    expect(BAND_SHEET.unit).toBeCloseTo(345 / 8)
  })

  test("the frame is exactly the inset from the panel's four edges", () => {
    for (const [panel, margin, size, ratio] of SHEETS) {
      const lat = lattice(panel, margin, size, ratio)
      expect(lat.xs[0]).toBe(margin)
      expect(lat.ys[0]).toBe(margin)
      expect(lat.xs[lat.columns]).toBe(panel.w - margin)
      expect(lat.bottom).toBe(panel.h - margin)
      expect(latticeRect(lat)).toEqual({
        x: margin,
        y: margin,
        w: panel.w - 2 * margin,
        h: lat.ys[lat.rows]! - margin,
      })
    }
  })

  test("every line is on a device pixel, and the modules are square to one", () => {
    for (const [panel, margin, size, ratio] of SHEETS) {
      const lat = lattice(panel, margin, size, ratio)
      expect(lat.xs.length).toBe(lat.columns + 1)
      expect(lat.ys.length).toBe(lat.rows + 1)
      for (const lines of [lat.xs, lat.ys]) {
        lines.forEach((line, index) => {
          expect(
            Math.abs(line * ratio - Math.round(line * ratio)),
          ).toBeLessThan(1e-9)
          if (index === 0) return
          const step = line - lines[index - 1]!
          expect(Math.abs(step - lat.unit)).toBeLessThanOrEqual(1 / ratio)
        })
      }
    }
  })

  test("under the last row, a strip tall enough for a line of small capitals", () => {
    for (const [panel, margin, size, ratio] of SHEETS) {
      const lat = lattice(panel, margin, size, ratio)
      const strip = lat.bottom - lat.ys[lat.rows]!
      expect(strip).toBeGreaterThanOrEqual(STRIP_MIN - 1 / ratio)
      expect(strip).toBeLessThan(STRIP_MIN + lat.unit + 1 / ratio)
    }
  })

  test("the square on a detail is whole modules, close to its share of the panel", () => {
    for (const [panel, margin, size, ratio] of SHEETS) {
      const lat = lattice(panel, margin, size, ratio)
      expect(lat.span).toBeLessThanOrEqual(Math.min(lat.columns, lat.rows))
      // Within a module of the side round 5 drew, never over the lattice.
      const wanted = Math.min(
        size * Math.min(panel.w, panel.h),
        panel.w - 2 * margin,
        panel.h - 2 * margin - STRIP_MIN,
      )
      expect(Math.abs(lat.span * lat.unit - wanted)).toBeLessThanOrEqual(
        lat.unit,
      )
      expect(lat.unit).toBeGreaterThanOrEqual(28)
      expect(lat.unit).toBeLessThanOrEqual(84)
    }
  })

  test("a panel too small for one still gives finite lines", () => {
    const lat = lattice({ w: 40, h: 30 }, 24, 0.8, 2)
    for (const line of [...lat.xs, ...lat.ys, lat.bottom, lat.unit]) {
      expect(Number.isFinite(line)).toBe(true)
    }
  })
})

describe("unit: pictures on the lattice", () => {
  /** The six details of the studio, as the page has them. */
  const DETAILS = [
    [880, 1560],
    [1600, 1250],
    [2800, 650],
    [4350, 1650],
    [4250, 650],
    [5400, 850],
  ].map((focus) => ({ focus: focus as [number, number], span: 1000 }))

  /** Which lattice line a position is, or -1. */
  const lineOf = (lines: readonly number[], at: number) =>
    lines.findIndex((line) => Math.abs(line - at) < 1e-9)

  test("a whole painting covers the lattice, cropped where its layout says", () => {
    const rect = latticeRect(SHEET)
    const open = openGeometry(PORTRAIT, LAYOUT, SHEET)
    expect(picture(open)).toEqual({
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
    })
    // Wider than tall for its frame: it fills the width and loses height.
    const scale = rect.w / PORTRAIT.w
    expect(open.scale).toBeCloseTo(scale)
    expect(open.x).toBeCloseTo(rect.x)
    expect(open.y).toBeCloseTo(rect.y + (rect.h - PORTRAIT.h * scale) * 0.3)
    expect(covers(open, PORTRAIT, picture(open))).toBe(true)
    // The studio, far wider than the band's lattice, loses width instead.
    const band = openGeometry(STUDIO, BAND_LAYOUT, BAND_SHEET)
    expect(band.scale).toBeCloseTo(latticeRect(BAND_SHEET).h / STUDIO.h)
    expect(covers(band, STUDIO, picture(band))).toBe(true)
    // Its centre shows the point the geometry calls its focus.
    expect(band.x + band.focus[0] * band.scale).toBeCloseTo(band.cx)
    expect(band.y + band.focus[1] * band.scale).toBeCloseTo(band.cy)
  })

  test("a detail is a square of whole modules, on the lattice's lines", () => {
    for (const [panel, layout, lat] of [
      [COLUMN, LAYOUT, SHEET],
      [BAND, BAND_LAYOUT, BAND_SHEET],
    ] as const) {
      for (const detail of DETAILS) {
        const g = windowGeometry(panel, STUDIO, detail, layout, lat)
        const box = picture(g)
        const column = lineOf(lat.xs, box.left)
        const row = lineOf(lat.ys, box.top)
        expect(column).toBeGreaterThanOrEqual(0)
        expect(row).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeCloseTo(lat.xs[column + lat.span]!, 9)
        expect(box.bottom).toBeCloseTo(lat.ys[row + lat.span]!, 9)
        // The detail is at its centre, at the same zoom wherever it sits.
        expect(g.scale).toBeCloseTo((lat.span * lat.unit) / detail.span)
        expect(g.x + detail.focus[0] * g.scale).toBeCloseTo(g.cx)
        expect(g.y + detail.focus[1] * g.scale).toBeCloseTo(g.cy)
        expect(covers(g, STUDIO, box)).toBe(true)
      }
    }
  })

  test("the square walks the lattice as its details walk the panorama", () => {
    const corners = DETAILS.map((detail) => {
      const box = picture(windowGeometry(COLUMN, STUDIO, detail, LAYOUT, SHEET))
      return [lineOf(SHEET.xs, box.left), lineOf(SHEET.ys, box.top)]
    })
    expect(corners).toEqual([
      [0, 4],
      [0, 3],
      [2, 1],
      [4, 4],
      [4, 1],
      [4, 2],
    ])
    // In the band there is one row to sit on: it only moves across.
    const band = DETAILS.map((detail) => {
      const box = picture(
        windowGeometry(BAND, STUDIO, detail, BAND_LAYOUT, BAND_SHEET),
      )
      return [lineOf(BAND_SHEET.xs, box.left), lineOf(BAND_SHEET.ys, box.top)]
    })
    expect(band).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 0],
      [1, 0],
      [1, 0],
    ])
  })

  test("a detail in the painting's corner moves in by half its span, and a pixel", () => {
    const g = windowGeometry(
      COLUMN,
      STUDIO,
      { focus: [5990, 2150], span: 1000 },
      LAYOUT,
      SHEET,
    )
    expect(g.focus[0]).toBeCloseTo(5500 - 1 / g.scale)
    expect(g.focus[1]).toBeCloseTo(1662 - 1 / g.scale)
    expect(covers(g, STUDIO, picture(g))).toBe(true)
  })

  test("between two states, each edge of the picture moves in a straight line", () => {
    const open = openGeometry(STUDIO, LAYOUT, SHEET)
    const closed = windowGeometry(COLUMN, STUDIO, DETAILS[0]!, LAYOUT, SHEET)
    const start = mixGeometry(open, closed, 0)
    const end = mixGeometry(open, closed, 1)
    for (const key of ["x", "y", "scale", "cx", "cy", "w", "h"] as const) {
      expect(start[key]).toBeCloseTo(open[key], 9)
      expect(end[key]).toBeCloseTo(closed[key], 9)
    }
    const from = picture(open)
    const to = picture(closed)
    for (const t of [0.25, 0.5, 0.75]) {
      const box = picture(mixGeometry(open, closed, t))
      for (const edge of ["left", "top", "right", "bottom"] as const) {
        expect(box[edge]).toBeCloseTo(from[edge] + (to[edge] - from[edge]) * t)
      }
    }
    // Halfway the zoom is the geometric mean: an even pace.
    expect(mixGeometry(open, closed, 0.5).scale).toBeCloseTo(
      Math.sqrt(open.scale * closed.scale),
    )
  })

  test("from one detail to the next the zoom holds and the painting covers", () => {
    for (let index = 1; index < DETAILS.length; index++) {
      const a = windowGeometry(
        COLUMN,
        STUDIO,
        DETAILS[index - 1]!,
        LAYOUT,
        SHEET,
      )
      const b = windowGeometry(COLUMN, STUDIO, DETAILS[index]!, LAYOUT, SHEET)
      for (let n = 0; n <= 20; n++) {
        const g = mixGeometry(a, b, n / 20)
        expect(g.scale).toBeCloseTo(a.scale, 12)
        expect(covers(g, STUDIO, picture(g))).toBe(true)
      }
    }
  })
})

describe("unit: moving between paintings", () => {
  const open = openGeometry(PORTRAIT, LAYOUT, SHEET)

  test("a push keeps its anchor in place and the painting over its picture", () => {
    for (const k of [1, 1.15, 1.3, 2]) {
      const at = pushed(open, [1322, 2541], k)
      expect(at.scale).toBeCloseTo(open.scale * k)
      expect(at.x + 1322 * at.scale).toBeCloseTo(open.x + 1322 * open.scale)
      expect(at.y + 2541 * at.scale).toBeCloseTo(open.y + 2541 * open.scale)
      expect(covers(at, PORTRAIT, picture(open))).toBe(true)
    }
    // Even about an anchor the picture crops away.
    const corner = pushed(open, [10, 10], 1.3)
    expect(covers(corner, PORTRAIT, picture(open))).toBe(true)
  })
})
