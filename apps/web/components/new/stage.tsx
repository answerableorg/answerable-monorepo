"use client"

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react"

import { RAIL, SCENE_COUNT } from "@/components/new/scenes"
import { ZoomPanel, type ZoomPanelHandle } from "@/components/new/zoom-panel"
import {
  clamp,
  lineFrame,
  rollFrame,
  offsetFrom,
  progressAt,
  scrub,
} from "@/lib/stage-math"
import { cn } from "@answerable/ui/lib/utils"

/** Snap points: one per scene, and the hero again at the end. */
const SNAPS = SCENE_COUNT + 1
/** How far a line travels as it enters or leaves, in pixels. */
const LINE_TRAVEL = 24
/** Navigation further than this many scenes cuts through a fade. */
const SMOOTH_REACH = 2

type SceneParts = {
  element: HTMLElement
  from: number
  to: number
  lines: HTMLElement[]
  steps: HTMLElement[]
  marks: HTMLElement[]
  highlight: HTMLElement | null
  current: boolean
  /** Off screen at the last frame, its lines already written out. */
  hidden: boolean
  /** The statements' box height and the index numbers' places, measured once. */
  travel: number
  markX: number[]
}

const FIELD_SELECTOR = "input, select, textarea, [role='combobox']"

/**
 * The /new page as one screen that the scroll plays: the copy column, the
 * image panel and the progress squares stay put while snap points one screen
 * apart pass under them. The scroll between two snap points is the progress
 * between two scenes, so every change is scrubbed by hand and rests on a
 * scene. The last snap point shows the hero again; settling there jumps to the
 * top, which looks the same.
 *
 * Everything here is an enhancement: an inline script marks `<html>` with
 * `data-stage` before first paint, and the `stage:` variant switches the
 * layout. Without it the scenes are ordinary sections beside the picture.
 */
