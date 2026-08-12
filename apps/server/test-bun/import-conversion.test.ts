import { describe, expect, it } from "bun:test"
import { InspirationReference, Workspace } from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { dirname, join } from "node:path"
import {
  ImageCodec,
  ImageCodecLive
} from "../src/features/converter/image-codec"
import {
  decodeImageBytes,
  sniffImageFormat
} from "../src/features/converter/image-conversion"
import { AI_PREVIEW_MAX_EDGE } from "../src/features/converter/import-derivatives"
import { jsonRequest, webHandler } from "../test/api-test-client"

const decodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, response: Response) =>
  Effect.promise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema))
  )

const withCodec = <A, E>(effect: Effect.Effect<A, E, ImageCodec>) =>
  effect.pipe(Effect.provide(ImageCodecLive))

const encodePng = (
  width: number,
  height: number,
  fill: (index: number) => readonly [number, number, number, number]
) =>
  withCodec(
    Effect.gen(function* () {
      const codec = yield* ImageCodec
      const data = new Uint8ClampedArray(width * height * 4)
      for (let index = 0; index < width * height; index += 1) {
        const [red, green, blue, alpha] = fill(index)
        data[index * 4] = red
        data[index * 4 + 1] = green
        data[index * 4 + 2] = blue
        data[index * 4 + 3] = alpha
      }
      return yield* codec.encode({ data, width, height }, "png", 90)
    })
  )

const firstWorkspace = (handler: (request: Request) => Promise<Response>) =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() =>
      handler(jsonRequest("GET", "/workspaces"))
    )
    const workspace = (yield* decodeJson(Schema.Array(Workspace), response))[0]
    if (workspace === undefined) {
      return yield* Effect.dieMessage("Missing default workspace")
    }
    return workspace
  })

const importFile = (
  handler: (request: Request) => Promise<Response>,
  workspaceId: string,
  path: string
) =>
  Effect.promise(() =>
    handler(
      jsonRequest("POST", "/references/import", {
        workspaceId,
        folderId: null,
        path
      })
    )
  )

const fetchBytes = (
  handler: (request: Request) => Promise<Response>,
  url: string
) =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() => handler(jsonRequest("GET", url)))
    expect(response.status).toBe(200)
    return new Uint8Array(
      yield* Effect.promise(() => response.arrayBuffer())
    )
  })

