import type { ImageConvertFormat } from "@refnest/contracts"
import { Effect } from "effect"
import { detectAssetMimeType } from "../assets/asset-mime"
import {
  formatForMimeType,
  ImageCodec,
  ImageCodecFailed,
  mimeTypeForFormat,
  type RawImage
} from "./image-codec"

/**
 * Conversion decodes to raw RGBA, so the byte cap is deliberately far below the
 * capture pipeline's: a 64 MB source is already ~2 GB of pixels at the pixel cap.
 */
export const MAX_CONVERTIBLE_IMAGE_BYTES = 64 * 1_024 * 1_024
export const MAX_CONVERTIBLE_IMAGE_PIXELS = 50_000_000

export type ConvertedImageBytes = {
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly width: number
  readonly height: number
}

/** Identifies the source format from magic bytes rather than the file name. */
export const sniffImageFormat = (
  bytes: Uint8Array
): ImageConvertFormat | null => {
  const mimeType = detectAssetMimeType(bytes)
  return mimeType === null ? null : formatForMimeType(mimeType)
}

/** Validates and decodes to raw pixels; separate so callers can encode twice. */
export const decodeImageBytes = Effect.fn("decodeImageBytes")(function* (
  source: Uint8Array
) {
  if (source.byteLength === 0) {
    return yield* new ImageCodecFailed({ reason: "The image file is empty." })
  }
  if (source.byteLength > MAX_CONVERTIBLE_IMAGE_BYTES) {
    return yield* new ImageCodecFailed({
      reason: "The image is larger than the 64 MB conversion limit."
    })
  }

  const sourceFormat = sniffImageFormat(source)
  if (sourceFormat === null) {
    return yield* new ImageCodecFailed({
      reason: "Only PNG, JPEG, and WebP images can be converted."
    })
  }

  const codec = yield* ImageCodec
  const decoded = yield* codec.decode(source, sourceFormat)

  if (decoded.width * decoded.height > MAX_CONVERTIBLE_IMAGE_PIXELS) {
    return yield* new ImageCodecFailed({
      reason: "The image exceeds the 50 megapixel conversion limit."
    })
  }

  return decoded
})

export const encodeImage = Effect.fn("encodeImage")(function* (
  image: RawImage,
  target: ImageConvertFormat,
  quality: number
) {
  const codec = yield* ImageCodec
  const bytes = yield* codec.encode(image, target, quality)

  return {
    bytes,
    mimeType: mimeTypeForFormat(target),
    width: image.width,
    height: image.height
  } satisfies ConvertedImageBytes
})

export const convertImageBytes = Effect.fn("convertImageBytes")(function* (
  source: Uint8Array,
  target: ImageConvertFormat,
  quality: number
) {
  const decoded = yield* decodeImageBytes(source)
  return yield* encodeImage(decoded, target, quality)
})
