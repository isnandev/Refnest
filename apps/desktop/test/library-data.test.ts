import {
  FolderId,
  LibraryFolder as StoredLibraryFolder,
  SmartFolderId,
  WorkspaceId
} from "@refnest/contracts"
import { DateTime } from "effect"
import { describe, expect, it } from "vitest"

import {
  buildFolderTree,
  folderMoveBlockReason,
  librarySelectionKey,
  toListReferences
} from "@/features/library/library-data"
import {
  formatDimensions,
  formatTagList,
  parseTagList,
  referenceAspectRatio
} from "@/features/library/library-format"
import { referenceImagePath } from "@/features/library/use-reference-assets"
import { formatFileSize } from "@/lib/format"

const workspaceId = WorkspaceId.make("workspace_test")
const rootId = FolderId.make("folder_root")
const childId = FolderId.make("folder_child")
const timestamp = DateTime.unsafeMake("2026-08-12T00:00:00.000Z")

const storedFolder = (
  id: FolderId,
  parentId: FolderId | null,
  name: string,
  relativePath: string,
  itemCount: number
) =>
  new StoredLibraryFolder({
    id,
    workspaceId,
    parentId,
    name,
    relativePath,
    directItemCount: itemCount,
    itemCount,
    createdAt: timestamp,
    updatedAt: timestamp
  })

describe("library data mapping", () => {
  it("builds the backend's flat folder list into a selectable tree", () => {
    const tree = buildFolderTree([
      storedFolder(childId, rootId, "About pages", "Web/About pages", 3),
      storedFolder(rootId, null, "Web", "Web", 8)
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({
      key: `folder:${rootId}`,
      label: "Web",
      count: 8,
      selection: { kind: "folder", id: rootId }
    })
    expect(tree[0]?.children?.[0]).toMatchObject({
      key: `folder:${childId}`,
      label: "About pages",
      count: 3
    })
  })

  it("blocks dropping a folder onto itself or a descendant", () => {
    const grandchildId = FolderId.make("folder_grandchild")
    const siblingId = FolderId.make("folder_sibling")
    const tree = buildFolderTree([
      storedFolder(rootId, null, "Web", "Web", 8),
      storedFolder(childId, rootId, "About pages", "Web/About pages", 3),
      storedFolder(
        grandchildId,
        childId,
        "Heroes",
        "Web/About pages/Heroes",
        1
      ),
      storedFolder(siblingId, null, "Print", "Print", 2)
    ])

    expect(folderMoveBlockReason(tree, childId, childId)).toBe(
      "A folder cannot be moved inside itself."
    )
    expect(folderMoveBlockReason(tree, rootId, grandchildId)).toBe(
      "A folder cannot be moved inside itself."
    )
    expect(folderMoveBlockReason(tree, childId, siblingId)).toBeNull()
    expect(
      folderMoveBlockReason(tree, childId, FolderId.make("folder_missing"))
    ).toBe("That folder cannot be moved there.")
  })

  it("maps each navigation kind to the shared reference query contract", () => {
    expect(
      toListReferences(
        workspaceId,
        { kind: "view", view: "favorites" },
        "  editorial  ",
        false,
        "name",
        "asc"
      )
    ).toMatchObject({
      workspaceId,
      view: "favorites",
      query: "editorial",
      sort: "name",
      direction: "asc"
    })

    expect(
      toListReferences(
        workspaceId,
        { kind: "folder", id: rootId },
        "",
        true,
        "date-added",
        "desc"
      )
    ).toMatchObject({ workspaceId, folderId: rootId, includeSubfolders: true })

    const smartFolderId = SmartFolderId.make("smart_dark")
    expect(
      toListReferences(
        workspaceId,
        { kind: "smart-folder", id: smartFolderId },
        "",
        false,
        "rating",
        "desc"
      )
    ).toMatchObject({ workspaceId, smartFolderId, sort: "rating" })
    expect(
      librarySelectionKey({ kind: "smart-folder", id: smartFolderId })
    ).toBe(`smart-folder:${smartFolderId}`)
  })
})

describe("library presentation mapping", () => {
  it("prefers a preview and only falls back to image originals", () => {
    expect(
      referenceImagePath({
        previewUrl: "/preview",
        assetUrl: "/asset",
        mimeType: "video/mp4"
      })
    ).toBe("/preview")
    expect(
      referenceImagePath({
        previewUrl: null,
        assetUrl: "/asset",
        mimeType: "image/png"
      })
    ).toBe("/asset")
    expect(
      referenceImagePath({
        previewUrl: null,
        assetUrl: "/asset",
        mimeType: "application/pdf"
      })
    ).toBeNull()
  })

  it("formats stored dimensions and bounds extreme capture ratios", () => {
    expect(formatDimensions({ width: 1_440, height: 6_000 })).toBe(
      "1,440 × 6,000"
    )
    expect(formatFileSize(3_800_000)).toBe("3.80 MB")
  })

  it("keeps real proportions for masonry and only bounds the extremes", () => {
    expect(referenceAspectRatio({ width: 1_600, height: 900 })).toBeCloseTo(
      1.778
    )
    expect(referenceAspectRatio({ width: 1_440, height: 6_000 })).toBe(0.4)
    expect(referenceAspectRatio({ width: 6_000, height: 900 })).toBe(2.5)
    expect(referenceAspectRatio({ width: null, height: null })).toBe(0.8)
  })

  it("round-trips the inspector's editable tag list", () => {
    expect(formatTagList(["editorial", "dark"])).toBe("editorial, dark")
    expect(parseTagList("  editorial , dark ,, editorial ")).toEqual([
      "editorial",
      "dark"
    ])
    expect(parseTagList("   ")).toEqual([])
  })
})
