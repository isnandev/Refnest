import { describe, expect, it } from "bun:test"
import type { ImageConvertFormat } from "@refnest/contracts"
import { Effect } from "effect"
import {
  ImageCodec,
  ImageCodecLive,
  formatForMimeType
} from "../src/features/converter/image-codec"
import {
  convertImageBytes,
  MAX_CONVERTIBLE_IMAGE_BYTES,
  sniffImageFormat
} from "../src/features/converter/image-conversion"

const run = <A, E>(effect: Effect.Effect<A, E, ImageCodec>) =>
  Effect.runPromise(Effect.provide(effect, ImageCodecLive))

const gradient = (width: number, height: number) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      data[index] = (x * 3) % 256
      data[index + 1] = (y * 5) % 256
      data[index + 2] = 90
      data[index + 3] = 255
    }
  }
  return { data, width, height }
}

const FORMATS: ReadonlyArray<ImageConvertFormat> = ["png", "jpeg", "webp"]

/** Encodes a known gradient so later assertions run against real image bytes. */
const encodeFixture = (format: ImageConvertFormat, width = 48, height = 32) =>
  Effect.gen(function* () {
    const codec = yield* ImageCodec
    return yield* codec.encode(gradient(width, height), format, 80)
  })

describe("image conversion", () => {
  it("round trips every supported format pair and preserves dimensions", async () => {
    await run(
      Effect.gen(function* () {
        for (const source of FORMATS) {
          const sourceBytes = yield* encodeFixture(source)
          expect(sniffImageFormat(sourceBytes)).toBe(source)

          for (const target of FORMATS) {
            const converted = yield* convertImageBytes(sourceBytes, target, 80)
            expect(converted.width).toBe(48)
            expect(converted.height).toBe(32)
            expect(converted.bytes.byteLength).toBeGreaterThan(0)
            // The output must be recognisable as the format that was asked for.
            expect(sniffImageFormat(converted.bytes)).toBe(target)
            expect(formatForMimeType(converted.mimeType)).toBe(target)
          }
        }
      })
    )
  }, 60_000)

  it("honours quality for lossy formats and ignores it for png", async () => {
    await run(
      Effect.gen(function* () {
        const source = yield* encodeFixture("png", 160, 120)

        const low = yield* convertImageBytes(source, "jpeg", 20)
        const high = yield* convertImageBytes(source, "jpeg", 95)
        expect(low.bytes.byteLength).toBeLessThan(high.bytes.byteLength)

        const lowWebp = yield* convertImageBytes(source, "webp", 20)
        const highWebp = yield* convertImageBytes(source, "webp", 95)
        expect(lowWebp.bytes.byteLength).toBeLessThan(highWebp.bytes.byteLength)

        // PNG is lossless, so the quality argument must not change the output.
        const pngLow = yield* convertImageBytes(source, "png", 20)
        const pngHigh = yield* convertImageBytes(source, "png", 95)
        expect(pngLow.bytes.byteLength).toBe(pngHigh.bytes.byteLength)
      })
    )
  }, 60_000)

  it("rejects input that is not a supported image", async () => {
    const result = await run(
      convertImageBytes(
        new TextEncoder().encode("this is plainly not an image"),
        "webp",
        80
      ).pipe(Effect.either)
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.reason).toContain("PNG, JPEG, and WebP")
    }
  })

  it("rejects empty input", async () => {
    const result = await run(
      convertImageBytes(new Uint8Array(0), "png", 80).pipe(Effect.either)
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.reason).toContain("empty")
    }
  })

  it("rejects input beyond the size limit before decoding it", async () => {
    const oversized = new Uint8Array(MAX_CONVERTIBLE_IMAGE_BYTES + 1)
    // A real PNG signature, so the rejection is the size check and not the sniff.
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)

    const result = await run(
      convertImageBytes(oversized, "webp", 80).pipe(Effect.either)
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.reason).toContain("64 MB")
    }
  })

  it("rejects a corrupt image that only looks like a supported format", async () => {
    const corrupt = new Uint8Array(256)
    corrupt.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)

    const result = await run(
      convertImageBytes(corrupt, "webp", 80).pipe(Effect.either)
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.reason).toContain("decoded")
    }
  }, 30_000)
})
