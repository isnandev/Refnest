import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { join } from "node:path"
import { unlinkSync } from "node:fs"
import { applicationServicesLive } from "../src/application-services"
import { ReferenceService } from "../src/features/references/reference-service"
import { WorkspaceRepository } from "../src/features/workspaces/workspace-repository"
import { temporaryDatabase } from "./temporary-database"

describe("reference listing performance and resilience", () => {
  it("lists references successfully even if underlying asset files on disk are deleted or missing", async () => {
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

            const assetPath = join(workspace.path, "test-card.png")
            yield* Effect.tryPromise(() => Bun.write(assetPath, "image data"))

            const created = yield* references.createCaptured({
              workspaceId: workspace.id,
              folderId: null,
              title: "Test Inspiration Card",
              description: "A test visual reference.",
              sourceUrl: "https://example.com/test",
              source: "website",
              kind: "web-capture",
              assetPath,
              previewPath: null,
              mimeType: "image/png",
              width: 800,
              height: 600,
              durationSeconds: null,
              fileSizeBytes: 10,
              tags: ["Card", "UI"],
              colors: ["#FFFFFF"],
              fileCreatedAt: null,
              fileModifiedAt: null
            })

            // Now delete the physical file from disk
            unlinkSync(assetPath)

            // Listing must still succeed and return the stored reference metadata without throwing
            const listed = yield* references.list({ workspaceId: workspace.id })
            expect(listed).toHaveLength(1)
            expect(listed[0]?.id).toBe(created.id)
            expect(listed[0]?.title).toBe("Test Inspiration Card")
            expect(listed[0]?.assetPath).toBe(assetPath)
            expect(listed[0]?.tags).toStrictEqual(["Card", "UI"])
            expect(listed[0]?.colors).toStrictEqual(["#FFFFFF"])

            // Peeking and getting must also decode metadata directly from SQLite
            const peeked = yield* references.peek(created.id)
            expect(peeked.id).toBe(created.id)
            expect(peeked.assetPath).toBe(assetPath)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })
})
