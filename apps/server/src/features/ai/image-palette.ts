import type { RawImage } from "../converter/image-codec"

type ColorBucket = {
  count: number
  red: number
  green: number
  blue: number
}

const hexChannel = (value: number) =>
  Math.round(value).toString(16).padStart(2, "0").toUpperCase()

const distanceSquared = (
  left: readonly [number, number, number],
  right: readonly [number, number, number]
) =>
  (left[0] - right[0]) ** 2 +
  (left[1] - right[1]) ** 2 +
  (left[2] - right[2]) ** 2

/**
 * Extracts a stable palette from decoded pixels. Quantization makes small
 * compression variations converge on the same colour instead of producing a
 * list of almost-identical swatches.
 */
export const extractDominantColors = (
  image: RawImage,
  maximum = 8
): ReadonlyArray<string> => {
  if (maximum <= 0) return []

  const pixelCount = image.width * image.height
  const stride = Math.max(1, Math.floor(pixelCount / 20_000))
  const buckets = new Map<number, ColorBucket>()

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const index = pixel * 4
    const alpha = image.data[index + 3] ?? 0
    if (alpha < 32) continue

    const red = image.data[index] ?? 0
    const green = image.data[index + 1] ?? 0
    const blue = image.data[index + 2] ?? 0
    const key = (red >> 4) << 8 | (green >> 4) << 4 | (blue >> 4)
    const bucket = buckets.get(key)
    if (bucket === undefined) {
      buckets.set(key, { count: 1, red, green, blue })
    } else {
      bucket.count += 1
      bucket.red += red
      bucket.green += green
      bucket.blue += blue
    }
  }

  const selected: Array<readonly [number, number, number]> = []
  const minimumDistanceSquared = 40 ** 2
  for (const [, bucket] of [...buckets].sort(
    ([leftKey, left], [rightKey, right]) =>
      right.count - left.count || leftKey - rightKey
  )) {
    const color = [
      bucket.red / bucket.count,
      bucket.green / bucket.count,
      bucket.blue / bucket.count
    ] as const
    if (
      selected.every(
        (existing) => distanceSquared(existing, color) >= minimumDistanceSquared
      )
    ) {
      selected.push(color)
      if (selected.length >= maximum) break
    }
  }

  return selected.map(
    ([red, green, blue]) =>
      `#${hexChannel(red)}${hexChannel(green)}${hexChannel(blue)}`
  )
}
