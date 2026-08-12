import { describe, expect, it } from "bun:test"
import {
  ImageConversionReport,
  InspirationReference,
  Workspace
} from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  ImageCodec,
  ImageCodecLive
} from "../src/features/converter/image-codec"
import { sniffImageFormat } from "../src/features/converter/image-conversion"
import { jsonRequest, webHandler } from "../test/api-test-client"

const decodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, response: Response) =>
  Effect.promise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema))
  )

/** A genuinely decodable PNG, so the converter has real pixels to work on. */
const pngFixture = (width: number, height: number) =>
  Effect.gen(function* () {
    const codec = yield* ImageCodec
    const data = new Uint8ClampedArray(width * height * 4)
    for (let index = 0; index < width * height; index += 1) {
      data[index * 4] = index % 256
      data[index * 4 + 1] = (index * 7) % 256
      data[index * 4 + 2] = 40
      data[index * 4 + 3] = 255
    }
    return yield* codec.encode({ data, width, height }, "png", 90)
  }).pipe(Effect.provide(ImageCodecLive))

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

describe("image conversion over HTTP", () => {
  it("converts selected local images into the chosen output folder", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const root = dirname(databasePath)
          const outputDirectory = join(root, "converted-output")
          mkdirSync(outputDirectory, { recursive: true })

          const png = yield* pngFixture(40, 24)
          const sourcePath = join(root, "Studio shot.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const response = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/converter/images", {
                paths: [sourcePath],
                outputDirectory,
                format: "webp",
                quality: 75
              })
            )
          )
          expect(response.status).toBe(200)

          const report = yield* decodeJson(ImageConversionReport, response)
          expect(report.failed).toHaveLength(0)
          expect(report.converted).toHaveLength(1)

          const converted = report.converted[0]
          if (converted === undefined) {
            return yield* Effect.dieMessage("Missing conversion result")
          }
          expect(converted).toMatchObject({
            format: "webp",
            mimeType: "image/webp",
            width: 40,
            height: 24
          })
          // The output keeps the source stem and gains the target extension.
          expect(converted.outputPath).toBe(
            join(outputDirectory, "Studio shot.webp")
          )
          expect(existsSync(converted.outputPath)).toBe(true)

          const written = new Uint8Array(
            yield* Effect.promise(() =>
              Bun.file(converted.outputPath).arrayBuffer()
            )
          )
          expect(sniffImageFormat(written)).toBe("webp")
          expect(written.byteLength).toBe(converted.outputBytes)
          // The source is converted, never consumed.
          expect(existsSync(sourcePath)).toBe(true)
        })
      )
    )
  }, 60_000)

  it("reports per-file failures without discarding the rest of the batch", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const root = dirname(databasePath)
          const outputDirectory = join(root, "mixed-output")
          mkdirSync(outputDirectory, { recursive: true })

          const png = yield* pngFixture(16, 16)
          const goodPath = join(root, "good.png")
          const textPath = join(root, "notes.txt")
          yield* Effect.tryPromise(() => Bun.write(goodPath, png))
          yield* Effect.tryPromise(() => Bun.write(textPath, "not an image"))

          const response = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/converter/images", {
                paths: [goodPath, textPath, join(root, "missing.png")],
                outputDirectory,
                format: "jpeg"
              })
            )
          )
          expect(response.status).toBe(200)

          const report = yield* decodeJson(ImageConversionReport, response)
          expect(report.converted).toHaveLength(1)
          expect(report.failed).toHaveLength(2)
          expect(report.failed.map((item) => item.sourcePath)).toEqual([
            textPath,
            join(root, "missing.png")
          ])
        })
      )
    )
  }, 60_000)

  it("does not overwrite an existing file with the same converted name", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const root = dirname(databasePath)
          const outputDirectory = join(root, "repeat-output")
          mkdirSync(outputDirectory, { recursive: true })

          const png = yield* pngFixture(12, 12)
          const sourcePath = join(root, "repeat.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const convert = () =>
            Effect.promise(() =>
              handler(
                jsonRequest("POST", "/converter/images", {
                  paths: [sourcePath],
                  outputDirectory,
                  format: "webp"
                })
              )
            ).pipe(Effect.flatMap((response) => decodeJson(ImageConversionReport, response)))

          const first = yield* convert()
          const second = yield* convert()

          expect(first.converted[0]?.outputPath).toBe(
            join(outputDirectory, "repeat.webp")
          )
          expect(second.converted[0]?.outputPath).toBe(
            join(outputDirectory, "repeat (1).webp")
          )
          expect(existsSync(join(outputDirectory, "repeat.webp"))).toBe(true)
          expect(existsSync(join(outputDirectory, "repeat (1).webp"))).toBe(true)
        })
      )
    )
  }, 60_000)

  it("rejects a batch when the output folder is not usable", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const root = dirname(databasePath)
          const png = yield* pngFixture(8, 8)
          const sourcePath = join(root, "orphan.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const response = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/converter/images", {
                paths: [sourcePath],
                outputDirectory: join(root, "does-not-exist"),
                format: "png"
              })
            )
          )
          expect(response.status).toBe(400)
        })
      )
    )
  }, 60_000)

  it("converts a library reference into a new reference in the workspace", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspace = yield* firstWorkspace(handler)
          const root = dirname(databasePath)

          const png = yield* pngFixture(64, 48)
          const sourcePath = join(root, "Palette.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, png))

          const importedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/references/import", {
                workspaceId: workspace.id,
                folderId: null,
                path: sourcePath
              })
            )
          )
          expect(importedResponse.status).toBe(201)
          const imported = yield* decodeJson(
            InspirationReference,
            importedResponse
          )

          const response = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", `/converter/references/${imported.id}`, {
                workspaceId: workspace.id,
                folderId: null,
                format: "webp",
                quality: 70
              })
            )
          )
          expect(response.status).toBe(201)

          const created = yield* decodeJson(InspirationReference, response)
          expect(created).toMatchObject({
            workspaceId: workspace.id,
            kind: "image",
            mimeType: "image/webp",
            title: "Palette (WEBP)",
            width: 64,
            height: 48
          })
          expect(created.id).not.toBe(imported.id)

          // The converted asset is served from the library like any other.
          const assetResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", created.assetUrl))
          )
          expect(assetResponse.status).toBe(200)
          const assetBytes = new Uint8Array(
            yield* Effect.promise(() => assetResponse.arrayBuffer())
          )
          expect(sniffImageFormat(assetBytes)).toBe("webp")

          // The original reference survives alongside the conversion.
          const listResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("GET", `/references?workspaceId=${workspace.id}`)
            )
          )
          expect(
            yield* decodeJson(Schema.Array(InspirationReference), listResponse)
          ).toHaveLength(2)
        })
      )
    )
  }, 60_000)
})
