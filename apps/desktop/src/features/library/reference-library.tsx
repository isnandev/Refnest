import {
  UpdateInspirationReference,
  type LibraryViewPreferences,
  type LibraryViewPreferencesPatch,
  type Workspace
} from "@refnest/contracts"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { useCallback, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { AppCommandMenu } from "@/features/commands/app-command-menu"
import { ConvertReferenceDialog } from "@/features/converter/convert-reference-dialog"
import { useImageConverter } from "@/features/converter/use-image-converter"
import { RemoteLibraryBadge } from "@/features/environments/remote-library-badge"
import { SidebarResizeHandle } from "@/features/shell/sidebar-resize-handle"
import {
  useSidebar,
  type SidebarPreferences
} from "@/features/shell/use-sidebar"
import type { Theme } from "@/features/theme/use-theme"
import { TitleBar } from "@/features/window/title-bar"
import type { WorkspacesState } from "@/features/workspaces/use-workspaces"
import { cn } from "@/lib/utils"
import { BulkActionBar } from "./bulk-action-bar"
import { CaptureToaster } from "./capture-toaster"
import { FolderCreateDialog } from "./folder-create-dialog"
import { ImportDropOverlay } from "./import-drop-overlay"
import { ImportStatusPill } from "./import-status-pill"
import { InspectorPanel } from "./inspector-panel"
import { PRIMARY_FOLDERS } from "./library-data"
import { LibrarySidebar } from "./library-sidebar"
import { LibraryToolbar } from "./library-toolbar"
import { openReferenceSource } from "./open-reference-source"
import { QuickSaveDialog } from "./quick-save-dialog"
import { ReferenceGrid } from "./reference-grid"
import { ReferenceViewer } from "./reference-viewer"
import { useReferenceLibrary } from "./use-reference-library"

export function ReferenceLibrary({
  workspaceState,
  selectedWorkspace,
  sidebarPreferences,
  settingsReady,
  theme,
  aiEnabled,
  libraryName,
  view,
  onViewChange,
  onLocalLibrary,
  onSelectWorkspace,
  onCreateWorkspace,
  onSidebarPreferencesChange,
  onOpenSettings,
  onOpenConverter,
  onToggleTheme
}: {
  readonly workspaceState: WorkspacesState
  readonly selectedWorkspace: Workspace | null
  readonly sidebarPreferences: SidebarPreferences
  readonly settingsReady: boolean
  readonly theme: Theme
  readonly aiEnabled: boolean
  readonly libraryName: string | null
  readonly view: LibraryViewPreferences
  readonly onViewChange: (patch: LibraryViewPreferencesPatch) => void
  /**
   * Host-only affordances are hidden rather than left to fail: on a remote
   * library, workspace creation and local file import are absent from that
   * machine's shared contract.
   */
  readonly onLocalLibrary: boolean
  readonly onSelectWorkspace: (workspace: Workspace) => void
  readonly onCreateWorkspace: () => void
  readonly onSidebarPreferencesChange: (
    preferences: SidebarPreferences
  ) => void
  readonly onOpenSettings: () => void
  readonly onOpenConverter: () => void
  readonly onToggleTheme: () => void
}) {
  const workspaceId = selectedWorkspace?.id ?? null
  const sidebar = useSidebar(
    false,
    { width: sidebarPreferences.width, collapsed: false },
    settingsReady,
    onSidebarPreferencesChange
  )
  const onInspectorPreferencesChange = useCallback(
    ({ width }: SidebarPreferences) =>
      onViewChange({ inspectorWidth: Math.round(width) }),
    [onViewChange]
  )
  const inspector = useSidebar(
    false,
    {
      width: view.inspectorWidth,
      collapsed: !view.showInspector
    },
    settingsReady,
    onInspectorPreferencesChange,
    "right"
  )
  const {
    activeSelection,
    activeItem,
    viewerItem,
    viewerIndex,
    viewerVideo,
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
    closeViewer,
    showPreviousReference,
    showNextReference,
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
  } = useReferenceLibrary({
    workspaceId,
    canImport: onLocalLibrary,
    aiEnabled,
    view,
    onViewChange
  })
  const converter = useImageConverter()
  const [convertOpen, setConvertOpen] = useState(false)
  const referencesError =
    workspaceState.status === "failed"
      ? workspaceState.message
      : library.references.status === "failed"
        ? library.references.message
        : null
  const openQuickSave = () => {
    quickSave.clearActionError()
    setQuickSaveOpen(true)
  }
  const importFiles = () => {
    referenceImport.clearActionError()
    void referenceImport.selectAndImport(parentFolder?.id ?? null)
  }
  const openCreateFolder = () => {
    library.clearActionError()
    setFolderCreateOpen(true)
  }
  const openConvert = () => {
    converter.clearActionError()
    setConvertOpen(true)
  }

  return (
    <div
      className={cn(
        "h-screen overflow-hidden bg-stage text-foreground",
        (sidebar.dragging || inspector.dragging) &&
          "cursor-col-resize select-none"
      )}
    >
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-full bg-primary px-4 py-2 text-label text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to references
      </a>

      <div className="flex h-full min-h-0">
        <div
          className={cn(
            "library-sidebar-drawer h-full shrink-0",
            mobileSidebarOpen && "is-open",
            // Hidden on desktop when the view says so; the drawer still opens
            // on a narrow window, which is the only way back to the folders.
            !view.showSidebar && "min-[900px]:hidden"
          )}
          style={{ width: sidebar.width }}
        >
          <LibrarySidebar
            workspaceState={workspaceState}
            selectedWorkspace={selectedWorkspace}
            navigation={library.navigation}
            captureJobs={quickSave.state}
            importPending={referenceImport.pending}
            addError={referenceImport.actionError ?? quickSave.actionError}
            primaryFolders={PRIMARY_FOLDERS}
            smartFolders={smartFolders}
            collectionFolders={collectionFolders}
            activeSelection={activeSelection}
            onSelectWorkspace={onSelectWorkspace}
            onCreateWorkspace={onCreateWorkspace}
            onLocalLibrary={onLocalLibrary}
            onSelectFolder={selectFolder}
            onOpenQuickSave={openQuickSave}
            onImportFiles={importFiles}
            onOpenCreateFolder={openCreateFolder}
            onOpenConverter={onOpenConverter}
            onOpenSettings={onOpenSettings}
            onRetryNavigation={() => void library.refreshNavigation()}
            onRetryCaptureJobs={() => void quickSave.refresh()}
          />
        </div>

        <SidebarResizeHandle
          dragging={sidebar.dragging}
          width={sidebar.width}
          onPointerDown={sidebar.startResize}
          onPointerMove={sidebar.resize}
          onPointerUp={sidebar.endResize}
          onPointerCancel={sidebar.endResize}
          onKeyDown={sidebar.onDividerKeyDown}
          className={cn("hidden", view.showSidebar && "min-[900px]:block")}
        />

        {mobileSidebarOpen && (
          <button
            type="button"
            className="library-mobile-scrim fixed inset-0 z-20 bg-black/35 min-[900px]:hidden"
            aria-label="Close library sidebar"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-stage">
          <TitleBar
            leading={
              <>
              {!onLocalLibrary && libraryName !== null ? (
                <RemoteLibraryBadge name={libraryName} />
              ) : null}
              <LibraryToolbar
                workspaceLabel={selectedWorkspace?.name ?? "Workspace"}
                folderLabel={currentFolderLabel}
                searchQuery={searchQuery}
                view={view}
                viewOptionsOpen={viewOptionsOpen}
                filterOpen={filtersOpen}
                activeFilter={activeFilter}
                filterOptions={filterOptions}
                canEnrich={activeItem !== null && aiEnabled}
                actionPending={library.pending || referenceImport.pending}
                onOpenSidebar={() => setMobileSidebarOpen(true)}
                onOpenSearch={() => setCommandMenuOpen(true)}
                onClearSearch={() => setSearchQuery("")}
                onViewChange={onViewChange}
                onViewOptionsOpenChange={setViewOptionsOpen}
                onRefresh={() => void library.refresh()}
                onFiltersOpenChange={setFiltersOpen}
                onFilterChange={setActiveFilter}
                onEnrich={() => void enrichActive()}
              />
              </>
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={view.showInspector ? "Hide details" : "Show details"}
              title={view.showInspector ? "Hide details" : "Show details"}
              aria-expanded={view.showInspector}
              onClick={() => setInspectorOpen(!view.showInspector)}
            >
              {view.showInspector ? (
                <PanelRightClose aria-hidden="true" />
              ) : (
                <PanelRightOpen aria-hidden="true" />
              )}
            </Button>
          </TitleBar>

          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <main
              id="main-content"
              tabIndex={-1}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none bg-stage"
            >
              <ReferenceGrid
                items={visibleItems}
                activeId={activeItem?.id ?? null}
                selectedIds={selection.ids}
                selectionMode={selection.active}
                view={view}
                imageUrls={assets.urls}
                failedImages={assets.failed}
                loading={
                  workspaceState.status === "loading" ||
                  library.references.status === "loading"
                }
                error={referencesError}
                onRetry={() => void library.refreshReferences()}
                onOpen={openReference}
                onToggleSelect={(item) => selection.toggle(item.id)}
                onExtendSelect={(item) => selection.extendTo(item.id)}
              />

              <p className="sr-only" aria-live="polite">
                Showing {visibleItems.length} references
              </p>
            </main>

            <SidebarResizeHandle
              collapsed={!view.showInspector}
              dragging={inspector.dragging}
              width={inspector.width}
              label="Resize reference inspector"
              onPointerDown={inspector.startResize}
              onPointerMove={inspector.resize}
              onPointerUp={inspector.endResize}
              onPointerCancel={inspector.endResize}
              onKeyDown={inspector.onDividerKeyDown}
              className={cn(
                "hidden",
                view.showInspector && "min-[900px]:block"
              )}
            />

            <div
              className={cn(
                "library-inspector-column h-full shrink-0 overflow-hidden",
                inspector.dragging && "is-dragging",
                !view.showInspector && "is-collapsed"
              )}
              style={
                {
                  "--inspector-width": `${inspector.width}px`
                } as CSSProperties
              }
              aria-hidden={!view.showInspector}
              inert={!view.showInspector}
            >
              <InspectorPanel
                item={activeItem}
                imageUrl={
                  activeItem === null ? undefined : assets.urls.get(activeItem.id)
                }
                imageFailed={
                  activeItem !== null && assets.failed.has(activeItem.id)
                }
                folders={collectionFolders}
                folderLabel={currentFolderLabel}
                itemCount={currentFolderCount}
                canEnrich={aiEnabled}
                pending={
                  library.pending ||
                  referenceImport.pending ||
                  referenceExport.pending ||
                  converter.pending
                }
                actionError={
                  referenceExport.actionError ??
                  referenceImport.actionError ??
                  library.actionError
                }
                onClose={() => setInspectorOpen(false)}
                onEditMetadata={updateActive}
                onToggleFavorite={() => {
                  if (activeItem === null) return
                  void updateActive(
                    new UpdateInspirationReference({
                      favorite: !activeItem.favorite
                    })
                  )
                }}
                onTrash={() => void trashActive()}
                onRestore={() => void restoreActive()}
                onEnrich={() => void enrichActive()}
                canConvert={onLocalLibrary}
                onConvert={openConvert}
                onExport={() => {
                  referenceExport.clearActionError()
                  void exportActive()
                }}
                onOpenSource={() => {
                  if (activeItem !== null && activeItem.source !== "local-file") {
                    void openReferenceSource(activeItem.sourceUrl)
                  }
                }}
              />
            </div>
          </div>
        </section>
      </div>

      <ReferenceViewer
        item={viewerItem}
        imageUrl={
          viewerItem === null ? undefined : assets.urls.get(viewerItem.id)
        }
        imageFailed={viewerItem !== null && assets.failed.has(viewerItem.id)}
        videoUrl={viewerVideo.url}
        videoFailed={viewerVideo.failed}
        index={viewerIndex}
        total={visibleItems.length}
        onOpenChange={(open) => {
          if (!open) closeViewer()
        }}
        onPrevious={showPreviousReference}
        onNext={showNextReference}
        onShowDetails={() => {
          closeViewer()
          setInspectorOpen(true)
        }}
      />

      {/*
        Both floating bars share one bottom stack, so an import that starts
        while a selection is open sits above the bulk bar instead of over it.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        <ImportStatusPill
          pending={referenceImport.pending}
          count={referenceImport.pendingCount}
        />

        <BulkActionBar
          items={selectedItems}
          folders={collectionFolders}
          allVisibleSelected={selection.allVisibleSelected}
          pending={library.pending}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onFavorite={(favorite) => void favoriteSelected(favorite)}
          onMove={(folderId) => void moveSelected(folderId)}
          onAddTags={(value) => void addTagsToSelected(value)}
          onRemoveTag={(tag) => void removeTagFromSelected(tag)}
          onRate={(rating) => void rateSelected(rating)}
          onTrash={() => void trashSelected()}
          onRestore={() => void restoreSelected()}
        />
      </div>

      <ImportDropOverlay
        state={referenceDrop}
        canImport={onLocalLibrary}
        destinationLabel={
          parentFolder?.label ?? selectedWorkspace?.name ?? "this workspace"
        }
      />

      <CaptureToaster
        jobs={quickSave.state.jobs}
        onShowReference={(id) => void showReferenceById(id)}
      />

      <AppCommandMenu
        open={commandMenuOpen}
        query={searchQuery}
        references={visibleItems}
        imageUrls={assets.urls}
        failedImages={assets.failed}
        searching={library.references.status === "loading"}
        primaryFolders={PRIMARY_FOLDERS}
        smartFolders={smartFolders}
        collectionFolders={collectionFolders}
        workspaceState={workspaceState}
        selectedWorkspace={selectedWorkspace}
        theme={theme}
        onOpenChange={setCommandMenuOpen}
        onQueryChange={setSearchQuery}
        onSelectReference={openReference}
        onSelectFolder={selectFolder}
        onSelectWorkspace={onSelectWorkspace}
        onCreateWorkspace={onCreateWorkspace}
        onQuickSave={openQuickSave}
        onImportFiles={importFiles}
        onCreateFolder={openCreateFolder}
        onOpenSettings={onOpenSettings}
        onToggleTheme={onToggleTheme}
      />

      <QuickSaveDialog
        open={quickSaveOpen}
        destinationLabel={parentFolder?.label ?? selectedWorkspace?.name ?? "workspace root"}
        aiEnabled={aiEnabled}
        pending={quickSave.pending}
        actionError={quickSave.actionError}
        onOpenChange={setQuickSaveOpen}
        onCreate={async (url, autoMetadata) =>
          (await quickSave.create(url, parentFolder?.id ?? null, autoMetadata)) !==
          null
        }
      />

      <ConvertReferenceDialog
        open={convertOpen}
        referenceTitle={activeItem?.title ?? "This image"}
        destinationLabel={
          parentFolder?.label ?? selectedWorkspace?.name ?? "workspace root"
        }
        pending={converter.pending}
        actionError={converter.actionError}
        onOpenChange={setConvertOpen}
        onConvert={async (format, quality) => {
          if (activeItem === null || workspaceId === null) return false

          const created = await converter.convertReference(
            activeItem.id,
            workspaceId,
            parentFolder?.id ?? null,
            format,
            quality
          )
          if (created === null) return false

          await library.refreshReferences()
          return true
        }}
      />

      <FolderCreateDialog
        open={folderCreateOpen}
        parentLabel={parentFolder?.label ?? null}
        pending={library.pending}
        actionError={library.actionError}
        onOpenChange={setFolderCreateOpen}
        onCreate={async (name) => {
          const created = await library.createFolder(name, parentFolder?.id ?? null)
          if (created === null) return false
          selectFolder({ kind: "folder", id: created.id })
          return true
        }}
      />
    </div>
  )
}
