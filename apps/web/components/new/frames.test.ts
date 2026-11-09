import { describe, expect, test } from "bun:test"

import {
  fieldLayers,
  frameAt,
  type Frame,
  type Layout,
  type Script,
} from "./frames"
import { PANEL_STATES, SCENE_COUNT, VALUES, WINDOW_LAYOUTS } from "./scenes"

const SCRIPT: Script = {
  sceneCount: SCENE_COUNT,
  states: PANEL_STATES,
  image: { w: 1086, h: 1448 },
  layouts: WINDOW_LAYOUTS,
  people: 2,
}

/** The page's scenes: hero, programme, values (2 to 7), people, join. */
const SCENES = [
  { from: 0, to: 0, lines: 4 },
  { from: 1, to: 1, lines: 4 },
  { from: 2, to: 7, lines: 3 },
  { from: 8, to: 8, lines: 4 },
  { from: 9, to: 9, lines: 3 },
]

function layout(reduced = false, column = true): Layout {
  return {
    reduced,
    lineTravel: 24,
    scenes: SCENES,
    values: {
      from: 2,
      count: VALUES.length,
      travel: 80,
      markX: VALUES.map((_, index) => index * 40),
    },
    panel: {
      size: column ? { w: 704, h: 868 } : { w: 390, h: 300 },
      column,
      margin: 32,
    },
  }
}

/** The frame at a stage position, 0 to `SCENE_COUNT`. */
function at(progress: number, measured = layout()): Frame {
  const segment = Math.min(Math.floor(progress), SCENE_COUNT - 1)
  return frameAt(SCRIPT, measured, segment, progress - segment)
}

/** Where the picture sits on the panel: its left, top and scale. */
function picture(frame: Frame) {
  const head = frame.head!
  const image = frame.headImage!
  return [
    head.x! + image.x! * head.s!,
    head.y! + image.y! * head.s!,
    image.s! * head.s!,
  ]
}

const POSITIONS = Array.from({ length: SCENE_COUNT * 40 + 1 }, (_, n) => n / 40)

