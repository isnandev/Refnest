import { describe, expect, it } from "@effect/vitest"
import { BrowseWorkspaceDirectory, CreateWorkspace, Workspace } from "@starter/contracts"
import { DateTime, Effect, Schema } from "effect"

describe("workspace contracts", () => {
  it.effect("round-trips a workspace", () =>
    Effect.gen(function* () {
      const workspace = yield* Schema.decodeUnknown(Workspace)({
        id: "workspace_1",
        name: "Product notes",
        path: "C:\\Workspaces\\Product notes",
        createdAt: DateTime.formatIso(yield* DateTime.now)
      })

      const encoded = yield* Schema.encode(Workspace)(workspace)
      const decoded = yield* Schema.decodeUnknown(Workspace)(encoded)

      expect(decoded.name).toBe("Product notes")
    }))

  it.effect("rejects empty names and accepts an omitted browse path", () =>
    Effect.gen(function* () {
      const invalid = yield* Schema.decodeUnknown(CreateWorkspace)({
        name: "   ",
        parentPath: "C:\\Workspaces"
      }).pipe(Effect.either)
      const browse = yield* Schema.decodeUnknown(BrowseWorkspaceDirectory)({})

      expect(invalid._tag).toBe("Left")
      expect(browse.path).toBeUndefined()
    }))
})
