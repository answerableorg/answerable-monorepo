/**
 * The arithmetic of the /new stage: where the scroll is between two scenes,
 * how a scene's lines move, and where the square window and the paintings
 * sit in the image panel. Pure, so the browser only reads the page and
 * writes styles.
 */

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Interpolates on a log scale, so sizes and zooms change at an even pace. */
const lerpLog = (a: number, b: number, t: number) => a * Math.pow(b / a, t)

/** Hermite smoothstep from `edge0` to `edge1`. */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * The pace of a change the scroll plays: half linear, half smoothstep. It
 * moves with the first pixel of scroll, at half speed, and still lands
 * softly. The browser's own smooth scroll, which a snap plays, eases the rest:
 * a flatter curve here, such as smootherstep, stacks on it and the page is
 * slow to answer (at a tenth of the scroll, smootherstep has moved 1%).
 */
export function scrub(x: number) {
  const t = clamp(x, 0, 1)
  return 0.5 * t + 0.5 * t * t * (3 - 2 * t)
}

/**
 * A scene's copy is in place by this share of the scroll. A snap's smooth
 * scroll spends about 300 ms on its last tenth (Chrome, one screen): copy
 * that waited for the very end would still be arriving.
 */
export const LAND = 0.92

/**
 * The scroll as a position among scenes: 0 on the first snap point, 1 on the
 * second, 2.5 halfway from the third to the fourth. `tops` are the snap
 * points' tops in the document, in order.
 */
export function progressAt(scrollY: number, tops: readonly number[]): number {
  const last = tops.length - 1
  if (last < 1 || scrollY <= tops[0]!) return 0
  for (let index = 0; index < last; index++) {
    const from = tops[index]!
    const to = tops[index + 1]!
    if (scrollY < to) return index + (scrollY - from) / (to - from)
  }
  return last
}

/**
 * How far the stage is from a run of scenes `from`..`to`: negative before it,
 * 0 inside it, positive after. The hero, scene 0, also stands at `loopAt`, the
 * last snap point, so the end of the page arrives back at it.
 */
export function offsetFrom(
  progress: number,
  from: number,
  to: number,
  loopAt: number,
): number {
  if (from === 0 && progress > loopAt - 1) return progress - loopAt
  if (progress < from) return progress - from
  if (progress > to) return progress - to
  return 0
}

/**
 * One line of a scene, from its offset: present at 0, gone at ±1. Lines enter
 * from below in order and leave upwards in the same order, each `stagger` of
 * the transition behind the one before. Returns its opacity and its shift as a
 * share of the travel: positive is down.
 */
export function lineFrame(
  offset: number,
  index: number,
  count: number,
  stagger = 0.06,
): { opacity: number; shift: number } {
  const presence = 1 - Math.min(Math.abs(offset), 1)
  const spread = stagger * Math.max(count - 1, 0)
  // Entering, the first line leads; leaving, the first line leads too, so
  // the last one waits longest.
  const lag = offset <= 0 ? index : count - 1 - index
  // The line's own stretch of the scroll, ending by LAND.
  const start = lag * stagger
  const width = LAND - spread
  const eased = scrub((presence - start) / width)
  return {
    // Seen only past the midpoint, every line: the scene going and the scene
    // coming never show together.
    opacity: smoothstep(
      Math.max(0.5, start + width / 2),
      start + width,
      presence,
    ),
    shift: (1 - eased) * (offset < 0 ? 1 : offset > 0 ? -1 : 0),
  }
}

/**
 * A statement rolling through a window its own height, as an odometer: at 0 in
 * place, at -1 a full height below, at 1 a full height above. It fades in once
 * it is well inside the window, so no sliver shows at the edge.
 */
export function rollFrame(offset: number): { opacity: number; shift: number } {
  const presence = clamp((1 - Math.min(Math.abs(offset), 1)) / LAND, 0, 1)
  const eased = scrub(presence)
  return {
    opacity: smoothstep(0.2, 0.75, presence),
    shift: (1 - eased) * (offset < 0 ? 1 : offset > 0 ? -1 : 0),
  }
}

