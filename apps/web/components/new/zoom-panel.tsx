"use client"

import Image from "next/image"
import {
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
} from "react"

import { GridFrame } from "@/components/new/grid-frame"
import {
  HERO,
  PANEL_STATES,
  PEOPLE,
  SCENE_COUNT,
  WINDOW_LAYOUTS,
  type Person,
} from "@/components/new/scenes"
import {
  clamp,
  COMMA,
  lerp,
  mixGeometry,
  openGeometry,
  scrub,
  windowBoxes,
  windowGeometry,
  type Point,
  type Size,
} from "@/lib/stage-math"
import { COMMA_PATH, COMMA_VIEW_BOX } from "@answerable/ui/lib/logo"
import { cn } from "@answerable/ui/lib/utils"

export type ZoomPanelHandle = {
  /** Draws the panel at a stage progress; `reduced` cuts instead of moving. */
  render: (progress: number, reduced: boolean) => void
}

/** Pixels per comma unit inside the two clip boxes, before their scale. */
const LOCAL = 5
/** Comma units the band reaches up under the head, so the two never part. */
const OVERLAP = 1
const HEAD_BOX = {
  width: COMMA.head.w * LOCAL,
  height: COMMA.head.h * LOCAL,
}
const BAND_BOX = {
  width: COMMA.band.w * LOCAL,
  height: (COMMA.band.h + OVERLAP) * LOCAL,
}
const BAND_VIEW_BOX = `0 ${-OVERLAP} ${COMMA.band.w} ${COMMA.band.h + OVERLAP}`
/**
 * The band starts left of the head (the tail's foot reaches 0.21 further) and
 * rises under it by the overlap: this covers the sliver of that rise left of
 * the head. It runs past the band's top and under the head, so none of its
 * edges meets another one.
 */
const OVERLAP_COVER = `M-2 ${-OVERLAP - 2}H${(COMMA.head.x - COMMA.band.x + 1).toFixed(3)}V0.5H-2Z`

/** The comma as a mask, as the logo has it or turned over (tail up). */
function commaMask(turned: boolean): CSSProperties {
  const [x, y, w, h] = COMMA_VIEW_BOX.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ]
  const turn = turned
    ? ` transform="rotate(180 ${x + w / 2} ${y + h / 2})"`
    : ""
  return {
    maskImage: `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${COMMA_VIEW_BOX}"><path d="${COMMA_PATH}"${turn}/></svg>`,
    )}")`,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
  }
}
const COMMA_MASKS = [commaMask(false), commaMask(true)] as const
/** The head's share of the comma's height. */
const HEAD_SHARE = COMMA.head.h / (COMMA.head.h + COMMA.band.h)

/** The `cols` variant in globals.css: the column beside the copy, else the band. */
const COLUMN_QUERY =
  "(min-width: 64rem), (min-width: 40rem) and (min-aspect-ratio: 4/3)"

/** A transition rests still for this share of the scroll at either end. */
const REST = 0.02

/**
 * The image panel: the hero illustration seen through the logo's square or
 * comma on a colour field, the Answerable AP badge, and the two portraits.
 * The stage calls `render` with the scroll's progress; before that it is the
 * plain picture, as without JS.
 *
 * Every frame is compositor work only. The window is two rectangle clips that
 * move by `transform`: the head, and under it the band that holds the tail,
 * whose curve two static shapes in the field's colour carve out. Each clip
 * holds the same picture, moved by `transform` too, so the browser samples
 * one decoded image and paints nothing. The field changes colour by fading
 * one solid layer over another. A square is the comma with its tail slid up
 * under the head, so the two shapes turn into each other.
 */
