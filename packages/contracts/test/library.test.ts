import { describe, expect, it } from "@effect/vitest"
import {
  InspirationReference,
  ImportLocalReference,
  LibraryFolder,
  ListReferences,
  UpdateInspirationReference
} from "@refnest/contracts"
import { Effect, Schema } from "effect"

describe("library contracts", () => {
  it.effect("round-trips nested folders and inspiration references", () =>
    Effect.gen(function* () {
      const folder = yield* Schema.decodeUnknown(LibraryFolder)({
        id: "folder_child",
        workspaceId: "workspace_1",
        parentId: "folder_parent",
        name: "About pages",
        relativePath: "Web inspiration/About pages",
        directItemCount: 1,
        itemCount: 1,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z"
      })
      const reference = yield* Schema.decodeUnknown(InspirationReference)({
        id: "reference_1",
        workspaceId: "workspace_1",
        folderId: folder.id,
        title: "Studio manifesto",
        description: "A dark editorial studio page.",
        sourceUrl: "https://example.com/about",
        source: "website",
        kind: "web-capture",
        assetUrl:
          "/workspaces/workspace_1/references/reference_1/assets/asset",
        previewUrl: null,
        mimeType: "image/png",
        width: 1_440,
        height: 6_840,
        durationSeconds: null,
        fileSizeBytes: 3_800_000,
        favorite: false,
        rating: 4,
        status: "active",
        tags: ["Dark", "Editorial"],
        colors: ["#0E0E0E", "#F5F5F5"],
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
        fileCreatedAt: null,
        fileModifiedAt: null,
        lastViewedAt: null
      })

      const encodedFolder = yield* Schema.encode(LibraryFolder)(folder)
      const encodedReference = yield* Schema.encode(InspirationReference)(reference)

      expect(encodedFolder.relativePath).toBe("Web inspiration/About pages")
      expect(encodedReference.tags).toStrictEqual(["Dark", "Editorial"])
      expect("assetPath" in encodedReference).toBe(false)
      expect("previewPath" in encodedReference).toBe(false)
      expect(
        yield* Schema.decodeUnknown(InspirationReference)(encodedReference)
      ).toStrictEqual(reference)
    }))

  it.effect("decodes reference filters from URL parameters", () =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknown(ListReferences)({
        workspaceId: "workspace_1",
        folderId: "folder_1",
        includeSubfolders: "false",
        view: "favorites",
        query: "editorial"
      })

      expect(query.includeSubfolders).toBe(false)
      expect(query.view).toBe("favorites")
    }))

  it.effect("decodes a bounded local-file import request", () =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknown(ImportLocalReference)({
        workspaceId: "workspace_1",
        folderId: "folder_1",
        path: "C:\\Users\\isnan\\Pictures\\reference.png"
      })

      expect(request.path).toBe(
        "C:\\Users\\isnan\\Pictures\\reference.png"
      )
      expect(
        (yield* Schema.decodeUnknown(ImportLocalReference)({
          workspaceId: "workspace_1",
          folderId: null,
          path: "   "
        }).pipe(Effect.either))._tag
      ).toBe("Left")
    }))

  it.effect("rejects malformed reference metadata at the boundary", () =>
    Effect.gen(function* () {
      const invalidColor = yield* Schema.decodeUnknown(
        UpdateInspirationReference
      )({ colors: ["charcoal"] }).pipe(Effect.either)
      const blankTag = yield* Schema.decodeUnknown(UpdateInspirationReference)({
        tags: ["   "]
      }).pipe(Effect.either)

      expect(invalidColor._tag).toBe("Left")
      expect(blankTag._tag).toBe("Left")
    }))
})
