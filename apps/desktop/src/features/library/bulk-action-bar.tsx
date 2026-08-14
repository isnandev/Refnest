import type { FolderId, InspirationReference } from "@refnest/contracts"
import { CheckCheck, Heart, HeartOff, RotateCcw, Sparkles, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { BulkMovePopover } from "./bulk-move-popover"
import { BulkRatingPopover } from "./bulk-rating-popover"
import { BulkTagPopover } from "./bulk-tag-popover"
import type { LibraryFolder } from "./library-data"

/**
 * The bulk bar floats over the grid rather than replacing the toolbar, so the
 * references stay where the user left them while a selection is being acted on.
 * Anything that edits the references themselves opens its own panel above the
 * bar; the actions that need no argument stay one click.
 */
export function BulkActionBar({
  items,
  folders,
  allVisibleSelected,
  pending,
  canEnrich,
  onSelectAll,
  onClear,
  onFavorite,
  onMove,
  onAddTags,
  onRemoveTag,
  onRate,
  onEnrich,
  onTrash,
  onRestore
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly folders: readonly LibraryFolder[]
  readonly allVisibleSelected: boolean
  readonly pending: boolean
  readonly canEnrich: boolean
  readonly onSelectAll: () => void
  readonly onClear: () => void
  readonly onFavorite: (favorite: boolean) => void
  readonly onMove: (folderId: FolderId | null) => void
  readonly onAddTags: (value: string) => void
  readonly onRemoveTag: (tag: string) => void
  readonly onRate: (rating: number) => void
  readonly onEnrich: () => void
  readonly onTrash: () => void
  readonly onRestore: () => void
}) {
  if (items.length === 0) return null

  const allFavorite = items.every((item) => item.favorite)
  const allTrashed = items.every((item) => item.status === "trash")
  /** A trashed reference is read-only, so a mixed selection cannot be edited. */
  const anyTrashed = items.some((item) => item.status === "trash")

  return (
    <div
      role="toolbar"
      aria-label="Selected references"
      className="library-float-pill pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl border bg-popover p-1.5 pl-4 text-popover-foreground"
    >
      <p className="numeric shrink-0 text-label" aria-live="polite">
        {items.length} selected
      </p>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Select all"
        title="Select all (Ctrl+A)"
        disabled={allVisibleSelected}
        onClick={onSelectAll}
      >
        <CheckCheck aria-hidden="true" />
      </Button>

      <BulkMovePopover
        items={items}
        folders={folders}
        disabled={pending || anyTrashed}
        onMove={onMove}
      />

      <BulkTagPopover
        items={items}
        disabled={pending || anyTrashed}
        onAddTags={onAddTags}
        onRemoveTag={onRemoveTag}
      />

      <BulkRatingPopover
        items={items}
        disabled={pending || anyTrashed}
        onRate={onRate}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Enrich selected reference with AI"
        title="Enrich selected reference with AI"
        disabled={!canEnrich || pending}
        onClick={onEnrich}
      >
        <Sparkles aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={allFavorite ? "Remove from favorites" : "Add to favorites"}
        title={allFavorite ? "Unfavorite" : "Favorite"}
        aria-pressed={allFavorite}
        disabled={pending}
        onClick={() => onFavorite(!allFavorite)}
      >
        {allFavorite ? (
          <HeartOff aria-hidden="true" />
        ) : (
          <Heart aria-hidden="true" />
        )}
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
  )
}
