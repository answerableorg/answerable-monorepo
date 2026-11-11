/**
 * The image panel as a drawing sheet: what is drawn over the paintings, in
 * panel pixels, from the panel's lattice (`lib/stage-math.ts`).
 *
 * One rule: a line either belongs to the lattice or continues something in
 * the painting. Every line starts on a lattice line (so on a device pixel)
 * and is drawn from there to the right or down, a whole number of device
 * pixels thick: the lattice a hairline, the frame and the rules about one
 * CSS pixel.
 */

import type { Script } from "@/components/new/frames"
import { noteLine, notePlans, type NotePlan } from "@/components/new/notes"
import {
  clamp,
  lattice,
  windowGeometry,
  type Lattice,
  type Rect,
  type Size,
} from "@/lib/stage-math"
import { COMMA_BOX, COMMA_PATH } from "@answerable/ui/lib/logo"

type Side = "top" | "right" | "bottom" | "left"

/** A measured panel (as `Layout["panel"]` in `frames.ts`). */
export type SheetPanel = {
  size: Size
  column: boolean
  margin: number
  ratio: number
}

export type SheetPlan = {
  /** What the plan was drawn from: two plans with one key are the same. */
  key: string
  lattice: Lattice
  /** The lattice's line thickness. */
  hair: number
  /** The frame's and the rules' thickness. */
  ink: number
  /** The thickness of the lines drawn on the paintings. */
  note: number
  /** The lattice's inner lines, as one path of filled rectangles. */
  lines: string
  /** The frame, the strip's lines and the ticks, as one filled path. */
  frame: string
  /** The zone labels in the margin: numbers across, letters down. */
  zones: readonly Zone[]
  /** Each rule where it rests before its transform (see `frames.ts`). */
  rules: Record<Side, Rect>
  /** The title strip under the lattice's last row, inside the frame. */
  strip: Strip
  /** Each person's comma, the opening one first. */
  commas: readonly [Comma, Comma]
  /** What the sheet points out in each painting (see `notes.ts`). */
  notes: readonly (NotePlan | null)[]
}

/** What of the page's script the sheet is drawn from. */
export type SheetScript = Pick<
  Script,
  "states" | "paintings" | "layouts" | "notes"
>

/**
 * The title strip, as on a drawing: the sheet's number in a cell that ends
 * on a lattice line, then the scene's name, and the key plan at the far end.
 */
type Strip = Rect & {
  /** Its words' size; 0 where it is too thin for words. */
  font: number
  /** The words' distance from their cell's left edge. */
  pad: number
  /** Where the number's cell ends: a lattice column line. */
  number: number
  keyplan: KeyPlan | null
}

/**
 * The key plan: the painting the squares are details of, whole and small,
 * with the square on show drawn on it.
 */
type KeyPlan = {
  /** Its cell: from a lattice column line to the frame. */
  cell: Rect
  /** The painting's outline. */
  box: Rect
  /** Each scene's square on it; null for a scene without one. */
  windows: readonly (Rect | null)[]
  /** A mark at each square's centre, to the device pixel. */
  dots: readonly (Rect | null)[]
}

/** A comma on the sheet: its whole box, and its head on lattice lines. */
type Comma = { box: Rect; head: Rect }

type Zone = {
  x: number
  y: number
  text: string
  anchor: "middle" | "end"
}

/** Ticks need this much margin; zone labels this much, beside the copy. */
const TICK_MARGIN = 12
const ZONE_MARGIN = 28
const TICK = 6
/** The strip needs this height for words, and this for the key plan. */
const STRIP_WORDS = 14
const STRIP_KEYPLAN = 30
/** The key plan's greatest height, and share of the lattice's columns. */
const KEYPLAN_HEIGHT = 36
const KEYPLAN_COLUMNS = 0.3
const KEYPLAN_DOT = 3
/** The zone labels' size, and their capitals' height as a share of it. */
export const ZONE_FONT = 9
const CAP = 0.7

/** Zone letters: the whole alphabet, I and O included. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
function zoneLetter(row: number): string {
  const last = LETTERS[row % LETTERS.length]!
  return row < LETTERS.length
    ? last
    : LETTERS[Math.floor(row / LETTERS.length) - 1]! + last
}

const n = (value: number) => String(Math.round(value * 1000) / 1000)
/** A filled rectangle as a path. */
const box = (x: number, y: number, w: number, h: number) =>
  `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`

/** The comma's head and whole height, in the logo's units. */
const HEAD = { x: 1104, w: 48, h: 47.835 }
/**
 * The comma on the lattice: the logo's, its tail 1% shorter so that it is
 * exactly half its head. With the head on `k` modules, the tail's flat end
 * is then on a lattice line too (or half way, when `k` is odd).
 */
