import type { Cut, PaintingKey, PanelState } from "@/components/new/scenes"
import {
  clamp,
  coverReach,
  lerp,
  lineFrame,
  mixGeometry,
  offsetFrom,
  openGeometry,
  pushed,
  rollFrame,
  scrub,
  windowGeometry,
  type Geometry,
  type Placement,
  type Point,
  type Size,
  type WindowLayout,
} from "@/lib/stage-math"

/**
 * The /new stage as a function of the scroll: what every moving element shows
 * at any point between two scenes. The stage samples it once into animations
 * that the browser plays against the scroll on its compositor, so nothing is
 * drawn by script while the page moves; where the browser has no scroll
 * timelines, the stage draws it each frame instead.
 *
 * A frame only holds opacity and a transform, the two things a compositor can
 * animate: a colour changes by fading one solid layer over another.
 */

/** One element's look at a moment: an opacity, a transform, or both. */
export type Style = {
  opacity?: number
  /** `translate3d(x, y, 0) scale(s)`, in pixels. */
  x?: number
  y?: number
  s?: number
}

/**
 * Every moving element's style, by its key:
 * - `line:<scene>:<n>` a scene's line; `step:<n>` a value statement;
 *   `mark:<n>` an index number; `highlight` the square behind it, and
 *   `tint:<n>` its colour for value n.
 * - `panel` the image panel; `painting:<key>` each painting;
 *   `shutter:<side>` the four white shutters that frame the square;
 *   `half:<n>` a person's white half and `comma:<n>` their photograph.
 */
export type Frame = Record<string, Style>

/**
 * The four white shutters round the square, each the panel's size and a
 * pixel more on every side, so no edge of the panel ever shows between them.
 */
export const SHUTTERS = ["top", "right", "bottom", "left"] as const

/**
 * The opacity of a painting above the one on show: a fifth of a percent,
 * under half a level of an 8-bit colour, so never seen. Not 0: WebKit lets go
 * of a layer left fully transparent and stalls when it shows again (40 to
 * 60 ms, measured on the second time round the page).
 */
export const GHOST = 0.002
/** A panel transition rests still for this share of the scroll at either end. */
const REST = 0.02
/**
 * Where a transition's curve has a corner: the ends of its rest, and the
 * halfway point where the portraits hand over from white to photograph (and
 * the painting behind them changes). Sampling must land on them, or a
 * straight line cuts the corner.
 */
export const KINKS = [REST, 0.5, 1 - REST] as const

/** What the page is made of: the same for every visitor. */
export type Script = {
  sceneCount: number
  /** What the panel shows on each scene. */
  states: readonly PanelState[]
  /** Each painting's size in its own pixels. */
  paintings: Readonly<Record<PaintingKey, Size>>
  /** How one painting gives way to the next. */
  cuts: readonly Cut[]
  layouts: { column: WindowLayout; band: WindowLayout }
  people: number
}

/** What the stage measured: this window, this font, this preference. */
export type Layout = {
  reduced: boolean
  /** How far a line travels as it enters or leaves, in pixels. */
  lineTravel: number
  scenes: readonly { from: number; to: number; lines: number }[]
  values: {
    from: number
    count: number
    /** The statements' box height. */
    travel: number
    /** Each index number's left edge. */
    markX: readonly number[]
  } | null
  panel: { size: Size; column: boolean; margin: number } | null
}

/**
 * The frame `t` of the way (0 to 1) from scene `segment` to the next. The
 * last segment runs from the last scene to the hero again.
 */
export function frameAt(
  script: Script,
  layout: Layout,
  segment: number,
  t: number,
): Frame {
  const frame: Frame = {}
  const progress = segment + t
  const { reduced } = layout

  layout.scenes.forEach((scene, sceneIndex) => {
    const offset = offsetFrom(progress, scene.from, scene.to, script.sceneCount)
    for (let line = 0; line < scene.lines; line++) {
      const { opacity, shift } = lineFrame(offset, line, scene.lines)
      frame[`line:${sceneIndex}:${line}`] = {
        opacity,
        x: 0,
        y: reduced ? 0 : shift * layout.lineTravel,
        s: 1,
      }
    }
  })

  if (layout.values) valuesFrame(frame, layout.values, progress, reduced)
  if (layout.panel && layout.panel.size.w > 0 && layout.panel.size.h > 0) {
    panelFrame(frame, script, layout.panel, segment, t, reduced)
  }
  return frame
}

