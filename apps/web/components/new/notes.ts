/**
 * The notes: what the sheet draws on a painting, as a drawing does. A note is
 * written in its painting's pixels and laid out for a measured panel: its
 * marks follow the painting's own lines (an axis, an outline, a circle, a
 * baseline), in hairlines, cut to the picture.
 */

import type { PaintingKey, PanelState } from "@/components/new/scenes"
import type { SheetPanel, SheetScript } from "@/components/new/sheet"
import {
  openGeometry,
  windowGeometry,
  type Geometry,
  type Lattice,
  type Placement,
  type Point,
  type Rect,
} from "@/lib/stage-math"

/** A mark on a painting, in the painting's pixels. */
type Mark =
  /** A centre line through two points, drawn `extend` past each. */
  | { kind: "axis"; from: Point; to: Point; extend: number }
  /** A construction line between two points: a baseline, an edge carried on. */
  | { kind: "guide"; from: Point; to: Point }
  /** An object's outline, with a handle at each corner. */
  | { kind: "outline"; points: readonly Point[] }
  /** A circle. */
  | { kind: "ring"; at: Point; r: number }
  /** A cross on a point. */
  | { kind: "cross"; at: Point }

/** The marks on the scenes that share one view of a painting. */
export type Note = { scenes: readonly number[]; marks: readonly Mark[] }

/** A note laid out: every path and rectangle is from its box's corner. */
export type NotePlan = {
  scenes: readonly number[]
  painting: PaintingKey
  /** The painting's placement the note is drawn for: it follows from there. */
  origin: Placement
  /** Its element's box on the panel. */
  box: Rect
  /** The picture: what is drawn on the painting is clipped to it. */
  clip: Rect
  /** Hairlines along the painting: outlines, circles and crosses. */
  construction: string
  /** Centre lines, drawn as chain lines. */
  axes: string
  /** The squares at an outline's corners. */
  handles: readonly Rect[]
}

/** An outline's handle and a cross's arm, in pixels. */
const HANDLE = 4
const ARM = 4.5

const n = (value: number) => String(Math.round(value * 100) / 100)

/** A scene's picture at rest: the square on its detail, or the painting. */
export function sceneGeometry(
  panel: SheetPanel,
  lat: Lattice,
  script: SheetScript,
  state: PanelState,
): Geometry {
  const layout = panel.column ? script.layouts.column : script.layouts.band
  const image = script.paintings[state.painting]
  return state.window
    ? windowGeometry(panel.size, image, state.window, layout, lat)
    : openGeometry(image, layout, lat)
}

type Segment = { a: Point; b: Point }

/** The part of a segment inside a rectangle (Liang–Barsky), or null. */
function clipSegment({ a, b }: Segment, r: Rect): Segment | null {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const tests: [number, number][] = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.w - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.h - a[1]],
  ]
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return {
    a: [a[0] + dx * t0, a[1] + dy * t0],
    b: [a[0] + dx * t1, a[1] + dy * t1],
  }
}

/** A box that grows to hold what is added to it. */
function bounds() {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  return {
    add(x: number, y: number, pad = 0) {
      x0 = Math.min(x0, x - pad)
      y0 = Math.min(y0, y - pad)
      x1 = Math.max(x1, x + pad)
      y1 = Math.max(y1, y + pad)
    },
    rect(): Rect | null {
      if (x0 > x1) return null
      const x = Math.floor(x0)
      const y = Math.floor(y0)
      return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y }
    },
  }
}

/** A square of about `size` centred on a line `thick` wide, on device pixels. */
function squareOn(
  x: number,
  y: number,
  size: number,
  thick: number,
  ratio: number,
): Rect {
  const line = Math.round(thick * ratio)
  let side = Math.round(size * ratio)
  if ((side - line) % 2) side += 1
  const edge = (side - line) / 2 / ratio
  return { x: x - edge, y: y - edge, w: side / ratio, h: side / ratio }
}

/** What a note draws, in panel pixels, before it is cut to its box. */
type Drawing = {
  construction: Segment[]
  circles: { c: Point; r: number }[]
  axes: Segment[]
  handles: Rect[]
}

/**
 * Every note laid out for a panel, in the script's order; null where a panel
 * shows nothing of one. Every line is `hair` wide.
 */
