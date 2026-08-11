import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { jsonRequest, webHandler } from "./api-test-client"

describe("workspaces over HTTP", () => {
  it.scoped("browses a Bun-served folder and creates a workspace there", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const parentPath = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "tauri-effect-workspace-"
      })
      const { handler } = yield* webHandler

      const initial = yield* Effect.promise(() =>
        handler(jsonRequest("GET", "/workspaces"))
      )
      expect(initial.status).toBe(200)
      const initialWorkspaces = (yield* Effect.promise(() => initial.json())) as ReadonlyArray<{
        name: string
      }>
      expect(initialWorkspaces[0]?.name).toBe("Tauri Effect")

      const created = yield* Effect.promise(() =>
        handler(
          jsonRequest("POST", "/workspaces", {
            name: "Product notes",
            parentPath
          })
        )
      )
      expect(created.status).toBe(201)
      const workspace = (yield* Effect.promise(() => created.json())) as {
        name: string
        path: string
      }
      expect(workspace.name).toBe("Product notes")
      expect(yield* fileSystem.exists(workspace.path)).toBe(true)

      const browse = yield* Effect.promise(() =>
        handler(
          jsonRequest(
            "GET",
            `/workspaces/directories?path=${encodeURIComponent(parentPath)}`
          )
        )
      )
      expect(browse.status).toBe(200)
      const listing = (yield* Effect.promise(() => browse.json())) as {
        directories: ReadonlyArray<{ name: string }>
      }
      expect(listing.directories.some((entry) => entry.name === "Product notes")).toBe(true)

      const duplicate = yield* Effect.promise(() =>
        handler(
          jsonRequest("POST", "/workspaces", {
            name: "Product notes",
            parentPath
          })
        )
      )
      expect(duplicate.status).toBe(400)
    }).pipe(Effect.provide(BunContext.layer)))
})
