import type {
  InspirationReference,
  LibraryViewPreferences,
  ReferenceId
} from "@refnest/contracts"
import { CircleAlert, RefreshCw, SearchX } from "lucide-react"
import { useMemo, useRef, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { packJustifiedRows } from "./justified-rows"
import { referenceAspectRatio } from "./library-format"
import { ReferenceCard, type ReferenceCardDisplay } from "./reference-card"
import { useElementWidth } from "./use-element-width"

const GAP_PX = 12
const PADDING_PX = 12

type MasonryStyle = CSSProperties & { "--reference-columns": number }
type GridStyle = CSSProperties & { "--reference-columns": number }

export function ReferenceGrid({
  items,
  activeId,
  selectedIds,
  selectionMode,
  view,
  imageUrls,
  failedImages,
  loading,
  error,
  hasActiveFilters = false,
  onRetry,
  onClearFilters,
  onOpen,
  onToggleSelect,
  onExtendSelect
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly activeId: ReferenceId | null
  readonly selectedIds: ReadonlySet<ReferenceId>
  readonly selectionMode: boolean
  readonly view: LibraryViewPreferences
  readonly imageUrls: ReadonlyMap<ReferenceId, string>
  readonly failedImages: ReadonlySet<ReferenceId>
  readonly loading: boolean
  readonly error: string | null
  readonly hasActiveFilters?: boolean
  readonly onRetry: () => void
  readonly onClearFilters?: () => void
  readonly onOpen: (item: InspirationReference) => void
  readonly onToggleSelect: (item: InspirationReference) => void
  readonly onExtendSelect: (item: InspirationReference) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const width = useElementWidth(container)
  const display: ReferenceCardDisplay = view
  const columnStyle: MasonryStyle & GridStyle = {
    "--reference-columns": view.columns
  }

  /**
   * The column count sets the row height too, so zooming behaves the same in
   * every layout: fewer columns means taller rows.
   */
  const rows = useMemo(() => {
    if (view.layout !== "justified") return []

    const available = Math.max(0, width - PADDING_PX * 2)
    const targetHeight =
      (available - GAP_PX * (view.columns - 1)) / view.columns

    return packJustifiedRows(
      items.map((reference) => ({
        key: reference.id,
        ratio: referenceAspectRatio(reference),
        reference
      })),
      available,
      Math.max(96, targetHeight),
      GAP_PX
    )
  }, [items, view.columns, view.layout, width])

  const card = (item: InspirationReference, index: number, frameStyle: CSSProperties) => (
    <ReferenceCard
      key={item.id}
      item={item}
      imageUrl={imageUrls.get(item.id)}
      imageFailed={failedImages.has(item.id)}
      selected={selectedIds.has(item.id)}
      active={item.id === activeId}
      selectionMode={selectionMode}
      eager={index < 8}
      display={display}
      frameStyle={frameStyle}
      onOpen={onOpen}
      onToggleSelect={onToggleSelect}
      onExtendSelect={onExtendSelect}
    />
  )

  if (loading && items.length === 0) {
    return (
      <div
        className="reference-masonry p-3"
        style={columnStyle}
        aria-busy="true"
        aria-label="Loading references"
      >
        {Array.from({ length: 12 }, (_, index) => (
          <div
            key={index}
            className="mb-3 aspect-[3/4] w-full animate-pulse rounded-sm border bg-surface-muted"
          />
        ))}
      </div>
    )
  }

  if (error !== null && items.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-md bg-danger-container text-danger">
          <CircleAlert className="size-4" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-h3">References could not be loaded</h2>
        <p className="mt-1 max-w-96 text-body-sm text-muted-foreground">
          {error}
        </p>
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-md border bg-surface">
          <SearchX className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-h3">No references found</h2>
        <p className="mt-1 max-w-72 text-body-sm text-muted-foreground">
          {hasActiveFilters
            ? "Nothing in this view matches the current search or filters."
            : "This folder is empty."}
        </p>
        {hasActiveFilters && onClearFilters !== undefined && (
          <Button type="button" variant="outline" className="mt-4" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    )
  }

  const label = `${items.length} reference thumbnails`

  if (view.layout === "justified") {
    let rendered = -1

    return (
      <div ref={container} className="p-3" aria-label={label} aria-busy={loading}>
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex"
            style={{ gap: GAP_PX, marginBottom: GAP_PX }}
          >
            {row.tiles.map((tile) => {
              rendered += 1
              return (
                <div key={tile.item.key} style={{ width: tile.width }}>
                  {card(tile.item.reference, rendered, {
                    height: tile.height
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  if (view.layout === "grid") {
    return (
      <div
        ref={container}
        className="reference-grid p-3"
        style={columnStyle}
        aria-label={label}
        aria-busy={loading}
      >
        {items.map((item, index) => card(item, index, { aspectRatio: 1 }))}
      </div>
    )
  }

  return (
    <div
      ref={container}
      className="reference-masonry p-3"
      style={columnStyle}
      aria-label={label}
      aria-busy={loading}
    >
      {items.map((item, index) =>
        card(item, index, { aspectRatio: referenceAspectRatio(item) })
      )}
    </div>
  )
}
