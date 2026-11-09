"use client"

import Image from "next/image"
import {
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react"

import { sheetOf, SHUTTERS, type Layout } from "@/components/new/frames"
import {
  COLUMN_QUERY,
  PAINTINGS,
  PEOPLE,
  RAIL,
  SCRIPT,
  type Painting,
  type Person,
} from "@/components/new/scenes"
import { SHEET_COMMA, ZONE_FONT, type SheetPlan } from "@/components/new/sheet"
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

/**
 * The comma as a mask, as the logo has it or turned over (tail up), stretched
 * to its box: the head on the lattice, the tail half of it.
 */
function commaMask(turned: boolean): CSSProperties {
  const { box, d, viewBox } = SHEET_COMMA
  const turn = turned
    ? ` transform="rotate(180 ${box.x + box.w / 2} ${box.y + box.h / 2})"`
    : ""
  return {
    maskImage: `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none"><path d="${d}"${turn}/></svg>`,
    )}")`,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
  }
}
const COMMA_MASKS = [commaMask(false), commaMask(true)] as const

/** The panel's elements, set by their refs. */
type Parts = {
  root: HTMLDivElement | null
  /** Everything the sheet is drawn over: paintings, shutters, portraits. */
  picture: HTMLDivElement | null
  paintings: Map<string, HTMLImageElement>
  shutters: Map<string, HTMLDivElement>
  rules: Map<string, HTMLDivElement>
  inset: HTMLDivElement | null
  halves: (HTMLDivElement | null)[]
  commas: (HTMLDivElement | null)[]
  /** Each scene's words in the title strip. */
  words: (HTMLDivElement | null)[]
  keyplan: HTMLDivElement | null
  /** The square on the key plan. */
  square: HTMLDivElement | null
}

const px = (value: number) => `${Math.round(value * 1000) / 1000}px`

function measurePanel(parts: Parts): NonNullable<Layout["panel"]> | null {
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
    // The lattice keeps to the panel's inset, its lines on device pixels.
    margin: inset?.offsetLeft ?? 24,
    ratio: window.devicePixelRatio || 1,
  }
}

/** Puts what sits on the lattice where the plan has it. */
function layOut(parts: Parts, plan: SheetPlan) {
  for (const [side, element] of parts.rules) {
    const rule = plan.rules[side as keyof SheetPlan["rules"]]
    Object.assign(element.style, {
      left: px(rule.x),
      top: px(rule.y),
      width: px(rule.w),
      height: px(rule.h),
      visibility: "visible",
    })
  }
  plan.commas.forEach(({ box, head }, person) => {
    const element = parts.commas[person]
    if (!element) return
    Object.assign(element.style, {
      left: px(box.x),
      top: px(box.y),
      width: px(box.w),
      height: px(box.h),
    })
    const inside = element.firstElementChild as HTMLElement | null
    if (inside) inside.style.height = px(head.h)
  })
}

