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

/** A view of a painting through the square window: what it shows. */
export type Window = {
  /** The detail, in the painting's pixels; the square centres on it. */
  focus: Point
  /** How many of the painting's pixels the square spans. */
  span: number
}

/** How a panel shape places the square. */
export type WindowLayout = {
  /** The square's side, as a share of the panel's shorter side. */
  size: number
  /**
   * Where a cropped painting sits vertically, 0 top to 1 bottom: covering
   * the panel when open, fitted inside it when the square is placed.
   */
  anchorY: number
}

/**
 * Where a painting and the window are: the painting drawn at `scale` with its
 * top-left at (`x`, `y`); the square `side` wide, centred on (`cx`, `cy`),
 * over the painting's point `focus`.
 */
export type Geometry = {
  x: number
  y: number
  scale: number
  cx: number
  cy: number
  side: number
  focus: Point
}

/** The scale at which the painting covers the panel, as `object-fit: cover`. */
function coverScale(panel: Size, image: Size) {
  return Math.max(panel.w / image.w, panel.h / image.h)
}

/**
 * Half the side of a square centred on (`cx`, `cy`) that just covers the
 * panel, with a twentieth to spare.
 */
export function coverReach(panel: Size, cx: number, cy: number) {
  return Math.max(cx, panel.w - cx, cy, panel.h - cy, 1) * 1.05
}

/**
 * The whole painting, covering the panel, with the square opened round
 * `focus` until it is larger than the panel: the start of a zoom on `focus`.
 */
export function openGeometry(
  panel: Size,
  image: Size,
  focus: Point,
  layout: WindowLayout,
): Geometry {
  const scale = coverScale(panel, image)
  const x = (panel.w - image.w * scale) / 2
  const y = (panel.h - image.h * scale) * layout.anchorY
  const cx = x + focus[0] * scale
  const cy = y + focus[1] * scale
  return { x, y, scale, cx, cy, side: coverReach(panel, cx, cy) * 2, focus }
}

/**
 * The square closed down on a detail: `size` of the panel's shorter side,
 * clamped `margin` pixels inside the panel; placed where the detail sits in
 * the whole painting fitted inside the panel, so the square travels across
 * the panel as the details do across the painting; the painting magnified so
 * the square spans `span` of its pixels. Near the painting's edge the detail
 * moves in, so the square never shows past it.
 */
export function windowGeometry(
  panel: Size,
  image: Size,
  window: Window,
  layout: WindowLayout,
  margin: number,
): Geometry {
  const side = Math.min(
    layout.size * Math.min(panel.w, panel.h),
    panel.h - 2 * margin,
    panel.w - 2 * margin,
  )
  const scale = side / window.span
  const half = window.span / 2
  const focus: Point = [
    clamp(window.focus[0], half, image.w - half),
    clamp(window.focus[1], half, image.h - half),
  ]
  const fit = Math.min(panel.w / image.w, panel.h / image.h)
  const left = (panel.w - image.w * fit) / 2
  const top = (panel.h - image.h * fit) * layout.anchorY
  const cx = clamp(
    left + focus[0] * fit,
    margin + side / 2,
    panel.w - margin - side / 2,
  )
  const cy = clamp(
    top + focus[1] * fit,
    margin + side / 2,
    panel.h - margin - side / 2,
  )
  return {
    x: cx - focus[0] * scale,
    y: cy - focus[1] * scale,
    scale,
    cx,
    cy,
    side,
    focus,
  }
}

/**
 * Between two geometries of one painting: the detail and the square's centre
 * glide; the side and the zoom change on a log scale. Both ends put the
 * detail at the square's centre, so the painting is placed from the
 * interpolated detail and the square keeps it centred.
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
    side: lerpLog(a.side, b.side, t),
    focus,
  }
}

/** Where a painting is drawn: its top-left on the panel, and its scale. */
export type Placement = { x: number; y: number; scale: number }

/**
 * The painting of `g` scaled `k` times about its own point `anchor`, which
 * stays where it is on the panel. A painting that covers the panel still
 * covers it for any `k` of 1 or more, since the anchor is inside it.
 */
export function pushed(g: Geometry, anchor: Point, k: number): Placement {
  const px = g.x + anchor[0] * g.scale
  const py = g.y + anchor[1] * g.scale
  const scale = g.scale * k
  return { x: px - anchor[0] * scale, y: py - anchor[1] * scale, scale }
}
