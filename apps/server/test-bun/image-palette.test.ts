import { describe, expect, it } from "bun:test"
import { extractDominantColors } from "../src/features/ai/image-palette"

describe("image palette", () => {
  it("orders dominant colors by pixel share and removes near-duplicates", () => {
    const data = new Uint8ClampedArray([
      240, 32, 16, 255,
      242, 34, 18, 255,
      238, 30, 14, 255,
      20, 80, 220, 255
    ])

    expect(extractDominantColors({ data, width: 4, height: 1 })).toStrictEqual([
      "#F12111",
      "#1450DC"
    ])
  })

  it("ignores pixels that are effectively transparent", () => {
    const data = new Uint8ClampedArray([
      255, 0, 255, 0,
      12, 34, 56, 255
    ])

    expect(extractDominantColors({ data, width: 2, height: 1 })).toStrictEqual([
      "#0C2238"
    ])
  })
})