/** The panel's elements, set by their refs, and what it remembers between frames. */
type Parts = {
  root: HTMLDivElement | null
  fields: (HTMLDivElement | null)[]
  head: HTMLDivElement | null
  headImage: HTMLImageElement | null
  band: HTMLDivElement | null
  bandImage: HTMLImageElement | null
  covers: (SVGSVGElement | null)[]
  badge: HTMLDivElement | null
  halves: (HTMLDivElement | null)[]
  size: Size
  column: boolean
  margin: number
  last: null | [number, boolean]
  segment: number
  written: WeakMap<Element, Record<string, string>>
}

function createParts(): Parts {
  return {
    root: null,
    fields: [],
    head: null,
    headImage: null,
    band: null,
    bandImage: null,
    covers: [],
    badge: null,
    halves: [],
    size: { w: 0, h: 0 },
    column: true,
    margin: 24,
    last: null,
    segment: -1,
    written: new WeakMap(),
  }
}

/** Sets a style only when it changes: most frames move two or three things. */
function write(
  parts: Parts,
  element: HTMLElement | SVGElement | null | undefined,
  key: string,
  value: string,
) {
  if (!element) return
  let values = parts.written.get(element)
  if (!values) parts.written.set(element, (values = {}))
  if (values[key] === value) return
  values[key] = value
  element.style.setProperty(key, value)
}

function measurePanel(parts: Parts) {
  const { root, head, badge } = parts
  if (!root || !head) return
  parts.size = { w: root.clientWidth, h: root.clientHeight }
  parts.column = window.matchMedia(COLUMN_QUERY).matches
  // The badge sits at the panel's inset; the windows keep the same.
  if (badge) parts.margin = badge.offsetLeft
  // From here the picture is placed by transform, at its own size, inside
  // two clip boxes that are placed by transform too.
  Object.assign(head.style, {
    inset: "auto",
    left: "0",
    top: "0",
    width: `${HEAD_BOX.width}px`,
    height: `${HEAD_BOX.height}px`,
    transformOrigin: "0 0",
    willChange: "transform",
  })
  for (const image of [parts.headImage, parts.bandImage]) {
    if (!image) continue
    Object.assign(image.style, {
      inset: "auto",
      left: "0",
      top: "0",
      width: `${HERO.size.w}px`,
      height: `${HERO.size.h}px`,
      transformOrigin: "0 0",
      willChange: "transform",
    })
  }
  parts.written = new WeakMap()
  parts.segment = -1
}

