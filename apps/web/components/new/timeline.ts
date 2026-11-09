import type { Frame, Style } from "@/components/new/frames"

/**
 * Frames of the stage, sampled into keyframes the browser plays against the
 * scroll. Between two keyframes the browser interpolates in a straight line,
 * so a curve is sampled densely and every keyframe a straight line would
 * reproduce is dropped. A value that jumps at a scene's boundary keeps the
 * jump: two keyframes at one offset.
 */

/**
 * Samples of each scene-to-scene transition, before the straight runs go.
 * With the curves' corners (`KINKS` in frames.ts) sampled too, the picture
 * strays under half a pixel from its exact path, and the whole page needs
 * about 1,900 keyframes. More is not free: WebKit's main thread slowed from
 * about 1,800 keyframes (3,300 gave 80 frames over 20 ms in nine scenes,
 * 1,800 gave none).
 */
export const STEPS = 32

/** One element's samples, in scroll order. */
export type Series = { offsets: number[]; styles: Style[] }

/**
 * How far a dropped keyframe may stray, per property: 1% of opacity, a
 * quarter pixel, and a scale step that moves the picture under half a pixel.
 */
const TOLERANCE = { opacity: 0.01, x: 0.25, y: 0.25, s: 0.0001 } as const
const PROPERTIES = ["opacity", "x", "y", "s"] as const

/**
 * Samples `frameAt` at `steps` even points through each segment, both ends
 * included, and at `extra` points (a jump's two sides, say). `offsetOf` maps
 * a point to its place on the timeline, 0 to 1.
 */
export function sample(
  frameAt: (segment: number, t: number) => Frame,
  segments: number,
  steps: number,
  offsetOf: (segment: number, t: number) => number,
  extra: readonly number[] = [],
): Map<string, Series> {
  const points = [
    ...new Set([
      ...Array.from({ length: steps + 1 }, (_, n) => n / steps),
      ...extra,
    ]),
  ].sort((a, b) => a - b)
  const series = new Map<string, Series>()
  for (let segment = 0; segment < segments; segment++) {
    for (const t of points) {
      const offset = offsetOf(segment, t)
      for (const [key, style] of Object.entries(frameAt(segment, t))) {
        let entry = series.get(key)
        if (!entry) series.set(key, (entry = { offsets: [], styles: [] }))
        const last = entry.styles.length - 1
        // The same moment twice, the end of one segment and the start of the
        // next: keep one, unless the value jumps there.
        if (
          last >= 0 &&
          entry.offsets[last] === offset &&
          same(entry.styles[last]!, style)
        ) {
          continue
        }
        entry.offsets.push(offset)
        entry.styles.push(style)
      }
    }
  }
  return series
}

function same(a: Style, b: Style) {
  return PROPERTIES.every((key) => a[key] === b[key])
}

/**
 * The fewest keyframes that keep every sample within the tolerance of the
 * straight line between kept ones (Douglas–Peucker, per stretch between
 * jumps).
 */
export function simplify(series: Series): Series {
  const { offsets, styles } = series
  const keep = new Set<number>([0, offsets.length - 1])
  // A jump is two samples at one offset: both stay, and no line crosses it.
  let start = 0
  for (let index = 1; index < offsets.length; index++) {
    if (offsets[index] === offsets[index - 1]) {
      keep.add(index - 1)
      keep.add(index)
      reduce(series, start, index - 1, keep)
      start = index
    }
  }
  reduce(series, start, offsets.length - 1, keep)
  const kept = [...keep].sort((a, b) => a - b)
  return {
    offsets: kept.map((index) => offsets[index]!),
    styles: kept.map((index) => styles[index]!),
  }
}

function reduce(series: Series, from: number, to: number, keep: Set<number>) {
  if (to - from < 2) return
  const { offsets, styles } = series
  const a = styles[from]!
  const b = styles[to]!
  const span = offsets[to]! - offsets[from]!
  let worst = 0
  let at = -1
  for (let index = from + 1; index < to; index++) {
    const t = span === 0 ? 0 : (offsets[index]! - offsets[from]!) / span
    const style = styles[index]!
    for (const key of PROPERTIES) {
      const value = style[key]
      if (value === undefined) continue
      const line =
        (a[key] ?? value) + ((b[key] ?? value) - (a[key] ?? value)) * t
      const error = Math.abs(value - line) / TOLERANCE[key]
      if (error > worst) {
        worst = error
        at = index
      }
    }
  }
  if (worst <= 1) return
  keep.add(at)
  reduce(series, from, at, keep)
  reduce(series, at, to, keep)
}

/** A style as CSS: `opacity` and a `transform` the compositor can run. */
export function css(style: Style): { opacity?: string; transform?: string } {
  const out: { opacity?: string; transform?: string } = {}
  if (style.opacity !== undefined) out.opacity = style.opacity.toFixed(4)
  if (style.x !== undefined || style.y !== undefined || style.s !== undefined) {
    out.transform = `translate3d(${(style.x ?? 0).toFixed(2)}px, ${(style.y ?? 0).toFixed(2)}px, 0px) scale(${(style.s ?? 1).toFixed(6)})`
  }
  return out
}

/** Keyframes for `Element.animate`, from a simplified series. */
export function keyframes(series: Series): Keyframe[] {
  return series.offsets.map((offset, index) => ({
    offset,
    ...css(series.styles[index]!),
  }))
}
