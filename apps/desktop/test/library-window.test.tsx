import {
  DEFAULT_LIBRARY_VIEW_PREFERENCES,
  InspirationReference,
  ReferenceId,
  WorkspaceId
} from "@refnest/contracts"
import { DateTime } from "effect"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  appendUniqueById,
  initialLibraryLimit,
  LIBRARY_PAGE_SIZE,
  nextLibraryLimit
} from "@/features/library/library-window"
import { ReferenceGrid } from "@/features/library/reference-grid"

const workspaceId = WorkspaceId.make("workspace_window")

const reference = (id: string) =>
  new InspirationReference({
    id: ReferenceId.make(id),
    workspaceId,
    folderId: null,
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
    lastViewedAt: null
  })

describe("library window", () => {
  it("opens on one page and never walks past the filtered set", () => {
    expect(initialLibraryLimit(10)).toBe(10)
    expect(initialLibraryLimit(200)).toBe(LIBRARY_PAGE_SIZE)
    expect(nextLibraryLimit(48, 200)).toBe(96)
    expect(nextLibraryLimit(192, 200)).toBe(200)
    expect(nextLibraryLimit(200, 200)).toBe(200)
  })

  it("appends a page without repeating an id already on screen", () => {
    const first = reference("a")
    const second = reference("b")
    const third = reference("c")

    expect(appendUniqueById([first, second], [second, third])).toEqual([
      first,
      second,
      third
    ])
    expect(appendUniqueById([first], [first, second])).toEqual([first, second])
    const current = [first]
    expect(appendUniqueById(current, [first])).toBe(current)
  })
})

describe("reference grid paging", () => {
  const items = [reference("one"), reference("two")]
  const emptyIds = new Set<ReferenceId>()
  const emptyUrls = new Map<ReferenceId, string>()
  const emptyFailed = new Set<ReferenceId>()
  const noop = () => undefined

  it("keeps already-shown cards while the next page is loading", () => {
    const markup = renderToStaticMarkup(
      <ReferenceGrid
        items={items}
        activeId={null}
        selectedIds={emptyIds}
        selectionMode={false}
        view={DEFAULT_LIBRARY_VIEW_PREFERENCES}
        imageUrls={emptyUrls}
        failedImages={emptyFailed}
        loading={false}
        loadingMore
        hasMore
        error={null}
        onRetry={noop}
        onLoadMore={noop}
        onOpen={noop}
        onToggleSelect={noop}
        onExtendSelect={noop}
      />
    )

    expect(markup).toContain("one")
    expect(markup).toContain("two")
    expect(markup).toContain("Loading more references")
    expect(markup).toContain('aria-busy="true"')
  })

  it("does not show a load sentinel once the filtered set is on screen", () => {
    const markup = renderToStaticMarkup(
      <ReferenceGrid
        items={items}
        activeId={null}
        selectedIds={emptyIds}
        selectionMode={false}
        view={DEFAULT_LIBRARY_VIEW_PREFERENCES}
        imageUrls={emptyUrls}
        failedImages={emptyFailed}
        loading={false}
        loadingMore={false}
        hasMore={false}
        error={null}
        onRetry={noop}
        onLoadMore={noop}
        onOpen={noop}
        onToggleSelect={noop}
        onExtendSelect={noop}
      />
    )

    expect(markup).toContain("one")
    expect(markup).not.toContain("Loading more references")
  })

  it("keeps the empty-folder error path for the first page", () => {
    const markup = renderToStaticMarkup(
      <ReferenceGrid
        items={[]}
        activeId={null}
        selectedIds={emptyIds}
        selectionMode={false}
        view={DEFAULT_LIBRARY_VIEW_PREFERENCES}
        imageUrls={emptyUrls}
        failedImages={emptyFailed}
        loading={false}
        error="The sidecar is offline."
        onRetry={noop}
        onOpen={noop}
        onToggleSelect={noop}
        onExtendSelect={noop}
      />
    )

    expect(markup).toContain("References could not be loaded")
    expect(markup).toContain("The sidecar is offline.")
    expect(markup).toContain("Try again")
  })
})
