import { describe, expect, it } from "bun:test"
import {
  AiSettings,
  CaptureJobId,
  CreateQuickSave
} from "@refnest/contracts"
import { Deferred, Effect, Layer } from "effect"
import { join } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { AiService } from "../src/features/ai/ai-service"
import { AiProviderPolicyLive } from "../src/features/ai/ai-provider-policy"
import {
  AiSettingsRepositoryLive
} from "../src/features/ai/ai-settings-repository"
import { FolderServiceLive } from "../src/features/folders/folder-service"
import {
  CaptureEngine,
  type CaptureRequest
} from "../src/features/quick-save/capture-engine"
import { CaptureFailure } from "../src/features/quick-save/capture-failure"
import {
  QuickSaveService,
  QuickSaveServiceLive
} from "../src/features/quick-save/quick-save-service"
import { QuickSaveSchedulerLive } from "../src/features/quick-save/quick-save-scheduler"
import { ReferenceService, ReferenceServiceLive } from "../src/features/references/reference-service"
import {
  WorkspaceRepository,
  WorkspaceRepositoryLive
} from "../src/features/workspaces/workspace-repository"
import { appPathsLive } from "../src/persistence/app-paths"
import {
  SqliteDatabase,
  sqliteDatabaseLive
} from "../src/persistence/sqlite-database"
import { temporaryDatabase } from "./temporary-database"
import {
  OutboundUrlPolicy,
  makeOutboundUrlPolicy
} from "../src/security/outbound-url-policy"

const fakeAiSettings = new AiSettings({
  baseUrl: "http://provider.invalid/v1",
  model: "unused-model",
  hasApiKey: false,
  localProvider: false,
  enabled: false
})

const FakeAiService = Layer.succeed(
  AiService,
  AiService.of({
    getSettings: () => Effect.succeed(fakeAiSettings),
    updateSettings: () => Effect.succeed(fakeAiSettings),
    enrichReference: () => Effect.dieMessage("AI enrichment was not expected"),
    enrichReferenceScoped: () =>
      Effect.dieMessage("AI enrichment was not expected")
  })
)

const FakeOutboundUrlPolicy = Layer.succeed(
  OutboundUrlPolicy,
  OutboundUrlPolicy.of(
    makeOutboundUrlPolicy(() => Effect.succeed(["93.184.216.34"]))
  )
)

const quickSaveTestLayer = (
  databasePath: string,
  captureEngine: Layer.Layer<CaptureEngine>
) => {
  const infrastructure = Layer.merge(
    appPathsLive(databasePath),
    sqliteDatabaseLive(databasePath)
  )
  const workspaces = WorkspaceRepositoryLive.pipe(Layer.provide(infrastructure))
  const folders = FolderServiceLive.pipe(
    Layer.provide(Layer.merge(infrastructure, workspaces))
  )
  const references = ReferenceServiceLive.pipe(
    Layer.provide(Layer.merge(infrastructure, folders))
  )
  const aiProviderPolicy = AiProviderPolicyLive.pipe(
    Layer.provide(FakeOutboundUrlPolicy)
  )
  const aiSettings = AiSettingsRepositoryLive.pipe(
    Layer.provide(Layer.merge(infrastructure, aiProviderPolicy))
  )
  const quickSave = QuickSaveServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        infrastructure,
        folders,
        references,
        captureEngine,
        FakeAiService,
        aiSettings,
        FakeOutboundUrlPolicy,
        QuickSaveSchedulerLive
      )
    )
  )

  return Layer.mergeAll(workspaces, references, quickSave)
}

