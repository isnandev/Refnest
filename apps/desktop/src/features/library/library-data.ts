import {
  ListReferences,
  type FolderId,
  type LibraryFolder as StoredLibraryFolder,
  type ReferenceSortDirection,
  type ReferenceSortField,
  type ReferenceView,
  type SmartFolder,
  type SmartFolderId,
  type WorkspaceId
} from "@refnest/contracts"

export type LibrarySelection =
  | { readonly kind: "view"; readonly view: ReferenceView }
  | { readonly kind: "folder"; readonly id: FolderId }
  | { readonly kind: "smart-folder"; readonly id: SmartFolderId }

export type LibraryFolder = {
  readonly key: string
  readonly label: string
  readonly count?: number
  readonly selection: LibrarySelection
  readonly children?: readonly LibraryFolder[]
}

export const ALL_REFERENCES_SELECTION: LibrarySelection = {
  kind: "view",
  view: "all"
}

export const librarySelectionKey = (selection: LibrarySelection): string => {
  switch (selection.kind) {
    case "view":
      return `view:${selection.view}`
    case "folder":
      return `folder:${selection.id}`
    case "smart-folder":
      return `smart-folder:${selection.id}`
  }
}

const primaryView = (
  view: ReferenceView,
  label: string
): LibraryFolder => ({
  key: `view:${view}`,
  label,
  selection: { kind: "view", view }
})

export const PRIMARY_FOLDERS: readonly LibraryFolder[] = [
  primaryView("all", "All references"),
  primaryView("uncategorized", "Uncategorized"),
  primaryView("untagged", "Untagged"),
  primaryView("recently-used", "Recently used"),
  primaryView("favorites", "Favorites"),
  primaryView("trash", "Trash")
]

type MutableLibraryFolder = {
  readonly key: string
  readonly label: string
  readonly count: number
  readonly selection: LibrarySelection
  readonly children: MutableLibraryFolder[]
}

export const buildFolderTree = (
  folders: ReadonlyArray<StoredLibraryFolder>
): readonly LibraryFolder[] => {
  const nodes = new Map<FolderId, MutableLibraryFolder>()

  for (const folder of folders) {
    nodes.set(folder.id, {
      key: `folder:${folder.id}`,
      label: folder.name,
      count: folder.itemCount,
      selection: { kind: "folder", id: folder.id },
      children: []
    })
  }

  const roots: MutableLibraryFolder[] = []
  for (const folder of folders) {
    const node = nodes.get(folder.id)
    if (node === undefined) continue

    const parent = folder.parentId === null ? undefined : nodes.get(folder.parentId)
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
  }

  return roots
}

export const buildSmartFolders = (
  folders: ReadonlyArray<SmartFolder>
): readonly LibraryFolder[] =>
  folders.map((folder) => ({
    key: `smart-folder:${folder.id}`,
    label: folder.name,
    count: folder.itemCount,
    selection: { kind: "smart-folder", id: folder.id }
  }))

/** Depth-first list of every folder, used where nesting cannot be shown. */
export const flattenLibraryFolders = (
  folders: readonly LibraryFolder[]
): readonly LibraryFolder[] =>
  folders.flatMap((folder) => [
    folder,
    ...flattenLibraryFolders(folder.children ?? [])
  ])

const findFolder = (
  folders: readonly LibraryFolder[],
  key: string
): LibraryFolder | undefined => {
  for (const folder of folders) {
    if (folder.key === key) return folder
    const nested = findFolder(folder.children ?? [], key)
    if (nested !== undefined) return nested
  }

  return undefined
}

export const findLibraryFolder = (
  selection: LibrarySelection,
  primaryFolders: readonly LibraryFolder[],
  smartFolders: readonly LibraryFolder[],
  collectionFolders: readonly LibraryFolder[]
) => {
  const key = librarySelectionKey(selection)
  return (
    findFolder(primaryFolders, key) ??
    findFolder(smartFolders, key) ??
    findFolder(collectionFolders, key)
  )
}

export const folderLabel = (
  selection: LibrarySelection,
  primaryFolders: readonly LibraryFolder[],
  smartFolders: readonly LibraryFolder[],
  collectionFolders: readonly LibraryFolder[]
) =>
  findLibraryFolder(
    selection,
    primaryFolders,
    smartFolders,
    collectionFolders
  )?.label ?? "Library"

export const folderCount = (
  selection: LibrarySelection,
  primaryFolders: readonly LibraryFolder[],
  smartFolders: readonly LibraryFolder[],
  collectionFolders: readonly LibraryFolder[],
  visibleCount: number
) =>
  findLibraryFolder(
    selection,
    primaryFolders,
    smartFolders,
    collectionFolders
  )?.count ?? visibleCount

export const toListReferences = (
  workspaceId: WorkspaceId,
  selection: LibrarySelection,
  query: string,
  includeSubfolders: boolean,
  sort: ReferenceSortField,
  direction: ReferenceSortDirection
) => {
  const normalizedQuery = query.trim()

  return new ListReferences({
    workspaceId,
    ...(selection.kind === "view" ? { view: selection.view } : {}),
    ...(selection.kind === "folder"
      ? { folderId: selection.id, includeSubfolders }
      : {}),
    ...(selection.kind === "smart-folder"
      ? { smartFolderId: selection.id }
      : {}),
    ...(normalizedQuery.length === 0 ? {} : { query: normalizedQuery }),
    sort,
    direction
  })
}