export function Stage({
  logo,
  children,
}: {
  logo: ReactNode
  /** The scenes: `[data-scene]` sections with `data-from` and `data-to`. */
  children: ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const scenesRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLOListElement>(null)
  const registerRef = useRef<HTMLAnchorElement>(null)
  const panelRef = useRef<ZoomPanelHandle>(null)

  useEffect(() => {
    const html = document.documentElement
    const stage = stageRef.current
    const track = trackRef.current
    const sceneArea = scenesRef.current
    if (!html.hasAttribute("data-stage") || !stage || !track || !sceneArea) {
      return
    }

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const touchQuery = window.matchMedia("(pointer: coarse)")
    const markers = [...track.querySelectorAll<HTMLElement>("[data-snap]")]
    const railItems = [
      ...(railRef.current?.querySelectorAll<HTMLElement>("[data-rail]") ?? []),
    ]
    const scenes: SceneParts[] = [
      ...sceneArea.querySelectorAll<HTMLElement>("[data-scene]"),
    ].map((element) => ({
      element,
      from: Number(element.dataset.from),
      to: Number(element.dataset.to),
      lines: [...element.querySelectorAll<HTMLElement>("[data-line]")],
      steps: [...element.querySelectorAll<HTMLElement>("[data-step]")],
      marks: [...element.querySelectorAll<HTMLElement>("[data-mark]")],
      highlight: element.querySelector<HTMLElement>("[data-highlight]"),
      current: false,
      hidden: false,
      travel: 0,
      markX: [],
    }))

    // A style is only set when it changes, and nothing is read from layout
    // while a frame is drawn: sizes are measured on resize.
    let written = new WeakMap<Element, Record<string, string>>()
    const write = (element: HTMLElement, key: string, value: string) => {
      let values = written.get(element)
      if (!values) written.set(element, (values = {}))
      if (values[key] === value) return
      values[key] = value
      element.style.setProperty(key, value)
    }

    let tops: number[] = []
    let target = 0
    let frame = 0
    let frozen = false
    let settleTimer = 0
    let railIndex = -1

    const measure = () => {
      tops = markers.map(
        (marker) => marker.getBoundingClientRect().top + window.scrollY,
      )
      for (const scene of scenes) {
        scene.travel = scene.steps[0]?.parentElement?.clientHeight ?? 0
        scene.markX = scene.marks.map((mark) => mark.offsetLeft)
        scene.hidden = false
      }
      written = new WeakMap()
    }
    const read = () => progressAt(window.scrollY, tops)

    const apply = (progress: number) => {
      const reduced = reducedQuery.matches
      for (const scene of scenes) {
        const offset = offsetFrom(progress, scene.from, scene.to, SCENE_COUNT)
        const current = Math.abs(offset) < 0.5
        if (current !== scene.current) {
          scene.current = current
          scene.element.toggleAttribute("data-current", current)
        }
        // A scene that stays off screen costs nothing.
        const hidden = Math.abs(offset) >= 1
        if (hidden && scene.hidden) continue
        scene.hidden = hidden
        scene.lines.forEach((line, index) => {
          const { opacity, shift } = lineFrame(
            offset,
            index,
            scene.lines.length,
          )
          write(line, "opacity", opacity.toFixed(3))
          write(
            line,
            "transform",
            reduced
              ? "none"
              : `translate3d(0, ${(shift * LINE_TRAVEL).toFixed(2)}px, 0)`,
          )
        })
        if (scene.steps.length) applySteps(scene, progress, reduced)
      }

      const nearest = Math.round(progress) % SCENE_COUNT
      if (nearest !== railIndex) {
        railIndex = nearest
        railItems.forEach((item, index) =>
          item.toggleAttribute("data-active", index === nearest),
        )
        registerRef.current?.toggleAttribute("data-hidden", nearest === 0)
      }
      panelRef.current?.render(progress, reduced)
    }

    /** The values: the statements roll, the highlight slides along the index. */
    const applySteps = (
      scene: SceneParts,
      progress: number,
      reduced: boolean,
    ) => {
      const count = scene.steps.length
      const position = clamp(progress - scene.from, 0, count - 1)
      scene.steps.forEach((step, index) => {
        let offset = clamp(position - index, -1, 1)
        // Arriving and leaving belong to the whole block.
        if (index === 0 && offset < 0) offset = 0
        if (index === count - 1 && offset > 0) offset = 0
        const { opacity, shift } = reduced
          ? lineFrame(offset, 0, 1)
          : rollFrame(offset)
        write(step, "opacity", opacity.toFixed(3))
        write(
          step,
          "transform",
          reduced
            ? "none"
            : `translate3d(0, ${(shift * scene.travel).toFixed(2)}px, 0)`,
        )
        step.toggleAttribute("aria-current", Math.abs(offset) < 0.5)
      })
      const index = Math.floor(position)
      const eased = reduced
        ? Math.round(position - index)
        : scrub(position - index)
      const next = Math.min(index + 1, count - 1)
      scene.marks.forEach((mark, k) => {
        const distance = Math.abs(index + eased - k)
        write(
          mark,
          "opacity",
          (0.32 + 0.68 * (1 - Math.min(distance, 1))).toFixed(3),
        )
      })
      const highlight = scene.highlight
      const fromX = scene.markX[index]
      const toX = scene.markX[next]
      if (highlight && fromX !== undefined && toX !== undefined) {
        const x = fromX + (toX - fromX) * eased
        write(highlight, "transform", `translate3d(${x.toFixed(2)}px, 0, 0)`)
        const a = scene.marks[index]?.dataset.colour ?? ""
        const b = scene.marks[next]?.dataset.colour ?? ""
        write(
          highlight,
          "background-color",
          a === b || eased <= 0
            ? a
            : eased >= 1
              ? b
              : `color-mix(in oklab, ${a} ${((1 - eased) * 100).toFixed(1)}%, ${b})`,
        )
      }
    }

    // Drawn once a frame at exactly the scroll's position. The scroll is
    // already smooth (the browser plays a snap as a smooth scroll), so any
    // smoothing here only trails it: 45 ms of lag left the page drifting for
    // 100 ms after the scroll had stopped.
    const tick = () => {
      frame = 0
      apply(target)
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(tick)
    }
    const jumpTo = (progress: number) => {
      target = progress
      cancelAnimationFrame(frame)
      frame = 0
      apply(target)
    }

    /** At rest on the last snap point: back to the top, which looks the same. */
    const settle = () => {
      window.clearTimeout(settleTimer)
      if (frozen || target < SNAPS - 1 - 0.001) return
      window.scrollTo({ top: tops[0] ?? 0, behavior: "instant" })
      jumpTo(0)
    }

    const onScroll = () => {
      if (frozen) return
      target = read()
      schedule()
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(settle, 180)
    }

    // A phone's bars resize the window mid-scroll: measure again. The snap
    // points are small-viewport tall, so the position barely moves.
    const onResize = () => {
      measure()
      if (frozen) return
      target = read()
      schedule()
    }

    // Phones: a field's keyboard scrolls the page to show it. While a field
    // has focus the stage holds its scene and snapping is off; afterwards the
    // scroll goes back under that scene.
    const freeze = () => {
      if (frozen) return
      frozen = true
      html.setAttribute("data-frozen", "")
    }
    const thaw = () => {
      if (!frozen) return
      frozen = false
      html.removeAttribute("data-frozen")
      measure()
      const scene = Math.round(target)
      window.scrollTo({ top: tops[scene] ?? 0, behavior: "instant" })
      jumpTo(scene)
      settle()
    }
    const isField = (element: Element | null) =>
      !!element?.matches(FIELD_SELECTOR)
    const inPopup = (element: Element | null) =>
      !!element?.closest("[role='listbox'], [role='dialog'], [data-side]")

    const onFocusIn = (event: FocusEvent) => {
      const element = event.target as Element
      const scene = element.closest<HTMLElement>("[data-scene]")
      if (!scene || !sceneArea.contains(scene)) return
      const from = Number(scene.dataset.from)
      const to = Number(scene.dataset.to)
      if (Math.abs(offsetFrom(target, from, to, SCENE_COUNT)) > 0.01) {
        goTo(from)
      }
      if (isField(element) && touchQuery.matches) freeze()
    }
    const onFocusOut = () => {
      if (!frozen) return
      // Focus moves after this event; look once it has landed.
      window.setTimeout(() => {
        const active = document.activeElement
        if ((isField(active) && stage.contains(active)) || inPopup(active)) {
          return
        }
        thaw()
      }, 0)
    }

    const afterArrival = (callback: () => void) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.removeEventListener("scrollend", finish)
        callback()
      }
      window.addEventListener("scrollend", finish, { once: true })
      window.setTimeout(finish, 900)
    }

    /**
     * To a scene: near ones by a smooth scroll that plays the way there, far
     * ones by a short fade and a jump. The hero is also at the end, so from
     * the last scenes it is ahead.
     */
    const goTo = (scene: number, focusEmail = false) => {
      if (frozen) thaw()
      measure()
      let destination = scene
      if (scene === 0 && SNAPS - 1 - target < target) destination = SNAPS - 1
      const top = tops[destination] ?? 0
      const focus = () => {
        if (!focusEmail) return
        document
          .querySelector<HTMLInputElement>('[data-scene] input[name="email"]')
          ?.focus({ preventScroll: true })
      }
      if (Math.abs(destination - target) < 0.01) return focus()
      if (
        reducedQuery.matches ||
        Math.abs(destination - target) > SMOOTH_REACH
      ) {
        stage.style.transition = "opacity 120ms linear"
        stage.style.opacity = "0"
        window.setTimeout(() => {
          window.scrollTo({ top: scene === 0 ? 0 : top, behavior: "instant" })
          jumpTo(read())
          stage.style.transition = "opacity 240ms ease-out"
          stage.style.opacity = ""
          focus()
        }, 130)
        return
      }
      window.scrollTo({ top, behavior: "smooth" })
      afterArrival(() => {
        settle()
        focus()
      })
    }
    // Links and buttons to a scene (`data-go`): the header's link, the join
    // scene's and the rail. A link to the hero puts the cursor in the form.
    const onClick = (event: globalThis.MouseEvent) => {
      const link = (event.target as Element).closest<HTMLElement>("[data-go]")
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey) {
        return
      }
      event.preventDefault()
      const scene = Number(link.dataset.go)
      goTo(scene, scene === 0 && link.tagName === "A")
    }

    measure()
    jumpTo(read())
    html.setAttribute("data-engine", "")

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("scrollend", settle)
    window.addEventListener("resize", onResize)
    stage.addEventListener("focusin", onFocusIn)
    stage.addEventListener("focusout", onFocusOut)
    stage.addEventListener("click", onClick)
    reducedQuery.addEventListener("change", onResize)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("scrollend", settle)
      window.removeEventListener("resize", onResize)
      stage.removeEventListener("focusin", onFocusIn)
      stage.removeEventListener("focusout", onFocusOut)
      stage.removeEventListener("click", onClick)
      reducedQuery.removeEventListener("change", onResize)
      cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
      html.removeAttribute("data-engine")
      html.removeAttribute("data-frozen")
    }
  }, [])

  const register = (
    <a
      ref={registerRef}
      href="#join"
      data-go="0"
      className="text-sm font-bold decoration-2 underline-offset-4 transition-[opacity,visibility] duration-200 [text-box:trim-both_cap_alphabetic] hover:underline data-[hidden]:invisible data-[hidden]:opacity-0 motion-reduce:transition-none"
    >
      Register your interest
    </a>
  )

  return (
    <div className="stage:relative">
      {/*
        The grid the page aligns to.
        - Columns (`cols`): one margin, `--m`, from every edge of the window.
          The logo's capitals and the badge's top sit on the top line, `--m`
          down; the progress squares sit on the bottom line, `--m` up. Inside
          the picture, `--inset` is the margin less the frame, so anything at
          the inset lands on those lines: the badge, the windows' edges, the
          portraits. The header and the rail rows are the same height,
          `--edge`, so the copy is centred on the window's middle, which is
          the picture's.
        - Band (`band`): one gutter, 1.5rem, or the copy column's edge where
          the window is wider than the column. The logo, the copy, the badge
          and the windows keep it from the sides, and the copy starts 1.5rem
          below the band.
        - Short windows, a phone on its side: the rail goes and the header
          row tightens, so the copy keeps its room, a little above the middle. The band gives way to the copy: about 26rem stays for the
          header and the tallest scene, never less than 10rem of picture. It
          folds away while the form's second step is open.
      */}
      <div
        ref={stageRef}
        data-stage-grid
        className="stage:sticky stage:top-0 stage:h-svh stage:min-h-0 stage:overflow-hidden stage:transition-[grid-template-rows] stage:duration-500 stage:ease-[cubic-bezier(0.2,0,0,1)] cols:grid-cols-2 cols:grid-rows-[auto_1fr] cols:[--inset:calc(var(--m)-var(--frame,16px))] stage:band:grid-rows-[auto_var(--band)_minmax(0,1fr)] stage:cols:grid-rows-[var(--edge)_minmax(0,1fr)_var(--edge)] [@media(height<30rem)]:stage:cols:grid-rows-[calc(var(--m)+1rem)_minmax(0,1fr)_0.5rem] grid min-h-svh grid-cols-1 grid-rows-[auto_auto_1fr] [--edge:calc(var(--m)+2.5rem)] [--inset:max(1.5rem,calc((100%_-_560px)/2))] [--m:2rem] motion-reduce:transition-none min-[80rem]:[--m:3rem] min-[120rem]:[--m:4rem] [@media(height<35rem)]:[--m:1.5rem]"
        style={
          { "--band": "clamp(10rem, 100svh - 26rem, 46svh)" } as CSSProperties
        }
      >
        <div className="bg-background cols:col-start-1 cols:row-start-1 cols:px-12 sticky top-0 z-30 px-6">
          <header className="cols:pt-[var(--m)] cols:pb-6 mx-auto flex w-full max-w-[560px] items-end justify-between py-5 min-[1800px]:max-w-[640px]">
            {logo}
            {register}
          </header>
        </div>

        {/* The band under the header, or the right column framed as wide as
            the scrollbar's gutter (`FRAME_SCRIPT`). */}
        <div className="cols:col-start-2 cols:row-span-3 cols:row-start-1 min-h-0">
          <div className="stage:h-full cols:sticky cols:top-0 cols:h-svh cols:py-[var(--frame,16px)] cols:pr-[calc(var(--frame,16px)-var(--gutter,0px))]">
            <div className="stage:aspect-auto stage:h-full cols:aspect-auto cols:h-full relative aspect-[4/3] overflow-hidden">
              <ZoomPanel ref={panelRef} />
            </div>
          </div>
        </div>

        <div className="cols:col-start-1 cols:row-start-2 cols:px-12 min-h-0 px-6">
          <div
            ref={scenesRef}
            className="stage:relative stage:h-full stage:gap-0 stage:py-0 mx-auto flex w-full max-w-[560px] flex-col gap-16 py-8 min-[1800px]:max-w-[640px]"
          >
            {children}
          </div>
        </div>

        <div className="stage:cols:col-start-1 stage:cols:row-start-3 stage:cols:block hidden px-12 [@media(height<30rem)]:hidden!">
          <Rail ref={railRef} />
        </div>
      </div>

      {/* The track: one snap point a screen. The last is a large viewport
          tall, so a phone with its bars hidden can still scroll onto it. */}
      <div
        ref={trackRef}
        aria-hidden="true"
        className="stage:-mt-[100svh] stage:block hidden"
      >
        {Array.from({ length: SNAPS }, (_, index) => (
          <div
            key={index}
            data-snap
            className={cn(
              "snap-start snap-always",
              index === SNAPS - 1 ? "h-lvh" : "h-svh",
            )}
          />
        ))}
      </div>
    </div>
  )
}

