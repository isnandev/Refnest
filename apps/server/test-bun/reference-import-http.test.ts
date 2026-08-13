import { describe, expect, it } from "bun:test"
import {
  InspirationReference,
  LibraryFolder,
  Workspace
} from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { jsonRequest, webHandler } from "../test/api-test-client"

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02
])

const decodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, response: Response) =>
  Effect.promise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema))
  )

describe("local reference import over HTTP", () => {
  it("copies a verified local file into the selected library folder", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspaceResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", "/workspaces"))
          )
          const workspace = (
            yield* decodeJson(Schema.Array(Workspace), workspaceResponse)
          )[0]
          if (workspace === undefined) {
            return yield* Effect.dieMessage("Missing default workspace")
          }

          const folderResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/folders", {
                workspaceId: workspace.id,
                parentId: null,
                name: "Imported"
              })
            )
          )
          const folder = yield* decodeJson(LibraryFolder, folderResponse)
          const sourcePath = join(dirname(databasePath), "Mood board.png")
          yield* Effect.tryPromise(() => Bun.write(sourcePath, PNG_BYTES))

          const importedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/references/import", {
                workspaceId: workspace.id,
                folderId: folder.id,
                path: sourcePath
              })
            )
          )
          expect(importedResponse.status).toBe(201)
          const imported = yield* decodeJson(
            InspirationReference,
            importedResponse
          )
          expect(imported).toMatchObject({
            workspaceId: workspace.id,
            folderId: folder.id,
            title: "Mood board",
            source: "local-file",
            kind: "image",
            mimeType: "image/png",
            fileSizeBytes: PNG_BYTES.byteLength,
            previewUrl: null
          })
          expect(existsSync(sourcePath)).toBe(true)

          const assetResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", imported.assetUrl))
          )
          expect(assetResponse.status).toBe(200)
          expect(new Uint8Array(yield* Effect.promise(() => assetResponse.arrayBuffer())))
            .toStrictEqual(PNG_BYTES)
        })
      )
    )
  })

  it("keeps pasted bytes as a reference, named by the clipboard", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler } = yield* webHandler
          const workspaceResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", "/workspaces"))
          )
          const workspace = (
            yield* decodeJson(Schema.Array(Workspace), workspaceResponse)
          )[0]
          if (workspace === undefined) {
            return yield* Effect.dieMessage("Missing default workspace")
          }

          const pastedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/references/paste", {
                workspaceId: workspace.id,
                folderId: null,
                name: "Clipboard shot.png",
                bytes: Buffer.from(PNG_BYTES).toString("base64")
              })
            )
          )
          expect(pastedResponse.status).toBe(201)
          const pasted = yield* decodeJson(InspirationReference, pastedResponse)
          expect(pasted).toMatchObject({
            workspaceId: workspace.id,
            folderId: null,
            title: "Clipboard shot",
            source: "local-file",
            kind: "image",
            mimeType: "image/png",
            fileSizeBytes: PNG_BYTES.byteLength,
            // The clipboard is not a file, so it carries no dates of its own.
            fileCreatedAt: null,
            fileModifiedAt: null
          })

          const assetResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", pasted.assetUrl))
          )
          expect(assetResponse.status).toBe(200)
          expect(
            new Uint8Array(yield* Effect.promise(() => assetResponse.arrayBuffer()))
          ).toStrictEqual(PNG_BYTES)

          const unnamedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("POST", "/references/paste", {
                workspaceId: workspace.id,
                folderId: null,
                bytes: Buffer.from(PNG_BYTES).toString("base64")
              })
            )
          )
          expect(unnamedResponse.status).toBe(201)
          expect(
            (yield* decodeJson(InspirationReference, unnamedResponse)).title
          ).toBe("Pasted image")
        })
      )
    )
  })

  it("refuses pasted bytes that are not media, and empty ones", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler } = yield* webHandler
          const workspaceResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", "/workspaces"))
          )
          const workspace = (
            yield* decodeJson(Schema.Array(Workspace), workspaceResponse)
          )[0]
          if (workspace === undefined) {
            return yield* Effect.dieMessage("Missing default workspace")
          }

          for (const bytes of [
            Buffer.from("not media").toString("base64"),
            ""
          ]) {
            const response = yield* Effect.promise(() =>
              handler(
                jsonRequest("POST", "/references/paste", {
                  workspaceId: workspace.id,
                  folderId: null,
                  bytes
                })
              )
            )
            expect(response.status).toBe(400)
          }

          const listedResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", `/references?workspaceId=${workspace.id}`))
          )
          expect(
            yield* decodeJson(Schema.Array(InspirationReference), listedResponse)
          ).toHaveLength(0)
        })
      )
    )
  })

  it("rejects missing and unsupported local files without creating references", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler, databasePath } = yield* webHandler
          const workspaceResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", "/workspaces"))
          )
          const workspace = (
            yield* decodeJson(Schema.Array(Workspace), workspaceResponse)
          )[0]
          if (workspace === undefined) {
            return yield* Effect.dieMessage("Missing default workspace")
          }

          const unsupportedPath = join(dirname(databasePath), "notes.txt")
          yield* Effect.tryPromise(() => Bun.write(unsupportedPath, "not media"))
          for (const path of [unsupportedPath, join(dirname(databasePath), "missing.png")]) {
            const response = yield* Effect.promise(() =>
              handler(
                jsonRequest("POST", "/references/import", {
                  workspaceId: workspace.id,
                  folderId: null,
                  path
                })
              )
            )
            expect(response.status).toBe(400)
          }

          const listedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest(
                "GET",
                `/references?workspaceId=${workspace.id}`
              )
            )
          )
          expect(
            yield* decodeJson(
              Schema.Array(InspirationReference),
              listedResponse
            )
          ).toHaveLength(0)
        })
      )
    )
  })
})
