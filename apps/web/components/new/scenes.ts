import type { StaticImageData } from "next/image"

import badge from "@/assets/new/badge.webp"
import keir from "@/assets/new/keir.webp"
import meeting from "@/assets/new/meeting.webp"
import sadie from "@/assets/new/sadie.webp"
import studio from "@/assets/new/studio.webp"
import type { Script } from "@/components/new/frames"
import type { Note } from "@/components/new/notes"
import type { Point, Window, WindowLayout } from "@/lib/stage-math"

/**
 * The /new stage, as data: the scenes in scroll order, which painting the
 * image panel shows on each and how, the details the six values zoom in on,
 * and how one painting gives way to the next. A new painting is one file in
 * `assets/new/` and an entry in `PAINTINGS`.
 */

/** Scenes 0 to 9; the last snap point, 10, is the hero again. */
export const SCENE_COUNT = 10

/**
 * The `cols` variant in globals.css: the panel beside the copy. Elsewhere it
 * is the band across a phone.
 */
export const COLUMN_QUERY =
  "(min-width: 64rem), (min-width: 40rem) and (min-aspect-ratio: 4/3)"

/** `sizes` for an image: one width beside the copy, another in the band. */
const sizes = (column: string, band: string) =>
  COLUMN_QUERY.split(", ")
    .map((query) => `${query} ${column}`)
    .concat(band)
    .join(", ")

export type PaintingKey = "meeting" | "badge" | "studio"

export type Painting = {
  key: PaintingKey
  image: StaticImageData
  /** Its size in its own pixels, as the file has it (a test reads the file). */
  size: { w: number; h: number }
  /** Empty where the painting repeats what the copy says. */
  alt: string
  /** 75 where it is never magnified, 85 where the squares magnify it. */
  quality: 75 | 85
  /**
   * How wide the browser should think it is drawn, so each screen downloads
   * the width it needs (`images.deviceSizes` in next.config.mjs).
   */
  sizes: string
  /** Loaded first, under the splash: the painting the page opens on. */
  first: boolean
}

/**
 * The three gouache paintings, bottom to top: each fades in over the one
 * before it. The meeting, at the bottom, never changes opacity, and only one
 * painting ever changes opacity at a time (see `frames.ts`).
 */
export const PAINTINGS: readonly Painting[] = [
  {
    key: "meeting",
    image: meeting,
    size: { w: 3840, h: 5120 },
    alt: "A painting of six colleagues talking round a table in a garden, with laptops, books and a voice recorder; the woman in a red blazer holds an Answerable AP badge.",
    quality: 75,
    // It covers the panel: about the panel's width.
    sizes: sizes("50vw", "100vw"),
    first: true,
  },
  {
    key: "badge",
    image: badge,
    size: { w: 3840, h: 5120 },
    alt: "",
    quality: 75,
    sizes: sizes("50vw", "100vw"),
    first: false,
  },
  {
    key: "studio",
    image: studio,
    size: { w: 6000, h: 2162 },
    alt: "",
    quality: 85,
    // The squares show about a thousand of its 6,000 pixels in two thirds
    // of the panel (four fifths of the band): drawn whole, it would be about
    // 3,300 px wide beside a laptop's copy and 1,100 in a phone's band.
    sizes: sizes("3000px", "1024px"),
    first: false,
  },
]

/** Each painting's size in its own pixels. */
export const PAINTING_SIZES = Object.fromEntries(
  PAINTINGS.map(({ key, size }) => [key, size]),
) as Record<PaintingKey, { w: number; h: number }>

/**
 * The brand's four highlights: each value's number, its square on the rail
 * and the index highlight. The image panel itself stays white round its
 * square.
 */
const SKY = "var(--highlight-1)"
const SAND = "var(--highlight-2)"
const GREEN = "var(--highlight-3)"
const CORAL = "var(--highlight-4)"
const BLACK = "#000"

export type Value = {
  text: string
  /** The value's number, its rail square and its index highlight. */
  colour: string
  /** The detail of the studio painting that stands for it. */
  window: Window
}

/**
 * The six values, each with its detail in the studio panorama (6000×2162):
 * drawing a plan by hand, the plaque set on the model, measuring the model,
 * presenting at the easel, a sealed letter handed over, a 3D printer beside a
 * laptop. The square travels over the painting from one detail to the next:
 * right across it to the plaque, back to the rule, then rightwards again.
 */