export const SHEET_COMMA = (() => {
  const seam = COMMA_BOX.y + HEAD.h
  const tail = COMMA_BOX.h - HEAD.h
  const squash = (y: number) =>
    y <= seam ? y : seam + ((y - seam) * (HEAD.h / 2)) / tail
  const d = COMMA_PATH.replace(
    /([MLHVCZ])([^MLHVCZ]*)/g,
    (_, command: string, rest: string) => {
      const values = rest
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
      const mapped =
        command === "H" || command === "Z"
          ? values
          : command === "V"
            ? values.map(squash)
            : values.map((value, index) => (index % 2 ? squash(value) : value))
      return command + mapped.map(n).join(" ")
    },
  )
  const h = HEAD.h * 1.5
  return {
    d,
    box: { x: COMMA_BOX.x, y: COMMA_BOX.y, w: COMMA_BOX.w, h },
    viewBox: `${COMMA_BOX.x} ${COMMA_BOX.y} ${COMMA_BOX.w} ${n(h)}`,
  }
})()

/**
 * The commas on the lattice, as a pair of quote marks set in the sheet's
 * corners: the opening one (tail up) top left, the closing one bottom right,
 * each the other turned half round about the lattice's centre. Each head is
 * `k` modules square, on lattice lines, `k` the whole number nearest to the
 * size they had before the lattice.
 */
function commas(panel: SheetPanel, lat: Lattice): [Comma, Comma] {
  const { w, h } = panel.size
  const { columns, rows, unit, xs, ys } = lat
  const half = panel.column ? { w, h: h / 2 } : { w: w / 2, h }
  const wanted =
    (Math.min(0.8 * half.h, 0.62 * half.w * (COMMA_BOX.h / COMMA_BOX.w)) *
      HEAD.h) /
    COMMA_BOX.h
  let k = clamp(Math.round(wanted / unit), 1, Math.min(columns, rows))
  // Smaller until both fit: each with room for its tail, and clear of the
  // other (apart across, or one above the other).
  for (; k > 1; k--) {
    const top = Math.ceil(k / 2)
    if (top + k > rows) continue
    if (2 * k < columns || 2 * (top + k) <= rows) break
  }
  const top = Math.min(Math.ceil(k / 2), rows - k)
  const place = (column: number, row: number, opening: boolean): Comma => {
    const head = {
      x: xs[column]!,
      y: ys[row]!,
      w: xs[column + k]! - xs[column]!,
      h: ys[row + k]! - ys[row]!,
    }
    // The tail is half the head: to the lattice line there, when there is
    // one, so its flat end is on that line to the device pixel.
    const end = row + (opening ? -k / 2 : k + k / 2)
    const line = Number.isInteger(end) ? ys[end] : undefined
    const tail =
      line === undefined
        ? head.h / 2
        : Math.abs(line - head.y) - (opening ? 0 : head.h)
    const overhang = (head.w * (COMMA_BOX.w - HEAD.w)) / HEAD.w
    return {
      head,
      box: {
        x: opening ? head.x : head.x - overhang,
        y: opening ? head.y - tail : head.y,
        w: head.w + overhang,
        h: head.h + tail,
      },
    }
  }
  return [place(0, top, true), place(columns - k, rows - top - k, false)]
}

/** The title strip's cells, each ending on a lattice column line. */
function strip(panel: SheetPanel, lat: Lattice, script: SheetScript): Strip {
  const { columns, rows, unit, xs, ys, bottom } = lat
  const x = xs[0]!
  const y = ys[rows]!
  const w = xs[columns]! - x
  const h = Math.max(0, bottom - y)
  // No words in a strip too thin for them, or too narrow for two cells.
  const font = h < STRIP_WORDS || columns < 3 ? 0 : panel.column ? 9 : 8
  const pad = panel.column ? 10 : 8
  // "00 / 00" is about four of its letters' size wide.
  const cells = Math.min(columns - 1, Math.ceil((2 * pad + 4 * font) / unit))
  const base = { x, y, w, h, font, pad, number: font ? xs[cells]! : x }
  return { ...base, keyplan: keyPlan(panel, lat, script, base, cells) }
}

