import { Effect } from "effect"
import { extensionForFormat } from "./image-codec"
import {
  type ConvertedImageBytes,
  decodeImageBytes,
  encodeImage,
  sniffImageFormat
} from "./image-conversion"
import { downscaleToFit, flattenOntoWhite } from "./image-raster"

/**
 * Vision endpoints resample to fixed tiles, so a longer edge than this is
 * payload and tokens without accuracy. Base64 adds another third on top.
 */
export const AI_PREVIEW_MAX_EDGE = 1_536
export const AI_PREVIEW_QUALITY = 80

/** The stored asset keeps full resolution, so it is encoded conservatively. */
export const IMPORT_ASSET_QUALITY = 90

/** Every OpenAI-compatible vision endpoint accepts JPEG; WebP support varies. */
export const IMPORT_TARGET_FORMAT = "jpeg" as const

export const IMPORT_TARGET_EXTENSION = extensionForFormat(IMPORT_TARGET_FORMAT)

export type ImportDerivatives = {
  /** The source dimensions, recorded whether or not the asset is re-encoded. */
  readonly width: number
  readonly height: number
  /** Null when auto-convert is off and the original bytes are kept. */
  readonly asset: ConvertedImageBytes | null
  readonly preview: ConvertedImageBytes
}

/** Only files this codec can actually read are worth attempting to convert. */
export const isConvertibleImage = (bytes: Uint8Array) =>
  sniffImageFormat(bytes) !== null

/**
 * One decode feeds both outputs: the full-resolution JPEG that replaces the
 * imported asset, and the downscaled copy the AI request attaches.
 *
 * The preview is built either way. It is what makes AI enrichment work at all,
 * and it is additive, so switching auto-convert off must not disable it.
 */
export const buildImportDerivatives = Effect.fn("buildImportDerivatives")(
  function* (source: Uint8Array, convertAsset: boolean) {
    const decoded = yield* decodeImageBytes(source)
    const opaque = flattenOntoWhite(decoded)

    const asset = convertAsset
      ? yield* encodeImage(opaque, IMPORT_TARGET_FORMAT, IMPORT_ASSET_QUALITY)
      : null
    const preview = yield* encodeImage(
      downscaleToFit(opaque, AI_PREVIEW_MAX_EDGE),
      IMPORT_TARGET_FORMAT,
      AI_PREVIEW_QUALITY
    )

    return {
      width: decoded.width,
      height: decoded.height,
      asset,
      preview
    } satisfies ImportDerivatives
  }
)
