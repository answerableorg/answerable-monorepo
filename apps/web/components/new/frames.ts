import type { Note } from "@/components/new/notes"
import type { Cut, PaintingKey, PanelState } from "@/components/new/scenes"
import { sheetPlan, type SheetPlan } from "@/components/new/sheet"
import {
  clamp,
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
  type Lattice,
  type Placement,
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
 * - `panel` the pictures in the image panel; `painting:<key>` each painting;
 *   `shutter:<side>` the four white shutters that frame the picture, and
 *   `rule:<side>` its four edges continued across the lattice;
 *   `half:<n>` a person's white half and `comma:<n>` their photograph.
 * - `strip:<scene>` a scene's words in the title strip; `keyplan` the key
 *   plan beside them and `keyplan:window` the square on it.
 */
export type Frame = Record<string, Style>

/**
 * The four white shutters round the picture, each the panel's size and a
 * pixel more on every side, so no edge of the panel ever shows between them;
 * and the four rules, one along each of the picture's edges.
 */
export const SHUTTERS = ["top", "right", "bottom", "left"] as const

/**
 * The opacity of a painting above the one on show: a fifth of a percent,
 * under half a level of an 8-bit colour, so never seen. Not 0: WebKit lets go
 * of a layer left fully transparent and stalls when it shows again (40 to
 * 60 ms, measured on the second time round the page).
 */
export const GHOST = 0.002
/**
 * A change rests still for this share of the scroll at either end, everything
 * in it: within an eighth of a stride of a snap point the page shows the
 * scene, whole. A phone can rest that far from where its page has snapped (a
 * toolbar that hides is about that tall), and a browser that plays some of
 * the page's animations from one of the two positions and some from the
 * other then still draws one scene.
 */
export const REST = 1 / 8
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
  /** What the sheet points out in the paintings. */
  notes: readonly Note[]
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
  panel: {
    size: Size
    column: boolean
    /** The frame's distance from the panel's edges. */
    margin: number
    /** The device's pixels per CSS pixel: the lattice's lines sit on them. */
    ratio: number
  } | null
}

type Panel = NonNullable<Layout["panel"]>

const sheets = new WeakMap<Panel, SheetPlan>()

/** A measured panel's sheet (`sheet.ts`), worked out once. */
export function sheetOf(script: Script, panel: Panel): SheetPlan {
  let sheet = sheets.get(panel)
  if (!sheet) {
    sheet = sheetPlan(panel, script)
    sheets.set(panel, sheet)
  }
  return sheet
}

/** A measured panel's lattice. */
export function latticeOf(script: Script, panel: Panel): Lattice {
  return sheetOf(script, panel).lattice
}

/**
 * The share of its own width, and of its own height, an element is laid out
 * at.
 */
export type Fit = { x: number; y: number }

const fits = new WeakMap<Panel, Record<PaintingKey, Fit>>()

/**
 * How large each painting is laid out on a measured panel, as shares of its
 * own size: the largest the page ever draws it there, each side taken up to a
 * whole pixel. Its element is then as large as its picture gets and under a
 * pixel larger, and its transform's scale is divided by the same shares (`css`
 * in timeline.ts), so a frame's `s` still takes the painting's own pixels to
 * the screen.
 *
 * At its own size a painting is a layer thousands of pixels each way that the
 * browser scales down. WebKit paints so large a layer in tiles as it pans, on
 * the main thread, and the further the pan the more it paints: on a phone's
 * screen the values' longest pans gave frames of up to 123 ms. Laid out as
 * large as shown, 214 of 220 scrolls between values kept every frame under
 * 25 ms.
 *
 * Whole pixels, and a picture that fills them, because Chromium draws an
 * image into its box's whole pixels: in a box 2658.462 px wide the studio sat
 * up to 0.37 px from its place on a value, and in one of 2,659 px within
 * 0.08 px, as at its own size.
 *
 * A change scales a painting one way from one scene to the next, so its
 * largest scale is at a scene.
 */
export function fitOf(script: Script, panel: Panel): Record<PaintingKey, Fit> {
  let fit = fits.get(panel)
  if (!fit) {
    const keys = Object.keys(script.paintings) as PaintingKey[]
    const largest = new Map(keys.map((key) => [key, 0]))
    if (panel.size.w > 0 && panel.size.h > 0) {
      for (let scene = 0; scene < script.sceneCount; scene++) {
        const frame: Frame = {}
        panelFrame(frame, script, panel, scene, 0, false)
        for (const key of keys) {
          const scale = frame[`painting:${key}`]!.s!
          if (scale > largest.get(key)!) largest.set(key, scale)
        }
      }
    }
    fit = Object.fromEntries(
      keys.map((key) => {
        const size = script.paintings[key]
        const scale = largest.get(key)!
        // A panel without a size draws nothing: every painting at its own size.
        return [
          key,
          scale > 0
            ? {
                x: Math.ceil(size.w * scale) / size.w,
                y: Math.ceil(size.h * scale) / size.h,
              }
            : { x: 1, y: 1 },
        ]
      }),
    ) as Record<PaintingKey, Fit>
    fits.set(panel, fit)
  }
  return fit
}

