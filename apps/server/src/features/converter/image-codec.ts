import type { ImageConvertFormat } from "@refnest/contracts"
import { Context, Data, Effect, Layer } from "effect"

import jpegDecWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm" with { type: "file" }
import jpegEncWasm from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm" with { type: "file" }
// @ts-expect-error Bun's file loader resolves this to a path string, but
// @jsquash/png ships a sibling .wasm.d.ts describing the wasm-bindgen exports.
import pngWasmPath from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm" with { type: "file" }
import webpDecWasm from "@jsquash/webp/codec/dec/webp_dec.wasm" with { type: "file" }
import webpEncSimdWasm from "@jsquash/webp/codec/enc/webp_enc_simd.wasm" with { type: "file" }
import webpEncWasm from "@jsquash/webp/codec/enc/webp_enc.wasm" with { type: "file" }

import jpegDecode, { init as initJpegDecode } from "@jsquash/jpeg/decode"
import jpegEncode, { init as initJpegEncode } from "@jsquash/jpeg/encode"
import pngDecode, { init as initPngDecode } from "@jsquash/png/decode"
import pngEncode, { init as initPngEncode } from "@jsquash/png/encode"
import webpDecode, { init as initWebpDecode } from "@jsquash/webp/decode"
import webpEncode, { init as initWebpEncode } from "@jsquash/webp/encode"
import { simd } from "wasm-feature-detect"

const pngWasm: string = pngWasmPath

/** Decoded pixels, always 8-bit RGBA. */
export type RawImage = {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export class ImageCodecFailed extends Data.TaggedError("ImageCodecFailed")<{
  readonly reason: string
}> {}

const IMAGE_MIME_TYPES: Readonly<Record<ImageConvertFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
}

const IMAGE_EXTENSIONS: Readonly<Record<ImageConvertFormat, string>> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp"
}

export const mimeTypeForFormat = (format: ImageConvertFormat) =>
  IMAGE_MIME_TYPES[format]

export const extensionForFormat = (format: ImageConvertFormat) =>
  IMAGE_EXTENSIONS[format]

/** Narrows a sniffed MIME type to a format this codec can decode. */
export const formatForMimeType = (
  mimeType: string
): ImageConvertFormat | null => {
  switch (mimeType) {
    case "image/jpeg":
      return "jpeg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    default:
      return null
  }
}

export type ImageCodecShape = {
  readonly decode: (
    bytes: Uint8Array,
    format: ImageConvertFormat
  ) => Effect.Effect<RawImage, ImageCodecFailed>
  readonly encode: (
    image: RawImage,
    format: ImageConvertFormat,
    quality: number
  ) => Effect.Effect<Uint8Array, ImageCodecFailed>
}

export class ImageCodec extends Context.Tag("ImageCodec")<
  ImageCodec,
  ImageCodecShape
>() {}

const compileWasm = (path: string) =>
  Effect.tryPromise({
    try: async () => WebAssembly.compile(await Bun.file(path).arrayBuffer()),
    catch: () =>
      new ImageCodecFailed({ reason: "An image codec could not be loaded." })
  })

/**
 * Every jSquash codec is handed an already-compiled module. Left to itself the
 * emscripten glue resolves its `.wasm` relative to `import.meta.url`, which has
 * no meaning inside the compiled single-file sidecar.
 */
const initialiseCodecs = Effect.gen(function* () {
  const hasSimd = yield* Effect.promise(() => simd())
  const [png, jpegDec, jpegEnc, webpDec, webpEnc] = yield* Effect.all(
    [
      compileWasm(pngWasm),
      compileWasm(jpegDecWasm),
      compileWasm(jpegEncWasm),
      compileWasm(webpDecWasm),
      compileWasm(hasSimd ? webpEncSimdWasm : webpEncWasm)
    ],
    { concurrency: "unbounded" }
  )

  yield* Effect.tryPromise({
    try: async () => {
      // png decode and encode each memoise their own init call.
      await initPngDecode(png)
      await initPngEncode(png)
      await initJpegDecode(jpegDec)
      await initJpegEncode(jpegEnc)
      await initWebpDecode(webpDec)
      await initWebpEncode(webpEnc)
    },
    catch: () =>
      new ImageCodecFailed({ reason: "The image codecs could not be started." })
  })
})

const makeImageCodec = Effect.gen(function* () {
  // Compiling five wasm modules costs real time, so it happens on first
  // conversion rather than at sidecar boot, and only once.
  const ready = yield* Effect.cached(initialiseCodecs)

  const decode = Effect.fn("ImageCodec.decode")(function* (
    bytes: Uint8Array,
    format: ImageConvertFormat
  ) {
    yield* ready
    const decoded = yield* Effect.tryPromise({
      try: async (): Promise<RawImage> => {
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer
        switch (format) {
          case "png":
            return await pngDecode(buffer)
          case "jpeg":
            return await jpegDecode(buffer)
          case "webp":
            return await webpDecode(buffer)
        }
      },
      catch: () =>
        new ImageCodecFailed({
          reason: "The image could not be decoded; it may be corrupt."
        })
    })

    if (
      !Number.isSafeInteger(decoded.width) ||
      !Number.isSafeInteger(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0
    ) {
      return yield* new ImageCodecFailed({
        reason: "The image reported invalid dimensions."
      })
    }

    return decoded
  })

  const encode = Effect.fn("ImageCodec.encode")(function* (
    image: RawImage,
    format: ImageConvertFormat,
    quality: number
  ) {
    yield* ready
    const encoded = yield* Effect.tryPromise({
      try: async () => {
        switch (format) {
          case "png":
            // PNG is lossless, so quality has nothing to act on.
            return await pngEncode(image)
          case "jpeg":
            return await jpegEncode(image, { quality })
          case "webp":
            return await webpEncode(image, { quality })
        }
      },
      catch: () =>
        new ImageCodecFailed({
          reason: `The image could not be encoded as ${format}.`
        })
    })

    const bytes = new Uint8Array(encoded)
    if (bytes.byteLength === 0) {
      return yield* new ImageCodecFailed({
        reason: `The ${format} encoder produced an empty image.`
      })
    }
    return bytes
  })

  return ImageCodec.of({ decode, encode })
})

export const ImageCodecLive = Layer.effect(ImageCodec, makeImageCodec)
