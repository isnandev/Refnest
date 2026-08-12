import type { Workspace } from "@refnest/contracts"
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FolderPlus,
  Library,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Replace,
  Settings2,
  Upload
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { WorkspacesState } from "@/features/workspaces/use-workspaces"
import { WorkspaceSelector } from "@/features/workspaces/workspace-selector"
import { FolderTree } from "./folder-tree"
import type { LibraryNavigationState } from "./use-library-data"
import type { CaptureJobsState } from "./use-quick-save"
import {
  type LibraryFolder,
  type LibrarySelection
} from "./library-data"

const captureLabel = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const CaptureStatusIcon = ({ status }: { status: CaptureJobsState["jobs"][number]["status"] }) => {
  if (status === "completed") {
    return <CheckCircle2 className="size-3.5 text-lime" aria-hidden="true" />
  }
  if (status === "failed") {
    return <CircleAlert className="size-3.5 text-danger" aria-hidden="true" />
  }
  if (status === "queued") {
    return <Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />
  }
  return <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
}

export function LibrarySidebar({
  workspaceState,
  selectedWorkspace,
  navigation,
  captureJobs,
  importPending,
  importError,
  primaryFolders,
  smartFolders,
  collectionFolders,
  activeSelection,
  onSelectWorkspace,
  onCreateWorkspace,
  onSelectFolder,
  onOpenQuickSave,
  onImportFiles,
  onOpenCreateFolder,
  onOpenConverter,
  onOpenSettings,
  onRetryNavigation,
  onRetryCaptureJobs
}: {
  readonly workspaceState: WorkspacesState
  readonly selectedWorkspace: Workspace | null
  readonly navigation: LibraryNavigationState
  readonly captureJobs: CaptureJobsState
  readonly importPending: boolean
  readonly importError: string | null
  readonly primaryFolders: readonly LibraryFolder[]
  readonly smartFolders: readonly LibraryFolder[]
  readonly collectionFolders: readonly LibraryFolder[]
  readonly activeSelection: LibrarySelection
  readonly onSelectWorkspace: (workspace: Workspace) => void
  readonly onCreateWorkspace: () => void
  readonly onSelectFolder: (selection: LibrarySelection) => void
  readonly onOpenQuickSave: () => void
  readonly onImportFiles: () => void
  readonly onOpenCreateFolder: () => void
  readonly onOpenConverter: () => void
  readonly onOpenSettings: () => void
  readonly onRetryNavigation: () => void
  readonly onRetryCaptureJobs: () => void
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const activeCaptures = captureJobs.jobs.filter((job) =>
    ["queued", "capturing", "enriching"].includes(job.status)
  ).length

  return (
    <aside
      aria-label="Library sidebar"
      className="library-sidebar relative z-30 flex h-full min-h-0 w-full shrink-0 flex-col bg-surface"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 px-3">
        <div className="flex size-8 items-center justify-center rounded-sm border bg-surface-muted">
          <Library className="size-4" aria-hidden="true" />
        </div>
        <span className="min-w-0 flex-1 truncate text-label text-foreground">
          RefNest
        </span>

        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Capture activity"
            aria-expanded={notificationsOpen}
            onClick={() => {
              setNotificationsOpen((open) => !open)
              setAddMenuOpen(false)
            }}
          >
            <Bell aria-hidden="true" />
            {activeCaptures > 0 && (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-lime" />
            )}
          </Button>

          {notificationsOpen && (
            <div
              role="status"
              className="library-popover absolute left-0 top-10 z-50 w-72 rounded-md border bg-popover p-2 text-popover-foreground"
            >
              <p className="px-2 py-1 text-label">Capture activity</p>
              {captureJobs.status === "loading" && captureJobs.jobs.length === 0 ? (
                <p className="px-2 py-3 text-body-sm text-muted-foreground">
                  Loading captures…
                </p>
              ) : captureJobs.status === "failed" ? (
                <div className="space-y-2 rounded-sm bg-danger-container p-2.5 text-body-sm text-danger">
                  <p>{captureJobs.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetryCaptureJobs}
                  >
                    <RefreshCw aria-hidden="true" />
                    Retry
                  </Button>
                </div>
              ) : captureJobs.jobs.length === 0 ? (
                <p className="px-2 py-3 text-body-sm text-muted-foreground">
                  No captures yet.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {captureJobs.jobs.slice(0, 8).map((job) => (
                    <div key={job.id} className="rounded-sm p-2.5 hover:bg-surface-muted">
                      <div className="flex items-center gap-2">
                        <CaptureStatusIcon status={job.status} />
                        <p className="min-w-0 flex-1 truncate text-body-sm">
                          {captureLabel(job.url)}
                        </p>
                        <span className="text-caption capitalize text-muted-foreground">
                          {job.status}
                        </span>
                      </div>
                      {(job.error ?? job.warning) !== null && (
                        <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">
                          {job.error ?? job.warning}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add to library"
            aria-expanded={addMenuOpen}
            disabled={selectedWorkspace === null}
            onClick={() => {
              setAddMenuOpen((open) => !open)
              setNotificationsOpen(false)
            }}
          >
            <Plus aria-hidden="true" />
          </Button>

          {addMenuOpen && (
            <div
              role="menu"
              aria-label="Add to library"
              className="library-popover absolute left-0 top-10 z-50 w-56 rounded-md border bg-popover p-1.5 text-popover-foreground"
            >
              <button
                type="button"
                role="menuitem"
                disabled={importPending}
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-body-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  setAddMenuOpen(false)
                  onImportFiles()
                }}
              >
                {importPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {importPending ? "Importing…" : "Import files…"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-body-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                onClick={() => {
                  setAddMenuOpen(false)
                  onOpenQuickSave()
                }}
              >
                <Link2 className="size-4" aria-hidden="true" />
                Capture a website…
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-body-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                onClick={() => {
                  setAddMenuOpen(false)
                  onOpenCreateFolder()
                }}
              >
                <FolderPlus className="size-4" aria-hidden="true" />
                New folder…
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-3 mb-3 rounded-sm border bg-surface-muted px-1">
        <WorkspaceSelector
          state={workspaceState}
          selectedWorkspace={selectedWorkspace}
          onSelect={onSelectWorkspace}
          onCreate={onCreateWorkspace}
        />
      </div>

      {importError !== null && (
        <p
          role="alert"
          className="mx-3 mb-3 line-clamp-3 rounded-sm bg-danger-container p-2.5 text-caption text-danger"
        >
          {importError}
        </p>
      )}

      <div className="library-folder-scroll min-h-0 flex-1 overflow-y-auto">
        {navigation.status === "loading" && navigation.folders.length === 0 ? (
          <div className="space-y-2 px-3 py-2" aria-label="Loading folders" aria-busy="true">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="h-7 animate-pulse rounded-sm bg-surface-muted" />
            ))}
          </div>
        ) : navigation.status === "failed" ? (
          <div className="mx-3 rounded-sm bg-danger-container p-3 text-body-sm text-danger">
            <p>{navigation.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRetryNavigation}
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : (
          <FolderTree
            primaryFolders={primaryFolders}
            smartFolders={smartFolders}
            collectionFolders={collectionFolders}
            activeSelection={activeSelection}
            onSelect={onSelectFolder}
          />
        )}
      </div>

      <div className="m-3 mt-2 shrink-0 border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-body-sm"
          onClick={onOpenConverter}
        >
          <Replace aria-hidden="true" />
          Convert images
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-body-sm"
          onClick={onOpenSettings}
        >
          <Settings2 aria-hidden="true" />
          Settings
        </Button>
      </div>
    </aside>
  )
}
