import {
  UpdateInspirationReference,
  type InspirationReference,
  type ReferenceId,
  type WorkspaceId
} from "@refnest/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"

import { COLUMN_DEFAULT } from "./library-columns"
import {
  ALL_REFERENCES_SELECTION,
  PRIMARY_FOLDERS,
  buildFolderTree,
  buildSmartFolders,
  folderCount,
  folderLabel,
  type LibrarySelection
} from "./library-data"
import { useDebouncedValue } from "./use-debounced-value"
import { useLibraryData } from "./use-library-data"
import { useLibraryShortcuts } from "./use-library-shortcuts"
import { useQuickSave } from "./use-quick-save"
import { useReferenceAssets } from "./use-reference-assets"
import { useReferenceImport } from "./use-reference-import"
import { useReferenceSelection } from "./use-reference-selection"

/** Coordinates library state while `ReferenceLibrary` stays a composition page. */
export const useReferenceLibrary = (workspaceId: WorkspaceId | null) => {
  const [activeSelection, setActiveSelection] = useState<LibrarySelection>(
    ALL_REFERENCES_SELECTION
  )
  /** The one reference the inspector describes — not the bulk selection. */
  const [activeItem, setActiveItem] = useState<InspirationReference | null>(null)
  const [viewerId, setViewerId] = useState<ReferenceId | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [columns, setColumns] = useState(COLUMN_DEFAULT)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState("All")
  const [includeSubfolders, setIncludeSubfolders] = useState(true)
  /** The imagery is the point; details are a deliberate request. */
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [quickSaveOpen, setQuickSaveOpen] = useState(false)
  const [folderCreateOpen, setFolderCreateOpen] = useState(false)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(searchQuery, 220)
  const library = useLibraryData(
    workspaceId,
    activeSelection,
    debouncedQuery,
    includeSubfolders
  )
  const quickSave = useQuickSave(workspaceId, () => {
    void library.refresh()
  })
  const referenceImport = useReferenceImport(workspaceId, () => {
    void library.refresh()
  })

  useEffect(() => {
    setActiveSelection(ALL_REFERENCES_SELECTION)
    setActiveItem(null)
    setViewerId(null)
    setSearchQuery("")
    setActiveFilter("All")
  }, [workspaceId])

  const collectionFolders = useMemo(
    () => buildFolderTree(library.navigation.folders),
    [library.navigation.folders]
  )
  const smartFolders = useMemo(
    () => buildSmartFolders(library.navigation.smartFolders),
    [library.navigation.smartFolders]
  )
  const filterOptions = useMemo(() => {
    const tags = new Set(
      library.references.references.flatMap((reference) => reference.tags)
    )
    if (activeFilter !== "All") tags.add(activeFilter)
    return [...tags].sort((left, right) => left.localeCompare(right)).slice(0, 12)
  }, [activeFilter, library.references.references])
  const visibleItems = useMemo(
    () =>
      activeFilter === "All"
        ? library.references.references
        : library.references.references.filter((reference) =>
            reference.tags.includes(activeFilter)
          ),
    [activeFilter, library.references.references]
  )
  const orderedIds = useMemo(
    () => visibleItems.map((item) => item.id),
    [visibleItems]
  )
  const selection = useReferenceSelection(orderedIds)
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selection.ids.has(item.id)),
    [selection.ids, visibleItems]
  )
  const currentFolderLabel = folderLabel(
    activeSelection,
    PRIMARY_FOLDERS,
    smartFolders,
    collectionFolders
  )
  const currentFolderCount = folderCount(
    activeSelection,
    PRIMARY_FOLDERS,
    smartFolders,
    collectionFolders,
    visibleItems.length
  )
  const assetReferences = useMemo(() => {
    if (
      activeItem === null ||
      visibleItems.some((item) => item.id === activeItem.id)
    ) {
      return visibleItems
    }
    return [...visibleItems, activeItem]
  }, [activeItem, visibleItems])
  const assets = useReferenceAssets(workspaceId, assetReferences)
  const viewerIndex = viewerId === null ? -1 : orderedIds.indexOf(viewerId)
  const viewerItem =
    viewerId === null
      ? null
      : activeItem?.id === viewerId
        ? activeItem
        : (visibleItems[viewerIndex] ?? null)

  useLibraryShortcuts({
    enabled: viewerId === null,
    onSelectAll: selection.selectAll,
    onClearSelection: selection.clear
  })

  const selectFolder = useCallback(
    (selectionTarget: LibrarySelection) => {
      setActiveSelection(selectionTarget)
      setActiveItem(null)
      setActiveFilter("All")
      setMobileSidebarOpen(false)
      selection.clear()
    },
    [selection.clear]
  )

  /** Opening a reference shows the image; the inspector stays where it was. */
  const openReference = useCallback(
    (item: InspirationReference) => {
      setActiveItem(item)
      setViewerId(item.id)
      void library.loadReference(item.id).then((loaded) => {
        if (loaded === null) return
        setActiveItem((current) => (current?.id === loaded.id ? loaded : current))
      })
    },
    [library.loadReference]
  )

  const showAdjacentReference = useCallback(
    (offset: number) => {
      if (viewerIndex < 0) return
      const next = visibleItems[viewerIndex + offset]
      if (next === undefined) return
      openReference(next)
    },
    [openReference, viewerIndex, visibleItems]
  )

  /** Opens a reference the user did not click, such as a finished capture. */
  const showReferenceById = useCallback(
    async (id: ReferenceId) => {
      const loaded = await library.loadReference(id)
      if (loaded === null) return

      setActiveItem(loaded)
      setInspectorOpen(true)
    },
    [library.loadReference]
  )

  const updateActive = useCallback(
    async (patch: UpdateInspirationReference) => {
      if (activeItem === null) return false
      const updated = await library.updateReference(activeItem.id, patch)
      if (updated === null) return false
      setActiveItem(updated)
      return true
    },
    [activeItem, library.updateReference]
  )

  const enrichActive = useCallback(async () => {
    if (activeItem === null) return
    const enriched = await library.enrichReference(activeItem.id)
    if (enriched !== null) setActiveItem(enriched)
  }, [activeItem, library.enrichReference])

  const trashActive = useCallback(async () => {
    if (activeItem === null) return
    if (await library.removeReference(activeItem.id)) setActiveItem(null)
  }, [activeItem, library.removeReference])

  const restoreActive = useCallback(async () => {
    if (
      await updateActive(new UpdateInspirationReference({ status: "active" }))
    ) {
      setActiveItem(null)
    }
  }, [updateActive])

  const forgetTrashedActive = useCallback(
    (ids: ReadonlySet<ReferenceId>) => {
      if (activeItem !== null && ids.has(activeItem.id)) setActiveItem(null)
    },
    [activeItem]
  )

  const favoriteSelected = useCallback(
    async (favorite: boolean) => {
      await library.updateReferences(
        [...selection.ids],
        new UpdateInspirationReference({ favorite })
      )
    },
    [library.updateReferences, selection.ids]
  )

  const trashSelected = useCallback(async () => {
    const ids = selection.ids
    const result = await library.removeReferences([...ids])
    if (result.succeeded > 0) forgetTrashedActive(ids)
  }, [forgetTrashedActive, library.removeReferences, selection.ids])

  const restoreSelected = useCallback(async () => {
    await library.updateReferences(
      [...selection.ids],
      new UpdateInspirationReference({ status: "active" })
    )
  }, [library.updateReferences, selection.ids])

  const parentFolder =
    activeSelection.kind === "folder"
      ? { id: activeSelection.id, label: currentFolderLabel }
      : null

  return {
    activeSelection,
    activeItem,
    viewerItem,
    viewerIndex,
    selection,
    selectedItems,
    searchQuery,
    columns,
    filtersOpen,
    activeFilter,
    includeSubfolders,
    inspectorOpen,
    mobileSidebarOpen,
    quickSaveOpen,
    folderCreateOpen,
    commandMenuOpen,
    library,
    quickSave,
    referenceImport,
    collectionFolders,
    smartFolders,
    filterOptions,
    visibleItems,
    currentFolderLabel,
    currentFolderCount,
    assets,
    parentFolder,
    setActiveItem,
    setSearchQuery,
    setColumns,
    setFiltersOpen,
    setActiveFilter,
    setIncludeSubfolders,
    setInspectorOpen,
    setMobileSidebarOpen,
    setQuickSaveOpen,
    setFolderCreateOpen,
    setCommandMenuOpen,
    selectFolder,
    openReference,
    closeViewer: useCallback(() => setViewerId(null), []),
    showPreviousReference: useCallback(
      () => showAdjacentReference(-1),
      [showAdjacentReference]
    ),
    showNextReference: useCallback(
      () => showAdjacentReference(1),
      [showAdjacentReference]
    ),
    showReferenceById,
    updateActive,
    enrichActive,
    trashActive,
    restoreActive,
    favoriteSelected,
    trashSelected,
    restoreSelected
  } as const
}