export type Size = { w: number; h: number }
export type Point = readonly [number, number]
export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The panel's lattice: square modules inside a frame that stands `margin`
 * from the panel's four edges. The modules divide the frame's width exactly;
 * what its height leaves under the last row is the strip. Every line is on a
 * device pixel, and everything that sits on the lattice reads its position
 * here: the lines as drawn, the pictures' edges, the notes' ends.
 */
export type Lattice = {
  columns: number
  rows: number
  /** A module's side, before its lines are rounded to device pixels. */
  unit: number
  /** How many modules the square on a detail spans. */
  span: number
  /** The vertical lines' x: `columns + 1` of them. */
  xs: readonly number[]
  /** The horizontal lines' y: `rows + 1` of them. */
  ys: readonly number[]
  /** The frame's bottom edge; the strip lies between the last row and it. */
  bottom: number
}

/** The strip is never thinner than this, so it always holds a line of text. */
export const STRIP_MIN = 20

/**
 * The lattice of a panel. Of every whole number of columns it takes the one
 * whose square of whole modules is nearest `size` of the panel's shorter
 * side, and whose module is nearest 7% of that side (44 to 76 px): the
 * first counts double. `ratio` is the device's pixels per CSS pixel.
 */
export function lattice(
  panel: Size,
  margin: number,
  size: number,
  ratio = 1,
): Lattice {
  const w = Math.max(panel.w - 2 * margin, 1)
  const h = Math.max(panel.h - 2 * margin, 1)
  const shorter = Math.min(panel.w, panel.h)
  const target = clamp(0.07 * shorter, 44, 76)
  const side = Math.max(Math.min(size * shorter, w, h - STRIP_MIN), 1)
  let best = { columns: 1, rows: 1, span: 1, loss: Infinity }
  for (let columns = 4; columns <= 24; columns++) {
    const unit = w / columns
    if (unit < 28 || unit > 84) continue
    const rows = Math.floor((h - STRIP_MIN) / unit + 1e-6)
    if (rows < 2) continue
    const span = clamp(Math.round(side / unit), 1, Math.min(columns, rows))
    const loss =
      (2 * Math.abs(span * unit - side)) / side +
      Math.abs(unit - target) / target
    if (loss < best.loss) best = { columns, rows, span, loss }
  }
  const { columns, rows, span } = best
  const unit = w / columns
  const snap = (value: number) => Math.round(value * ratio) / ratio
  return {
    columns,
    rows,
    unit,
    span,
    xs: Array.from({ length: columns + 1 }, (_, i) => snap(margin + i * unit)),
    ys: Array.from({ length: rows + 1 }, (_, j) => snap(margin + j * unit)),
    bottom: snap(Math.max(panel.h - margin, margin + rows * unit)),
  }
}

/** The lattice's own rectangle: every module, without the strip. */
export function latticeRect(lat: Lattice): Rect {
  const x = lat.xs[0]!
  const y = lat.ys[0]!
  return { x, y, w: lat.xs[lat.columns]! - x, h: lat.ys[lat.rows]! - y }
}

/** A view of a painting through the square window: what it shows. */
export type Window = {
  /** The detail, in the painting's pixels; the square centres on it. */
  focus: Point
  /** How many of the painting's pixels the square spans. */
  span: number
}

/** How a panel shape places the pictures. */
export type WindowLayout = {
  /** The square's side, as a share of the panel's shorter side. */
  size: number
  /**
   * Where a whole painting sits vertically when the lattice crops it, 0 top
   * to 1 bottom.
   */
  anchorY: number
  /**
   * Where the painting fitted inside the panel sits vertically, 0 top to 1
   * bottom: the square on a detail is placed where the detail falls in it.
   */
  fitY: number
}

/**
 * Where a painting and the picture are: the painting drawn at `scale` with
 * its top-left at (`x`, `y`); the picture the rectangle `w` by `h` centred on
 * (`cx`, `cy`), over the painting's point `focus`.
 */
