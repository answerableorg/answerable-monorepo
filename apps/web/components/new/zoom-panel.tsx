"use client"

import Image from "next/image"
import {
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
} from "react"

import {
  BAND_BOX,
  fieldLayers,
  HEAD_BOX,
  OVERLAP,
  type Layout,
} from "@/components/new/frames"
import { GridFrame } from "@/components/new/grid-frame"
import {
  HERO,
  PANEL_STATES,
  PEOPLE,
  type Person,
} from "@/components/new/scenes"
import { COMMA } from "@/lib/stage-math"
import { COMMA_PATH, COMMA_VIEW_BOX } from "@answerable/ui/lib/logo"
import { cn } from "@answerable/ui/lib/utils"

export type ZoomPanelHandle = {
  /**
   * Measures the panel and readies its parts to be moved by transform; null
   * before it has a size.
   */
  measure: () => Layout["panel"]
  /** The parts the stage's frames move, by key (see `frames.ts`). */
  targets: () => Map<string, HTMLElement | SVGElement>
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

/** One colour layer per scene with a field, in scene order. */
const FIELDS = fieldLayers(PANEL_STATES).map(
  (scene) => PANEL_STATES[scene]!.field!,
)

/** The panel's elements, set by their refs. */
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
  }
}

function measurePanel(parts: Parts): Layout["panel"] {
  const { root, head, band, badge } = parts
  if (!root || !head || !root.clientWidth || !root.clientHeight) return null
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
  // Shown by its opacity from here.
  if (band) band.style.visibility = "visible"
  return {
    size: { w: root.clientWidth, h: root.clientHeight },
    column: window.matchMedia(COLUMN_QUERY).matches,
    // The badge sits at the panel's inset; the windows keep the same.
    margin: badge?.offsetLeft ?? 24,
  }
}

function panelTargets(parts: Parts) {
  const targets = new Map<string, HTMLElement | SVGElement>()
  const add = (key: string, element: HTMLElement | SVGElement | null) => {
    if (element) targets.set(key, element)
  }
  add("panel", parts.root)
  add("head", parts.head)
  add("headImage", parts.headImage)
  add("band", parts.band)
  add("bandImage", parts.bandImage)
  add("badge", parts.badge)
  parts.fields.forEach((field, layer) => add(`field:${layer}`, field))
  parts.covers.forEach((cover, layer) => add(`cover:${layer}`, cover))
  parts.halves.forEach((half, person) => {
    add(`half:${person}`, half)
    add(`comma:${person}`, (half?.firstElementChild as HTMLElement) ?? null)
  })
  return targets
}

/**
 * The image panel: the hero illustration seen through the logo's square or
 * comma on a colour field, the Answerable AP badge, and the two portraits.
 * The stage moves its parts (`frames.ts`); before that it is the plain
 * picture, as without JS.
 *
 * Everything moves by transform or fades by opacity, so the browser's
 * compositor can play it. The window is two rectangle clips: the head, and
 * under it the band that holds the tail, whose curve static shapes in the
 * field's colour carve out. Each clip holds the same picture, so the browser
 * samples one decoded image and paints nothing. Each field colour is a solid
 * layer of its own; a colour change is one fading in over another.
 */
export function ZoomPanel({ ref }: { ref: Ref<ZoomPanelHandle> }) {
  const partsRef = useRef<Parts>(createParts())

  useImperativeHandle(
    ref,
    () => ({
      measure: () => measurePanel(partsRef.current),
      targets: () => panelTargets(partsRef.current),
    }),
    [],
  )

  const imageClass =
    "absolute inset-0 size-full max-w-none object-cover object-[50%_36%] cols:object-center"

  return (
    <div
      ref={(element) => {
        partsRef.current.root = element
      }}
      className="@container absolute inset-0 overflow-hidden bg-white"
    >
      {/* The field: a solid layer per colour, hidden until the stage runs. */}
      {FIELDS.map((colour, layer) => (
        <div
          key={layer}
          ref={(element) => {
            partsRef.current.fields[layer] = element
          }}
          aria-hidden="true"
          className="absolute inset-0 opacity-0 will-change-[opacity]"
          style={{ backgroundColor: colour }}
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
        {FIELDS.map((colour, layer) => (
          <svg
            key={layer}
            ref={(element) => {
              partsRef.current.covers[layer] = element
            }}
            viewBox={BAND_VIEW_BOX}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible opacity-0 will-change-[opacity]"
            style={{ fill: colour }}
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
      style={{ backgroundColor: person.colour, opacity: 0 }}
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
