import {
  UpdateInspirationReference,
  type InspirationReference,
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
import { useDebouncedValue } from "./use-debounced-value"
import { useLibraryData } from "./use-library-data"
import { useQuickSave } from "./use-quick-save"
import { useReferenceAssets } from "./use-reference-assets"
import { useReferenceImport } from "./use-reference-import"

/** Coordinates library state while `ReferenceLibrary` stays a composition page. */
export const useReferenceLibrary = (workspaceId: WorkspaceId | null) => {
  const [activeSelection, setActiveSelection] = useState<LibrarySelection>(
    ALL_REFERENCES_SELECTION
  )
  const [selectedItem, setSelectedItem] =
    useState<InspirationReference | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [zoom, setZoom] = useState(0.95)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState("All")
  const [includeSubfolders, setIncludeSubfolders] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
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
    setSelectedItem(null)
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
      selectedItem === null ||
      visibleItems.some((item) => item.id === selectedItem.id)
    ) {
      return visibleItems
    }
    return [...visibleItems, selectedItem]
  }, [selectedItem, visibleItems])
  const assets = useReferenceAssets(workspaceId, assetReferences)

  const selectFolder = useCallback((selection: LibrarySelection) => {
    setActiveSelection(selection)
    setSelectedItem(null)
    setActiveFilter("All")
    setMobileSidebarOpen(false)
  }, [])

  const selectItem = useCallback(
    (item: InspirationReference) => {
      setSelectedItem(item)
      setInspectorOpen(true)
      void library.loadReference(item.id).then((loaded) => {
        if (loaded === null) return
        setSelectedItem((current) =>
          current?.id === loaded.id ? loaded : current
        )
      })
    },
    [library.loadReference]
  )

  const updateSelected = useCallback(
    async (patch: UpdateInspirationReference) => {
      if (selectedItem === null) return false
      const updated = await library.updateReference(selectedItem.id, patch)
      if (updated === null) return false
      setSelectedItem(updated)
      return true
    },
    [library.updateReference, selectedItem]
  )

  const enrichSelected = useCallback(async () => {
    if (selectedItem === null) return
    const enriched = await library.enrichReference(selectedItem.id)
    if (enriched !== null) setSelectedItem(enriched)
  }, [library.enrichReference, selectedItem])

  const moveSelectedToTrash = useCallback(async () => {
    if (selectedItem === null) return
    if (await library.removeReference(selectedItem.id)) setSelectedItem(null)
  }, [library.removeReference, selectedItem])

  const restoreSelected = useCallback(async () => {
    if (
      await updateSelected(
        new UpdateInspirationReference({ status: "active" })
      )
    ) {
      setSelectedItem(null)
    }
  }, [updateSelected])

  const parentFolder =
    activeSelection.kind === "folder"
      ? { id: activeSelection.id, label: currentFolderLabel }
      : null

  return {
    activeSelection,
    selectedItem,
    searchQuery,
    zoom,
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
    setSelectedItem,
    setSearchQuery,
    setZoom,
    setFiltersOpen,
    setActiveFilter,
    setIncludeSubfolders,
    setInspectorOpen,
    setMobileSidebarOpen,
    setQuickSaveOpen,
    setFolderCreateOpen,
    setCommandMenuOpen,
    selectFolder,
    selectItem,
    updateSelected,
    enrichSelected,
    moveSelectedToTrash,
    restoreSelected
  } as const
}
