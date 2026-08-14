import { describe, expect, it } from "bun:test"
import { Effect, Layer } from "effect"
import { basename, join } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { AssetService } from "../src/features/assets/asset-service"
import { ReferenceService } from "../src/features/references/reference-service"
import {
  VideoThumbnailer,
  VideoThumbnailFailed,
  videoThumbnailArguments,
  videoThumbnailOutputName
} from "../src/features/converter/video-thumbnailer"
import { WorkspaceRepository } from "../src/features/workspaces/workspace-repository"
import { temporaryDatabase } from "./temporary-database"

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x00
])

describe("video thumbnail extraction", () => {
  it("selects one representative frame and writes a bounded JPEG", () => {
    const args = videoThumbnailArguments(
      "C:/library/source clip.mp4",
      "C:/previews/video-thumbnail.jpg"
    )

    expect(args).toContain("C:/library/source clip.mp4")
    expect(args).toContain("C:/previews/video-thumbnail.jpg")
    expect(args).toContain("thumbnail=30,scale=1536:1536:force_original_aspect_ratio=decrease")
    expect(args).toContain("1")
  })

  it("allocates a stable JPEG name for each reference", () => {
    expect(basename(videoThumbnailOutputName("reference_123"))).toBe(
      "video-thumbnail-reference_123.jpg"
    )
  })

  it("adds a generated preview when a captured video has no poster", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          let extractionCount = 0
          const fakeThumbnailer = Layer.succeed(
            VideoThumbnailer,
            VideoThumbnailer.of({
              generate: (_sourcePath, referenceId) =>
                Effect.tryPromise(async () => {
                  extractionCount += 1
                  const outputPath = join(
                    database.directory,
                    "previews",
                    videoThumbnailOutputName(referenceId)
                  )
                  await Bun.write(outputPath, JPEG_BYTES)
                  return outputPath
                }).pipe(Effect.orDie)
            })
          )

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const references = yield* ReferenceService
            const assets = yield* AssetService
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) {
              return yield* Effect.dieMessage("Missing default workspace")
            }

            const assetPath = join(workspace.path, "motion-study.mp4")
            yield* Effect.tryPromise(() => Bun.write(assetPath, MP4_BYTES))
            const reference = yield* references.createCaptured({
              workspaceId: workspace.id,
              folderId: null,
              title: "Motion study",
              description: "",
              sourceUrl: "https://example.com/motion-study.mp4",
              source: "website",
              kind: "video",
              assetPath,
              previewPath: null,
              mimeType: "video/mp4",
              width: null,
              height: null,
              durationSeconds: null,
              fileSizeBytes: MP4_BYTES.byteLength,
              tags: [],
              colors: [],
              fileCreatedAt: null,
              fileModifiedAt: null
            })

            expect(extractionCount).toBe(1)
            expect(reference.previewUrl).not.toBeNull()
            const preview = yield* assets.read(
              workspace.id,
              reference.id,
              "preview",
              1_024
            )
            expect(preview.mimeType).toBe("image/jpeg")
            expect(preview.bytes).toStrictEqual(JPEG_BYTES)
          }).pipe(
            Effect.provide(
              applicationServicesLive(database.path, {
                videoThumbnailer: fakeThumbnailer
              })
            )
          )
        })
      )
    )
  })

  it("backfills a poster for video rows created by an older app version", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const unavailableThumbnailer = Layer.succeed(
            VideoThumbnailer,
            VideoThumbnailer.of({
              generate: () =>
                Effect.fail(
                  new VideoThumbnailFailed({ reason: "Unavailable in the old app" })
                )
            })
          )

          const referenceId = yield* Effect.scoped(
            Effect.gen(function* () {
              const workspaces = yield* WorkspaceRepository
              const references = yield* ReferenceService
              const workspace = (yield* workspaces.list)[0]
              if (workspace === undefined) {
                return yield* Effect.dieMessage("Missing default workspace")
              }
              const assetPath = join(workspace.path, "legacy-video.mp4")
              yield* Effect.tryPromise(() => Bun.write(assetPath, MP4_BYTES))
              const reference = yield* references.createCaptured({
                workspaceId: workspace.id,
                folderId: null,
                title: "Legacy video",
                description: "",
                sourceUrl: "https://example.com/legacy-video.mp4",
                source: "website",
                kind: "video",
                assetPath,
                previewPath: null,
                mimeType: "video/mp4",
                width: null,
                height: null,
                durationSeconds: null,
                fileSizeBytes: MP4_BYTES.byteLength,
                tags: [],
                colors: [],
                fileCreatedAt: null,
                fileModifiedAt: null
              })
              expect(reference.previewUrl).toBeNull()
              return reference.id
            }).pipe(
              Effect.provide(
                applicationServicesLive(database.path, {
                  videoThumbnailer: unavailableThumbnailer
                })
              )
            )
          )

          const workingThumbnailer = Layer.succeed(
            VideoThumbnailer,
            VideoThumbnailer.of({
              generate: (_sourcePath, id) =>
                Effect.tryPromise(async () => {
                  const outputPath = join(
                    database.directory,
                    "previews",
                    videoThumbnailOutputName(id)
                  )
                  await Bun.write(outputPath, JPEG_BYTES)
                  return outputPath
                }).pipe(Effect.orDie)
            })
          )

          yield* Effect.scoped(
            Effect.gen(function* () {
              const references = yield* ReferenceService
              let previewUrl: string | null = null
              for (let attempt = 0; attempt < 100; attempt += 1) {
                previewUrl = (yield* references.peek(referenceId)).previewUrl
                if (previewUrl !== null) break
                yield* Effect.sleep("10 millis")
              }
              expect(previewUrl).not.toBeNull()
            }).pipe(
              Effect.provide(
                applicationServicesLive(database.path, {
                  videoThumbnailer: workingThumbnailer
                })
              )
            )
          )
        })
      )
    )
  })
})
