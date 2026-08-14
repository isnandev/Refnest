import type {
  LibraryViewPreferences,
  LibraryViewPreferencesPatch
} from "@refnest/contracts"
import {
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
import { COLUMN_MAX, COLUMN_MIN, boundedColumns } from "./library-columns"
import type { LibraryFolder } from "./library-data"
import type { FilterPreset, LibraryFilters } from "./library-filters"
import { ViewOptionsPopover } from "./view-options-popover"

const SEARCH_SHORTCUT =
  globalThis.navigator?.userAgent.includes("Mac") === true ? "⌘K" : "Ctrl K"

export function LibraryToolbar({
  workspaceLabel,
  folderLabel,
  searchQuery,
  view,
  viewOptionsOpen,
  filterOpen,
  filters,
  activeFilterCount,
  filterTags,
  filterFolders,
  filterPresets,
  canEnrich,
  actionPending,
  onOpenSidebar,
  onOpenSearch,
  onClearSearch,
  onViewChange,
  onViewOptionsOpenChange,
  onRefresh,
  onFiltersOpenChange,
  onFiltersChange,
  onClearFilters,
  onSaveFilterPreset,
  onApplyFilterPreset,
  onDeleteFilterPreset,
  onEnrich
}: {
  workspaceLabel: string
  folderLabel: string
  searchQuery: string
  view: LibraryViewPreferences
  viewOptionsOpen: boolean
  filterOpen: boolean
  filters: LibraryFilters
  activeFilterCount: number
  filterTags: readonly string[]
  filterFolders: readonly LibraryFolder[]
  filterPresets: readonly FilterPreset[]
  canEnrich: boolean
  actionPending: boolean
  onOpenSidebar: () => void
  onOpenSearch: () => void
  onClearSearch: () => void
  onViewChange: (patch: LibraryViewPreferencesPatch) => void
  onViewOptionsOpenChange: (open: boolean) => void
  onRefresh: () => void
  onFiltersOpenChange: (open: boolean) => void
  onFiltersChange: (filters: LibraryFilters) => void
  onClearFilters: () => void
  onSaveFilterPreset: (name: string) => void
  onApplyFilterPreset: (id: string) => void
  onDeleteFilterPreset: (id: string) => void
  onEnrich: () => void
}) {
  /** The slider runs zoomed-out to zoomed-in, which is 8 columns down to 1. */
  const zoomValue = COLUMN_MAX + COLUMN_MIN - view.columns

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
          aria-label="Zoom out to more columns"
          disabled={view.columns >= COLUMN_MAX}
          onClick={() =>
            onViewChange({ columns: boundedColumns(view.columns + 1) })
          }
        >
          <Minus aria-hidden="true" />
        </Button>
        <label className="flex items-center">
          <span className="sr-only">Columns</span>
          <input
            type="range"
            min={COLUMN_MIN}
            max={COLUMN_MAX}
            step="1"
            value={zoomValue}
            aria-valuetext={`${view.columns} ${view.columns === 1 ? "column" : "columns"}`}
            onChange={(event) =>
              onViewChange({
                columns: boundedColumns(
                  COLUMN_MAX + COLUMN_MIN - Number(event.currentTarget.value)
                )
              })
            }
            className="library-zoom-slider w-20"
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in to fewer columns"
          disabled={view.columns <= COLUMN_MIN}
          onClick={() =>
            onViewChange({ columns: boundedColumns(view.columns - 1) })
          }
        >
          <Plus aria-hidden="true" />
        </Button>
        <span className="numeric w-10 shrink-0 text-caption text-muted-foreground">
          {view.columns} col
        </span>
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
        <ViewOptionsPopover
          open={viewOptionsOpen}
          view={view}
          onOpenChange={onViewOptionsOpenChange}
          onChange={onViewChange}
          onRefresh={onRefresh}
        />
        <FilterPopover
          open={filterOpen}
          filters={filters}
          activeCount={activeFilterCount}
          tags={filterTags}
          folders={filterFolders}
          presets={filterPresets}
          onOpenChange={onFiltersOpenChange}
          onChange={onFiltersChange}
          onClear={onClearFilters}
          onSavePreset={onSaveFilterPreset}
          onApplyPreset={onApplyFilterPreset}
          onDeletePreset={onDeleteFilterPreset}
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
