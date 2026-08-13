import {
  REFERENCE_TAG_MAX_LENGTH,
  ReferenceTag,
  UpdateInspirationReference,
  type FolderId,
  type InspirationReference,
  type LibraryViewPreferences,
  type LibraryViewPreferencesPatch,
  type ReferenceId,
  type WorkspaceId
} from "@refnest/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ALL_REFERENCES_SELECTION,
  PRIMARY_FOLDERS,
  buildFolderTree,
  buildSmartFolders,
  folderCount,
  folderLabel,
  type LibrarySelection
} from "./library-data"
import { parseTagList } from "./library-format"
import { useDebouncedValue } from "./use-debounced-value"
import { useLibraryData } from "./use-library-data"
import { useLibraryShortcuts } from "./use-library-shortcuts"
import { useQuickSave } from "./use-quick-save"
import { useReferenceAssets } from "./use-reference-assets"
import { useReferenceDrop } from "./use-reference-drop"
import { useReferenceExport } from "./use-reference-export"
import { useReferenceImport } from "./use-reference-import"
import { useReferenceSelection } from "./use-reference-selection"
import { usePasteToLibrary } from "./use-paste-to-library"

const toReferenceTags = (tags: ReadonlyArray<string>) =>
  tags
    .filter((tag) => tag.length <= REFERENCE_TAG_MAX_LENGTH)
    .map((tag) => ReferenceTag.make(tag))

/**
 * Coordinates library state while `ReferenceLibrary` stays a composition page.
 * How the grid presents itself lives in the saved view document rather than in
 * this hook, so every preference survives a restart.
 */
export const useReferenceLibrary = ({
  workspaceId,
  canImport,
  aiEnabled,
  view,
  onViewChange
}: {
  readonly workspaceId: WorkspaceId | null
  /** Local import is host-only, so a remote library can neither pick nor drop. */
  readonly canImport: boolean
  readonly aiEnabled: boolean
  readonly view: LibraryViewPreferences
  readonly onViewChange: (patch: LibraryViewPreferencesPatch) => void
}) => {
  const [activeSelection, setActiveSelection] = useState<LibrarySelection>(
    ALL_REFERENCES_SELECTION
  )
  /** The one reference the inspector describes — not the bulk selection. */
  const [activeItem, setActiveItem] = useState<InspirationReference | null>(null)
  const [viewerId, setViewerId] = useState<ReferenceId | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState("All")
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [quickSaveOpen, setQuickSaveOpen] = useState(false)
  const [folderCreateOpen, setFolderCreateOpen] = useState(false)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(searchQuery, 220)
  const library = useLibraryData(
    workspaceId,
    activeSelection,
    debouncedQuery,
    view.showSubfolderContents,
    view.sort,
    view.sortDirection
  )
  const quickSave = useQuickSave(workspaceId, () => {
    void library.refresh()
  })
  const referenceImport = useReferenceImport({
    workspaceId,
    canImport,
    onImported: () => {
      void library.refresh()
    }
  })
  const referenceExport = useReferenceExport()
  /**
   * Everything added without a dialog — a dropped file, a pasted link — lands
   * in the folder being viewed, exactly where the menu's own actions put it.
   */
  const addDestination =
    activeSelection.kind === "folder" ? activeSelection.id : null
  const referenceDrop = useReferenceDrop({
    canImport: canImport && workspaceId !== null,
    onDrop: (paths) => {
      void referenceImport.importFiles(paths, addDestination)
    }
  })
  usePasteToLibrary({
    enabled: workspaceId !== null,
    onPasteUrl: (url) => {
      void quickSave.create(url, addDestination, aiEnabled)
    },
    onPasteFile: (file) => {
      void referenceImport.importPastedFile(file, addDestination)
    }
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
  const assets = useReferenceAssets(
    workspaceId,
    assetReferences,
    view.thumbnailQuality
  )
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

  const setInspectorOpen = useCallback(
    (open: boolean) => onViewChange({ showInspector: open }),
    [onViewChange]
  )

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
    [library.loadReference, setInspectorOpen]
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

  const exportActive = useCallback(async () => {
    if (activeItem === null) return
    await referenceExport.exportToFile(activeItem)
  }, [activeItem, referenceExport.exportToFile])

  const favoriteSelected = useCallback(
    async (favorite: boolean) => {
      await library.updateReferences(
        [...selection.ids],
        new UpdateInspirationReference({ favorite })
      )
    },
    [library.updateReferences, selection.ids]
  )

  const moveSelected = useCallback(
    async (folderId: FolderId | null) => {
      await library.updateReferences(
        [...selection.ids],
        new UpdateInspirationReference({ folderId })
      )
    },
    [library.updateReferences, selection.ids]
  )

  const rateSelected = useCallback(
    async (rating: number) => {
      await library.updateReferences(
        [...selection.ids],
        new UpdateInspirationReference({ rating })
      )
    },
    [library.updateReferences, selection.ids]
  )

  /** Adding keeps what each reference already carries, so every patch differs. */
  const addTagsToSelected = useCallback(
    async (value: string) => {
      const added = parseTagList(value)
      if (added.length === 0) return

      await library.updateEachReference(
        selectedItems.flatMap((item) => {
          const missing = added.filter((tag) => !item.tags.includes(tag))
          return missing.length === 0
            ? []
            : [
                [
                  item.id,
                  new UpdateInspirationReference({
                    tags: toReferenceTags([...item.tags, ...missing])
                  })
                ] as const
              ]
        })
      )
    },
    [library.updateEachReference, selectedItems]
  )

  const removeTagFromSelected = useCallback(
    async (tag: string) => {
      await library.updateEachReference(
        selectedItems.flatMap((item) =>
          item.tags.includes(tag)
            ? [
                [
                  item.id,
                  new UpdateInspirationReference({
                    tags: toReferenceTags(
                      item.tags.filter((current) => current !== tag)
                    )
                  })
                ] as const
              ]
            : []
        )
      )
    },
    [library.updateEachReference, selectedItems]
  )

  const trashSelected = useCallback(async () => {
    const ids = selection.ids
    const result = await library.removeReferences([...ids])
    if (result.succeeded > 0 && activeItem !== null && ids.has(activeItem.id)) {
      setActiveItem(null)
    }
  }, [activeItem, library.removeReferences, selection.ids])

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
    filtersOpen,
    viewOptionsOpen,
    activeFilter,
    mobileSidebarOpen,
    quickSaveOpen,
    folderCreateOpen,
    commandMenuOpen,
    library,
    quickSave,
    referenceImport,
    referenceDrop,
    referenceExport,
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
    setFiltersOpen,
    setViewOptionsOpen,
    setActiveFilter,
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
    exportActive,
    favoriteSelected,
    moveSelected,
    rateSelected,
    addTagsToSelected,
    removeTagFromSelected,
    trashSelected,
    restoreSelected
  } as const
}