export function notePlans(
  panel: SheetPanel,
  lat: Lattice,
  script: SheetScript,
  hair: number,
): (NotePlan | null)[] {
  const { ratio } = panel
  const snap = (value: number) => Math.round(value * ratio) / ratio
  const crisp = (value: number) => snap(value) + hair / 2
  const plans: (NotePlan | null)[] = []
  for (const note of script.notes) {
    const state = script.states[note.scenes[0]!]!
    const g = sceneGeometry(panel, lat, script, state)
    const picture = { x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h }
    const at = ([x, y]: Point): Point => [g.x + x * g.scale, g.y + y * g.scale]
    const inside = ([x, y]: Point, pad: number) =>
      x >= picture.x + pad &&
      x <= picture.x + picture.w - pad &&
      y >= picture.y + pad &&
      y <= picture.y + picture.h - pad
    const drawing: Drawing = {
      construction: [],
      circles: [],
      axes: [],
      handles: [],
    }
    for (const mark of note.marks) {
      if (mark.kind === "axis") {
        let a = at(mark.from)
        let b = at(mark.to)
        // Upright and level lines are set on device pixels.
        if (mark.from[0] === mark.to[0]) {
          a = [crisp(a[0]), a[1]]
          b = [a[0], b[1]]
        } else if (mark.from[1] === mark.to[1]) {
          a = [a[0], crisp(a[1])]
          b = [b[0], a[1]]
        }
        const k = (mark.extend * g.scale) / Math.hypot(b[0] - a[0], b[1] - a[1])
        const dx = (b[0] - a[0]) * k
        const dy = (b[1] - a[1]) * k
        drawing.axes.push({
          a: [a[0] - dx, a[1] - dy],
          b: [b[0] + dx, b[1] + dy],
        })
      } else if (mark.kind === "guide") {
        drawing.construction.push({ a: at(mark.from), b: at(mark.to) })
      } else if (mark.kind === "outline") {
        const points = mark.points.map(at)
        points.forEach((point, index) => {
          drawing.construction.push({
            a: point,
            b: points[(index + 1) % points.length]!,
          })
          if (!inside(point, HANDLE)) return
          drawing.handles.push(
            squareOn(snap(point[0]), snap(point[1]), HANDLE, hair, ratio),
          )
        })
      } else if (mark.kind === "ring") {
        drawing.circles.push({ c: at(mark.at), r: mark.r * g.scale })
      } else {
        const [x, y] = at(mark.at)
        const cx = crisp(x)
        const cy = crisp(y)
        drawing.construction.push(
          { a: [cx - ARM, cy], b: [cx + ARM, cy] },
          { a: [cx, cy - ARM], b: [cx, cy + ARM] },
        )
      }
    }
    const plan = cut(drawing, picture, ratio)
    plans.push(
      plan && {
        scenes: note.scenes,
        painting: state.painting,
        origin: { x: g.x, y: g.y, scale: g.scale },
        ...plan,
      },
    )
  }
  return plans
}

/**
 * A drawing cut to its box: only what shows inside the picture is kept, the
 * box holds no more than that, on device pixels, and every path is from its
 * corner.
 */
function cut(
  drawing: Drawing,
  picture: Rect,
  ratio: number,
): Omit<NotePlan, "scenes" | "painting" | "origin"> | null {
  const box = bounds()
  const shown = (segments: Segment[]) =>
    segments.filter((segment) => {
      const part = clipSegment(segment, picture)
      if (!part) return false
      box.add(part.a[0], part.a[1], 1)
      box.add(part.b[0], part.b[1], 1)
      return true
    })
  const construction = shown(drawing.construction)
  const axes = shown(drawing.axes)
  const circles = drawing.circles.filter(({ c, r }) => {
    const x0 = Math.max(picture.x, c[0] - r)
    const x1 = Math.min(picture.x + picture.w, c[0] + r)
    const y0 = Math.max(picture.y, c[1] - r)
    const y1 = Math.min(picture.y + picture.h, c[1] + r)
    if (x0 >= x1 || y0 >= y1) return false
    box.add(x0, y0, 1)
    box.add(x1, y1, 1)
    return true
  })
  for (const rect of drawing.handles) {
    box.add(rect.x, rect.y, 1)
    box.add(rect.x + rect.w, rect.y + rect.h, 1)
  }
  const loose = box.rect()
  if (!loose) return null
  // The box's corner is on a device pixel, as its lines are.
  const x = Math.floor(loose.x * ratio) / ratio
  const y = Math.floor(loose.y * ratio) / ratio
  const rect = { x, y, w: loose.x + loose.w - x, h: loose.y + loose.h - y }
  const point = (p: Point) => `${n(p[0] - x)} ${n(p[1] - y)}`
  const line = ({ a, b }: Segment) => `M${point(a)}L${point(b)}`
  const circle = (c: Point, r: number) =>
    `M${point([c[0] - r, c[1]])}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0` +
    `a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`
  const move = (r: Rect): Rect => ({ ...r, x: r.x - x, y: r.y - y })
  return {
    box: rect,
    clip: move(picture),
    construction: [
      ...construction.map(line),
      ...circles.map(({ c, r }) => circle(c, r)),
    ].join(""),
    axes: axes.map(line).join(""),
    handles: drawing.handles.map(move),
  }
}
