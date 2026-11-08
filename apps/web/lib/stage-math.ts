/**
 * The arithmetic of the /new stage: where the scroll is between two scenes,
 * how a scene's lines move, and where the comma window sits over the hero
 * illustration. Pure, so the browser only reads the page and writes styles.
 */

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Interpolates on a log scale, so sizes and zooms change at an even pace. */
const lerpLog = (a: number, b: number, t: number) =>
  a * Math.pow(b / a, t)

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

/** A view of the illustration through the comma: what it shows and how big. */
export type Window = {
  /** The detail, in the image's pixels; the window centres on it. */
  focus: Point
  /** How many image pixels the comma's head spans. */
  span: number
  /** The head's size as a multiple of the layout's base size. */
  size: number
}

/** How a panel shape places windows: shares of the panel's shorter side. */
export type WindowLayout = {
  /** The comma's head at `size` 1. */
  base: number
  /** The least space between the comma and the panel's edge. */
  margin: number
  /** Where a cropped image sits vertically when the window is open: 0 top, 1 bottom. */
  anchorY: number
  /** The largest magnification, in panel pixels per image pixel. */
  maxScale: number
}

/**
 * Where the image and the comma are: the image drawn at `scale` with its
 * top-left at (`x`, `y`), the comma's head a square of side `head` centred on
 * (`cx`, `cy`).
 */
export type Geometry = {
  x: number
  y: number
  scale: number
  cx: number
  cy: number
  head: number
  focus: Point
}

/** The scale at which the image covers the panel, as `object-fit: cover`. */
function coverScale(panel: Size, image: Size) {
  return Math.max(panel.w / image.w, panel.h / image.h)
}

/**
 * The whole picture, covering the panel, with the comma's head opened round
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
  const reach = Math.max(cx, panel.w - cx, cy, panel.h - cy, 1)
  return { x, y, scale, cx, cy, head: reach * 2.1, focus }
}

/**
 * The comma closed down on a detail: its head `size` × base, clamped so the
 * whole comma fits inside the margin, placed where the detail sits in the
 * open picture, and the picture magnified so the head spans `span` pixels.
 */
export function windowGeometry(
  panel: Size,
  image: Size,
  window: Window,
  layout: WindowLayout,
): Geometry {
  const short = Math.min(panel.w, panel.h)
  const margin = layout.margin * short
  // The comma is 1.5 heads tall, its head's centre half a head from its top.
  const head = Math.min(
    window.size * layout.base * short,
    (panel.h - 2 * margin) / 1.5,
    panel.w - 2 * margin,
  )
  const scale = Math.min(head / window.span, layout.maxScale)
  const open = openGeometry(panel, image, window.focus, layout)
  const cx = clamp(open.cx, margin + head / 2, panel.w - margin - head / 2)
  const cy = clamp(open.cy, margin + head / 2, panel.h - margin - head)
  return {
    x: cx - window.focus[0] * scale,
    y: cy - window.focus[1] * scale,
    scale,
    cx,
    cy,
    head,
    focus: window.focus,
  }
}

/**
 * Between two geometries: the detail and the window's centre glide; the head
 * and the zoom change on a log scale. Both ends put the detail at the head's
 * centre, so the picture is placed from the interpolated detail and the window
 * keeps it centred all the way.
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
    focus,
  }
}

/** Whether the comma's head covers the whole panel, so no clip is needed. */
export function coversPanel(geometry: Geometry, panel: Size) {
  const half = geometry.head / 2
  return (
    geometry.cx - half <= 0 &&
    geometry.cx + half >= panel.w &&
    geometry.cy - half <= 0 &&
    geometry.cy + half >= panel.h
  )
}

/** The comma path's numbers and commands, parsed once. Absolute M L H V C Z only. */
type Segment = { command: string; numbers: number[] }

export function parsePath(d: string): Segment[] {
  const segments: Segment[] = []
  for (const match of d.matchAll(/([MLHVCZ])([^MLHVCZ]*)/g)) {
    const numbers = (match[2]!.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(
      Number,
    )
    segments.push({ command: match[1]!, numbers })
  }
  return segments
}

/**
 * A path drawn with its head's centre at (`cx`, `cy`) and its head `size` wide,
 * from a source whose head is a square of side `unit` centred on `origin`.
 * Translation and uniform scale keep lines lines and curves curves, so the
 * comma stays exact at any size. Returned as absolute M L C Z commands.
 */
export function placePath(
  segments: readonly Segment[],
  origin: Point,
  unit: number,
  cx: number,
  cy: number,
  size: number,
): string {
  const k = size / unit
  const X = (x: number) => round(cx + (x - origin[0]) * k)
  const Y = (y: number) => round(cy + (y - origin[1]) * k)
  let px = 0
  let py = 0
  const out: string[] = []
  for (const { command, numbers } of segments) {
    if (command === "M" || command === "L") {
      ;[px, py] = [numbers[0]!, numbers[1]!]
      out.push(`${command}${X(px)} ${Y(py)}`)
    } else if (command === "H") {
      px = numbers[0]!
      out.push(`L${X(px)} ${Y(py)}`)
    } else if (command === "V") {
      py = numbers[0]!
      out.push(`L${X(px)} ${Y(py)}`)
    } else if (command === "C") {
      const [x1, y1, x2, y2, x, y] = numbers as [
        number,
        number,
        number,
        number,
        number,
        number,
      ]
      ;[px, py] = [x, y]
      out.push(`C${X(x1)} ${Y(y1)} ${X(x2)} ${Y(y2)} ${X(x)} ${Y(y)}`)
    } else if (command === "Z") {
      out.push("Z")
    }
  }
  return out.join("")
}

const round = (value: number) => Math.round(value * 100) / 100
