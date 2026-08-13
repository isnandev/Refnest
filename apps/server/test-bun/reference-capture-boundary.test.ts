import { describe, expect, it } from "bun:test"
import {
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH
} from "@refnest/contracts"
import { Effect } from "effect"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { ReferenceService } from "../src/features/references/reference-service"
import { SqliteDatabase } from "../src/persistence/sqlite-database"
import { WorkspaceRepository } from "../src/features/workspaces/workspace-repository"
import { temporaryDatabase } from "./temporary-database"

describe("captured reference persistence boundary", () => {
  it("decodes the complete candidate before insert and removes rejected artifacts", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const references = yield* ReferenceService
            const { connection } = yield* SqliteDatabase
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) {
              return yield* Effect.dieMessage("Missing default workspace")
            }

            const invalidCandidates = [
              { title: "x".repeat(REFERENCE_TITLE_MAX_LENGTH + 1) },
              {
                description: "x".repeat(
                  REFERENCE_DESCRIPTION_MAX_LENGTH + 1
                )
              },
              { width: 0 },
              { height: -1 },
              { sourceUrl: "not a URL" },
              { sourceUrl: `https://public.test/${"x".repeat(8_192)}` },
              { mimeType: "not-a-mime" },
              { fileSizeBytes: 0 }
            ]

            for (const [index, override] of invalidCandidates.entries()) {
              const assetPath = join(workspace.path, `invalid-${index}.png`)
              const previewPath = join(database.directory, "previews", `invalid-${index}.png`)
              yield* Effect.tryPromise(() => Bun.write(assetPath, "asset"))
              yield* Effect.tryPromise(() => Bun.write(previewPath, "preview"))

              const result = yield* references
                .createCaptured({
                  workspaceId: workspace.id,
                  folderId: null,
                  title: "Captured page",
                  description: "A useful page.",
                  sourceUrl: "https://public.test/page",
                  source: "website",
                  kind: "web-capture",
                  assetPath,
                  previewPath,
                  mimeType: "image/png",
                  width: 1_440,
                  height: 900,
                  durationSeconds: null,
                  fileSizeBytes: 5,
                  tags: [" Website ", "website"],
                  colors: ["#101010"],
                  fileCreatedAt: null,
                  fileModifiedAt: null,
                  ...override
                })
                .pipe(Effect.either)

              expect(result).toMatchObject({
                _tag: "Left",
                left: { _tag: "LibraryOperationFailed" }
              })
              expect(existsSync(assetPath)).toBe(false)
              expect(existsSync(previewPath)).toBe(false)
            }

            expect(
              connection
                .query<{ readonly count: number }, []>(
                  "SELECT COUNT(*) AS count FROM inspiration_references"
                )
                .get()?.count
            ).toBe(0)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })

  it("removes staged artifacts when SQLite rejects an otherwise valid insert", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const references = yield* ReferenceService
            const { connection } = yield* SqliteDatabase
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) {
              return yield* Effect.dieMessage("Missing default workspace")
            }
            const assetPath = join(workspace.path, "persistence-failure.png")
            const previewPath = join(
              database.directory,
              "previews",
              "persistence-failure.png"
            )
            yield* Effect.tryPromise(() => Bun.write(assetPath, "asset"))
            yield* Effect.tryPromise(() => Bun.write(previewPath, "preview"))
            yield* Effect.sync(() =>
              connection.exec(`
                CREATE TRIGGER reject_reference_insert
                BEFORE INSERT ON inspiration_references
                BEGIN
                  SELECT RAISE(ABORT, 'expected test rejection');
                END;
              `)
            )

            const result = yield* references
              .createCaptured({
                workspaceId: workspace.id,
                folderId: null,
                title: "Captured page",
                description: "A useful page.",
                sourceUrl: "https://public.test/page",
                source: "website",
                kind: "web-capture",
                assetPath,
                previewPath,
                mimeType: "image/png",
                width: 1_440,
                height: 900,
                durationSeconds: null,
                fileSizeBytes: 5,
                tags: [],
                colors: [],
                fileCreatedAt: null,
                fileModifiedAt: null
              })
              .pipe(Effect.either)

            expect(result).toMatchObject({
              _tag: "Left",
              left: { _tag: "LibraryOperationFailed" }
            })
            expect(existsSync(assetPath)).toBe(false)
            expect(existsSync(previewPath)).toBe(false)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })

  it("rejects an escaped preview without deleting the outside file", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const references = yield* ReferenceService
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) {
              return yield* Effect.dieMessage("Missing default workspace")
            }
            const assetPath = join(workspace.path, "escaped-preview.png")
            const outsidePreviewPath = join(database.directory, "outside-preview.png")
            yield* Effect.tryPromise(() => Bun.write(assetPath, "asset"))
            yield* Effect.tryPromise(() => Bun.write(outsidePreviewPath, "outside"))

            const result = yield* references
              .createCaptured({
                workspaceId: workspace.id,
                folderId: null,
                title: "Escaped preview",
                description: "",
                sourceUrl: "https://public.test/page",
                source: "website",
                kind: "web-capture",
                assetPath,
                previewPath: outsidePreviewPath,
                mimeType: "image/png",
                width: 1,
                height: 1,
                durationSeconds: null,
                fileSizeBytes: 5,
                tags: [],
                colors: [],
                fileCreatedAt: null,
                fileModifiedAt: null
              })
              .pipe(Effect.either)

            expect(result).toMatchObject({
              _tag: "Left",
              left: { _tag: "LibraryOperationFailed" }
            })
            expect(existsSync(assetPath)).toBe(false)
            expect(existsSync(outsidePreviewPath)).toBe(true)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })
})