describe("import conversion", () => {
  it("stores imported images as JPEG and records real dimensions", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspace = yield* firstWorkspace(handler)

          const png = yield* encodePng(120, 90, (index) => [
            index % 256,
            (index * 3) % 256,
            60,
            255
          ])
          const sourcePath = join(dirname(databasePath), "Grid study.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const response = yield* importFile(handler, workspace.id, sourcePath)
          expect(response.status).toBe(201)

          const imported = yield* decodeJson(InspirationReference, response)
          expect(imported).toMatchObject({
            kind: "image",
            mimeType: "image/jpeg",
            title: "Grid study",
            width: 120,
            height: 90
          })
          // The AI request attaches previewUrl, so it must now be present.
          expect(imported.previewUrl).not.toBeNull()

          const asset = yield* fetchBytes(handler, imported.assetUrl)
          expect(sniffImageFormat(asset)).toBe("jpeg")
          expect(asset.byteLength).toBe(imported.fileSizeBytes)
        })
      )
    )
  }, 60_000)

  it("writes an AI preview capped at the vision-model edge", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspace = yield* firstWorkspace(handler)

          const wide = 2_400
          const tall = 1_200
          const png = yield* encodePng(wide, tall, (index) => [
            index % 256,
            120,
            (index * 7) % 256,
            255
          ])
          const sourcePath = join(dirname(databasePath), "Wide banner.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const response = yield* importFile(handler, workspace.id, sourcePath)
          expect(response.status).toBe(201)
          const imported = yield* decodeJson(InspirationReference, response)

          // The stored asset keeps full resolution...
          expect(imported.width).toBe(wide)
          expect(imported.height).toBe(tall)

          // ...while the preview is downscaled for the model.
          const previewUrl = imported.previewUrl
          if (previewUrl === null) {
            return yield* Effect.dieMessage("Expected a preview URL")
          }
          const previewBytes = yield* fetchBytes(handler, previewUrl)
          expect(sniffImageFormat(previewBytes)).toBe("jpeg")

          const preview = yield* withCodec(decodeImageBytes(previewBytes))
          expect(Math.max(preview.width, preview.height)).toBe(
            AI_PREVIEW_MAX_EDGE
          )
          expect(preview.width).toBe(AI_PREVIEW_MAX_EDGE)
          expect(preview.height).toBe(768)
          expect(previewBytes.byteLength).toBeLessThan(imported.fileSizeBytes)
        })
      )
    )
  }, 60_000)

  it("flattens transparency onto white instead of encoding it black", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspace = yield* firstWorkspace(handler)

          // Fully transparent black: the exact case that encodes as a black
          // block if the alpha channel is dropped without compositing.
          const png = yield* encodePng(32, 32, () => [0, 0, 0, 0])
          const sourcePath = join(dirname(databasePath), "Logo.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const response = yield* importFile(handler, workspace.id, sourcePath)
          expect(response.status).toBe(201)
          const imported = yield* decodeJson(InspirationReference, response)

          const asset = yield* fetchBytes(handler, imported.assetUrl)
          const decoded = yield* withCodec(decodeImageBytes(asset))
          // JPEG is lossy, so allow a little drift from pure white.
          expect(decoded.data[0]).toBeGreaterThan(240)
          expect(decoded.data[1]).toBeGreaterThan(240)
          expect(decoded.data[2]).toBeGreaterThan(240)
        })
      )
    )
  }, 60_000)

  it("keeps original bytes when auto-convert is disabled, but still previews", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspace = yield* firstWorkspace(handler)

          const disabled = yield* Effect.promise(() =>
            handler(
              jsonRequest("PATCH", "/settings", { autoConvertImports: false })
            )
          )
          expect(disabled.status).toBe(200)

          const png = yield* encodePng(100, 50, (index) => [
            index % 256,
            80,
            140,
            255
          ])
          const sourcePath = join(dirname(databasePath), "Untouched.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const response = yield* importFile(handler, workspace.id, sourcePath)
          expect(response.status).toBe(201)
          const imported = yield* decodeJson(InspirationReference, response)

          // The asset is the original PNG, byte for byte.
          expect(imported.mimeType).toBe("image/png")
          expect(imported.fileSizeBytes).toBe(png.byteLength)
          const asset = yield* fetchBytes(handler, imported.assetUrl)
          expect(asset).toStrictEqual(new Uint8Array(png))

          // Dimensions still come from the decode...
          expect(imported.width).toBe(100)
          expect(imported.height).toBe(50)

          // ...and the AI preview is still produced, so enrichment keeps working.
          const previewUrl = imported.previewUrl
          if (previewUrl === null) {
            return yield* Effect.dieMessage(
              "Disabling auto-convert must not disable AI previews"
            )
          }
          const previewBytes = yield* fetchBytes(handler, previewUrl)
          expect(sniffImageFormat(previewBytes)).toBe("jpeg")
        })
      )
    )
  }, 60_000)

  it("imports files the codec cannot read without converting them", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspace = yield* firstWorkspace(handler)

          // A valid GIF header: recognised as an image, but not a format the
          // codec decodes, so it must copy through untouched.
          const gif = new TextEncoder().encode("GIF89a")
          const sourcePath = join(dirname(databasePath), "Loop.gif")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, gif))

          const response = yield* importFile(handler, workspace.id, sourcePath)
          expect(response.status).toBe(201)

          const imported = yield* decodeJson(InspirationReference, response)
          expect(imported).toMatchObject({
            mimeType: "image/gif",
            fileSizeBytes: gif.byteLength,
            previewUrl: null,
            width: null,
            height: null
          })

          const asset = yield* fetchBytes(handler, imported.assetUrl)
          expect(asset).toStrictEqual(gif)
        })
      )
    )
  }, 60_000)
})
