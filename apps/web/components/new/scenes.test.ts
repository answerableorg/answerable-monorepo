import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { PAINTINGS, VALUES } from "./scenes"

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

  test("the values read the panorama from left to right", () => {
    const xs = VALUES.map(({ window }) => window.focus[0])
    expect(xs.slice(0, 3)).toEqual([...xs.slice(0, 3)].sort((a, b) => a - b))
    // Values 4 and 5 share a column (the plaque below, the letter above).
    expect(Math.abs(xs[3]! - xs[4]!)).toBeLessThan(200)
    expect(xs[5]).toBeGreaterThan(Math.max(...xs.slice(0, 5)))
  })

  test("only the first painting loads first, and only it is described", () => {
    expect(
      PAINTINGS.filter(({ first }) => first).map(({ key }) => key),
    ).toEqual(["meeting"])
    for (const { first, alt } of PAINTINGS) expect(alt.length > 0).toBe(first)
  })
})
