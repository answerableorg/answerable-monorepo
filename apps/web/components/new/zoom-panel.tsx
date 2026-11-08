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
  smootherstep,
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

const COMMA_MASK: CSSProperties = {
  maskImage: `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${COMMA_VIEW_BOX}"><path d="${COMMA_PATH}"/></svg>`,
  )}")`,
  maskSize: "100% 100%",
  maskRepeat: "no-repeat",
}

/** The `cols` variant in globals.css: the column beside the copy, else the band. */
const COLUMN_QUERY =
  "(min-width: 64rem), (min-width: 40rem) and (min-aspect-ratio: 4/3)"

/** A transition rests still for this share of the scroll at either end. */
const REST = 0.04

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
  badgeAt: Point
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
    badgeAt: [0, 0],
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
  if (badge) {
    // The badge sits at the panel's inset; the windows keep the same.
    parts.margin = badge.offsetLeft
    parts.badgeAt = [
      badge.offsetLeft + badge.offsetWidth / 2,
      badge.offsetTop + badge.offsetHeight / 2,
    ]
  }
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
  const e = smootherstep((f - REST) / (1 - 2 * REST))

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

  const { badge, badgeAt } = parts
  if (badge) {
    set(badge, "opacity", lerp(+a.badge, +b.badge, e).toFixed(3))
    const onPicture =
      badgeAt[0] > head.x &&
      badgeAt[0] < head.x + HEAD_BOX.width * k &&
      badgeAt[1] > head.y &&
      badgeAt[1] < head.y + HEAD_BOX.height * k
    badge.toggleAttribute("data-on-field", !onPicture)
  }

  // The portraits rise as one sheet and leave upwards; their windows lag a
  // little behind the sheet, for depth.
  const y =
    a.team && b.team ? 0 : b.team ? (1 - e) * 100 : a.team ? -e * 100 : 100
  for (const half of parts.halves) {
    if (!half) continue
    set(half, "transform", `translate3d(0, ${y.toFixed(2)}%, 0)`)
    set(half, "visibility", Math.abs(y) >= 100 ? "hidden" : "visible")
    // `transform`, not `translate`, which centres the window already.
    const frame = half.firstElementChild as HTMLElement | null
    set(frame, "transform", `translate3d(0, ${(y * 0.3).toFixed(2)}%, 0)`)
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
          Before the head, so the head paints over the part they share. */}
      <div
        ref={(element) => {
          partsRef.current.band = element
        }}
        aria-hidden="true"
        className="absolute top-0 left-0 origin-top-left overflow-hidden will-change-transform"
        style={{
          width: BAND_BOX.width,
          height: BAND_BOX.height,
          visibility: "hidden",
        }}
      >
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
        className="absolute font-bold tracking-[-0.01em] text-black transition-colors duration-300 data-[on-field]:text-white motion-reduce:transition-none"
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
 * One person on their own colour, seen through the logo's square or comma,
 * as the values are. The band puts the two side by side, the windows
 * centred; the column one above the other, the first window on the panel's
 * right inset and the second on its left.
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
  const square = person.shape === "square"
  return (
    <div
      ref={ref}
      className="[container-type:size] relative overflow-hidden will-change-transform"
      style={{
        backgroundColor: person.colour,
        transform: "translate3d(0, 100%, 0)",
        visibility: "hidden",
      }}
    >
      <div
        className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden",
          // Sized by the half's smaller side: the two heads match.
          square
            ? "aspect-square h-[min(54cqh,62cqw)]"
            : "aspect-[48.21/72.002] h-[min(80cqh,calc(62cqw*1.4935))]",
          index === 0
            ? "cols:right-[var(--inset)] cols:left-auto cols:translate-x-0"
            : "cols:left-[var(--inset)] cols:translate-x-0",
        )}
        style={square ? undefined : COMMA_MASK}
      >
        <Image
          src={person.portrait}
          alt={`Portrait of ${person.name}`}
          fill
          sizes="(min-width: 64rem) 25vw, 50vw"
          quality={85}
          className="object-cover"
          style={{ objectPosition: person.position }}
        />
      </div>
    </div>
  )
}
