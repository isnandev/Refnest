import {
  LayoutGrid,
  Minus,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  X
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FilterPopover } from "./filter-popover"

const SEARCH_SHORTCUT =
  globalThis.navigator?.userAgent.includes("Mac") === true ? "⌘K" : "Ctrl K"

export function LibraryToolbar({
  workspaceLabel,
  folderLabel,
  searchQuery,
  zoom,
  filterOpen,
  activeFilter,
  filterOptions,
  includeSubfolders,
  canEnrich,
  actionPending,
  onOpenSidebar,
  onOpenSearch,
  onClearSearch,
  onZoomChange,
  onFiltersOpenChange,
  onFilterChange,
  onIncludeSubfoldersChange,
  onEnrich
}: {
  workspaceLabel: string
  folderLabel: string
  searchQuery: string
  zoom: number
  filterOpen: boolean
  activeFilter: string
  filterOptions: readonly string[]
  includeSubfolders: boolean
  canEnrich: boolean
  actionPending: boolean
  onOpenSidebar: () => void
  onOpenSearch: () => void
  onClearSearch: () => void
  onZoomChange: (zoom: number) => void
  onFiltersOpenChange: (open: boolean) => void
  onFilterChange: (filter: string) => void
  onIncludeSubfoldersChange: (include: boolean) => void
  onEnrich: () => void
}) {
  const setBoundedZoom = (nextZoom: number) => {
    onZoomChange(Math.min(1.2, Math.max(0.75, nextZoom)))
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5" data-tauri-drag-region>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Open library sidebar"
        className="min-[900px]:hidden"
        onClick={onOpenSidebar}
      >
        <PanelLeftOpen aria-hidden="true" />
      </Button>

      <p className="min-w-0 max-w-72 truncate px-1 text-label text-foreground">
        {workspaceLabel} <span className="text-muted-foreground">/</span>{" "}
        {folderLabel}
      </p>

      <div className="ml-auto hidden items-center gap-1 lg:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Decrease thumbnail size"
          onClick={() => setBoundedZoom(zoom - 0.1)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <label className="flex items-center">
          <span className="sr-only">Thumbnail size</span>
          <input
            type="range"
            min="0.75"
            max="1.2"
            step="0.05"
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
            className="library-zoom-slider w-20"
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Increase thumbnail size"
          onClick={() => setBoundedZoom(zoom + 0.1)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>

      <div className="ml-1 hidden items-center md:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Enrich selected reference with AI"
          title="Enrich selected reference with AI"
          disabled={!canEnrich || actionPending}
          onClick={onEnrich}
        >
          <Sparkles aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Masonry view"
          aria-pressed="true"
          title="Masonry view"
        >
          <LayoutGrid aria-hidden="true" />
        </Button>
        <FilterPopover
          open={filterOpen}
          filters={filterOptions}
          activeFilter={activeFilter}
          includeSubfolders={includeSubfolders}
          onOpenChange={onFiltersOpenChange}
          onFilterChange={onFilterChange}
          onIncludeSubfoldersChange={onIncludeSubfoldersChange}
        />
      </div>

      <div className="ml-1 flex h-9 w-48 min-w-28 items-center rounded-full border bg-surface-muted pr-1 lg:w-56">
        <button
          type="button"
          aria-keyshortcuts="Control+K Meta+K"
          aria-label={
            searchQuery.length === 0
              ? "Search references"
              : `Search references, filtering on ${searchQuery}`
          }
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-full pl-3 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onOpenSearch}
        >
          <Search
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body-sm",
              searchQuery.length === 0 ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {searchQuery.length === 0 ? "Search" : searchQuery}
          </span>
          {searchQuery.length === 0 && (
            <kbd className="hidden shrink-0 rounded-xs border px-1.5 py-0.5 text-caption text-muted-foreground lg:block">
              {SEARCH_SHORTCUT}
            </kbd>
          )}
        </button>

        {searchQuery.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={onClearSearch}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}
