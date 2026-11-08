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
  coversPanel,
  lerp,
  mixGeometry,
  openGeometry,
  parsePath,
  placePath,
  smootherstep,
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

const COMMA = parsePath(COMMA_PATH)
/** The comma's head in the logo's coordinates: a 48-unit square round this point. */
const COMMA_HEAD: Point = [1128, 239.92]
const COMMA_UNIT = 48

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
 * The image panel: the hero illustration, a colour field with a comma-shaped
 * window onto one detail of it, the Answerable AP badge, and the two
 * portraits. It draws nothing on its own; the stage calls `render` with the
 * scroll's progress. Before that it is the plain picture, as without JS.
 */
export function ZoomPanel({ ref }: { ref: Ref<ZoomPanelHandle> }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const halvesRef = useRef<(HTMLDivElement | null)[]>([])
  const state = useRef({
    size: { w: 0, h: 0 } as Size,
    column: true,
    badge: [0, 0] as Point,
    last: null as null | [number, boolean],
    field: "",
    clip: "",
  })

  useImperativeHandle(ref, () => ({ render }), [])

  function measure() {
    const root = rootRef.current
    const image = imageRef.current
    const badge = badgeRef.current
    if (!root || !image) return
    const s = state.current
    s.size = { w: root.clientWidth, h: root.clientHeight }
    s.column = window.matchMedia(COLUMN_QUERY).matches
    if (badge) {
      s.badge = [
        badge.offsetLeft + badge.offsetWidth / 2,
        badge.offsetTop + badge.offsetHeight / 2,
      ]
    }
    // From here the picture is placed by transform, at its own size.
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

  function render(progress: number, reduced: boolean) {
    const s = state.current
    s.last = [progress, reduced]
    const root = rootRef.current
    const image = imageRef.current
    const frame = windowRef.current
    if (!root || !image || !frame || !s.size.w) return

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

    const layout = s.column ? WINDOW_LAYOUTS.column : WINDOW_LAYOUTS.band
    const centre: Point = [HERO.size.w / 2, HERO.size.h / 2]
    const from = a.window
      ? windowGeometry(s.size, HERO.size, a.window, layout)
      : openGeometry(s.size, HERO.size, b.window?.focus ?? centre, layout)
    const to = b.window
      ? windowGeometry(s.size, HERO.size, b.window, layout)
      : openGeometry(s.size, HERO.size, a.window?.focus ?? centre, layout)
    const g = mixGeometry(from, to, e)

    image.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) scale(${g.scale})`
    const clip = coversPanel(g, s.size)
      ? "none"
      : `path("${placePath(COMMA, COMMA_HEAD, COMMA_UNIT, g.cx, g.cy, g.head)}")`
    if (clip !== s.clip) frame.style.clipPath = s.clip = clip

    const fieldA = a.field ?? b.field
    const fieldB = b.field ?? a.field
    const field =
      fieldA && fieldB
        ? fieldA === fieldB || e <= 0 || e >= 1
          ? e >= 1
            ? fieldB
            : fieldA
          : `color-mix(in oklab, ${fieldA} ${((1 - e) * 100).toFixed(1)}%, ${fieldB})`
        : "#fff"
    if (field !== s.field) root.style.backgroundColor = s.field = field

    const badge = badgeRef.current
    if (badge) {
      badge.style.opacity = String(lerp(+a.badge, +b.badge, e))
      const half = g.head / 2
      const onPicture =
        Math.abs(s.badge[0] - g.cx) < half && Math.abs(s.badge[1] - g.cy) < half
      badge.toggleAttribute("data-on-field", !onPicture)
    }

    // The portraits rise as one sheet and leave upwards; their windows lag a
    // little behind the sheet, for depth.
    const y =
      a.team && b.team ? 0 : b.team ? (1 - e) * 100 : a.team ? -e * 100 : 100
    halvesRef.current.forEach((half) => {
      if (!half) return
      half.style.transform = `translate3d(0, ${y}%, 0)`
      half.style.visibility = Math.abs(y) >= 100 ? "hidden" : ""
      // `transform`, not `translate`, which centres the window already.
      const comma = half.firstElementChild as HTMLElement | null
      if (comma) comma.style.transform = `translate3d(0, ${y * 0.3}%, 0)`
    })

    root.style.opacity = opacity === 1 ? "" : String(opacity)
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(() => {
      measure()
      const last = state.current.last
      if (last) render(...last)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={rootRef}
      className="@container absolute inset-0 overflow-hidden bg-white"
    >
      <div ref={windowRef} className="absolute inset-0">
        <Image
          ref={imageRef}
          src={HERO.image}
          alt={HERO.alt}
          sizes="1086px"
          quality={85}
          placeholder="blur"
          loading="eager"
          fetchPriority="high"
          className="cols:object-center absolute inset-0 size-full max-w-none object-cover object-[50%_36%]"
        />
      </div>

      <div
        ref={badgeRef}
        aria-hidden="true"
        className="absolute top-[5cqw] left-[5cqw] font-bold tracking-[-0.01em] text-black transition-colors duration-300 data-[on-field]:text-white motion-reduce:transition-none"
        style={{ fontSize: "clamp(13px, 2.6cqw, 22px)", lineHeight: 1.15 }}
      >
        <GridFrame>Answerable AP</GridFrame>
      </div>

      <div className="cols:grid-cols-1 cols:grid-rows-2 pointer-events-none absolute inset-0 grid grid-cols-2">
        {PEOPLE.map((person, index) => (
          <Portrait
            key={person.name}
            ref={(element) => {
              halvesRef.current[index] = element
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
 * One person on their own colour, seen through the comma, as the values are.
 * The band puts the two side by side; the column one above the other, the windows
 * staggered left and right.
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
  return (
    <div
      ref={ref}
      className="@container relative overflow-hidden"
      style={{
        backgroundColor: person.colour,
        transform: "translate3d(0, 100%, 0)",
        visibility: "hidden",
      }}
    >
      <div
        className={cn(
          "absolute top-1/2 left-1/2 aspect-[48.21/72.002] h-[74%] -translate-x-1/2 -translate-y-[44%]",
          index === 0 ? "cols:left-[64%]" : "cols:left-[36%]",
        )}
        style={COMMA_MASK}
      >
        {person.portrait ? (
          <Image
            src={person.portrait}
            alt={`Portrait of ${person.name}`}
            fill
            sizes="(min-width: 64rem) 25vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundColor: `color-mix(in oklab, ${person.colour} 55%, white)`,
            }}
          >
            {/* The head is the top two thirds of the comma. */}
            <span
              className="absolute inset-x-0 top-0 grid h-[66.6%] place-items-center font-bold tracking-[-0.02em] text-black"
              style={{ fontSize: "clamp(18px, 9cqh, 40px)" }}
            >
              {person.initials}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
