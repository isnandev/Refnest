import {
  FolderId,
  InspirationReference,
  ReferenceId,
  WorkspaceId
} from "@refnest/contracts"
import { DateTime } from "effect"
import { describe, expect, it } from "vitest"

import {
  EMPTY_LIBRARY_FILTERS,
  applyLibraryFilters,
  countActiveFilters,
  decodeStoredFilterState,
  encodeStoredFilterState,
  normalizeLibraryFilters,
  toggleListValue,
  type LibraryFilters
} from "@/features/library/library-filters"

const workspaceId = WorkspaceId.make("workspace_filters")
const webFolder = FolderId.make("folder_web")
const printFolder = FolderId.make("folder_print")

const reference = (
  id: string,
  patch: Partial<ConstructorParameters<typeof InspirationReference>[0]> = {}
) =>
  new InspirationReference({
    id: ReferenceId.make(id),
    workspaceId,
    folderId: webFolder,
    title: id,
    description: "",
    sourceUrl: "https://example.com/ref",
    source: "website",
    kind: "image",
    assetUrl: "/asset",
    previewUrl: "/preview",
    mimeType: "image/png",
    width: 800,
    height: 600,
    durationSeconds: null,
    fileSizeBytes: 1_024,
    favorite: false,
    rating: 0,
    status: "active",
    tags: [],
    colors: [],
    createdAt: DateTime.unsafeMake("2026-08-01T12:00:00.000Z"),
    updatedAt: DateTime.unsafeMake("2026-08-01T12:00:00.000Z"),
    fileCreatedAt: null,
    fileModifiedAt: null,
    lastViewedAt: null,
    ...patch
  })

const filters = (patch: Partial<LibraryFilters>): LibraryFilters => ({
  ...EMPTY_LIBRARY_FILTERS,
  ...patch
})

const ids = (items: ReadonlyArray<InspirationReference>) => items.map((item) => item.id)

const library = [
  reference("editorial", {
    tags: ["editorial", "dark"],
    description: "A dark editorial page.",
    colors: ["#101010"],
    rating: 5,
    kind: "web-capture",
    createdAt: DateTime.unsafeMake("2026-08-10T12:00:00.000Z")
  }),
  reference("motion", {
    tags: ["motion"],
    kind: "video",
    previewUrl: null,
    rating: 2,
    folderId: printFolder,
    createdAt: DateTime.unsafeMake("2026-07-01T12:00:00.000Z")
  }),
  reference("uncat", {
    folderId: null,
    description: "  ",
    rating: 0,
    createdAt: DateTime.unsafeMake("2026-08-12T12:00:00.000Z")
  })
]

describe("library filters", () => {
  it("leaves the sidecar's order alone when nothing is active", () => {
    expect(applyLibraryFilters(library, EMPTY_LIBRARY_FILTERS)).toBe(library)
    expect(countActiveFilters(EMPTY_LIBRARY_FILTERS)).toBe(0)
  })

  it("combines include tags with AND or OR and always subtracts excludes", () => {
    expect(
      ids(applyLibraryFilters(library, filters({ includeTags: ["editorial", "dark"] })))
    ).toEqual(["editorial"])
    expect(
      ids(
        applyLibraryFilters(
          library,
          filters({ match: "or", includeTags: ["editorial", "motion"] })
        )
      )
    ).toEqual(["editorial", "motion"])
    expect(
      ids(
        applyLibraryFilters(
          library,
          filters({ match: "or", includeTags: ["editorial"], excludeTags: ["dark"] })
        )
      )
    ).toEqual([])
  })

  it("narrows by type, rating, date, folder, and presence flags together", () => {
    expect(
      ids(applyLibraryFilters(library, filters({ kinds: ["video", "pdf"] })))
    ).toEqual(["motion"])
    expect(
      ids(applyLibraryFilters(library, filters({ ratingMin: 3, ratingMax: 5 })))
    ).toEqual(["editorial"])
    expect(
      ids(
        applyLibraryFilters(
          library,
          filters({ dateFrom: "2026-08-01", dateTo: "2026-08-31" })
        )
      )
    ).toEqual(["editorial", "uncat"])
    expect(
      ids(
        applyLibraryFilters(
          library,
          filters({ folderIds: [printFolder], includeUncategorized: true })
        )
      )
    ).toEqual(["motion", "uncat"])
    expect(
      ids(applyLibraryFilters(library, filters({ hasNotes: "yes" })))
    ).toEqual(["editorial"])
    expect(
      ids(applyLibraryFilters(library, filters({ hasAiMetadata: "yes" })))
    ).toEqual(["editorial"])
    expect(
      ids(applyLibraryFilters(library, filters({ hasThumbnail: "no" })))
    ).toEqual(["motion"])
  })

  it("ORs independent clauses without letting an exclude through", () => {
    expect(
      ids(
        applyLibraryFilters(
          library,
          filters({
            match: "or",
            kinds: ["video"],
            hasNotes: "yes",
            excludeTags: ["motion"]
          })
        )
      )
    ).toEqual(["editorial"])
  })

  it("counts each active group once and restores a stored document", () => {
    const current = filters({
      includeTags: ["dark"],
      ratingMin: 4,
      hasNotes: "yes"
    })
    expect(countActiveFilters(current)).toBe(3)

    const encoded = encodeStoredFilterState(current, "editorial", [
      { id: "preset_dark", name: "Dark", filters: current }
    ])
    const restored = decodeStoredFilterState(encoded)
    expect(restored.searchQuery).toBe("editorial")
    expect(restored.current).toEqual(current)
    expect(restored.presets).toHaveLength(1)
    expect(decodeStoredFilterState("not-json").current).toEqual(EMPTY_LIBRARY_FILTERS)
    expect(normalizeLibraryFilters({ match: "or", kinds: ["video", "nope"] })).toMatchObject({
      match: "or",
      kinds: ["video"]
    })
    expect(toggleListValue(["a"], "b")).toEqual(["a", "b"])
    expect(toggleListValue(["a", "b"], "a")).toEqual(["b"])
  })
})
