import {
  UpdateInspirationReference,
  type Workspace
} from "@refnest/contracts"
import { PanelRightClose, PanelRightOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AppCommandMenu } from "@/features/commands/app-command-menu"
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
import { CaptureToaster } from "./capture-toaster"
import { FolderCreateDialog } from "./folder-create-dialog"
import { InspectorPanel } from "./inspector-panel"
import { PRIMARY_FOLDERS } from "./library-data"
import { LibrarySidebar } from "./library-sidebar"
import { LibraryToolbar } from "./library-toolbar"
import { openReferenceSource } from "./open-reference-source"
import { QuickSaveDialog } from "./quick-save-dialog"
import { ReferenceGrid } from "./reference-grid"
import { useReferenceLibrary } from "./use-reference-library"

export function ReferenceLibrary({
  workspaceState,
  selectedWorkspace,
  sidebarPreferences,
  settingsReady,
  theme,
  aiEnabled,
  libraryName,
  onLocalLibrary,
  onSelectWorkspace,
  onCreateWorkspace,
  onSidebarPreferencesChange,
  onOpenSettings,
  onToggleTheme
}: {
  readonly workspaceState: WorkspacesState
  readonly selectedWorkspace: Workspace | null
  readonly sidebarPreferences: SidebarPreferences
  readonly settingsReady: boolean
  readonly theme: Theme
  readonly aiEnabled: boolean
  readonly libraryName: string | null
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
  readonly onToggleTheme: () => void
}) {
  const workspaceId = selectedWorkspace?.id ?? null
  const sidebar = useSidebar(
    false,
    { width: sidebarPreferences.width, collapsed: false },
    settingsReady,
    onSidebarPreferencesChange
  )
  const {
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
    selectReferenceById,
    updateSelected,
    enrichSelected,
    moveSelectedToTrash,
    restoreSelected
  } = useReferenceLibrary(workspaceId)
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

  return (
    <div
      className={cn(
        "h-screen overflow-hidden bg-stage text-foreground",
        sidebar.dragging && "cursor-col-resize select-none"
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
            mobileSidebarOpen && "is-open"
          )}
          style={{ width: sidebar.width }}
        >
          <LibrarySidebar
            workspaceState={workspaceState}
            selectedWorkspace={selectedWorkspace}
            navigation={library.navigation}
            captureJobs={quickSave.state}
            importPending={referenceImport.pending}
            importError={referenceImport.actionError}
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
          className="hidden min-[900px]:block"
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
                zoom={zoom}
                filterOpen={filtersOpen}
                activeFilter={activeFilter}
                filterOptions={filterOptions}
                includeSubfolders={includeSubfolders}
                canEnrich={selectedItem !== null && aiEnabled}
                actionPending={library.pending || referenceImport.pending}
                onOpenSidebar={() => setMobileSidebarOpen(true)}
                onOpenSearch={() => setCommandMenuOpen(true)}
                onClearSearch={() => setSearchQuery("")}
                onZoomChange={setZoom}
                onFiltersOpenChange={setFiltersOpen}
                onFilterChange={setActiveFilter}
                onIncludeSubfoldersChange={setIncludeSubfolders}
                onEnrich={() => void enrichSelected()}
              />
              </>
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={inspectorOpen ? "Collapse inspector" : "Open inspector"}
              aria-expanded={inspectorOpen}
              onClick={() => setInspectorOpen((open) => !open)}
            >
              {inspectorOpen ? (
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
                selectedId={selectedItem?.id ?? null}
                zoom={zoom}
                imageUrls={assets.urls}
                failedImages={assets.failed}
                loading={
                  workspaceState.status === "loading" ||
                  library.references.status === "loading"
                }
                error={referencesError}
                onRetry={() => void library.refreshReferences()}
                onSelect={selectItem}
              />

              <p className="sr-only" aria-live="polite">
                Showing {visibleItems.length} references
              </p>
            </main>

            <div
              className={cn(
                "library-inspector-column h-full shrink-0 overflow-hidden",
                !inspectorOpen && "is-collapsed"
              )}
              aria-hidden={!inspectorOpen}
              inert={!inspectorOpen}
            >
              <InspectorPanel
                item={selectedItem}
                imageUrl={
                  selectedItem === null ? undefined : assets.urls.get(selectedItem.id)
                }
                imageFailed={
                  selectedItem !== null && assets.failed.has(selectedItem.id)
                }
                folderLabel={currentFolderLabel}
                itemCount={currentFolderCount}
                canEnrich={aiEnabled}
                pending={library.pending || referenceImport.pending}
                actionError={
                  referenceImport.actionError ?? library.actionError
                }
                onClearSelection={() => setSelectedItem(null)}
                onToggleFavorite={() => {
                  if (selectedItem === null) return
                  void updateSelected(
                    new UpdateInspirationReference({
                      favorite: !selectedItem.favorite
                    })
                  )
                }}
                onTrash={() => void moveSelectedToTrash()}
                onRestore={() => void restoreSelected()}
                onEnrich={() => void enrichSelected()}
                onOpenSource={() => {
                  if (
                    selectedItem !== null &&
                    selectedItem.source !== "local-file"
                  ) {
                    void openReferenceSource(selectedItem.sourceUrl)
                  }
                }}
              />
            </div>
          </div>
        </section>
      </div>

      <CaptureToaster
        jobs={quickSave.state.jobs}
        onShowReference={(id) => void selectReferenceById(id)}
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
        onSelectReference={selectItem}
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