/**
 * Where in a change the title strip changes its words: the old ones go just
 * before halfway and the new ones come just after, so the two are never read
 * at once. In the change's own time, between its rests: a third to a half is
 * 12/32 to 16/32 of the scroll, on samples of the timeline.
 */
const WORDS_OUT = [1 / 3, 1 / 2] as const
const WORDS_IN = [1 / 2, 2 / 3] as const
/** From 0 to 1 between two points, in a straight line. */
const ramp = (from: number, to: number, x: number) =>
  clamp((x - from) / (to - from), 0, 1)

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
  // Still at either end; the change plays in between.
  const moved = clamp((t - REST) / (1 - 2 * REST), 0, 1)
  const progress = segment + moved
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
    panelFrame(frame, script, layout.panel, segment, moved, reduced)
  }
  return frame
}

/**
 * How far the change from scene `segment` to the next carries a painting on
 * show across the panel, in pixels: the most that the point of a painting
 * under the panel's middle moves. A painting off show at both ends does not
 * count, as it waits at one pace, which straight lines draw exactly; nor does
 * any with reduced motion, which never glides.
 */
export function travelAt(
  script: Script,
  layout: Layout,
  segment: number,
): number {
  const { panel } = layout
  if (!panel || layout.reduced) return 0
  const from = frameAt(script, layout, segment, 0)
  const to = frameAt(script, layout, segment, 1)
  const cx = panel.size.w / 2
  const cy = panel.size.h / 2
  let travel = 0
  for (const key of Object.keys(script.paintings)) {
    const a = from[`painting:${key}`]!
    const b = to[`painting:${key}`]!
    if (Math.max(a.opacity!, b.opacity!) < 0.5) continue
    // The painting's own point under the middle, and where it ends up.
    const px = (cx - a.x!) / a.s!
    const py = (cy - a.y!) / a.s!
    travel = Math.max(
      travel,
      Math.hypot(b.x! + b.s! * px - cx, b.y! + b.s! * py - cy),
    )
  }
  return travel
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
 * The image panel: a painting whole, cropped by the lattice, or seen through
 * the logo's square on white, and the two portraits. Each painting has one
 * transform and an opacity; four white shutters slide to frame the picture,
 * whose edges always rest on lines of the lattice. Nothing is clipped or
 * rescaled but the paintings themselves, and a painting never shows its
 * edge: while visible it covers the picture it is seen through.
 */
function panelFrame(
  frame: Frame,
  script: Script,
  panel: Panel,
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
  const step = scrub(f)
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
  const lat = latticeOf(script, panel)
  /** A state's geometry: the square on its detail, or the whole painting. */
  const view = (state: PanelState) => {
    const image = paintings[state.painting]
    return state.window
      ? windowGeometry(panel.size, image, state.window, layout, lat)
      : openGeometry(image, layout, lat)
  }
  const from = view(a)
  const to = view(b)
  /**
   * Where a painting off show waits. It leaves where it last showed for where
   * it next shows at one pace, over every scene between: a large painting
   * that travels fast costs WebKit frames, seen or not.
   */
  const waiting = (key: PaintingKey): Placement => {
    const state = (scene: number) =>
      states[((scene % sceneCount) + sceneCount) % sceneCount]!
    let ahead = 1
    while (ahead <= sceneCount && state(index + ahead).painting !== key) ahead++
    if (ahead > sceneCount) return { x: 0, y: 0, scale: 1 }
    let back = 0
    while (state(index - back).painting !== key) back++
    const here = view(state(index - back))
    const there = view(state(index + ahead))
    // Off show from the scene after its last to the scene before its next.
    const scenes = ahead + back - 2
    if (scenes <= 0) return there
    const u = clamp((back - 1 + f) / scenes, 0, 1)
    return {
      x: lerp(here.x, there.x, u),
      y: lerp(here.y, there.y, u),
      scale: here.scale * Math.pow(there.scale / here.scale, u),
    }
  }

  const keys = Object.keys(paintings) as PaintingKey[]
  /**
   * Each painting's opacity with `key` on show: it, and the painting at the
   * bottom (which never goes transparent), opaque; the rest ghosts. Only one
   * large painting ever changes opacity at a time: WebKit stalls when two do.
   */
  const rest = (key: PaintingKey) =>
    keys.map((other, order) => (other === key || order === 0 ? 1 : GHOST))

  let picture: Picture
  // Each painting's placement and opacity.
  const at = new Map<PaintingKey, Placement>(
    keys.map((key) => [key, waiting(key)]),
  )
  let alphas: number[] = [...rest(a.painting)]
  if (a.painting === b.painting) {
    const g = mixGeometry(from, to, e)
    picture = g
    at.set(a.painting, g)
  } else if (cut) {
    /** The picture `u` of the way through the cut. */
    const pictureAt = (u: number): Picture => mixGeometry(from, to, u)
    picture = pictureAt(e)
    at.set(a.painting, pushed(from, cut.out.anchor, Math.pow(cut.out.push, e)))
    let [start, end] = cut.fade
    if (cut.in === "square") {
      // The detail waits where it lands and dissolves in once the closing
      // picture sits inside it.
      const inside = coveredFrom(to, paintings[b.painting], pictureAt)
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
    // Under the portraits: the outgoing painting fades where it is, while
    // nothing shows it, and gradually, as everything else here does. WebKit
    // stalls when many large layers change at once.
    picture = mixGeometry(from, to, e)
    at.set(a.painting, from)
    at.set(b.painting, to)
    const after = rest(b.painting)
    alphas = alphas.map((value, order) => lerp(value, after[order]!, e))
  }

  // The shutters frame the picture, and only ever slide; each rule lies
  // along one of its edges, across the lattice.
  const { w, h } = panel.size
  const left = picture.cx - picture.w / 2
  const right = picture.cx + picture.w / 2
  const top = picture.cy - picture.h / 2
  const bottom = picture.cy + picture.h / 2
  frame["shutter:top"] = { x: 0, y: top - h - 1, s: 1 }
  frame["shutter:right"] = { x: right + 1, y: 0, s: 1 }
  frame["shutter:bottom"] = { x: 0, y: bottom + 1, s: 1 }
  frame["shutter:left"] = { x: left - w - 1, y: 0, s: 1 }
  frame["rule:top"] = { x: 0, y: top, s: 1 }
  frame["rule:right"] = { x: right, y: 0, s: 1 }
  frame["rule:bottom"] = { x: 0, y: bottom, s: 1 }
  frame["rule:left"] = { x: left, y: 0, s: 1 }
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

  // The title strip: this scene's words, then the next one's.
  const going = 1 - ramp(WORDS_OUT[0], WORDS_OUT[1], t)
  const coming = ramp(WORDS_IN[0], WORDS_IN[1], t)
  for (let scene = 0; scene < sceneCount; scene++) {
    frame[`strip:${scene}`] = {
      opacity: scene === index ? going : scene === next ? coming : 0,
    }
  }
  // The key plan, while the squares are on its painting: its square glides
  // from one detail to the next as the picture does, and waits on the
  // nearest detail while the plan is away.
  const { keyplan } = sheetOf(script, panel).strip
  if (keyplan) {
    const squares = keyplan.windows
    const near = (scene: number) => {
      for (let back = scene; back >= 0; back--) {
        const square = squares[back]
        if (square) return square
      }
      return squares.find((square) => square)!
    }
    const here = squares[index]
    const there = squares[next]
    const start = near(index)
    const end = near(next)
    frame.keyplan = {
      opacity: here && there ? 1 : here ? going : there ? coming : 0,
    }
    frame["keyplan:window"] = {
      x: lerp(start.x, end.x, e) - keyplan.cell.x,
      y: lerp(start.y, end.y, e) - keyplan.cell.y,
      s: lerp(start.w, end.w, e) / near(0).w,
    }
  }
}

/** The picture the shutters frame: a rectangle, by its centre. */
type Picture = Pick<Geometry, "cx" | "cy" | "w" | "h">

/**
 * From how far through a cut a painting placed at `at` covers the picture,
 * to the end: 1 if only at the end.
 */
function coveredFrom(
  at: Placement,
  image: Size,
  pictureAt: (u: number) => Picture,
) {
  const e = 0.01
  let from = 1
  for (let n = 64; n >= 0; n--) {
    const u = n / 64
    const { cx, cy, w, h } = pictureAt(u)
    const covered =
      at.x <= cx - w / 2 + e &&
      at.y <= cy - h / 2 + e &&
      at.x + image.w * at.scale >= cx + w / 2 - e &&
      at.y + image.h * at.scale >= cy + h / 2 - e
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