export type Geometry = {
  x: number
  y: number
  scale: number
  cx: number
  cy: number
  w: number
  h: number
  focus: Point
}

/** The whole painting: it covers the lattice, which crops it. */
export function openGeometry(
  image: Size,
  layout: WindowLayout,
  lat: Lattice,
): Geometry {
  const rect = latticeRect(lat)
  const scale = Math.max(rect.w / image.w, rect.h / image.h)
  const x = rect.x + (rect.w - image.w * scale) / 2
  const y = rect.y + (rect.h - image.h * scale) * layout.anchorY
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  return {
    x,
    y,
    scale,
    cx,
    cy,
    w: rect.w,
    h: rect.h,
    focus: [(cx - x) / scale, (cy - y) / scale],
  }
}

/**
 * The square on a detail: `span` modules of the lattice a side, its corner
 * on the lattice point nearest where the detail falls in the whole painting
 * fitted inside the panel, so the square travels across the lattice as the
 * details do across the painting; the painting magnified so the square
 * spans `span` of its pixels. Near the painting's edge the detail moves in,
 * by half the span and one screen pixel more (the lattice's lines are
 * rounded to device pixels, the zoom is not), so the square never shows
 * past it.
 */
export function windowGeometry(
  panel: Size,
  image: Size,
  window: Window,
  layout: WindowLayout,
  lat: Lattice,
): Geometry {
  const side = lat.span * lat.unit
  const scale = side / window.span
  const half = window.span / 2 + 1 / scale
  const focus: Point = [
    clamp(window.focus[0], half, image.w - half),
    clamp(window.focus[1], half, image.h - half),
  ]
  const fit = Math.min(panel.w / image.w, panel.h / image.h)
  const left = (panel.w - image.w * fit) / 2 + focus[0] * fit - side / 2
  const top = (panel.h - image.h * fit) * layout.fitY + focus[1] * fit - side / 2
  const column = clamp(
    Math.round((left - lat.xs[0]!) / lat.unit),
    0,
    lat.columns - lat.span,
  )
  const row = clamp(
    Math.round((top - lat.ys[0]!) / lat.unit),
    0,
    lat.rows - lat.span,
  )
  const x0 = lat.xs[column]!
  const x1 = lat.xs[column + lat.span]!
  const y0 = lat.ys[row]!
  const y1 = lat.ys[row + lat.span]!
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return {
    x: cx - focus[0] * scale,
    y: cy - focus[1] * scale,
    scale,
    cx,
    cy,
    w: x1 - x0,
    h: y1 - y0,
    focus,
  }
}

/**
 * Between two geometries of one painting: the detail and the picture's
 * centre and sides glide, so each of its edges moves in a straight line; the
 * zoom changes on a log scale. Both ends put the detail at the picture's
 * centre, so the painting is placed from the interpolated detail.
 */
export function mixGeometry(a: Geometry, b: Geometry, t: number): Geometry {
  const focus: Point = [
    lerp(a.focus[0], b.focus[0], t),
    lerp(a.focus[1], b.focus[1], t),
  ]
  const scale = lerpLog(a.scale, b.scale, t)
  const cx = lerp(a.cx, b.cx, t)
  const cy = lerp(a.cy, b.cy, t)
  return {
    x: cx - focus[0] * scale,
    y: cy - focus[1] * scale,
    scale,
    cx,
    cy,
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    focus,
  }
}

/** Where a painting is drawn: its top-left on the panel, and its scale. */
export type Placement = { x: number; y: number; scale: number }

/**
 * The painting of `g` scaled `k` times about its own point `anchor`, which
 * stays where it is on the panel. A painting that covers its picture still
 * covers it for any `k` of 1 or more, when the anchor is inside it.
 */
export function pushed(g: Geometry, anchor: Point, k: number): Placement {
  const px = g.x + anchor[0] * g.scale
  const py = g.y + anchor[1] * g.scale
  const scale = g.scale * k
  return { x: px - anchor[0] * scale, y: py - anchor[1] * scale, scale }
}