function renderPanel(parts: Parts, progress: number, reduced: boolean) {
  parts.last = [progress, reduced]
  const { root } = parts
  if (!root || !parts.size.w) return
  const set = (
    element: HTMLElement | SVGElement | null | undefined,
    key: string,
    value: string,
  ) => write(parts, element, key, value)

  const q = ((progress % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT
  const index = Math.floor(q)
  let f = q - index
  // Reduced motion: no camera, the nearest state, crossfaded through white.
  let opacity = 1
  if (reduced) {
    opacity = clamp(Math.abs(f - 0.5) * 2.5, 0, 1)
    f = f < 0.5 ? 0 : 1
  }
  const a = PANEL_STATES[index]!
  const b = PANEL_STATES[(index + 1) % SCENE_COUNT]!
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
  const e = arriving ? clamp(step * 2 - 1, 0, 1) : step

  const layout = parts.column ? WINDOW_LAYOUTS.column : WINDOW_LAYOUTS.band
  const centre: Point = [HERO.size.w / 2, HERO.size.h / 2]
  const from = a.window
    ? windowGeometry(parts.size, HERO.size, a.window, layout, parts.margin)
    : openGeometry(
        parts.size,
        HERO.size,
        b.window?.focus ?? centre,
        b.window?.shape ?? "square",
        layout,
      )
  const to = b.window
    ? windowGeometry(parts.size, HERO.size, b.window, layout, parts.margin)
    : openGeometry(
        parts.size,
        HERO.size,
        a.window?.focus ?? centre,
        a.window?.shape ?? "square",
        layout,
      )
  const g = mixGeometry(from, to, e)
  const { unit, head, band } = windowBoxes(g, OVERLAP)
  const k = unit / LOCAL
  const place = (x: number, y: number, scale: number) =>
    `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(5)})`

  set(parts.head, "transform", place(head.x, head.y, k))
  set(
    parts.headImage,
    "transform",
    place((g.x - head.x) / k, (g.y - head.y) / k, g.scale / k),
  )
  // The band only exists while there is a tail inside the panel.
  const bandBottom = band.y + BAND_BOX.height * k
  const showBand = g.tail > 0.001 && band.y < parts.size.h && bandBottom > 0
  set(parts.band, "visibility", showBand ? "visible" : "hidden")
  if (showBand) {
    set(parts.band, "transform", place(band.x, band.y, k))
    set(
      parts.bandImage,
      "transform",
      place((g.x - band.x) / k, (g.y - band.y) / k, g.scale / k),
    )
  }

  // The field: the segment's two colours, the second fading in.
  const fieldA = a.field ?? b.field ?? "#fff"
  const fieldB = b.field ?? a.field ?? "#fff"
  if (parts.segment !== index) {
    parts.segment = index
    set(parts.fields[0], "background-color", fieldA)
    set(parts.fields[1], "background-color", fieldB)
    set(parts.covers[0], "fill", fieldA)
    set(parts.covers[1], "fill", fieldB)
  }
  const blend = fieldA === fieldB ? "0" : e.toFixed(3)
  set(parts.fields[1], "opacity", blend)
  set(parts.covers[1], "opacity", blend)

  set(parts.badge, "opacity", lerp(+a.badge, +b.badge, e).toFixed(3))

  for (const half of parts.halves) {
    set(half, "opacity", colours.toFixed(3))
    set(half, "visibility", colours > 0 ? "visible" : "hidden")
    const comma = half?.firstElementChild as HTMLElement | null
    set(comma, "opacity", photographs.toFixed(3))
  }

  set(root, "opacity", opacity === 1 ? "1" : opacity.toFixed(3))
}

export function ZoomPanel({ ref }: { ref: Ref<ZoomPanelHandle> }) {
  const partsRef = useRef<Parts>(createParts())

  useImperativeHandle(
    ref,
    () => ({
      render: (progress, reduced) =>
        renderPanel(partsRef.current, progress, reduced),
    }),
    [],
  )

  useEffect(() => {
    const parts = partsRef.current
    const root = parts.root
    if (!root) return
    const observer = new ResizeObserver(() => {
      measurePanel(parts)
      if (parts.last) renderPanel(parts, ...parts.last)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const imageClass =
    "absolute inset-0 size-full max-w-none object-cover object-[50%_36%] cols:object-center"

  return (
    <div
      ref={(element) => {
        partsRef.current.root = element
      }}
      className="@container absolute inset-0 overflow-hidden bg-white"
    >
      {/* The field: two solid layers, the upper fading in between colours. */}
      {[0, 1].map((layer) => (
        <div
          key={layer}
          ref={(element) => {
            partsRef.current.fields[layer] = element
          }}
          aria-hidden="true"
          className={cn(
            "absolute inset-0",
            layer === 1 && "opacity-0 will-change-[opacity]",
          )}
        />
      ))}

      {/* The band under the head: the tail, its curve carved by the covers.
          Before the head, so the head paints over the part they share. The
          picture is clipped inside the band and the covers run past that
          clip: were both cut at one edge, the picture would show through
          their two soft edges as a hairline. */}
      <div
        ref={(element) => {
          partsRef.current.band = element
        }}
        aria-hidden="true"
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{
          width: BAND_BOX.width,
          height: BAND_BOX.height,
          visibility: "hidden",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <Image
            ref={(element) => {
              partsRef.current.bandImage = element
            }}
            src={HERO.image}
            alt=""
            sizes="1086px"
            quality={85}
            loading="eager"
            className={imageClass}
          />
        </div>
        {[0, 1].map((layer) => (
          <svg
            key={layer}
            ref={(element) => {
              partsRef.current.covers[layer] = element
            }}
            viewBox={BAND_VIEW_BOX}
            preserveAspectRatio="none"
            className={cn(
              "absolute inset-0 size-full overflow-visible",
              layer === 1 && "opacity-0 will-change-[opacity]",
            )}
          >
            <path d={COMMA.covers} />
            <path d={OVERLAP_COVER} />
          </svg>
        ))}
      </div>

      {/* The head: the whole picture until the stage takes over. */}
      <div
        ref={(element) => {
          partsRef.current.head = element
        }}
        className="absolute inset-0 overflow-hidden"
      >
        <Image
          ref={(element) => {
            partsRef.current.headImage = element
          }}
          src={HERO.image}
          alt={HERO.alt}
          sizes="1086px"
          quality={85}
          placeholder="blur"
          loading="eager"
          fetchPriority="high"
          className={imageClass}
        />
      </div>

      <div
        ref={(element) => {
          partsRef.current.badge = element
        }}
        aria-hidden="true"
        className="absolute font-bold tracking-[-0.01em] text-black"
        style={{
          top: "var(--inset, 5cqw)",
          left: "var(--inset, 5cqw)",
          fontSize: "clamp(13px, 2.6cqw, 22px)",
          lineHeight: 1.15,
        }}
      >
        <GridFrame>Answerable AP</GridFrame>
      </div>

      {/* A pixel past the panel's clip on every side: at a fractional edge
          the halves' layers round short and the picture shows as a line. */}
      <div className="cols:grid-cols-1 cols:grid-rows-2 pointer-events-none absolute -inset-px grid grid-cols-2">
        {PEOPLE.map((person, index) => (
          <Portrait
            key={person.name}
            ref={(element) => {
              partsRef.current.halves[index] = element
            }}
            person={person}
            index={index}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One person on their own colour, in the logo's comma: the photograph in its
 * head, the tail in the photograph's own edge tone. Keir's comma is turned
 * over and Sadie's is not, so the pair reads as quote marks. The band puts
 * the two side by side, the commas centred; the column one above the other,
 * the opening one on the panel's left inset and the closing one on its right.
 */
function Portrait({
  ref,
  person,
  index,
}: {
  ref: Ref<HTMLDivElement>
  person: Person
  index: number
}) {
  const { turned, frame, tail } = person
  return (
    <div
      ref={ref}
      className="[container-type:size] relative overflow-hidden will-change-[opacity]"
      style={{
        backgroundColor: person.colour,
        opacity: 0,
        visibility: "hidden",
      }}
    >
      <div
        className={cn(
          "absolute top-1/2 left-1/2 aspect-[48.21/72.002] h-[min(80cqh,calc(62cqw*1.4935))] -translate-x-1/2 -translate-y-1/2 will-change-[opacity]",
          index === 0
            ? "cols:left-[var(--inset)] cols:translate-x-0"
            : "cols:right-[var(--inset)] cols:left-auto cols:translate-x-0",
        )}
        style={{ ...COMMA_MASKS[turned ? 1 : 0], backgroundColor: tail.tone }}
      >
        <div
          className={cn(
            "absolute inset-x-0 overflow-hidden",
            turned ? "bottom-0" : "top-0",
          )}
          style={{ height: `${(HEAD_SHARE * 100).toFixed(3)}%` }}
        >
          <Image
            src={person.portrait}
            alt={`Portrait of ${person.name}`}
            fill
            sizes="(min-width: 64rem) 25vw, 50vw"
            quality={85}
            className="object-cover"
            style={{
              transform: `translate(${frame.x}%, ${frame.y}%) scale(${frame.scale})`,
            }}
          />
          {tail.fade && (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: `linear-gradient(${turned ? "to bottom" : "to top"}, ${tail.tone}, transparent 12%)`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
