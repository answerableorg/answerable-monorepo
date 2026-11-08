/**
 * The arithmetic of the /new stage: where the scroll is between two scenes,
 * how a scene's lines move, and where the comma window sits over the hero
 * illustration. Pure, so the browser only reads the page and writes styles.
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

/** Perlin's smootherstep on 0..1: no speed and no acceleration at either end. */
export function smootherstep(x: number) {
  const t = clamp(x, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

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
  const local = clamp((presence - lag * stagger) / (1 - spread), 0, 1)
  const eased = smootherstep(local)
  return {
    // Gone before the next scene's lines arrive: no two scenes ghost together.
    opacity: smoothstep(0.5, 1, local),
    shift: (1 - eased) * (offset < 0 ? 1 : offset > 0 ? -1 : 0),
  }
}

/**
 * A statement rolling through a window its own height, as an odometer: at 0 in
 * place, at -1 a full height below, at 1 a full height above. It fades in once
 * it is well inside the window, so no sliver shows at the edge.
 */
export function rollFrame(offset: number): { opacity: number; shift: number } {
  const presence = 1 - Math.min(Math.abs(offset), 1)
  const eased = smootherstep(presence)
  return {
    opacity: smoothstep(0.2, 0.75, presence),
    shift: (1 - eased) * (offset < 0 ? 1 : offset > 0 ? -1 : 0),
  }
}

export type Size = { w: number; h: number }
export type Point = readonly [number, number]

/**
 * The comma of the logo, in its own units (`COMMA_PATH`): a head 48 wide and
 * 47.835 tall centred on (1128, 239.9155), and below it a band 24.167 tall
 * that holds the tail. The window draws the head as a plain rectangle clip and
 * the band as a second one, with two shapes in the field's colour carving the
 * tail out of it, so nothing is masked or repainted as the window moves.
 */
export const COMMA = {
  head: { x: 1104, y: 215.998, w: 48, h: 47.835 },
  band: { x: 1103.79, y: 263.833, w: 48.21, h: 24.167 },
  /**
   * Band-local shapes that are field, not tail: left of the curve and right of
   * the slope. They overhang the band by 2 units where they meet its edges, so
   * no edge pixel lets the picture through; the band's clip trims them.
   */
  covers:
    "M-2 0H20.77L20.78 3.159C14.11 8.589 0 24.167 0 24.167V26.167H-2Z" +
    "M48.21 0H50.21V26.167H23.93V24.167Z",
} as const

/** The band's height as a share of the head's width: how far the tail reaches. */
export const TAIL = COMMA.band.h / COMMA.head.w
const HEAD_RATIO = COMMA.head.h / COMMA.head.w

/** The window's shape: the logo's comma, or its square, the comma's head alone. */
export type Shape = "comma" | "square"

/** A view of the illustration through the window: what it shows and how big. */
export type Window = {
  /** The detail, in the image's pixels; the window centres on it. */
  focus: Point
  /** How many image pixels the head spans. */
  span: number
  /** The head's size as a multiple of the layout's base size. */
  size: number
  shape: Shape
}

/** How a panel shape places windows, as shares of the panel's shorter side. */
export type WindowLayout = {
  /** The head at `size` 1. */
  base: number
  /** Where a cropped image sits vertically when the window is open: 0 top, 1 bottom. */
  anchorY: number
  /** The largest magnification, in panel pixels per image pixel. */
  maxScale: number
}

/**
 * Where the image and the window are: the image drawn at `scale` with its
 * top-left at (`x`, `y`); the head `head` wide, centred on (`cx`, `cy`); the
 * tail out by `tail`, 0 for the square and 1 for the comma.
 */
export type Geometry = {
  x: number
  y: number
  scale: number
  cx: number
  cy: number
  head: number
  tail: number
  focus: Point
}

/** The scale at which the image covers the panel, as `object-fit: cover`. */
function coverScale(panel: Size, image: Size) {
  return Math.max(panel.w / image.w, panel.h / image.h)
}

const tailOf = (shape: Shape) => (shape === "comma" ? 1 : 0)

/**
 * The whole picture, covering the panel, with the head opened round `focus`
 * until it is larger than the panel: the start of a zoom on `focus`.
 */
export function openGeometry(
  panel: Size,
  image: Size,
  focus: Point,
  shape: Shape,
  layout: WindowLayout,
): Geometry {
  const scale = coverScale(panel, image)
  const x = (panel.w - image.w * scale) / 2
  const y = (panel.h - image.h * scale) * layout.anchorY
  const cx = x + focus[0] * scale
  const cy = y + focus[1] * scale
  const reach = Math.max(cx, panel.w - cx, cy, panel.h - cy, 1)
  return { x, y, scale, cx, cy, head: reach * 2.1, tail: tailOf(shape), focus }
}

/**
 * The window closed down on a detail: its head `size` × base, clamped so the
 * whole shape stays `margin` pixels inside the panel, placed where the detail
 * sits in the open picture, and the picture magnified so the head spans
 * `span` pixels. Near the picture's edge the detail moves in, so the window
 * never shows past it.
 */
export function windowGeometry(
  panel: Size,
  image: Size,
  window: Window,
  layout: WindowLayout,
  margin: number,
): Geometry {
  const tail = tailOf(window.shape)
  const short = Math.min(panel.w, panel.h)
  const head = Math.min(
    window.size * layout.base * short,
    (panel.h - 2 * margin) / (HEAD_RATIO + tail * TAIL),
    panel.w - 2 * margin,
  )
  const above = (head * HEAD_RATIO) / 2
  const below = above + tail * TAIL * head
  const scale = Math.min(head / window.span, layout.maxScale)
  // The shape must see only picture: move the detail in from the edges by
  // whatever the window would show past them.
  const halfWidth = head / 2 / scale
  const focus: Point = [
    clamp(window.focus[0], halfWidth, image.w - halfWidth),
    clamp(window.focus[1], above / scale, image.h - below / scale),
  ]
  const open = openGeometry(panel, image, focus, window.shape, layout)
  const cx = clamp(open.cx, margin + head / 2, panel.w - margin - head / 2)
  const cy = clamp(open.cy, margin + above, panel.h - margin - below)
  return {
    x: cx - focus[0] * scale,
    y: cy - focus[1] * scale,
    scale,
    cx,
    cy,
    head,
    tail,
    focus,
  }
}

/**
 * Between two geometries: the detail and the window's centre glide; the head
 * and the zoom change on a log scale; the tail grows or slides back under the
 * head. Both ends put the detail at the head's centre, so the picture is
 * placed from the interpolated detail and the window keeps it centred.
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
    head: lerpLog(a.head, b.head, t),
    tail: lerp(a.tail, b.tail, t),
    focus,
  }
}

/**
 * The two clipping boxes for a geometry, in panel pixels, each `unit` pixels
 * per comma unit: the head, and the band under it, raised by `overlap` units
 * so the two never show a seam, and slid up under the head as the tail
 * retracts.
 */
export function windowBoxes(geometry: Geometry, overlap: number) {
  const unit = geometry.head / COMMA.head.w
  const centreX = COMMA.head.x + COMMA.head.w / 2
  const centreY = COMMA.head.y + COMMA.head.h / 2
  const head = {
    x: geometry.cx - (COMMA.head.w / 2) * unit,
    y: geometry.cy - (COMMA.head.h / 2) * unit,
  }
  const band = {
    x: geometry.cx + (COMMA.band.x - centreX) * unit,
    y:
      geometry.cy +
      (COMMA.band.y - overlap - centreY) * unit -
      (1 - geometry.tail) * COMMA.band.h * unit,
  }
  return { unit, head, band }
}
