import type { RawImage } from "./image-codec"

/**
 * JPEG has no alpha channel. Without an explicit composite, a transparent PNG
 * or WebP encodes whatever undefined colour sits under the transparent pixels,
 * which is usually black fringing around logos and UI exports.
 */
export const flattenOntoWhite = (image: RawImage): RawImage => {
  const source = image.data
  let transparent = false
  for (let index = 3; index < source.length; index += 4) {
    if (source[index] !== 255) {
      transparent = true
      break
    }
  }
  if (!transparent) return image

  const data = new Uint8ClampedArray(source.length)
  for (let index = 0; index < source.length; index += 4) {
    const alpha = (source[index + 3] ?? 255) / 255
    const inverse = 255 * (1 - alpha)
    data[index] = (source[index] ?? 0) * alpha + inverse
    data[index + 1] = (source[index + 1] ?? 0) * alpha + inverse
    data[index + 2] = (source[index + 2] ?? 0) * alpha + inverse
    data[index + 3] = 255
  }

  return { data, width: image.width, height: image.height }
}

/**
 * Area-averaging downscale. Vision models resample to fixed tiles anyway, so
 * anything past the cap is payload without accuracy. Returns the original when
 * it already fits, so the common case allocates nothing.
 */
export const downscaleToFit = (image: RawImage, maxEdge: number): RawImage => {
  const longestEdge = Math.max(image.width, image.height)
  if (longestEdge <= maxEdge) return image

  const scale = maxEdge / longestEdge
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const source = image.data
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const sourceTop = Math.floor((y * image.height) / height)
    const sourceBottom = Math.max(
      sourceTop + 1,
      Math.floor(((y + 1) * image.height) / height)
    )

    for (let x = 0; x < width; x += 1) {
      const sourceLeft = Math.floor((x * image.width) / width)
      const sourceRight = Math.max(
        sourceLeft + 1,
        Math.floor(((x + 1) * image.width) / width)
      )

      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let samples = 0

      for (let sourceY = sourceTop; sourceY < sourceBottom; sourceY += 1) {
        for (let sourceX = sourceLeft; sourceX < sourceRight; sourceX += 1) {
          const index = (sourceY * image.width + sourceX) * 4
          red += source[index] ?? 0
          green += source[index + 1] ?? 0
          blue += source[index + 2] ?? 0
          alpha += source[index + 3] ?? 0
          samples += 1
        }
      }

      const target = (y * width + x) * 4
      data[target] = red / samples
      data[target + 1] = green / samples
      data[target + 2] = blue / samples
      data[target + 3] = alpha / samples
    }
  }

  return { data, width, height }
}
