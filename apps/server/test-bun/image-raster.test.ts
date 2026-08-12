import { describe, expect, it } from "bun:test"
import type { RawImage } from "../src/features/converter/image-codec"
import {
  downscaleToFit,
  flattenOntoWhite
} from "../src/features/converter/image-raster"

const image = (
  width: number,
  height: number,
  fill: (index: number) => readonly [number, number, number, number]
): RawImage => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const [red, green, blue, alpha] = fill(index)
    data[index * 4] = red
    data[index * 4 + 1] = green
    data[index * 4 + 2] = blue
    data[index * 4 + 3] = alpha
  }
  return { data, width, height }
}

const opaqueGrey = (value: number) =>
  () => [value, value, value, 255] as const

describe("downscaleToFit", () => {
  it("returns the original image untouched when it already fits", () => {
    const source = image(800, 600, opaqueGrey(10))
    expect(downscaleToFit(source, 1_536)).toBe(source)
  })

  it("scales the long edge to the cap and preserves aspect ratio", () => {
    const landscape = downscaleToFit(image(4_000, 2_000, opaqueGrey(10)), 1_536)
    expect(landscape.width).toBe(1_536)
    expect(landscape.height).toBe(768)

    const portrait = downscaleToFit(image(1_000, 5_000, opaqueGrey(10)), 1_536)
    expect(portrait.height).toBe(1_536)
    expect(portrait.width).toBe(307)
  })

  it("averages source pixels instead of dropping them", () => {
    // One black and one white pixel collapsing to a single pixel must land in
    // the middle; a nearest-neighbour shortcut would return 0 or 255.
    const merged = downscaleToFit(
      image(2, 1, (index) =>
        index === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      ),
      1
    )
    expect(merged.width).toBe(1)
    expect(merged.height).toBe(1)
    expect(merged.data[0]).toBeGreaterThan(120)
    expect(merged.data[0]).toBeLessThan(136)
  })

  it("never produces a zero-sized edge for extreme aspect ratios", () => {
    const sliver = downscaleToFit(image(4_000, 3, opaqueGrey(10)), 1_536)
    expect(sliver.width).toBe(1_536)
    expect(sliver.height).toBeGreaterThanOrEqual(1)
  })
})

describe("flattenOntoWhite", () => {
  it("returns the original image when nothing is transparent", () => {
    const source = image(4, 4, opaqueGrey(120))
    expect(flattenOntoWhite(source)).toBe(source)
  })

  it("composites fully transparent pixels to white", () => {
    // Black with zero alpha is the case that betrays a missing composite:
    // JPEG drops the alpha channel and the pixel would encode as black.
    const flattened = flattenOntoWhite(image(1, 1, () => [0, 0, 0, 0]))
    expect(Array.from(flattened.data)).toEqual([255, 255, 255, 255])
  })

  it("blends partial transparency and leaves the result opaque", () => {
    const flattened = flattenOntoWhite(image(1, 1, () => [0, 0, 0, 128]))
    expect(flattened.data[0]).toBeGreaterThan(120)
    expect(flattened.data[0]).toBeLessThan(136)
    expect(flattened.data[3]).toBe(255)
  })

  it("leaves opaque pixels exactly as they were", () => {
    const flattened = flattenOntoWhite(
      image(2, 1, (index) =>
        index === 0 ? [10, 20, 30, 255] : [40, 50, 60, 0]
      )
    )
    expect(Array.from(flattened.data.slice(0, 4))).toEqual([10, 20, 30, 255])
  })
})