/** The values: the statements roll, the highlight slides along the index. */
function valuesFrame(
  frame: Frame,
  values: NonNullable<Layout["values"]>,
  progress: number,
  reduced: boolean,
) {
  const { count, travel, markX } = values
  const position = clamp(progress - values.from, 0, count - 1)
  for (let index = 0; index < count; index++) {
    let offset = clamp(position - index, -1, 1)
    // Arriving and leaving belong to the whole block.
    if (index === 0 && offset < 0) offset = 0
    if (index === count - 1 && offset > 0) offset = 0
    const { opacity, shift } = reduced
      ? lineFrame(offset, 0, 1)
      : rollFrame(offset)
    frame[`step:${index}`] = {
      opacity,
      x: 0,
      y: reduced ? 0 : shift * travel,
      s: 1,
    }
  }
  // Between number `index` and the next, `eased` of the way.
  const index = Math.min(Math.floor(position), count - 2)
  const u = position - index
  const eased = reduced ? Math.round(u) : scrub(u)
  for (let k = 0; k < count; k++) {
    const distance = Math.abs(index + eased - k)
    frame[`mark:${k}`] = { opacity: 0.32 + 0.68 * (1 - Math.min(distance, 1)) }
    // The next colour fades in over this one, which stays solid beneath.
    frame[`tint:${k}`] = {
      opacity: k === index ? 1 : k === index + 1 ? eased : 0,
    }
  }
  frame.highlight = {
    x: lerp(markX[index] ?? 0, markX[index + 1] ?? 0, eased),
    y: 0,
    s: 1,
  }
}

/**
 * The image panel: a painting whole, or seen through the logo's square on
 * white, and the two portraits. Each painting has one transform and an
 * opacity; four white shutters slide to frame the square. Nothing is clipped
 * or rescaled but the paintings themselves, and a painting never shows its
 * edge: while visible it covers the panel, or the square it is seen through.
 */