export const VALUES: readonly Value[] = [
  {
    text: "We hold ourselves answerable for our work.",
    colour: GREEN,
    window: { focus: [880, 1560], span: 1000 },
  },
  {
    text: "We use AI only where we are competent to do so.",
    colour: CORAL,
    window: { focus: [4350, 1650], span: 1000 },
  },
  {
    text: "We are honest about how we use AI.",
    colour: SKY,
    window: { focus: [1600, 1250], span: 1000 },
  },
  {
    text: "We respect the intellectual and creative work of others.",
    colour: SAND,
    window: { focus: [2800, 650], span: 1000 },
  },
  {
    text: "We protect the information entrusted to us.",
    colour: GREEN,
    window: { focus: [4250, 650], span: 1000 },
  },
  {
    text: "We use AI to strengthen our professions, not to diminish them.",
    colour: CORAL,
    window: { focus: [5400, 850], span: 1000 },
  },
]

/** The first values scene. */
export const VALUES_FROM = 2

export type PanelState = {
  painting: PaintingKey
  /** The square on a detail; none for the whole painting. */
  window: Window | null
  /** The two portraits over the painting. */
  team: boolean
}

/** One per scene, by index. */
export const PANEL_STATES: readonly PanelState[] = [
  // Hero: the meeting, whole.
  { painting: "meeting", window: null, team: false },
  // Programme: the badge, close up.
  { painting: "badge", window: null, team: false },
  // The values: a square on each detail of the studio, on white.
  ...VALUES.map((value) => ({
    painting: "studio" as const,
    window: value.window,
    team: false,
  })),
  // People: the portraits, the meeting behind them.
  { painting: "meeting", window: null, team: true },
  // Join: the meeting, whole, as the hero has it.
  { painting: "meeting", window: null, team: false },
]

/**
 * How one painting gives way to the next in scroll order, where nothing
 * covers the change. The outgoing painting moves in by `push` about its
 * anchor. The incoming one either settles from `push` about its own anchor,
 * or waits where it lands while the square closes (`"square"`), fading in no
 * sooner than the square sits inside it. It fades in over `fade`, a share of
 * the move. Neither ever shows its edge.
 */
export type Cut = {
  from: PaintingKey
  to: PaintingKey
  out: { anchor: Point; push: number }
  in: { anchor: Point; push: number } | "square"
  fade: readonly [number, number]
}

/** The badge's centre in the meeting, where the woman holds it. */
const MEETING_BADGE: Point = [1322, 2541]
/** The badge's centre in the close-up. */
const BADGE_BADGE: Point = [2176, 2785]

export const CUTS: readonly Cut[] = [
  // The camera moves in on her badge, and the close-up of it settles.
  {
    from: "meeting",
    to: "badge",
    out: { anchor: MEETING_BADGE, push: 1 },
    in: { anchor: BADGE_BADGE, push: 1 },
    fade: [0.2, 0.8],
  },
  // White closes in round the badge; the first detail dissolves in.
  {
    from: "badge",
    to: "studio",
    out: { anchor: BADGE_BADGE, push: 1 },
    in: "square",
    fade: [0.45, 0.9],
  },
]

/**
 * The panel's two shapes. `column` is the panel beside the copy; `band` is
 * the strip across a phone. The square is a share of the shorter side, in
 * whole modules of the panel's lattice. Beside the copy a whole painting is
 * cropped low, so the sun stays in the picture.
 */
export const WINDOW_LAYOUTS = {
  column: { size: 0.64, anchorY: 0.3, fitY: 0.5 },
  band: { size: 0.8, anchorY: 0.36, fitY: 0.36 },
} as const satisfies Record<string, WindowLayout>

export type Person = {
  name: string
  line: string
  /** The square beside the name in the people scene. */
  colour: string
  /** The comma turned over, tail up: an opening quote mark. */
  turned: boolean
  /** A black and white photograph, square, in the comma's head. */
  portrait: StaticImageData
  /**
   * The photograph's framing in the head: a zoom about its centre, then a
   * shift in percent of the head, to give the face room.
   */
  frame: { scale: number; x: number; y: number }
  /**
   * The tail continues the photograph's edge where it meets it: `tone` is
   * that edge's grey, and `fade` blends the photograph into it (a wall needs
   * it; a dark coat that reaches the edge already is the tone).
   */
  tail: { tone: string; fade: boolean }
}

/**
 * The two people as a pair of quote marks: Keir's comma turned over, the
 * opening one, and Sadie's as the logo has it, the closing one.
 */
