import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { NOTES, PAINTINGS, VALUES, VALUES_FROM } from "./scenes"

/**
 * A WebP file's canvas size, from its first chunk: lossy (`VP8 `), lossless
 * (`VP8L`) or extended (`VP8X`).
 */
function webpSize(bytes: Buffer) {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF")
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP")
  const chunk = bytes.toString("ascii", 12, 16)
  if (chunk === "VP8X") {
    return { w: 1 + bytes.readUIntLE(24, 3), h: 1 + bytes.readUIntLE(27, 3) }
  }
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21)
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) }
  }
  return {
    w: bytes.readUInt16LE(26) & 0x3fff,
    h: bytes.readUInt16LE(28) & 0x3fff,
  }
}

describe("unit: the /new paintings", () => {
  test("each painting's declared size is its file's", () => {
    for (const { image, size } of PAINTINGS) {
      // Under Bun an image import is its file's path.
      const path = image as unknown as string
      expect(webpSize(readFileSync(path))).toEqual(size)
    }
  })

  test("every value's square fits inside the studio", () => {
    const studio = PAINTINGS.find(({ key }) => key === "studio")!.size
    for (const { window } of VALUES) {
      expect(window.span).toBeLessThanOrEqual(Math.min(studio.w, studio.h))
      expect(window.focus[0]).toBeGreaterThanOrEqual(0)
      expect(window.focus[0]).toBeLessThanOrEqual(studio.w)
      expect(window.focus[1]).toBeGreaterThanOrEqual(0)
      expect(window.focus[1]).toBeLessThanOrEqual(studio.h)
    }
  })

  test("no two values share a detail", () => {
    const squares = VALUES.map(({ window }) => window)
    squares.forEach((a, index) => {
      for (const b of squares.slice(index + 1)) {
        // Their squares may overlap at an edge, never by half.
        const apart = Math.max(
          Math.abs(a.focus[0] - b.focus[0]),
          Math.abs(a.focus[1] - b.focus[1]),
        )
        expect(apart).toBeGreaterThan(Math.max(a.span, b.span) / 2)
      }
    })
  })

  test("each value's marks are drawn on its own detail", () => {
    VALUES.forEach(({ window }, index) => {
      const scene = VALUES_FROM + index
      const notes = NOTES.filter(({ scenes }) => scenes.includes(scene))
      expect(notes).toHaveLength(1)
      const points = notes[0]!.marks.flatMap((mark) =>
        mark.kind === "outline"
          ? mark.points
          : mark.kind === "ring" || mark.kind === "cross"
            ? [mark.at]
            : [mark.from, mark.to],
      )
      expect(points.length).toBeGreaterThan(0)
      // Every point a mark is drawn through lies inside the value's square.
      for (const [x, y] of points) {
        expect(Math.abs(x - window.focus[0])).toBeLessThan(window.span / 2)
        expect(Math.abs(y - window.focus[1])).toBeLessThan(window.span / 2)
      }
    })
  })

  test("only the first painting loads first, and only it is described", () => {
    expect(
      PAINTINGS.filter(({ first }) => first).map(({ key }) => key),
    ).toEqual(["meeting"])
    for (const { first, alt } of PAINTINGS) expect(alt.length > 0).toBe(first)
  })
})