function panelFrame(
  frame: Frame,
  script: Script,
  panel: NonNullable<Layout["panel"]>,
  segment: number,
  t: number,
  reduced: boolean,
) {
  const { states, sceneCount, paintings } = script
  const index = ((segment % sceneCount) + sceneCount) % sceneCount
  const next = (index + 1) % sceneCount
  const a = states[index]!
  const b = states[next]!

  // Reduced motion: no camera, the nearest state, crossfaded through white.
  let f = t
  let opacity = 1
  if (reduced) {
    opacity = clamp(Math.abs(f - 0.5) * 2.5, 0, 1)
    f = f < 0.5 ? 0 : 1
  }
  const step = scrub((f - REST) / (1 - 2 * REST))
  // The portraits come in two fades, so a face never shows over a painting:
  // arriving, the white halves cover the panel in the first half, then the
  // photographs appear on them while the painting behind changes, unseen;
  // leaving, the photographs go first, then the halves over a still painting.
  const arriving = b.team && !a.team
  const leaving = a.team && !b.team
  const first = clamp(step * 2, 0, 1)
  const second = clamp(step * 2 - 1, 0, 1)
  const colours =
    a.team && b.team ? 1 : arriving ? first : leaving ? 1 - second : 0
  const photographs =
    a.team && b.team ? 1 : arriving ? second : leaving ? 1 - first : 0
  const e = arriving ? second : step

  const layout = panel.column ? script.layouts.column : script.layouts.band
  const cut =
    a.painting === b.painting
      ? null
      : (script.cuts.find(
          ({ from, to }) => from === a.painting && to === b.painting,
        ) ?? null)
  /** A state's geometry, beside the state it moves to or from. */
  const view = (state: PanelState, other: PanelState, end: "out" | "in") => {
    const image = paintings[state.painting]
    if (state.window) {
      return windowGeometry(
        panel.size,
        image,
        state.window,
        layout,
        panel.margin,
      )
    }
    // Open, the square is centred on the point the camera moves about: the
    // detail it closes on, the anchor of a cut, or the middle.
    let focus: Point = [image.w / 2, image.h / 2]
    const side = cut?.[end]
    if (other.painting === state.painting && other.window) {
      focus = other.window.focus
    } else if (side && side !== "square") {
      focus = side.anchor
    }
    return openGeometry(panel.size, image, focus, layout)
  }
  const from = view(a, b, "out")
  const to = view(b, a, "in")
  /** Where a painting next shows at rest, from the next scene on. */
  const home = (key: PaintingKey): Placement => {
    for (let ahead = 1; ahead <= sceneCount; ahead++) {
      const state = states[(index + ahead) % sceneCount]!
      if (state.painting !== key) continue
      const image = paintings[key]
      return state.window
        ? windowGeometry(panel.size, image, state.window, layout, panel.margin)
        : openGeometry(panel.size, image, [image.w / 2, image.h / 2], layout)
    }
    return { x: 0, y: 0, scale: 1 }
  }

  const keys = Object.keys(paintings) as PaintingKey[]
  /**
   * Each painting's opacity with `key` on show: it, and the painting at the
   * bottom (which never goes transparent), opaque; the rest ghosts. Only one
   * large painting ever changes opacity at a time: WebKit stalls when two do.
   */
  const rest = (key: PaintingKey) =>
    keys.map((other, order) => (other === key || order === 0 ? 1 : GHOST))

  let square: Pick<Geometry, "cx" | "cy" | "side">
  // Each painting's placement and opacity; a painting not on show waits,
  // still, where it next shows.
  const at = new Map<PaintingKey, Placement>(
    keys.map((key) => [key, home(key)]),
  )
  let alphas: number[] = [...rest(a.painting)]
  if (a.painting === b.painting) {
    const g = mixGeometry(from, to, e)
    square = g
    at.set(a.painting, g)
  } else if (cut) {
    /** The square `u` of the way through the cut. */
    const squareAt = (u: number) => {
      const g = mixGeometry(from, to, u)
      // Between two whole paintings, the square stays larger than the panel.
      const side =
        a.window || b.window
          ? g.side
          : Math.max(g.side, coverReach(panel.size, g.cx, g.cy) * 2)
      return { cx: g.cx, cy: g.cy, side }
    }
    square = squareAt(e)
    at.set(a.painting, pushed(from, cut.out.anchor, Math.pow(cut.out.push, e)))
    let [start, end] = cut.fade
    if (cut.in === "square") {
      // The detail waits where it lands and dissolves in once the closing
      // square sits inside it.
      const inside = coveredFrom(
        to,
        paintings[b.painting],
        panel.size,
        squareAt,
      )
      start = Math.max(start, inside)
      end = Math.min(1, Math.max(end, start + 0.1))
    }
    at.set(
      b.painting,
      cut.in === "square"
        ? to
        : pushed(to, cut.in.anchor, Math.pow(cut.in.push, 1 - e)),
    )
    const fade = smoothstep(start, end, e)
    const incoming = keys.indexOf(b.painting)
    const outgoing = keys.indexOf(a.painting)
    if (alphas[incoming] === 1) {
      // Already opaque under it: the outgoing painting fades out to show it.
      alphas[outgoing] = lerp(1, GHOST, fade)
    } else {
      // Over it: the incoming painting fades in; once it is opaque, the
      // outgoing one fades to a ghost, unless it is the bottom painting.
      const gone = end < 1 ? smoothstep(end, 1, e) : +(e >= 1)
      alphas[incoming] = Math.max(alphas[incoming]!, fade)
      if (outgoing > 0) alphas[outgoing] = lerp(1, GHOST, gone)
    }
  } else {
    // Under the portraits: the change happens while nothing shows it, and
    // gradually, as everything else here does. WebKit stalls when many large
    // layers change at once.
    const g = mixGeometry(from, to, e)
    square = g
    const outgoing = home(a.painting)
    at.set(a.painting, {
      x: lerp(from.x, outgoing.x, e),
      y: lerp(from.y, outgoing.y, e),
      scale: from.scale * Math.pow(outgoing.scale / from.scale, e),
    })
    at.set(b.painting, to)
    const after = rest(b.painting)
    alphas = alphas.map((value, order) => lerp(value, after[order]!, e))
  }

  // The shutters frame the square, and only ever slide; past the panel's
  // edges they are simply out of sight.
  const { w, h } = panel.size
  const left = square.cx - square.side / 2
  const right = square.cx + square.side / 2
  const top = square.cy - square.side / 2
  const bottom = square.cy + square.side / 2
  frame["shutter:top"] = { x: 0, y: top - h - 1, s: 1 }
  frame["shutter:right"] = { x: right + 1, y: 0, s: 1 }
  frame["shutter:bottom"] = { x: 0, y: bottom + 1, s: 1 }
  frame["shutter:left"] = { x: left - w - 1, y: 0, s: 1 }
  keys.forEach((key, order) => {
    const placement = at.get(key)!
    frame[`painting:${key}`] = {
      opacity: alphas[order]!,
      x: placement.x,
      y: placement.y,
      s: placement.scale,
    }
  })

  for (let person = 0; person < script.people; person++) {
    frame[`half:${person}`] = { opacity: colours }
    frame[`comma:${person}`] = { opacity: photographs }
  }
  frame.panel = { opacity }
}

/**
 * From how far through a cut a painting placed at `at` covers what the
 * square shows of the panel, to the end: 1 if only at the end.
 */
function coveredFrom(
  at: Placement,
  image: Size,
  panel: Size,
  squareAt: (u: number) => Pick<Geometry, "cx" | "cy" | "side">,
) {
  const e = 0.01
  let from = 1
  for (let n = 64; n >= 0; n--) {
    const u = n / 64
    const { cx, cy, side } = squareAt(u)
    const covered =
      at.x <= Math.max(0, cx - side / 2) + e &&
      at.y <= Math.max(0, cy - side / 2) + e &&
      at.x + image.w * at.scale >= Math.min(panel.w, cx + side / 2) - e &&
      at.y + image.h * at.scale >= Math.min(panel.h, cy + side / 2) - e
    if (!covered) break
    from = u
  }
  return from
}

/** Hermite smoothstep from `edge0` to `edge1`. */
function smoothstep(edge0: number, edge1: number, x: number) {
  const u = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return u * u * (3 - 2 * u)
}
