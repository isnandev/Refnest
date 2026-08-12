import type { WorkspaceDirectoryListing } from "@refnest/contracts"
import {
  ArrowUp,
  ChevronRight,
  CircleAlert,
  Folder,
  Home,
  LoaderCircle
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { WorkspaceBrowserState } from "./use-workspace-browser"

export function WorkspaceFolderExplorer({
  state,
  listing,
  onBrowse
}: {
  readonly state: WorkspaceBrowserState
  readonly listing: WorkspaceDirectoryListing | null
  readonly onBrowse: (path?: string) => void
}) {
  const retryPath = state.status === "failed" ? state.path : undefined

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Label>Location</Label>
          <p
            className="mt-1 truncate font-mono text-caption text-muted-foreground"
            title={listing?.path}
          >
            {listing?.path ?? "Loading your folders…"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (listing !== null) {
                onBrowse(listing.homePath)
              }
            }}
            disabled={listing === null || listing.path === listing.homePath}
            aria-label="Go to home folder"
          >
            <Home aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (listing?.parentPath !== null && listing?.parentPath !== undefined) {
                onBrowse(listing.parentPath)
              }
            }}
            disabled={listing?.parentPath === null || listing === null}
            aria-label="Go to parent folder"
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        className="workspace-folder-scroll min-h-[220px] overflow-y-auto rounded-md border bg-surface-muted p-1.5"
        aria-label="Folder explorer"
      >
        {state.status === "loading" && listing === null && (
          <div className="flex min-h-[204px] items-center justify-center gap-2 text-body-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading folders…
          </div>
        )}

        {state.status === "failed" && (
          <div className="flex min-h-[204px] flex-col items-center justify-center gap-3 px-6 text-center">
            <CircleAlert className="size-5 text-danger" aria-hidden="true" />
            <p className="text-body-sm text-muted-foreground">{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onBrowse(retryPath)}
            >
              Try again
            </Button>
          </div>
        )}

        {listing !== null && listing.directories.length === 0 && (
          <div className="flex min-h-[204px] items-center justify-center text-body-sm text-muted-foreground">
            This folder has no subfolders.
          </div>
        )}

        {listing !== null && listing.directories.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {listing.directories.map((directory) => (
              <button
                key={directory.path}
                type="button"
                className="flex min-h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-body-sm transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
                onClick={() => onBrowse(directory.path)}
              >
                <Folder
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{directory.name}</span>
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-caption text-muted-foreground">
        The workspace will be created as a new folder inside this location.
      </p>
    </div>
  )
}
