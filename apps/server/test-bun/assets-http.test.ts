import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { InspirationReference, Workspace } from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { dirname, join } from "node:path"
import { unlink } from "node:fs/promises"
import { applicationServicesLive } from "../src/application-services"
import { ReferenceService } from "../src/features/references/reference-service"
import {
  authenticatedJsonRequest,
  authenticatedWebHandler,
  jsonRequest
} from "../test/api-test-client"

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
])

const decodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, response: Response) =>
  Effect.promise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema))
  )

describe("authenticated reference asset delivery", () => {
  it("enforces auth and ownership while returning verified opaque bytes", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath, directory } = yield* authenticatedWebHandler
          const workspacesResponse = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", "/workspaces"))
          )
          const workspaces = yield* decodeJson(
            Schema.Array(Workspace),
            workspacesResponse
          )
          const workspace = workspaces[0]
          if (workspace === undefined) return yield* Effect.dieMessage("Missing default workspace")

          const previewPath = join(directory, "previews", "asset-preview.png")
          const assetPath = join(workspace.path, "asset-original.png")
          yield* Effect.tryPromise(() =>
            Promise.all([
              Bun.write(assetPath, PNG_BYTES),
              Bun.write(previewPath, PNG_BYTES)
            ])
          )
          const reference = yield* Effect.scoped(
            Effect.gen(function* () {
              const references = yield* ReferenceService
              return yield* references.createCaptured({
                workspaceId: workspace.id,
                folderId: null,
                title: "Opaque asset",
                description: "Delivered by identifier, never by path.",
                sourceUrl: "https://example.com/asset",
                source: "website",
                kind: "image",
                assetPath,
                previewPath,
                mimeType: "image/png",
                width: 1,
                height: 1,
                durationSeconds: null,
                fileSizeBytes: PNG_BYTES.byteLength,
                tags: [],
                colors: []
              })
            }).pipe(Effect.provide(applicationServicesLive(databasePath)))
          )
          const assetUrl = `/workspaces/${workspace.id}/references/${reference.id}/assets/asset`

          const unauthenticated = yield* Effect.promise(() =>
            handler(jsonRequest("GET", assetUrl))
          )
          expect(unauthenticated.status).toBe(401)

          const wrongToken = yield* Effect.promise(() =>
            handler(
              new Request(`http://sidecar.test${assetUrl}`, {
                headers: { authorization: "Bearer incorrect" }
              })
            )
          )
          expect(wrongToken.status).toBe(401)

          const delivered = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", assetUrl))
          )
          expect(delivered.status).toBe(200)
          expect(delivered.headers.get("content-type")).toBe("image/png")
          expect(delivered.headers.get("content-length")).toBe(String(PNG_BYTES.byteLength))
          expect(delivered.headers.get("content-security-policy")).toContain("sandbox")
          expect(delivered.headers.get("x-content-type-options")).toBe("nosniff")
          expect(
            new Uint8Array(yield* Effect.promise(() => delivered.arrayBuffer()))
          ).toStrictEqual(PNG_BYTES)

          const preview = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", reference.previewUrl ?? ""))
          )
          expect(preview.status).toBe(200)
          expect(new Uint8Array(yield* Effect.promise(() => preview.arrayBuffer())))
            .toStrictEqual(PNG_BYTES)

          const publicResponse = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", `/references/${reference.id}`))
          )
          const publicReference = yield* decodeJson(InspirationReference, publicResponse)
          const publicJson = JSON.stringify(publicReference)
          expect(publicReference.assetUrl).toBe(assetUrl)
          expect(publicJson).not.toContain(workspace.path)
          expect(publicJson).not.toContain(directory)
          expect(publicJson).not.toContain("assetPath")
          expect(publicJson).not.toContain("previewPath")

          const otherWorkspaceResponse = yield* Effect.promise(() =>
            handler(
              authenticatedJsonRequest("POST", "/workspaces", {
                name: "Other Vault",
                parentPath: directory
              })
            )
          )
          const otherWorkspace = yield* decodeJson(Workspace, otherWorkspaceResponse)
          const crossWorkspace = yield* Effect.promise(() =>
            handler(
              authenticatedJsonRequest(
                "GET",
                `/workspaces/${otherWorkspace.id}/references/${reference.id}/assets/asset`
              )
            )
          )
          expect(crossWorkspace.status).toBe(404)

          yield* Effect.tryPromise(() => unlink(previewPath))
          const assetWithoutPreview = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", assetUrl))
          )
          expect(assetWithoutPreview.status).toBe(200)
          expect(
            new Uint8Array(
              yield* Effect.promise(() => assetWithoutPreview.arrayBuffer())
            )
          ).toStrictEqual(PNG_BYTES)
          const removedPreview = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", reference.previewUrl ?? ""))
          )
          expect(removedPreview.status).toBe(404)

          const missingPreviewAssetPath = join(workspace.path, "without-preview.png")
          yield* Effect.tryPromise(() => Bun.write(missingPreviewAssetPath, PNG_BYTES))
          const withoutPreview = yield* Effect.scoped(
            Effect.gen(function* () {
              const references = yield* ReferenceService
              return yield* references.createCaptured({
                workspaceId: workspace.id,
                folderId: null,
                title: "No preview",
                description: "",
                sourceUrl: "https://example.com/no-preview",
                source: "website",
                kind: "image",
                assetPath: missingPreviewAssetPath,
                previewPath: null,
                mimeType: "image/png",
                width: 1,
                height: 1,
                durationSeconds: null,
                fileSizeBytes: PNG_BYTES.byteLength,
                tags: [],
                colors: []
              })
            }).pipe(Effect.provide(applicationServicesLive(databasePath)))
          )
          const noPreview = yield* Effect.promise(() =>
            handler(
              authenticatedJsonRequest(
                "GET",
                `/workspaces/${workspace.id}/references/${withoutPreview.id}/assets/preview`
              )
            )
          )
          expect(noPreview.status).toBe(404)

          yield* Effect.tryPromise(() => unlink(missingPreviewAssetPath))
          const missingFile = yield* Effect.promise(() =>
            handler(
              authenticatedJsonRequest(
                "GET",
                `/workspaces/${workspace.id}/references/${withoutPreview.id}/assets/asset`
              )
            )
          )
          expect(missingFile.status).toBe(404)

          yield* Effect.tryPromise(() =>
            Bun.write(assetPath, new Uint8Array(PNG_BYTES.byteLength))
          )
          const mismatchedMime = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", assetUrl))
          )
          expect(mismatchedMime.status).toBe(400)
          yield* Effect.tryPromise(() => Bun.write(assetPath, PNG_BYTES))

          const outsidePath = join(dirname(workspace.path), "outside.png")
          yield* Effect.tryPromise(() => Bun.write(outsidePath, PNG_BYTES))
          yield* Effect.acquireUseRelease(
            Effect.sync(() => new Database(databasePath, { strict: true })),
            (database) =>
              Effect.sync(() => {
                database
                  .query<never, [string, string]>(
                    "UPDATE inspiration_references SET asset_relative_path = ? WHERE id = ?"
                  )
                  .run("../outside.png", reference.id)
              }),
            (database) => Effect.sync(() => database.close())
          )
          const traversal = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", assetUrl))
          )
          expect(traversal.status).toBe(404)
        })
      )
    )
  })
})