describe("Quick Save service", () => {
  it("returns a queued job and processes it asynchronously through a fake capture", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const captureStarted = yield* Deferred.make<void>()
          const releaseCapture = yield* Deferred.make<void>()
          const fakeCapture = Layer.succeed(
            CaptureEngine,
            CaptureEngine.of({
              capture: Effect.fn("FakeCaptureEngine.capture")(function* (
                request: CaptureRequest
              ) {
                yield* Deferred.succeed(captureStarted, undefined)
                yield* Deferred.await(releaseCapture)
                const assetPath = join(
                  database.directory,
                  "Inspiration Vault",
                  `reference-${request.jobId}.png`
                )
                yield* Effect.tryPromise(() =>
                  Bun.write(assetPath, new Uint8Array([1]))
                ).pipe(
                  Effect.mapError(
                    () => new CaptureFailure({ reason: "Fake capture write failed." })
                  )
                )
                return {
                  workspaceId: request.workspaceId,
                  folderId: request.folderId,
                  title: "Captured example",
                  description: "Captured without external I/O.",
                  sourceUrl: request.url.toString(),
                  source: request.source,
                  kind: "web-capture",
                  assetPath,
                  previewPath: null,
                  mimeType: "image/png",
                  width: 1_440,
                  height: 900,
                  durationSeconds: null,
                  fileSizeBytes: 1,
                  tags: ["Website"],
                  colors: []
                }
              })
            })
          )

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const quickSave = yield* QuickSaveService
            const references = yield* ReferenceService
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) return yield* Effect.dieMessage("Missing default workspace")

            const queued = yield* quickSave.enqueue(
              new CreateQuickSave({
                workspaceId: workspace.id,
                folderId: null,
                url: "https://example.com/article",
                autoMetadata: false
              })
            )
            expect(queued.status).toBe("queued")
            expect(queued.source).toBe("website")

            yield* Deferred.await(captureStarted)
            expect((yield* quickSave.get(queued.id)).status).toBe("capturing")
            yield* Deferred.succeed(releaseCapture, undefined)

            let completed = yield* quickSave.get(queued.id)
            for (let attempt = 0; attempt < 100 && completed.status !== "completed"; attempt += 1) {
              yield* Effect.sleep("5 millis")
              completed = yield* quickSave.get(queued.id)
            }

            expect(completed.status).toBe("completed")
            expect(completed.referenceId).not.toBeNull()
            expect(yield* quickSave.list(workspace.id)).toHaveLength(1)
            expect(yield* references.list({ workspaceId: workspace.id })).toHaveLength(1)

            const rejected = yield* quickSave
              .enqueue(
                new CreateQuickSave({
                  workspaceId: workspace.id,
                  folderId: null,
                  url: "file:///tmp/reference.png",
                  autoMetadata: false
                })
              )
              .pipe(Effect.either)
            expect(rejected._tag).toBe("Left")
            if (rejected._tag === "Left") {
              expect(rejected.left._tag).toBe("QuickSaveRejected")
            }

            const loopback = yield* quickSave
              .enqueue(
                new CreateQuickSave({
                  workspaceId: workspace.id,
                  folderId: null,
                  url: "http://127.0.0.1/internal",
                  autoMetadata: false
                })
              )
              .pipe(Effect.either)
            expect(loopback).toMatchObject({
              _tag: "Left",
              left: { _tag: "QuickSaveRejected" }
            })
          }).pipe(
            Effect.provide(quickSaveTestLayer(database.path, fakeCapture))
          )
        })
      )
    )
  })

  it("marks a persisted queued job as failed after an interrupted app session", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const workspace = yield* Effect.scoped(
            Effect.gen(function* () {
              const workspaces = yield* WorkspaceRepository
              const first = (yield* workspaces.list)[0]
              return first ?? (yield* Effect.dieMessage("Missing default workspace"))
            }).pipe(Effect.provide(applicationServicesLive(database.path)))
          )
          const jobId = CaptureJobId.make("capture_interrupted")
          const now = new Date().toISOString()

          yield* Effect.scoped(
            Effect.gen(function* () {
              const { connection } = yield* SqliteDatabase
              yield* Effect.sync(() =>
                connection
                  .query<
                    never,
                    [CaptureJobId, typeof workspace.id, string, string, string]
                  >(`
                    INSERT INTO capture_jobs (
                      id, workspace_id, folder_id, url, source, status,
                      auto_metadata, reference_id, error, warning, created_at, updated_at
                    ) VALUES (?, ?, NULL, ?, 'website', 'queued', 0, NULL, NULL, NULL, ?, ?)
                  `)
                  .run(
                    jobId,
                    workspace.id,
                    "https://example.com/interrupted",
                    now,
                    now
                  )
              )
            }).pipe(Effect.provide(sqliteDatabaseLive(database.path)))
          )

          const unusedCapture = Layer.succeed(
            CaptureEngine,
            CaptureEngine.of({
              capture: () => Effect.dieMessage("Capture should not restart automatically")
            })
          )
          const recovered = yield* Effect.scoped(
            Effect.gen(function* () {
              const quickSave = yield* QuickSaveService
              return yield* quickSave.get(jobId)
            }).pipe(
              Effect.provide(
                quickSaveTestLayer(database.path, unusedCapture)
              )
            )
          )

          expect(recovered.status).toBe("failed")
          expect(recovered.error).toBe(
            "The app closed before this capture finished."
          )
        })
      )
    )
  })

  it("never runs more than two queued captures concurrently", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const twoCapturesStarted = yield* Deferred.make<void>()
          const releaseCaptures = yield* Deferred.make<void>()
          let activeCaptures = 0
          let startedCaptures = 0
          let maximumActiveCaptures = 0

          const fakeCapture = Layer.succeed(
            CaptureEngine,
            CaptureEngine.of({
              capture: Effect.fn("ConcurrentFakeCapture.capture")(
                (request: CaptureRequest) =>
                  Effect.acquireUseRelease(
                    Effect.sync(() => {
                      activeCaptures += 1
                      startedCaptures += 1
                      maximumActiveCaptures = Math.max(
                        maximumActiveCaptures,
                        activeCaptures
                      )
                      if (startedCaptures === 2) {
                        Deferred.unsafeDone(
                          twoCapturesStarted,
                          Effect.succeed(undefined)
                        )
                      }
                    }),
                    () =>
                      Effect.gen(function* () {
                        yield* Deferred.await(releaseCaptures)
                        const assetPath = join(
                          database.directory,
                          "Inspiration Vault",
                          `${request.jobId}.png`
                        )
                        yield* Effect.tryPromise(() =>
                          Bun.write(assetPath, new Uint8Array([1]))
                        ).pipe(
                          Effect.mapError(
                            () =>
                              new CaptureFailure({
                                reason: "Fake capture write failed."
                              })
                          )
                        )
                        return {
                          workspaceId: request.workspaceId,
                          folderId: request.folderId,
                          title: "Bounded capture",
                          description: "",
                          sourceUrl: request.url.toString(),
                          source: request.source,
                          kind: "web-capture" as const,
                          assetPath,
                          previewPath: null,
                          mimeType: "image/png",
                          width: 1,
                          height: 1,
                          durationSeconds: null,
                          fileSizeBytes: 1,
                          tags: [],
                          colors: []
                        }
                      }),
                    () =>
                      Effect.sync(() => {
                        activeCaptures -= 1
                      })
                  )
              )
            })
          )

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const quickSave = yield* QuickSaveService
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) {
              return yield* Effect.dieMessage("Missing default workspace")
            }

            const jobs = []
            for (let index = 0; index < 3; index += 1) {
              jobs.push(
                yield* quickSave.enqueue(
                  new CreateQuickSave({
                    workspaceId: workspace.id,
                    folderId: null,
                    url: `https://example.com/capture-${index}`,
                    autoMetadata: false
                  })
                )
              )
            }

            yield* Deferred.await(twoCapturesStarted)
            yield* Effect.sleep("25 millis")
            expect(startedCaptures).toBe(2)
            expect(maximumActiveCaptures).toBe(2)
            yield* Deferred.succeed(releaseCaptures, undefined)

            for (let attempt = 0; attempt < 200; attempt += 1) {
              const states = yield* Effect.forEach(jobs, (job) =>
                quickSave.get(job.id)
              )
              if (states.every((job) => job.status === "completed")) break
              yield* Effect.sleep("5 millis")
            }
            const completed = yield* Effect.forEach(jobs, (job) =>
              quickSave.get(job.id)
            )
            expect(completed.map((job) => job.status)).toStrictEqual([
              "completed",
              "completed",
              "completed"
            ])
            expect(startedCaptures).toBe(3)
            expect(maximumActiveCaptures).toBe(2)
          }).pipe(
            Effect.provide(quickSaveTestLayer(database.path, fakeCapture))
          )
        })
      )
    )
  })

  it("interrupts in-flight scheduled captures when the service scope closes", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const captureStarted = yield* Deferred.make<void>()
          const captureInterrupted = yield* Deferred.make<void>()
          const heldCapture = Layer.succeed(
            CaptureEngine,
            CaptureEngine.of({
              capture: () =>
                Deferred.succeed(captureStarted, undefined).pipe(
                  Effect.zipRight(Effect.never),
                  Effect.ensuring(
                    Deferred.succeed(captureInterrupted, undefined)
                  )
                )
            })
          )

          yield* Effect.scoped(
            Effect.gen(function* () {
              const workspaces = yield* WorkspaceRepository
              const quickSave = yield* QuickSaveService
              const workspace = (yield* workspaces.list)[0]
              if (workspace === undefined) {
                return yield* Effect.dieMessage("Missing default workspace")
              }
              yield* quickSave.enqueue(
                new CreateQuickSave({
                  workspaceId: workspace.id,
                  folderId: null,
                  url: "https://example.com/held-capture",
                  autoMetadata: false
                })
              )
              yield* Deferred.await(captureStarted)
            }).pipe(
              Effect.provide(quickSaveTestLayer(database.path, heldCapture))
            )
          )

          yield* Deferred.await(captureInterrupted).pipe(
            Effect.timeoutFail({
              duration: "2 seconds",
              onTimeout: () => new Error("Scheduled capture was not interrupted")
            })
          )
        })
      )
    )
  })
})
