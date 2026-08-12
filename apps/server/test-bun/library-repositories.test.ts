import { describe, expect, it } from "bun:test"
import {
  CreateLibraryFolder,
  CreateSmartFolder,
  UpdateInspirationReference,
  UpdateLibraryFolder,
  UpdateSmartFolder
} from "@refnest/contracts"
import { Effect } from "effect"
import { existsSync, mkdirSync, rmdirSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { FolderService } from "../src/features/folders/folder-service"
import { ReferenceService } from "../src/features/references/reference-service"
import { SmartFolderService } from "../src/features/smart-folders/smart-folder-service"
import { WorkspaceRepository } from "../src/features/workspaces/workspace-repository"
import { temporaryDatabase } from "./temporary-database"

describe("library repositories", () => {
  it("preserves ..design names and rejects a junction inserted beneath a workspace", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const folders = yield* FolderService
            const workspace = (yield* workspaces.list)[0]
            if (workspace === undefined) {
              return yield* Effect.dieMessage("Missing default workspace")
            }

            const dotted = yield* folders.create(
              new CreateLibraryFolder({
                workspaceId: workspace.id,
                parentId: null,
                name: "..design"
              })
            )
            expect(dotted.relativePath).toBe("..design")

            const linked = yield* folders.create(
              new CreateLibraryFolder({
                workspaceId: workspace.id,
                parentId: null,
                name: "Linked"
              })
            )
            const linkedPath = join(workspace.path, "Linked")
            const outsidePath = join(database.directory, "outside")
            mkdirSync(outsidePath)
            yield* Effect.tryPromise(() => Bun.write(join(outsidePath, ".keep"), "outside"))
            rmdirSync(linkedPath)
            symlinkSync(
              outsidePath,
              linkedPath,
              process.platform === "win32" ? "junction" : "dir"
            )

            const rejected = yield* folders
              .create(
                new CreateLibraryFolder({
                  workspaceId: workspace.id,
                  parentId: linked.id,
                  name: "Must not escape"
                })
              )
              .pipe(Effect.either)
            expect(rejected).toMatchObject({
              _tag: "Left",
              left: { _tag: "LibraryOperationFailed" }
            })
            expect(existsSync(join(outsidePath, "Must not escape"))).toBe(false)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })

  it("manages physical nested folders, references, and derived smart folders", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          yield* Effect.gen(function* () {
            const workspaces = yield* WorkspaceRepository
            const folders = yield* FolderService
            const references = yield* ReferenceService
            const smartFolders = yield* SmartFolderService
            const workspace = (yield* workspaces.list)[0]

            expect(workspace).toBeDefined()
            if (workspace === undefined) return yield* Effect.dieMessage("Missing default workspace")

            const parent = yield* folders.create(
              new CreateLibraryFolder({
                workspaceId: workspace.id,
                parentId: null,
                name: "Web inspiration"
              })
            )
            const child = yield* folders.create(
              new CreateLibraryFolder({
                workspaceId: workspace.id,
                parentId: parent.id,
                name: "About pages"
              })
            )
            const assetRelativePath = `${child.relativePath}/reference.png`
            const assetPath = join(workspace.path, ...assetRelativePath.split("/"))
            yield* Effect.tryPromise(() => Bun.write(assetPath, "captured image"))

            const createdReference = yield* references.createCaptured({
              workspaceId: workspace.id,
              folderId: child.id,
              title: "Studio manifesto",
              description: "A dark editorial studio page.",
              sourceUrl: "https://example.com/about",
              source: "website",
              kind: "web-capture",
              assetPath,
              previewPath: null,
              mimeType: "image/png",
              width: 1_440,
              height: 6_840,
              durationSeconds: null,
              fileSizeBytes: 14,
              tags: ["Dark", "dark", "Editorial"],
              colors: ["#0e0e0e"]
            })

            expect(createdReference.tags).toStrictEqual(["Dark", "Editorial"])
            expect(createdReference.colors).toStrictEqual(["#0E0E0E"])

            const countedFolders = yield* folders.list(workspace.id)
            expect(countedFolders.find((folder) => folder.id === parent.id)).toMatchObject({
              directItemCount: 0,
              itemCount: 1
            })
            expect(countedFolders.find((folder) => folder.id === child.id)).toMatchObject({
              directItemCount: 1,
              itemCount: 1
            })

            expect(
              yield* references.list({
                workspaceId: workspace.id,
                folderId: parent.id,
                includeSubfolders: true
              })
            ).toHaveLength(1)
            expect(
              yield* references.list({
                workspaceId: workspace.id,
                folderId: parent.id,
                includeSubfolders: false
              })
            ).toHaveLength(0)

            const cycle = yield* folders
              .update(
                parent.id,
                new UpdateLibraryFolder({ parentId: child.id })
              )
              .pipe(Effect.either)
            expect(cycle._tag).toBe("Left")

            const customSmartFolder = yield* smartFolders.create(
              new CreateSmartFolder({
                workspaceId: workspace.id,
                name: "Dark research",
                ruleKind: "tag",
                ruleValue: "Dark",
                withinDays: null
              })
            )
            expect(customSmartFolder.itemCount).toBe(1)
            expect(
              (yield* smartFolders.list(workspace.id)).find(
                (folder) => folder.name === "Recently added"
              )?.itemCount
            ).toBe(1)

            const updatedReference = yield* references.update(
              createdReference.id,
              new UpdateInspirationReference({
                favorite: true,
                title: "Updated studio manifesto"
              })
            )
            expect(updatedReference.favorite).toBe(true)

            const favoriteSmartFolder = yield* smartFolders.update(
              customSmartFolder.id,
              new UpdateSmartFolder({
                ruleKind: "favorites",
                ruleValue: null,
                withinDays: null
              })
            )
            expect(favoriteSmartFolder.itemCount).toBe(1)

            const movedParent = yield* folders.update(
              parent.id,
              new UpdateLibraryFolder({ name: "Web archive" })
            )
            const movedChild = yield* folders.get(child.id)
            const movedReference = yield* references.peek(createdReference.id)
            expect(movedParent.relativePath).toBe("Web archive")
            expect(movedChild.relativePath).toBe("Web archive/About pages")
            expect(movedReference.assetPath).toBe(
              join(workspace.path, "Web archive", "About pages", "reference.png")
            )
            expect(existsSync(movedReference.assetPath)).toBe(true)

            const destination = yield* folders.create(
              new CreateLibraryFolder({
                workspaceId: workspace.id,
                parentId: null,
                name: "Favorites"
              })
            )
            const relocatedReference = yield* references.update(
              createdReference.id,
              new UpdateInspirationReference({ folderId: destination.id })
            )
            expect(relocatedReference.folderId).toBe(destination.id)
            expect(relocatedReference.assetPath).toBe(
              join(workspace.path, "Favorites", "reference.png")
            )
            expect(existsSync(relocatedReference.assetPath)).toBe(true)

            yield* folders.remove(child.id)
            yield* folders.remove(parent.id)
            expect(existsSync(join(workspace.path, "Web archive"))).toBe(false)

            const empty = yield* folders.create(
              new CreateLibraryFolder({
                workspaceId: workspace.id,
                parentId: null,
                name: "Empty folder"
              })
            )
            yield* folders.remove(empty.id)
            expect((yield* folders.get(empty.id).pipe(Effect.either))._tag).toBe("Left")

            yield* references.remove(createdReference.id)
            expect(yield* references.list({ workspaceId: workspace.id })).toHaveLength(0)
            expect(
              yield* references.list({ workspaceId: workspace.id, view: "trash" })
            ).toHaveLength(1)
            expect((yield* folders.remove(destination.id).pipe(Effect.either))._tag).toBe(
              "Left"
            )

            yield* smartFolders.remove(customSmartFolder.id)
            expect(
              (yield* smartFolders.get(customSmartFolder.id).pipe(Effect.either))._tag
            ).toBe("Left")
            const builtIn = (yield* smartFolders.list(workspace.id)).find(
              (folder) => folder.builtIn
            )
            expect(builtIn).toBeDefined()
            if (builtIn !== undefined) {
              expect((yield* smartFolders.remove(builtIn.id).pipe(Effect.either))._tag).toBe(
                "Left"
              )
            }
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })
})
