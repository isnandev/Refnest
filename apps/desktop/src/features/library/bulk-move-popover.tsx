import type { FolderId, InspirationReference } from "@refnest/contracts"
import { Check, Folder, FolderInput, FolderMinus } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { BulkActionPopover } from "./bulk-action-popover"
import { flattenLibraryFolders, type LibraryFolder } from "./library-data"

const ROW_CLASS =
  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-body-sm text-muted-foreground outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** The folder every selected reference already sits in, if they agree on one. */
const sharedFolderId = (items: ReadonlyArray<InspirationReference>) => {
  const first = items[0]?.folderId ?? null
  return items.every((item) => item.folderId === first) ? first : undefined
}

/**
 * Moving is the one bulk action that changes where a reference lives rather
 * than what it says, so the whole folder tree is offered flat — nesting cannot
 * be walked inside a pill-bar panel, and a move needs one click, not three.
 */
export function BulkMovePopover({
  items,
  folders,
  disabled,
  onMove
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly folders: readonly LibraryFolder[]
  readonly disabled: boolean
  readonly onMove: (folderId: FolderId | null) => void
}) {
  const flat = flattenLibraryFolders(folders)
  const current = sharedFolderId(items)

  return (
    <BulkActionPopover
      icon={FolderInput}
      label="Move"
      title="Move to folder"
      description={`Move ${items.length} ${items.length === 1 ? "reference" : "references"} into one folder.`}
      disabled={disabled || folders.length === 0}
      disabledReason={
        folders.length === 0
          ? "This workspace has no folders yet."
          : "Restore these references before moving them."
      }
    >
      {(close) => (
        <>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {flat.map((folder) => {
              if (folder.selection.kind !== "folder") return null
              const folderId = folder.selection.id

              return (
                <button
                  key={folder.key}
                  type="button"
                  className={cn(ROW_CLASS, folderId === current && "text-foreground")}
                  onClick={() => {
                    close()
                    onMove(folderId)
                  }}
                >
                  <Folder className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                  {folderId === current && (
                    <Check className="size-3.5 shrink-0 text-lime" aria-hidden="true" />
                  )}
                </button>
              )
            })}
          </div>

          <Separator className="my-2" />

          <button
            type="button"
            className={cn(ROW_CLASS, current === null && "text-foreground")}
            onClick={() => {
              close()
              onMove(null)
            }}
          >
            <FolderMinus className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Remove from folder</span>
            {current === null && (
              <Check className="size-3.5 shrink-0 text-lime" aria-hidden="true" />
            )}
          </button>
        </>
      )}
    </BulkActionPopover>
  )
}
