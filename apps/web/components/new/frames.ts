import type { PanelState } from "@/components/new/scenes"
import {
  clamp,
  COMMA,
  lerp,
  lineFrame,
  mixGeometry,
  offsetFrom,
  openGeometry,
  rollFrame,
  scrub,
  windowBoxes,
  windowGeometry,
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
 * - `panel` the image panel; `head` and `band` the window's two clips and
 *   `headImage` and `bandImage` the picture in each; `field:<n>` and
 *   `cover:<n>` the colour of field layer n round the window and in its tail;
 *   `badge`; `half:<n>` a person's colour and `comma:<n>` their photograph.
 */
export type Frame = Record<string, Style>

/** Pixels per comma unit inside the two clip boxes, before their scale. */
const LOCAL = 5
/** Comma units the band reaches up under the head, so the two never part. */
export const OVERLAP = 1
export const HEAD_BOX = {
  width: COMMA.head.w * LOCAL,
  height: COMMA.head.h * LOCAL,
}
export const BAND_BOX = {
  width: COMMA.band.w * LOCAL,
  height: (COMMA.band.h + OVERLAP) * LOCAL,
}
/** A panel transition rests still for this share of the scroll at either end. */
const REST = 0.02
/**
 * Where a transition's curve has a corner: the ends of its rest, and the
 * halfway point where the portraits hand over from colour to photograph.
 * Sampling must land on them, or a straight line cuts the corner.
 */
export const KINKS = [REST, 0.5, 1 - REST] as const

/** What the page is made of: the same for every visitor. */
export type Script = {
  sceneCount: number
  /** What the panel shows on each scene. */
  states: readonly PanelState[]
  /** The illustration's size in its own pixels. */
  image: Size
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

/** A solid colour layer behind the window: one per run of scenes in it. */
export type FieldLayer = { colour: string; from: number; to: number }

/**
 * The field's layers, in scene order: neighbouring scenes in one colour
 * share a layer, so a colour that does not change is not faded over itself.
 */
export function fieldLayers(states: readonly PanelState[]): FieldLayer[] {
  const layers: FieldLayer[] = []
  states.forEach(({ field }, index) => {
    if (!field) return
    const last = layers.at(-1)
    if (last && last.to === index - 1 && last.colour === field) last.to = index
    else layers.push({ colour: field, from: index, to: index })
  })
  return layers
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
 * The image panel: the illustration seen through the logo's square or comma
 * on a colour field, the badge, and the two portraits. The window is two
 * rectangle clips moved by transform, each holding the picture, moved by
 * transform too; a square is the comma with its tail slid up under the head.
 */
function panelFrame(
  frame: Frame,
  script: Script,
  panel: NonNullable<Layout["panel"]>,
  segment: number,
  t: number,
  reduced: boolean,
) {
  const { states, sceneCount, image } = script
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
  // The portraits come in two fades, so a face never shows over the
  // picture: arriving, the colours cover the panel in the first half, then
  // the photographs appear on them while the picture behind moves, unseen;
  // leaving, the photographs go first, then the colours over a still picture.
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
  const centre: Point = [image.w / 2, image.h / 2]
  const from = a.window
    ? windowGeometry(panel.size, image, a.window, layout, panel.margin)
    : openGeometry(
        panel.size,
        image,
        b.window?.focus ?? centre,
        b.window?.shape ?? "square",
        layout,
      )
  const to = b.window
    ? windowGeometry(panel.size, image, b.window, layout, panel.margin)
    : openGeometry(
        panel.size,
        image,
        a.window?.focus ?? centre,
        a.window?.shape ?? "square",
        layout,
      )
  const g = mixGeometry(from, to, e)
  const { unit, head, band } = windowBoxes(g, OVERLAP)
  const k = unit / LOCAL

  frame.head = { x: head.x, y: head.y, s: k }
  frame.headImage = {
    x: (g.x - head.x) / k,
    y: (g.y - head.y) / k,
    s: g.scale / k,
  }
  // The band shows only while there is a tail inside the panel.
  const bandBottom = band.y + BAND_BOX.height * k
  const showBand = g.tail > 0.001 && band.y < panel.size.h && bandBottom > 0
  frame.band = { opacity: showBand ? 1 : 0, x: band.x, y: band.y, s: k }
  frame.bandImage = {
    x: (g.x - band.x) / k,
    y: (g.y - band.y) / k,
    s: g.scale / k,
  }

  // The field: a solid layer per run of one colour, the later above the
  // earlier. Arriving at a new colour, its layer fades in over the last
  // one's, or is there at once behind an open picture.
  fieldLayers(states).forEach(({ from, to }, layer) => {
    const here = index >= from && index <= to
    const coming = next >= from && next <= to
    const value = here ? 1 : coming ? (a.field ? e : 1) : 0
    frame[`field:${layer}`] = { opacity: value }
    frame[`cover:${layer}`] = { opacity: value }
  })

  frame.badge = { opacity: lerp(+a.badge, +b.badge, e) }
  for (let person = 0; person < script.people; person++) {
    frame[`half:${person}`] = { opacity: colours }
    frame[`comma:${person}`] = { opacity: photographs }
  }
  frame.panel = { opacity }
}
