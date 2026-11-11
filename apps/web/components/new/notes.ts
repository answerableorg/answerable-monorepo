/**
 * The notes: what the sheet draws on a painting, as a drawing does. A note is
 * written in its painting's pixels and laid out for a measured panel: its
 * marks follow the painting's own lines (an axis, an outline, a circle, a
 * baseline), in lines heavy enough to read over paint, cut to the picture.
 * Each mark is one stroke, which the page draws from its first point to its
 * last once the scene has arrived.
 */

import type { PaintingKey, PanelState } from "@/components/new/scenes"
import type { SheetPanel, SheetScript } from "@/components/new/sheet"
import {
  openGeometry,
  windowGeometry,
  type Geometry,
  type Lattice,
  type Point,
  type Rect,
} from "@/lib/stage-math"

/** A mark on a painting, in the painting's pixels. */
type Mark =
  /** A centre line through two points, drawn `extend` past each. */
  | { kind: "axis"; from: Point; to: Point; extend: number }
  /**
   * A construction line between two points: a baseline, an edge carried on.
   * Drawn fine, as it may cross what it is drawn for.
   */
  | { kind: "guide"; from: Point; to: Point }
  /** An object's outline, with a handle at each corner. */
  | { kind: "outline"; points: readonly Point[] }
  /** A circle. */
  | { kind: "ring"; at: Point; r: number }
  /** A cross on a point. */
  | { kind: "cross"; at: Point }
  /**
   * The angle at a point between the line from `from`, which is drawn and
   * carried `past` the point, and the line to `to`: an arc `r` from the
   * point, and its size in figures beyond it.
   */
  | {
      kind: "angle"
      at: Point
      from: Point
      to: Point
      r: number
      past: number
    }
  /**
   * A dimension between two points: a line beside them, `offset` to the left
   * of the way from `from` to `to`, a witness line to it from `clear` of each
   * point, a stroke across each end, and its size in figures over its middle.
   */
  | {
      kind: "dimension"
      from: Point
      to: Point
      offset: number
      clear: number
      text: string
    }

/** The marks on the scenes that share one view of a painting. */
export type Note = { scenes: readonly number[]; marks: readonly Mark[] }

/** A note laid out: every path and rectangle is from its box's corner. */
export type NotePlan = {
  scenes: readonly number[]
  painting: PaintingKey
  /** Its element's box on the panel. */
  box: Rect
  /** The picture: what is drawn on the painting is clipped to it. */
  clip: Rect
  /** What it draws, a stroke a mark, in the order the marks are drawn. */
  strokes: readonly Stroke[]
  /** The squares at an outline's corners. */
  handles: readonly Handle[]
  /** Figures, each centred on its point. */
  labels: readonly Label[]
}

/** One mark's lines, drawn in one go from the first point to the last. */
export type Stroke = {
  /** Which of the note's marks it is. */
  step: number
  /**
   * A line along the painting (an outline, a circle, a cross, an angle, a
   * dimension), a centre line, drawn as a chain line, or a construction line,
   * drawn fine.
   */
  kind: "line" | "chain" | "fine"
  path: string
  /** How long it is, in pixels. */
  length: number
  /** The box its lines' ends lie in, from the note's corner. */
  reach: Rect
}

/** A square on a corner of mark `step`, reached `along` its stroke (0 to 1). */
type Handle = Rect & { step: number; along: number }

/** Figures of mark `step`, the point they are centred on, and how far round
    they are turned, in degrees. */
type Label = { x: number; y: number; text: string; turn: number; step: number }

/** An outline's handle and a cross's arm, in pixels. */
const HANDLE = 7
export const ARM = 7.5
/** An angle's figures: their size, how far their middle is from the arc, and
    the room they take around it. */
export const FIGURE_FONT = 11
export const FIGURE_GAP = 13
const FIGURE_ROOM = 12
/** A dimension's witness lines run this far past it, the stroke across each
    end is twice this long, and its figures' middle is this far beyond it. */
const WITNESS_PAST = 5
export const DIMENSION_STROKE = 5
export const DIMENSION_GAP = 9

/**
 * How thick a note's lines are, in pixels: about one and a half, a whole
 * number of device pixels. A hairline is lost on paint; only its construction
 * lines stay one.
 */
export function noteLine(ratio: number) {
  return Math.max(1, Math.round(1.5 * ratio)) / ratio
}

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

/** `step`: which of its note's marks a piece of a drawing belongs to. */
type Segment = { a: Point; b: Point; step?: number }

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

/** An arc about `c`: from the angle `from`, `turn` round (both in radians). */
type Arc = { c: Point; r: number; from: number; turn: number; step?: number }

/** What a note draws, in panel pixels, before it is cut to its box. */
type Drawing = {
  construction: Segment[]
  fine: Segment[]
  circles: { c: Point; r: number; step?: number }[]
  arcs: Arc[]
  axes: Segment[]
  handles: Handle[]
  labels: Label[]
}

const onArc = ({ c, r }: Arc, angle: number): Point => [
  c[0] + r * Math.cos(angle),
  c[1] + r * Math.sin(angle),
]

