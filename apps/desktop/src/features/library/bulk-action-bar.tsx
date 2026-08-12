import type { InspirationReference } from "@refnest/contracts"
import { CheckCheck, Heart, HeartOff, RotateCcw, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

/**
 * The bulk bar floats over the grid rather than replacing the toolbar, so the
 * references stay where the user left them while a selection is being acted on.
 */
export function BulkActionBar({
  items,
  allVisibleSelected,
  pending,
  onSelectAll,
  onClear,
  onFavorite,
  onTrash,
  onRestore
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly allVisibleSelected: boolean
  readonly pending: boolean
  readonly onSelectAll: () => void
  readonly onClear: () => void
  readonly onFavorite: (favorite: boolean) => void
  readonly onTrash: () => void
  readonly onRestore: () => void
}) {
  if (items.length === 0) return null

  const allFavorite = items.every((item) => item.favorite)
  const allTrashed = items.every((item) => item.status === "trash")

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Selected references"
        className="library-bulk-bar pointer-events-auto flex items-center gap-1 rounded-full border bg-popover p-1.5 pl-4 text-popover-foreground"
      >
        <p className="numeric shrink-0 text-label" aria-live="polite">
          {items.length} selected
        </p>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={allVisibleSelected}
          onClick={onSelectAll}
        >
          <CheckCheck aria-hidden="true" />
          Select all
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => onFavorite(!allFavorite)}
        >
          {allFavorite ? (
            <HeartOff aria-hidden="true" />
          ) : (
            <Heart aria-hidden="true" />
          )}
          {allFavorite ? "Unfavorite" : "Favorite"}
        </Button>

        {allTrashed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onRestore}
          >
            <RotateCcw aria-hidden="true" />
            Restore
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={onTrash}
          >
            <Trash2 aria-hidden="true" />
            Move to trash
          </Button>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          title="Clear selection (Esc)"
          onClick={onClear}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