function panelTargets(parts: Parts) {
  const targets = new Map<string, HTMLElement | SVGElement>()
  const add = (key: string, element: HTMLElement | SVGElement | null) => {
    if (element) targets.set(key, element)
  }
  add("panel", parts.picture)
  for (const [key, element] of parts.paintings) add(`painting:${key}`, element)
  for (const [side, element] of parts.shutters) add(`shutter:${side}`, element)
  for (const [side, element] of parts.rules) add(`rule:${side}`, element)
  parts.halves.forEach((half, person) => add(`half:${person}`, half))
  parts.commas.forEach((comma, person) => add(`comma:${person}`, comma))
  parts.words.forEach((words, scene) => add(`strip:${scene}`, words))
  add("keyplan", parts.keyplan)
  add("keyplan:window", parts.square)
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
 * The sheet's colours, all see-through so that they sit back over white and
 * over a painting alike: the lattice's sky, the drawing's ink, and the ink a
 * little stronger for words, which are too small to read at a line's weight.
 */
const SHEET_COLOURS = {
  "--sheet-lattice": "rgb(140 200 220 / 0.45)",
  "--sheet-ink": "rgb(39 71 214 / 0.34)",
  "--sheet-text": "rgb(39 71 214 / 0.58)",
} as CSSProperties

/**
 * The image panel, as a drawing sheet: three paintings, each whole or seen
 * through the logo's square on white, and the two portraits; over them, the
 * lattice everything keeps to, its frame, and the picture's edges ruled
 * across it. The stage moves its parts (`frames.ts`); before that it is the
 * meeting, whole, as without JS.
 *
 * Everything moves by transform or fades by opacity, so the browser's
 * compositor can play it. Each painting has its own transform and opacity;
 * four white shutters slide to frame the picture, so nothing clips or
 * rescales the paintings but their own transforms. The lattice and frame
 * never move. Each screen downloads the width it needs (`sizes` in
 * `scenes.ts`).
 */
export function ZoomPanel({ ref }: { ref: Ref<ZoomPanelHandle> }) {
  const partsRef = useRef<Parts>({
    root: null,
    picture: null,
    paintings: new Map(),
    shutters: new Map(),
    rules: new Map(),
    inset: null,
    halves: [],
    commas: [],
    words: [],
    keyplan: null,
    square: null,
  })
  // What the sheet draws, from the last measure: drawn once per panel size.
  const [plan, setPlan] = useState<SheetPlan | null>(null)
  const drawn = useRef("")

  useImperativeHandle(
    ref,
    () => ({
      measure: () => {
        const panel = measurePanel(partsRef.current)
        if (!panel) return null
        const next = sheetOf(SCRIPT, panel)
        layOut(partsRef.current, next)
        if (next.key !== drawn.current) {
          drawn.current = next.key
          setPlan(next)
        }
        return panel
      },
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
      style={SHEET_COLOURS}
    >
      {/* The panel's inset, where the lattice's frame is. */}
      <div
        ref={(element) => {
          partsRef.current.inset = element
        }}
        aria-hidden="true"
        className="absolute top-0 size-0"
        style={{ left: "var(--inset, 5cqw)" }}
      />

      <div
        ref={(element) => {
          partsRef.current.picture = element
        }}
        className="absolute inset-0"
      >
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

        {/* The white round the picture, hidden until the stage runs. */}
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

        {/* The portraits' white, a pixel past the panel's clip on every side:
            at a fractional edge the halves' layers round short and the
            painting shows as a line. */}
        <div
          aria-hidden="true"
          className="cols:grid-cols-1 cols:grid-rows-2 pointer-events-none absolute -inset-px grid grid-cols-2"
        >
          {PEOPLE.map((person, index) => (
            <div
              key={person.name}
              ref={(element) => {
                partsRef.current.halves[index] = element
              }}
              className="bg-white will-change-[opacity]"
              style={{ opacity: 0 }}
            />
          ))}
        </div>
        {PEOPLE.map((person, index) => (
          <Portrait
            key={person.name}
            ref={(element) => {
              partsRef.current.commas[index] = element
            }}
            person={person}
          />
        ))}
      </div>

      {/* The sheet: the lattice and its frame, over everything, never moving. */}
      {plan && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {/* A hairline is a whole pixel on a plain screen and half of one
              on a sharp one: the same weight on both. */}
          <path
            d={plan.lines}
            fill="var(--sheet-lattice)"
            opacity={Math.min(1, 0.5 / plan.hair)}
            shapeRendering="crispEdges"
          />
          <path
            d={plan.frame}
            fill="var(--sheet-ink)"
            shapeRendering="crispEdges"
          />
          <g
            fill="var(--sheet-text)"
            fontSize={ZONE_FONT}
            fontWeight={500}
            letterSpacing="0.04em"
          >
            {plan.zones.map((zone) => (
              <text
                key={`${zone.anchor}${zone.text}`}
                x={zone.x}
                y={zone.y}
                textAnchor={zone.anchor}
              >
                {zone.text}
              </text>
            ))}
          </g>
        </svg>
      )}

      <TitleStrip
        plan={plan}
        wordsRef={(scene, element) => {
          partsRef.current.words[scene] = element
        }}
        keyplanRef={(element) => {
          partsRef.current.keyplan = element
        }}
        squareRef={(element) => {
          partsRef.current.square = element
        }}
      />

      {/* The picture's four edges, ruled across the lattice. */}
      {SHUTTERS.map((side) => (
        <div
          key={side}
          ref={(element) => {
            if (element) partsRef.current.rules.set(side, element)
            else partsRef.current.rules.delete(side)
          }}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 bg-(--sheet-ink) will-change-transform"
          style={{ visibility: "hidden" }}
        />
      ))}
    </div>
  )
}

/**
 * The sheet's title strip, as a drawing has one: the sheet's number, the
 * scene's name and, while the squares are on the studio, a key plan of that
 * painting with a square on the detail in view. The stage fades each scene's
 * words and moves the square (`frames.ts`), so those elements are here from
 * the start; the plan sizes them once the panel is measured.
 */
function TitleStrip({
  plan,
  wordsRef,
  keyplanRef,
  squareRef,
}: {
  plan: SheetPlan | null
  wordsRef: (scene: number, element: HTMLDivElement | null) => void
  keyplanRef: Ref<HTMLDivElement>
  squareRef: Ref<HTMLDivElement>
}) {
  const strip = plan?.strip
  const keyplan = strip?.keyplan ?? null
  const first = keyplan?.windows.find((square) => square)
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute overflow-hidden font-medium tracking-[0.08em] whitespace-nowrap text-(--sheet-text) uppercase"
        style={
          strip?.font
            ? {
                left: px(strip.x),
                top: px(strip.y),
                width: px((keyplan?.cell.x ?? strip.x + strip.w) - strip.x),
                height: px(strip.h),
                fontSize: strip.font,
              }
            : { display: "none" }
        }
      >
        {RAIL.map(({ label }, scene) => (
          <div
            key={label}
            ref={(element) => wordsRef(scene, element)}
            className="absolute inset-0 flex items-center will-change-[opacity]"
            style={{ opacity: scene === 0 ? 1 : 0 }}
          >
            <span
              className="shrink-0 tabular-nums"
              style={
                strip && {
                  width: px(strip.number - strip.x),
                  paddingLeft: strip.pad,
                }
              }
            >
              {String(scene + 1).padStart(2, "0")} / {RAIL.length}
            </span>
            <span style={strip && { paddingLeft: strip.pad }}>{label}</span>
          </div>
        ))}
      </div>

      <div
        ref={keyplanRef}
        aria-hidden="true"
        className="pointer-events-none absolute will-change-[opacity]"
        style={{
          opacity: 0,
          ...(keyplan
            ? {
                left: px(keyplan.cell.x),
                top: px(keyplan.cell.y),
                width: px(keyplan.cell.w),
                height: px(keyplan.cell.h),
              }
            : { display: "none" }),
        }}
      >
        {plan && keyplan && (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-(--sheet-ink)"
              style={{ width: plan.ink }}
            />
            <div
              className="absolute border-(--sheet-ink)"
              style={{
                left: px(keyplan.box.x - keyplan.cell.x),
                top: px(keyplan.box.y - keyplan.cell.y),
                width: px(keyplan.box.w),
                height: px(keyplan.box.h),
                borderWidth: plan.hair,
              }}
            />
            {keyplan.dots.map(
              (dot, scene) =>
                dot && (
                  <div
                    key={scene}
                    className="absolute"
                    style={{
                      left: px(dot.x - keyplan.cell.x),
                      top: px(dot.y - keyplan.cell.y),
                      width: px(dot.w),
                      height: px(dot.h),
                      backgroundColor: RAIL[scene]?.colour,
                    }}
                  />
                ),
            )}
          </>
        )}
        <div
          ref={squareRef}
          className="absolute top-0 left-0 origin-top-left border-(--sheet-text) will-change-transform"
          style={
            plan && first
              ? {
                  width: px(first.w),
                  height: px(first.h),
                  borderWidth: plan.ink,
                }
              : undefined
          }
        />
      </div>
    </>
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
 * One person, in the logo's comma on the lattice: the photograph in its
 * head, the tail in the photograph's own edge tone. Keir's comma is turned
 * over and Sadie's is not, so the pair reads as quote marks, set in the
 * sheet's opposite corners (`sheet.ts` places them, once the panel is
 * measured).
 */
function Portrait({
  ref,
  person,
}: {
  ref: Ref<HTMLDivElement>
  person: Person
}) {
  const { turned, frame, tail } = person
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute top-0 left-0 size-0 will-change-[opacity]"
      style={{
        ...COMMA_MASKS[turned ? 1 : 0],
        backgroundColor: tail.tone,
        opacity: 0,
      }}
    >
      <div
        className={cn(
          "absolute inset-x-0 overflow-hidden",
          turned ? "bottom-0" : "top-0",
        )}
      >
        <Image
          src={person.portrait}
          alt={`Portrait of ${person.name}`}
          fill
          sizes="(min-width: 64rem) 20vw, 40vw"
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
  )
}