/**
 * Every note laid out for a panel, in the script's order; null where a panel
 * shows nothing of one. Every line is `thick` wide, and a construction line
 * `hair`.
 */
export function notePlans(
  panel: SheetPanel,
  lat: Lattice,
  script: SheetScript,
  thick: number,
  hair: number,
): (NotePlan | null)[] {
  const { ratio } = panel
  const snap = (value: number) => Math.round(value * ratio) / ratio
  const crisp = (value: number, width = thick) => snap(value) + width / 2
  const plans: (NotePlan | null)[] = []
  for (const note of script.notes) {
    const state = script.states[note.scenes[0]!]!
    const g = sceneGeometry(panel, lat, script, state)
    const picture = { x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h }
    const at = ([x, y]: Point): Point => [g.x + x * g.scale, g.y + y * g.scale]
    /** The line between two of the painting's points, `width` wide; an
        upright or level one is set on device pixels. */
    const between = (from: Point, to: Point, width = thick): Segment => {
      const a = at(from)
      const b = at(to)
      if (from[0] === to[0]) {
        const x = crisp(a[0], width)
        return { a: [x, a[1]], b: [x, b[1]] }
      }
      if (from[1] === to[1]) {
        const y = crisp(a[1], width)
        return { a: [a[0], y], b: [b[0], y] }
      }
      return { a, b }
    }
    const inside = ([x, y]: Point, pad: number) =>
      x >= picture.x + pad &&
      x <= picture.x + picture.w - pad &&
      y >= picture.y + pad &&
      y <= picture.y + picture.h - pad
    const drawing: Drawing = {
      construction: [],
      fine: [],
      circles: [],
      arcs: [],
      axes: [],
      handles: [],
      labels: [],
    }
    note.marks.forEach((mark, step) => {
      const { construction, fine, circles, arcs, axes } = drawing
      const before = [construction, fine, circles, arcs, axes].map(
        (pieces) => pieces.length,
      )
      if (mark.kind === "axis") {
        const { a, b } = between(mark.from, mark.to)
        const k = (mark.extend * g.scale) / Math.hypot(b[0] - a[0], b[1] - a[1])
        const dx = (b[0] - a[0]) * k
        const dy = (b[1] - a[1]) * k
        drawing.axes.push({
          a: [a[0] - dx, a[1] - dy],
          b: [b[0] + dx, b[1] + dy],
        })
      } else if (mark.kind === "guide") {
        drawing.fine.push(between(mark.from, mark.to, hair))
      } else if (mark.kind === "outline") {
        const points = mark.points.map(at)
        points.forEach((point, index) => {
          drawing.construction.push({
            a: point,
            b: points[(index + 1) % points.length]!,
          })
          if (!inside(point, HANDLE)) return
          drawing.handles.push({
            ...squareOn(snap(point[0]), snap(point[1]), HANDLE, thick, ratio),
            step,
            along: index / points.length,
          })
        })
      } else if (mark.kind === "ring") {
        drawing.circles.push({ c: at(mark.at), r: mark.r * g.scale })
      } else if (mark.kind === "angle") {
        const bearing = (to: Point) =>
          Math.atan2(to[1] - mark.at[1], to[0] - mark.at[0])
        const from = bearing(mark.from)
        // The short way round, under half a turn.
        let turn = bearing(mark.to) - from
        if (turn > Math.PI) turn -= 2 * Math.PI
        if (turn < -Math.PI) turn += 2 * Math.PI
        // The line the angle is measured from, through the point.
        const { a, b } = between(mark.from, mark.at)
        const k = (mark.past * g.scale) / Math.hypot(b[0] - a[0], b[1] - a[1])
        drawing.construction.push({
          a,
          b: [b[0] + (b[0] - a[0]) * k, b[1] + (b[1] - a[1]) * k],
        })
        const arc = { c: at(mark.at), r: mark.r * g.scale, from, turn }
        drawing.arcs.push(arc)
        const [x, y] = onArc({ ...arc, r: arc.r + FIGURE_GAP }, from + turn / 2)
        if (inside([x, y], FIGURE_ROOM)) {
          const degrees = Math.round((Math.abs(turn) * 180) / Math.PI)
          drawing.labels.push({ x, y, text: `${degrees}°`, turn: 0, step })
        }
      } else if (mark.kind === "dimension") {
        const a = at(mark.from)
        const b = at(mark.to)
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        // Along the way from one point to the other, and to its left.
        const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
        const v: Point = [u[1], -u[0]]
        const from = ([x, y]: Point, along: number, out: number): Point => [
          x + u[0] * along + v[0] * out,
          y + u[1] * along + v[1] * out,
        ]
        const side = Math.sign(mark.offset)
        const out = mark.offset * g.scale
        drawing.construction.push({ a: from(a, 0, out), b: from(b, 0, out) })
        const half = DIMENSION_STROKE / Math.SQRT2
        for (const end of [a, b]) {
          drawing.construction.push(
            {
              a: from(end, 0, side * mark.clear * g.scale),
              b: from(end, 0, out + side * WITNESS_PAST),
            },
            { a: from(end, -half, out - half), b: from(end, half, out + half) },
          )
        }
        const [x, y] = from(a, length / 2, out + side * DIMENSION_GAP)
        const room = Math.max(FIGURE_ROOM, mark.text.length * 3.5)
        if (inside([x, y], room)) {
          // Read along the line, the right way up.
          let turn = (Math.atan2(u[1], u[0]) * 180) / Math.PI
          if (turn > 90) turn -= 180
          if (turn <= -90) turn += 180
          drawing.labels.push({ x, y, text: mark.text, turn, step })
        }
      } else {
        const [x, y] = at(mark.at)
        const cx = crisp(x)
        const cy = crisp(y)
        drawing.construction.push(
          { a: [cx - ARM, cy], b: [cx + ARM, cy] },
          { a: [cx, cy - ARM], b: [cx, cy + ARM] },
        )
      }
      // What the mark added is its stroke.
      ;[construction, fine, circles, arcs, axes].forEach((pieces, index) => {
        for (const piece of pieces.slice(before[index])) piece.step = step
      })
    })
    const plan = cut(drawing, picture, ratio)
    plans.push(
      plan && { scenes: note.scenes, painting: state.painting, ...plan },
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
): Omit<NotePlan, "scenes" | "painting"> | null {
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
  const fine = shown(drawing.fine)
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
  // An arc, by points along it a twelfth of a turn apart at most.
  const arcs = drawing.arcs.filter((arc) => {
    const steps = Math.max(1, Math.ceil(Math.abs(arc.turn) / (Math.PI / 6)))
    let seen = false
    for (let step = 0; step <= steps; step++) {
      const [px, py] = onArc(arc, arc.from + (arc.turn * step) / steps)
      if (
        px < picture.x ||
        px > picture.x + picture.w ||
        py < picture.y ||
        py > picture.y + picture.h
      ) {
        continue
      }
      box.add(px, py, 1)
      seen = true
    }
    return seen
  })
  for (const rect of drawing.handles) {
    box.add(rect.x, rect.y, 1)
    box.add(rect.x + rect.w, rect.y + rect.h, 1)
  }
  for (const label of drawing.labels) {
    box.add(label.x, label.y, Math.max(FIGURE_ROOM, label.text.length * 3.5))
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
  const sweep = (arc: Arc) =>
    `M${point(onArc(arc, arc.from))}A${n(arc.r)} ${n(arc.r)} 0 0 ` +
    `${arc.turn > 0 ? 1 : 0} ${point(onArc(arc, arc.from + arc.turn))}`
  const move = <T extends Rect>(r: T): T => ({ ...r, x: r.x - x, y: r.y - y })
  const long = ({ a, b }: Segment) => Math.hypot(b[0] - a[0], b[1] - a[1])
  // A stroke a mark and a kind: its pieces one after the other.
  const strokes: Stroke[] = []
  const steps = [construction, fine, axes, circles, arcs]
    .flat()
    .map((piece) => piece.step!)
  for (const step of [...new Set(steps)].sort((a, b) => a - b)) {
    const of = <T extends { step?: number }>(pieces: T[]) =>
      pieces.filter((piece) => piece.step === step)
    type Piece = { path: string; length: number; ends: Point[] }
    const straight = (s: Segment): Piece => ({
      path: line(s),
      length: long(s),
      ends: [s.a, s.b],
    })
    const kinds: [Stroke["kind"], Piece[]][] = [
      ["fine", of(fine).map(straight)],
      ["chain", of(axes).map(straight)],
      [
        "line",
        [
          ...of(construction).map(straight),
          ...of(circles).map(({ c, r }) => ({
            path: circle(c, r),
            length: 2 * Math.PI * r,
            ends: [
              [c[0] - r, c[1] - r] as Point,
              [c[0] + r, c[1] + r] as Point,
            ],
          })),
          ...of(arcs).map((arc) => ({
            path: sweep(arc),
            length: Math.abs(arc.turn) * arc.r,
            ends: [
              [arc.c[0] - arc.r, arc.c[1] - arc.r] as Point,
              [arc.c[0] + arc.r, arc.c[1] + arc.r] as Point,
            ],
          })),
        ],
      ],
    ]
    for (const [kind, pieces] of kinds) {
      if (!pieces.length) continue
      const ends = pieces.flatMap((piece) => piece.ends)
      const left = Math.min(...ends.map((end) => end[0]))
      const top = Math.min(...ends.map((end) => end[1]))
      strokes.push({
        step,
        kind,
        path: pieces.map((piece) => piece.path).join(""),
        length: pieces.reduce((sum, piece) => sum + piece.length, 0),
        reach: {
          x: left - x,
          y: top - y,
          w: Math.max(...ends.map((end) => end[0])) - left,
          h: Math.max(...ends.map((end) => end[1])) - top,
        },
      })
    }
  }
  return {
    box: rect,
    clip: move(picture),
    strokes,
    handles: drawing.handles.map(move),
    labels: drawing.labels.map((label) => ({
      ...label,
      x: label.x - x,
      y: label.y - y,
    })),
  }
}
