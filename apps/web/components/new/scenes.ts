import type { StaticImageData } from "next/image"

import hero from "@/assets/new/hero.webp"
import keir from "@/assets/new/keir.webp"
import sadie from "@/assets/new/sadie.webp"
import type { Shape, Window, WindowLayout } from "@/lib/stage-math"

/**
 * The /new stage, as data: the scenes in scroll order, what the image panel
 * shows on each, and the details the six values zoom in on. A new
 * illustration is one file in `assets/new/` and new `focus` points here.
 */

/** Scenes 0 to 9; the last snap point, 10, is the hero again. */
export const SCENE_COUNT = 10

export const HERO = {
  image: hero,
  size: { w: hero.width, h: hero.height },
  alt: "An illustration of a practice at work around a long table: colleagues measure and label a white architectural model, one signs a drawing, two review a design on a laptop, and two pass a sealed letter.",
}

/** The brand's four highlights, the colours of the zoom fields. */
const SKY = "var(--highlight-1)"
const SAND = "var(--highlight-2)"
const GREEN = "var(--highlight-3)"
const CORAL = "var(--highlight-4)"
const BLACK = "#000"

export type Value = {
  text: string
  /** The field round the window, and the value's number. */
  colour: string
  /** The detail of the illustration that stands for it. */
  window: Window
}

/**
 * The six values, each with the detail Laura's zooms frame: the signature,
 * the ruler, the conversation, the name plaque, the sealed letter, the
 * laptop. `focus` is in the illustration's pixels (1086×1448). The windows
 * take the logo's two marks, two squares then a comma, twice over, so the
 * tail grows and retracts as the reader goes.
 */
export const VALUES: readonly Value[] = [
  {
    text: "We hold ourselves answerable for our work.",
    colour: GREEN,
    window: { focus: [866, 998], span: 250, size: 1.05, shape: "square" },
  },
  {
    text: "We use AI only where we are competent to do so.",
    colour: CORAL,
    window: { focus: [478, 600], span: 300, size: 1.2, shape: "square" },
  },
  {
    text: "We are honest about how we use AI.",
    colour: SKY,
    window: { focus: [446, 392], span: 330, size: 1.1, shape: "comma" },
  },
  {
    text: "We respect the intellectual and creative work of others.",
    colour: SAND,
    window: { focus: [296, 800], span: 210, size: 1, shape: "square" },
  },
  {
    text: "We protect the information entrusted to us.",
    colour: GREEN,
    window: { focus: [262, 1166], span: 230, size: 1, shape: "square" },
  },
  {
    text: "We use AI to strengthen our professions, not to diminish them.",
    colour: CORAL,
    window: { focus: [898, 482], span: 380, size: 1.15, shape: "comma" },
  },
]

/** The first values scene. */
export const VALUES_FROM = 2

export type PanelState = {
  /** The colour round the window; none while the picture is open. */
  field: string | null
  /** The comma window; none for the whole picture. */
  window: Window | null
  /** The Answerable AP badge in the corner. */
  badge: boolean
  /** The two portraits over the picture. */
  team: boolean
}

const OPEN: PanelState = {
  field: null,
  window: null,
  badge: false,
  team: false,
}

/** One per scene, by index. */
export const PANEL_STATES: readonly PanelState[] = [
  // Hero: the whole picture and the badge on its sky.
  { ...OPEN, badge: true },
  // Programme: black closes in to the model, the work itself.
  {
    field: BLACK,
    window: { focus: [556, 786], span: 760, size: 1.75, shape: "comma" },
    badge: true,
    team: false,
  },
  ...VALUES.map((value) => ({
    ...OPEN,
    field: value.colour,
    window: value.window,
  })),
  // People: the picture opens again under the portraits.
  { ...OPEN, team: true },
  // Join: the whole picture, as the hero has it.
  OPEN,
]

/**
 * The panel's two shapes. `column` is the image beside the copy; `band` is
 * the strip across a phone. Sizes are shares of the shorter side; the margin
 * is the panel's inset, `--inset`, which the badge measures out.
 */
export const WINDOW_LAYOUTS = {
  column: { base: 0.36, anchorY: 0.5, maxScale: 1.3 },
  band: { base: 0.5, anchorY: 0.36, maxScale: 1.3 },
} as const satisfies Record<string, WindowLayout>

export type Person = {
  name: string
  line: string
  colour: string
  /** The portrait's window: the logo's square or its comma. */
  shape: Shape
  /** A black and white photograph, square. */
  portrait: StaticImageData
  /**
   * The photograph's `object-position` in the window. The comma is narrower
   * than the photograph and crops its sides: this puts the face in its head.
   */
  position: string
}

export const PEOPLE: readonly Person[] = [
  {
    name: "Keir Regan-Alexander",
    line: "Has helped more than 100 AEC firms develop their approach to AI over the past three years.",
    colour: GREEN,
    shape: "square",
    portrait: keir,
    position: "50% 50%",
  },
  {
    name: "Sadie Morgan OBE",
    line: "Co-founder of Stirling Prize-winning dRMM and founder of the Quality of Life Foundation.",
    colour: SKY,
    shape: "comma",
    portrait: sadie,
    position: "30% 50%",
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