/** Ten squares, the brand's marks: where the page is, and a way to each scene. */
function Rail({ ref }: { ref: Ref<HTMLOListElement> }) {
  return (
    // Its squares sit on the bottom line: each at the foot of its button.
    <ol
      ref={ref}
      aria-label="Scenes"
      className="mx-auto flex h-full w-full max-w-[560px] items-end gap-1 pb-[var(--m)] min-[1800px]:max-w-[640px]"
    >
      {RAIL.map(({ label, colour }, index) => (
        <li key={label} className="flex">
          <button
            type="button"
            data-rail
            aria-label={label}
            data-go={index}
            className="group/rail grid size-6 items-end justify-items-center"
            style={{ "--rail": colour } as CSSProperties}
          >
            {/* Compositor only: the square scales and its colour fades in as
                a layer of its own. A transition of `background-color` paints,
                and its end cost a frame on every arrival. */}
            <span className="bg-muted-foreground/30 relative size-1.5 origin-bottom transition-[scale] duration-300 will-change-[scale] group-data-[active]/rail:scale-[1.67] motion-reduce:transition-none">
              <span className="absolute inset-0 bg-[var(--rail)] opacity-0 transition-opacity duration-300 will-change-[opacity] group-hover/rail:opacity-100 group-data-[active]/rail:opacity-100 motion-reduce:transition-none" />
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
