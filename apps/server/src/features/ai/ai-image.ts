import { AiRequestFailed } from "@refnest/contracts"
import { Buffer } from "node:buffer"
import { Effect } from "effect"
import { detectAssetMimeType } from "../assets/asset-mime"
import {
  decodeImageBytes,
  encodeImage,
  MAX_CONVERTIBLE_IMAGE_BYTES,
  sniffImageFormat
} from "../converter/image-conversion"
import type { ImageCodec } from "../converter/image-codec"
import {
  AI_PREVIEW_MAX_EDGE,
  AI_PREVIEW_QUALITY,
  IMPORT_TARGET_FORMAT
} from "../converter/import-derivatives"
import { downscaleToFit, flattenOntoWhite } from "../converter/image-raster"
import { extractDominantColors } from "./image-palette"

const MAX_INLINE_IMAGE_BYTES = 5 * 1_024 * 1_024
const VISION_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
])

type AiImageRequest = {
  readonly assetPath: string
  readonly previewPath: string | null
  readonly mimeType: string
}

export type PreparedAiImage = {
  readonly dataUrl: string
  readonly colors: ReadonlyArray<string>
}

const requestFailure = (reason: string) => new AiRequestFailed({ reason })

const baseMimeType = (value: string) =>
  value.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? ""

const dataUrl = (mimeType: string, bytes: Uint8Array) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`

const prepareCandidate = (
  path: string | null
): Effect.Effect<PreparedAiImage | null, AiRequestFailed, ImageCodec> =>
  Effect.gen(function* () {
    if (path === null || path.length === 0) return null

    const bytes = yield* Effect.tryPromise({
      try: async () => {
        const file = Bun.file(path)
        if (!(await file.exists())) return null
        if (file.size <= 0 || file.size > MAX_CONVERTIBLE_IMAGE_BYTES) return null
        return new Uint8Array(await file.arrayBuffer())
      },
      catch: () => requestFailure("The reference image could not be read for AI.")
    })
    if (bytes === null) return null

    const mimeType = detectAssetMimeType(bytes)
    if (mimeType === null || !VISION_MIME_TYPES.has(mimeType)) return null

    // GIF is accepted by vision endpoints but is not supported by the local
    // raster codec. A bounded GIF can still be attached as-is.
    if (mimeType === "image/gif") {
      return bytes.byteLength <= MAX_INLINE_IMAGE_BYTES
        ? { dataUrl: dataUrl(mimeType, bytes), colors: [] }
        : null
    }

    if (sniffImageFormat(bytes) === null) return null
    const decoded = yield* decodeImageBytes(bytes).pipe(
      Effect.mapError(() =>
        requestFailure("The reference image could not be decoded for AI.")
      )
    )
    const opaque = flattenOntoWhite(decoded)
    const visionImage = downscaleToFit(opaque, AI_PREVIEW_MAX_EDGE)
    const colors = extractDominantColors(visionImage)

    if (
      bytes.byteLength <= MAX_INLINE_IMAGE_BYTES &&
      visionImage === opaque
    ) {
      return { dataUrl: dataUrl(mimeType, bytes), colors }
    }

    const encoded = yield* encodeImage(
      visionImage,
      IMPORT_TARGET_FORMAT,
      AI_PREVIEW_QUALITY
    ).pipe(
      Effect.mapError(() =>
        requestFailure("The reference image could not be resized for AI.")
      )
    )
    if (encoded.bytes.byteLength > MAX_INLINE_IMAGE_BYTES) return null

    return {
      dataUrl: dataUrl(encoded.mimeType, encoded.bytes),
      colors
    }
  })

/**
 * Prefer the stored AI preview, but rebuild a bounded inline image from the
 * original when old captures have no preview. Image references never fall
 * through to a text-only request: that is what caused apology text to be saved.
 */
export const prepareAiImage = (
  request: AiImageRequest
): Effect.Effect<PreparedAiImage | null, AiRequestFailed, ImageCodec> =>
  Effect.gen(function* () {
    for (const path of [request.previewPath, request.assetPath]) {
      const prepared = yield* prepareCandidate(path).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      )
      if (prepared !== null) return prepared
    }

    if (baseMimeType(request.mimeType).startsWith("image/")) {
      return yield* requestFailure(
        "The reference image could not be prepared for AI. Re-import or convert it and try again."
      )
    }
    return null
  })
