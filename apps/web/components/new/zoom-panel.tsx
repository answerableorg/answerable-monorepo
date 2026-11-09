"use client"

import Image from "next/image"
import {
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
} from "react"

import { SHUTTERS, type Layout } from "@/components/new/frames"
import {
  COLUMN_QUERY,
  PAINTINGS,
  PEOPLE,
  type Painting,
  type Person,
} from "@/components/new/scenes"
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
/** The comma's head (47.835 units tall) as a share of its 72.002 height. */
const HEAD_SHARE = 47.835 / 72.002

/** The panel's elements, set by their refs. */
type Parts = {
  root: HTMLDivElement | null
  paintings: Map<string, HTMLImageElement>
  shutters: Map<string, HTMLDivElement>
  inset: HTMLDivElement | null
  halves: (HTMLDivElement | null)[]
}

function measurePanel(parts: Parts): Layout["panel"] {
  const { root, inset } = parts
  if (!root || !root.clientWidth || !root.clientHeight) return null
  const w = root.clientWidth
  const h = root.clientHeight
  // From here each painting is placed by transform, at its own size, and the
  // shutters, a pixel larger than the panel all round, slide into place.
  for (const shutter of parts.shutters.values()) {
    Object.assign(shutter.style, {
      left: "-1px",
      top: "-1px",
      width: `${w + 2}px`,
      height: `${h + 2}px`,
      visibility: "visible",
    })
  }
  for (const { key, size } of PAINTINGS) {
    const element = parts.paintings.get(key)
    if (!element) continue
    Object.assign(element.style, {
      inset: "auto",
      left: "0",
      top: "0",
      width: `${size.w}px`,
      height: `${size.h}px`,
      transformOrigin: "0 0",
      willChange: "transform, opacity",
    })
  }
  return {
    size: { w, h },
    column: matchMedia(COLUMN_QUERY).matches,
    // The square keeps to the panel's inset, as the portraits do.
    margin: inset?.offsetLeft ?? 24,
  }
}

function panelTargets(parts: Parts) {
  const targets = new Map<string, HTMLElement | SVGElement>()
  const add = (key: string, element: HTMLElement | SVGElement | null) => {
    if (element) targets.set(key, element)
  }
  add("panel", parts.root)
  for (const [key, element] of parts.paintings) add(`painting:${key}`, element)
  for (const [side, element] of parts.shutters) add(`shutter:${side}`, element)
  parts.halves.forEach((half, person) => {
    add(`half:${person}`, half)
    add(`comma:${person}`, (half?.firstElementChild as HTMLElement) ?? null)
  })
  return targets
}

/**
 * Decodes a painting the page shows later as soon as it has loaded, so the
 * first move onto it does not decode in the middle of the scroll.
 */
function decodeAhead(image: HTMLImageElement) {
  image.decode().catch(() => {})
}

/**
 * The image panel: three paintings, each whole or seen through the logo's
 * square on white, and the two portraits. The stage moves its parts
 * (`frames.ts`); before that it is the meeting, whole, as without JS.
 *
 * Everything moves by transform or fades by opacity, so the browser's
 * compositor can play it. Each painting has its own transform and opacity;
 * four white shutters slide to frame the square, so nothing clips or rescales
 * the paintings but their own transforms. Each screen downloads the width it
 * needs (`sizes` in `scenes.ts`).
 */
export function ZoomPanel({ ref }: { ref: Ref<ZoomPanelHandle> }) {
  const partsRef = useRef<Parts>({
    root: null,
    paintings: new Map(),
    shutters: new Map(),
    inset: null,
    halves: [],
  })

  useImperativeHandle(
    ref,
    () => ({
      measure: () => measurePanel(partsRef.current),
      targets: () => panelTargets(partsRef.current),
    }),
    [],
  )

  return (
    <div
      ref={(element) => {
        partsRef.current.root = element
      }}
      className="@container absolute inset-0 overflow-hidden bg-white"
    >
      {/* The panel's inset, where the square and the portraits keep. */}
      <div
        ref={(element) => {
          partsRef.current.inset = element
        }}
        aria-hidden="true"
        className="absolute top-0 size-0"
        style={{ left: "var(--inset, 5cqw)" }}
      />

      {/* The meeting, whole, until the stage takes over. */}
      {PAINTINGS.map((painting) => (
        <PaintingImage
          key={painting.key}
          painting={painting}
          ref={(element) => {
            if (element) partsRef.current.paintings.set(painting.key, element)
            else partsRef.current.paintings.delete(painting.key)
          }}
        />
      ))}

      {/* The white round the square, hidden until the stage runs. */}
      {SHUTTERS.map((side) => (
        <div
          key={side}
          ref={(element) => {
            if (element) partsRef.current.shutters.set(side, element)
            else partsRef.current.shutters.delete(side)
          }}
          aria-hidden="true"
          className="absolute inset-0 bg-white will-change-transform"
          style={{ visibility: "hidden" }}
        />
      ))}

      {/* A pixel past the panel's clip on every side: at a fractional edge
          the halves' layers round short and the painting shows as a line. */}
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
 * One painting. The first is the picture without JS and loads first, under
 * the splash; the others wait their turn and decode ahead of their scene.
 */
function PaintingImage({
  ref,
  painting,
}: {
  ref: Ref<HTMLImageElement>
  painting: Painting
}) {
  const { first } = painting
  return (
    <Image
      ref={ref}
      src={painting.image}
      alt={painting.alt}
      sizes={painting.sizes}
      quality={painting.quality}
      loading="eager"
      fetchPriority={first ? "high" : "low"}
      placeholder={first ? "blur" : "empty"}
      onLoad={first ? undefined : (event) => decodeAhead(event.currentTarget)}
      className="cols:object-center absolute inset-0 size-full max-w-none object-cover object-[50%_36%]"
      style={first ? undefined : { opacity: 0 }}
    />
  )
}

/**
 * One person on white, in the logo's comma: the photograph in its
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
      style={{ backgroundColor: "#fff", opacity: 0 }}
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