export const PEOPLE: readonly Person[] = [
  {
    name: "Keir Regan-Alexander",
    line: "Has helped more than 100 AEC firms develop their approach to AI over the past three years.",
    colour: GREEN,
    turned: true,
    portrait: keir,
    frame: { scale: 1.25, x: 0, y: 10 },
    tail: { tone: "#838383", fade: true },
  },
  {
    name: "Sadie Morgan OBE",
    line: "Co-founder of Stirling Prize-winning dRMM and founder of the Quality of Life Foundation.",
    colour: SKY,
    turned: false,
    portrait: sadie,
    frame: { scale: 1.25, x: 7, y: 2 },
    tail: { tone: "#111", fade: false },
  },
]

/** Each scene's square on the progress rail: its name and colour. */
export const RAIL: readonly { label: string; colour: string }[] = [
  { label: "Register", colour: BLACK },
  { label: "The programme", colour: BLACK },
  ...VALUES.map((value, index) => ({
    label: `Value ${index + 1}`,
    colour: value.colour,
  })),
  { label: "The people", colour: BLACK },
  { label: "Join the founding cohort", colour: BLACK },
]

/**
 * What the sheet draws on each painting, in the painting's own pixels: a line
 * that continues something painted (the pen, the rule, the pointing arm), an
 * outline, a circle. The scenes of one note show one view of a painting; the
 * hero and the last scene share theirs.
 */
export const NOTES: readonly Note[] = [
  {
    scenes: [0, 9],
    marks: [
      { kind: "ring", at: [3101, 582], r: 321 },
      { kind: "axis", from: [2780, 582], to: [3422, 582], extend: 60 },
      { kind: "axis", from: [3101, 261], to: [3101, 903], extend: 60 },
    ],
  },
  {
    scenes: [1],
    marks: [
      {
        kind: "outline",
        points: [
          [1508, 2478],
          [2914, 2600],
          [2862, 3141],
          [1438, 3026],
        ],
      },
      // The lettering's baseline and its capitals' line.
      { kind: "guide", from: [1400, 2779], to: [2980, 2924] },
      { kind: "guide", from: [1400, 2658], to: [2980, 2817] },
      { kind: "ring", at: [3293, 506], r: 256 },
    ],
  },
  {
    scenes: [VALUES_FROM],
    marks: [
      { kind: "axis", from: [925, 1772], to: [1081, 2001], extend: 40 },
      // The table under the pen's tip, and the pen's angle to it.
      {
        kind: "angle",
        at: [1081, 2001],
        from: [841, 2001],
        to: [925, 1772],
        r: 170,
        past: 50,
      },
      { kind: "cross", at: [1081, 2001] },
    ],
  },
  {
    scenes: [VALUES_FROM + 1],
    marks: [
      {
        kind: "outline",
        points: [
          [4222, 1742],
          [4553, 1748],
          [4550, 1858],
          [4217, 1850],
        ],
      },
    ],
  },
  {
    scenes: [VALUES_FROM + 2],
    marks: [
      { kind: "axis", from: [1450, 1496.5], to: [1920, 1451], extend: 60 },
      // The rule's length, from end to end: a scale rule is 300 mm.
      {
        kind: "dimension",
        from: [1450, 1496.5],
        to: [1920, 1451],
        offset: 62,
        clear: 20,
        text: "300 mm",
      },
    ],
  },
  {
    scenes: [VALUES_FROM + 3],
    marks: [
      { kind: "axis", from: [2605, 357], to: [2950, 567], extend: 25 },
      { kind: "cross", at: [2605, 357] },
    ],
  },
  {
    scenes: [VALUES_FROM + 4],
    marks: [
      {
        kind: "outline",
        points: [
          [4218, 705.5],
          [4371, 726],
          [4359.5, 819],
          [4205.5, 804],
        ],
      },
      { kind: "ring", at: [4287, 763], r: 26 },
    ],
  },
  {
    scenes: [VALUES_FROM + 5],
    marks: [
      {
        kind: "outline",
        points: [
          [5402, 851],
          [5550, 851],
          [5588, 915],
          [5592, 1000],
          [5370, 1000],
          [5373, 915],
        ],
      },
      { kind: "axis", from: [5481, 851], to: [5481, 1000], extend: 40 },
    ],
  },
]

/** What the stage plays: the same for every visitor (see `frames.ts`). */
export const SCRIPT: Script = {
  sceneCount: SCENE_COUNT,
  states: PANEL_STATES,
  paintings: PAINTING_SIZES,
  cuts: CUTS,
  layouts: WINDOW_LAYOUTS,
  people: PEOPLE.length,
  notes: NOTES,
}