describe("unit: the stage's frames", () => {
  test("at rest, the scene on screen is in place and every other is out", () => {
    for (let scene = 0; scene <= SCENE_COUNT; scene++) {
      const frame = at(scene)
      const on = SCENES.findIndex(
        ({ from, to }) =>
          (scene >= from && scene <= to) ||
          (scene === SCENE_COUNT && from === 0),
      )
      SCENES.forEach(({ lines }, index) => {
        for (let line = 0; line < lines; line++) {
          const style = frame[`line:${index}:${line}`]!
          expect(style.opacity).toBe(index === on ? 1 : 0)
          if (index === on) expect(style.y).toBe(0)
        }
      })
    }
  })

  test("two scenes' copy never shows at once", () => {
    for (const progress of POSITIONS) {
      const frame = at(progress)
      const showing = SCENES.filter((scene, index) =>
        Array.from({ length: scene.lines }).some(
          (_, line) => frame[`line:${index}:${line}`]!.opacity! > 0,
        ),
      )
      expect(showing.length).toBeLessThanOrEqual(1)
    }
  })

  test("the picture never jumps where one transition meets the next", () => {
    for (let segment = 0; segment < SCENE_COUNT - 1; segment++) {
      const end = picture(frameAt(SCRIPT, layout(), segment, 1))
      const start = picture(frameAt(SCRIPT, layout(), segment + 1, 0))
      end.forEach((value, index) => expect(value).toBeCloseTo(start[index]!, 6))
    }
  })

  test("the copy never jumps where one transition meets the next", () => {
    for (let segment = 0; segment < SCENE_COUNT - 1; segment++) {
      const end = frameAt(SCRIPT, layout(), segment, 1)
      const start = frameAt(SCRIPT, layout(), segment + 1, 0)
      for (const key of Object.keys(end)) {
        if (!/^(line|step|mark|tint|highlight)/.test(key)) continue
        expect(end[key]).toEqual(start[key]!)
      }
    }
  })

  test("at rest on a value, the highlight sits on its number in its colour", () => {
    VALUES.forEach((_, value) => {
      const frame = at(2 + value)
      expect(frame.highlight!.x).toBe(value * 40)
      expect(frame[`tint:${value}`]!.opacity).toBe(1)
      // No colour above it shows.
      for (let k = value + 1; k < VALUES.length; k++) {
        expect(frame[`tint:${k}`]!.opacity).toBe(0)
      }
      expect(frame[`mark:${value}`]!.opacity).toBe(1)
      expect(frame[`step:${value}`]!.opacity).toBe(1)
    })
  })

  test("at rest on a scene with a field, its colour is the top layer shown", () => {
    const layers = fieldLayers(PANEL_STATES)
    for (let scene = 0; scene < SCENE_COUNT; scene++) {
      const field = PANEL_STATES[scene]!.field
      if (!field) continue
      const frame = at(scene)
      const top = layers.findLastIndex(
        (_, layer) => frame[`field:${layer}`]!.opacity === 1,
      )
      expect(layers[top]!.colour).toBe(field)
      expect(scene).toBeGreaterThanOrEqual(layers[top]!.from)
      expect(scene).toBeLessThanOrEqual(layers[top]!.to)
      // The tail's covers match the field.
      layers.forEach((_, layer) =>
        expect(frame[`cover:${layer}`]).toEqual(frame[`field:${layer}`]!),
      )
    }
  })

  test("scenes in one colour share a layer, and a new colour fades in over it", () => {
    const plain = { window: null, badge: false, team: false }
    const states = [
      { ...plain, field: null },
      { ...plain, field: "white" },
      { ...plain, field: "white" },
      { ...plain, field: "green" },
      { ...plain, field: null },
      { ...plain, field: "white" },
    ]
    expect(fieldLayers(states)).toEqual([
      { colour: "white", from: 1, to: 2 },
      { colour: "green", from: 3, to: 3 },
      { colour: "white", from: 5, to: 5 },
    ])
    // The page's own fields: all white, so one layer.
    expect(fieldLayers(PANEL_STATES)).toEqual([
      { colour: "#fff", from: 1, to: VALUES.length + 1 },
    ])
  })

  test("the badge shows only on the first scene, beside the form", () => {
    for (let scene = 0; scene <= SCENE_COUNT; scene++) {
      expect(at(scene).badge!.opacity).toBe(
        scene === 0 || scene === SCENE_COUNT ? 1 : 0,
      )
    }
  })

  test("the portraits show only around the people scene, colours before faces", () => {
    for (const progress of POSITIONS) {
      const frame = at(progress)
      const colours = frame["half:0"]!.opacity!
      const faces = frame["comma:0"]!.opacity!
      if (progress <= 7 || progress >= 9) expect(colours).toBe(0)
      if (progress === 8) expect([colours, faces]).toEqual([1, 1])
      // A face only ever shows on a colour that is already solid.
      if (faces > 0) expect(colours).toBe(1)
    }
  })

  test("reduced motion moves nothing and cuts through white", () => {
    const reduced = layout(true)
    for (const progress of POSITIONS) {
      const frame = at(progress, reduced)
      for (const [key, style] of Object.entries(frame)) {
        if (key.startsWith("line:") || key.startsWith("step:")) {
          expect(style.y).toBe(0)
        }
      }
    }
    expect(at(4.5, reduced).panel!.opacity).toBe(0)
    expect(at(4, reduced).panel!.opacity).toBe(1)
    // Either side of the cut, the picture holds one scene's view.
    expect(picture(at(4.2, reduced))).toEqual(picture(at(4, reduced)))
    expect(picture(at(4.8, reduced))).toEqual(picture(at(5, reduced)))
  })

  test("a panel without a size draws nothing", () => {
    const frame = frameAt(
      SCRIPT,
      {
        ...layout(),
        panel: { size: { w: 390, h: 0 }, column: false, margin: 24 },
      },
      3,
      0.5,
    )
    expect(frame.head).toBeUndefined()
    expect(frame["line:2:0"]).toBeDefined()
  })

  test("every number is finite, on both layouts", () => {
    for (const column of [true, false]) {
      for (const progress of POSITIONS) {
        for (const style of Object.values(
          at(progress, layout(false, column)),
        )) {
          for (const value of Object.values(style)) {
            expect(Number.isFinite(value)).toBe(true)
          }
        }
      }
    }
  })
})