function keyPlan(
  panel: SheetPanel,
  lat: Lattice,
  script: SheetScript,
  strip: Rect & { font: number; pad: number },
  taken: number,
): KeyPlan | null {
  const keyed = script.states.find((state) => state.window)
  if (!keyed || !strip.font || strip.h < STRIP_KEYPLAN) return null
  const { columns, unit, xs } = lat
  const snap = (value: number) => Math.round(value * panel.ratio) / panel.ratio
  const image = script.paintings[keyed.painting]
  const most = Math.floor(columns * KEYPLAN_COLUMNS)
  const tall = Math.min(
    strip.h - 2 * Math.max(6, Math.round(strip.h * 0.16)),
    KEYPLAN_HEIGHT,
  )
  const wide = (tall * image.w) / image.h
  const cells = Math.min(Math.ceil((wide + 2 * strip.pad) / unit), most)
  // Room left for the scene's name: two modules at least.
  if (cells < 1 || columns - cells - taken < 2) return null
  const left = xs[columns - cells]!
  const cell = { x: left, y: strip.y, w: xs[columns]! - left, h: strip.h }
  const w = snap(Math.min(wide, cell.w - 2 * strip.pad))
  const scale = w / image.w
  const h = snap(image.h * scale)
  const box = {
    x: snap(cell.x + (cell.w - w) / 2),
    y: snap(cell.y + (cell.h - h) / 2),
    w,
    h,
  }
  const layout = panel.column ? script.layouts.column : script.layouts.band
  const windows = script.states.map((state) => {
    if (!state.window || state.painting !== keyed.painting) return null
    // The detail as the panel shows it: moved in at the painting's edge.
    const { focus } = windowGeometry(
      panel.size,
      image,
      state.window,
      layout,
      lat,
    )
    const side = snap(state.window.span * scale)
    return {
      x: snap(box.x + focus[0] * scale - side / 2),
      y: snap(box.y + focus[1] * scale - side / 2),
      w: side,
      h: side,
    }
  })
  const dots = windows.map((window) => {
    if (!window) return null
    // About three pixels, and as odd or even as its square in device pixels.
    const side = Math.round(window.w * panel.ratio)
    let across = Math.round(KEYPLAN_DOT * panel.ratio)
    if ((side - across) % 2) across += 1
    const edge = (side - across) / 2 / panel.ratio
    const size = across / panel.ratio
    return { x: window.x + edge, y: window.y + edge, w: size, h: size }
  })
  return { cell, box, windows, dots }
}

/** Everything the sheet draws that never moves, for a measured panel. */
export function sheetPlan(panel: SheetPanel, script: SheetScript): SheetPlan {
  const { size, margin, ratio, column } = panel
  const lat = lattice(
    size,
    margin,
    (column ? script.layouts.column : script.layouts.band).size,
    ratio,
  )
  const { columns, rows, xs, ys, bottom } = lat
  const hair = Math.max(1, Math.round(ratio / 2)) / ratio
  const ink = Math.max(1, Math.round(ratio)) / ratio
  const note = noteLine(ratio)
  const x0 = xs[0]!
  const x1 = xs[columns]!
  const y0 = ys[0]!
  const y1 = ys[rows]!

  let lines = ""
  for (let i = 1; i < columns; i++) lines += box(xs[i]!, y0, hair, y1 - y0)
  for (let j = 1; j < rows; j++) lines += box(x0, ys[j]!, x1 - x0, hair)

  let frame =
    box(x0, y0, x1 - x0 + ink, ink) +
    box(x0, bottom, x1 - x0 + ink, ink) +
    box(x0, y0, ink, bottom - y0 + ink) +
    box(x1, y0, ink, bottom - y0 + ink)
  if (bottom > y1) frame += box(x0, y1, x1 - x0 + ink, ink)
  const title = strip(panel, lat, script)
  // The number's cell, closed on its lattice line.
  if (title.font) frame += box(title.number, y1, ink, bottom - y1)
  const ticks = margin >= TICK_MARGIN
  if (ticks) {
    for (let i = 0; i <= columns; i++) {
      frame += box(xs[i]!, y0 - TICK, ink, TICK)
      frame += box(xs[i]!, bottom + ink, ink, TICK)
    }
    for (let j = 0; j <= rows; j++) {
      frame += box(x0 - TICK, ys[j]!, TICK, ink)
      frame += box(x1 + ink, ys[j]!, TICK, ink)
    }
  }

  const zones: Zone[] = []
  if (column && margin >= ZONE_MARGIN) {
    const gap = TICK + 5
    for (let i = 0; i < columns; i++) {
      zones.push({
        x: (xs[i]! + xs[i + 1]!) / 2,
        y: y0 - gap,
        text: String(i + 1),
        anchor: "middle",
      })
    }
    for (let j = 0; j < rows; j++) {
      zones.push({
        x: x0 - gap,
        y: (ys[j]! + ys[j + 1]!) / 2 + (ZONE_FONT * CAP) / 2,
        text: zoneLetter(j),
        anchor: "end",
      })
    }
  }

  return {
    key: [size.w, size.h, margin, ratio, column].join(":"),
    lattice: lat,
    hair,
    ink,
    note,
    lines,
    frame,
    zones,
    rules: {
      top: { x: x0, y: 0, w: x1 - x0 + ink, h: ink },
      bottom: { x: x0, y: 0, w: x1 - x0 + ink, h: ink },
      left: { x: 0, y: y0, w: ink, h: y1 - y0 + ink },
      right: { x: 0, y: y0, w: ink, h: y1 - y0 + ink },
    },
    strip: title,
    commas: commas(panel, lat),
    notes: notePlans(panel, lat, script, note, hair),
  }
}
