import { describe, expect, it } from "bun:test"
import {
  InspirationReference,
  LibraryFolder,
  SmartFolder,
  Workspace
} from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { dirname, join } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { ReferenceService } from "../src/features/references/reference-service"
import { jsonRequest, webHandler } from "../test/api-test-client"

const decodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, response: Response) =>
  Effect.promise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema))
  )

describe("library over HTTP", () => {
  it("serves nested folder, reference, and smart-folder lifecycles", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspacesResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", "/workspaces"))
          )
          const workspaces = yield* decodeJson(
            Schema.Array(Workspace),
            workspacesResponse
          )
          const workspace = workspaces[0]
          if (workspace === undefined) return yield* Effect.dieMessage("Missing default workspace")

          const parentResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/folders", {
                workspaceId: workspace.id,
                parentId: null,
                name: "Web inspiration"
              })
            )
          )
          expect(parentResponse.status).toBe(201)
          const parent = yield* decodeJson(LibraryFolder, parentResponse)

          const childResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/folders", {
                workspaceId: workspace.id,
                parentId: parent.id,
                name: "About pages"
              })
            )
          )
          const child = yield* decodeJson(LibraryFolder, childResponse)
          expect(child.relativePath).toBe("Web inspiration/About pages")

          const reference = yield* Effect.scoped(
            Effect.gen(function* () {
              const references = yield* ReferenceService
              const assetPath = join(
                workspace.path,
                ...child.relativePath.split("/"),
                "saved-manifesto.png"
              )
              yield* Effect.tryPromise(() =>
                Bun.write(assetPath, new Uint8Array([1]))
              )
              return yield* references.createCaptured({
                workspaceId: workspace.id,
                folderId: child.id,
                title: "Saved manifesto",
                description: "A dark editorial page.",
                sourceUrl: "https://example.com/about",
                source: "website",
                kind: "web-capture",
                assetPath,
                previewPath: null,
                mimeType: "image/png",
                width: 1_440,
                height: 6_000,
                durationSeconds: null,
                fileSizeBytes: 1,
                tags: ["Dark", "Editorial"],
                colors: ["#101010"],
                fileCreatedAt: null,
                fileModifiedAt: null
              })
            }).pipe(Effect.provide(applicationServicesLive(databasePath)))
          )

          const listedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest(
                "GET",
                `/references?workspaceId=${workspace.id}&folderId=${parent.id}&includeSubfolders=true`
              )
            )
          )
          const listed = yield* decodeJson(
            Schema.Array(InspirationReference),
            listedResponse
          )
          expect(listed.map((item) => item.id)).toStrictEqual([reference.id])

          const searchedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest(
                "GET",
                `/references?workspaceId=${workspace.id}&query=${encodeURIComponent("#101010")}`
              )
            )
          )
          const searched = yield* decodeJson(
            Schema.Array(InspirationReference),
            searchedResponse
          )
          expect(searched.map((item) => item.id)).toStrictEqual([reference.id])

          const updatedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("PATCH", `/references/${reference.id}`, {
                title: "Favorite manifesto",
                favorite: true,
                tags: ["Dark", "Studio"]
              })
            )
          )
          expect(updatedResponse.status).toBe(200)
          expect(yield* decodeJson(InspirationReference, updatedResponse)).toMatchObject({
            title: "Favorite manifesto",
            favorite: true,
            tags: ["Dark", "Studio"]
          })

          const defaultSmartResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", `/smart-folders?workspaceId=${workspace.id}`))
          )
          const defaultSmartFolders = yield* decodeJson(
            Schema.Array(SmartFolder),
            defaultSmartResponse
          )
          expect(defaultSmartFolders.map((folder) => folder.name)).toEqual(
            expect.arrayContaining(["Recently added", "Dark interfaces"])
          )

          const customResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/smart-folders", {
                workspaceId: workspace.id,
                name: "Studio references",
                ruleKind: "tag",
                ruleValue: "Studio",
                withinDays: null
              })
            )
          )
          expect(customResponse.status).toBe(201)
          const custom = yield* decodeJson(SmartFolder, customResponse)
          expect(custom.itemCount).toBe(1)

          const invalidSmartFolder = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/smart-folders", {
                workspaceId: workspace.id,
                name: "Missing tag",
                ruleKind: "tag",
                ruleValue: null,
                withinDays: null
              })
            )
          )
          expect(invalidSmartFolder.status).toBe(400)

          const smartReferencesResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest(
                "GET",
                `/references?workspaceId=${workspace.id}&smartFolderId=${custom.id}`
              )
            )
          )
          expect(
            yield* decodeJson(
              Schema.Array(InspirationReference),
              smartReferencesResponse
            )
          ).toHaveLength(1)

          const customUpdated = yield* Effect.promise(() =>
            handler(
              jsonRequest("PATCH", `/smart-folders/${custom.id}`, {
                ruleKind: "favorites",
                ruleValue: null,
                withinDays: null
              })
            )
          )
          expect(customUpdated.status).toBe(200)
          expect((yield* decodeJson(SmartFolder, customUpdated)).itemCount).toBe(1)

          const builtIn = defaultSmartFolders.find((folder) => folder.builtIn)
          expect(builtIn).toBeDefined()
          if (builtIn !== undefined) {
            const protectedResponse = yield* Effect.promise(() =>
              handler(
                jsonRequest("PATCH", `/smart-folders/${builtIn.id}`, {
                  name: "Changed"
                })
              )
            )
            expect(protectedResponse.status).toBe(400)
          }

          const secondWorkspaceResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/workspaces", {
                name: "Second vault",
                parentPath: dirname(databasePath)
              })
            )
          )
          const secondWorkspace = yield* decodeJson(Workspace, secondWorkspaceResponse)
          const secondSmartResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/smart-folders", {
                workspaceId: secondWorkspace.id,
                name: "Second favorites",
                ruleKind: "favorites",
                ruleValue: null,
                withinDays: null
              })
            )
          )
          const secondSmart = yield* decodeJson(SmartFolder, secondSmartResponse)
          const crossWorkspaceResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest(
                "GET",
                `/references?workspaceId=${workspace.id}&smartFolderId=${secondSmart.id}`
              )
            )
          )
          expect(crossWorkspaceResponse.status).toBe(404)

          const removedReference = yield* Effect.promise(() =>
            handler(jsonRequest("DELETE", `/references/${reference.id}`))
          )
          expect(removedReference.status).toBe(204)
          const trashResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("GET", `/references?workspaceId=${workspace.id}&view=trash`)
            )
          )
          expect(
            yield* decodeJson(Schema.Array(InspirationReference), trashResponse)
          ).toHaveLength(1)

          const removedSmartFolder = yield* Effect.promise(() =>
            handler(jsonRequest("DELETE", `/smart-folders/${custom.id}`))
          )
          expect(removedSmartFolder.status).toBe(204)

          const invalidFolder = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/folders", {
                workspaceId: workspace.id,
                parentId: null,
                name: "invalid/name"
              })
            )
          )
          expect(invalidFolder.status).toBe(400)
        })
      )
    )
  })
})
