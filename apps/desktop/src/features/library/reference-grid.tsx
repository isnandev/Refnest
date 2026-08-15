import type {
  InspirationReference,
  LibraryViewPreferences,
  ReferenceId
} from "@refnest/contracts"
import { CircleAlert, LoaderCircle, RefreshCw, SearchX } from "lucide-react"
import { memo, useEffect, useMemo, useRef, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { packJustifiedRows } from "./justified-rows"
import { referenceAspectRatio } from "./library-format"
import { ReferenceCard, type ReferenceCardDisplay } from "./reference-card"
import { useElementWidth } from "./use-element-width"

const GAP_PX = 12
const PADDING_PX = 12
const LOAD_MORE_ROOT_MARGIN = "400px"
const GRID_FRAME: CSSProperties = { aspectRatio: 1 }
const masonryFrames = new Map<number, CSSProperties>()

const masonryFrame = (item: InspirationReference): CSSProperties => {
  const ratio = referenceAspectRatio(item)
  const cached = masonryFrames.get(ratio)
  if (cached !== undefined) return cached
  const style = { aspectRatio: ratio }
  masonryFrames.set(ratio, style)
  return style
}

type MasonryStyle = CSSProperties & { "--reference-columns": number }
type GridStyle = CSSProperties & { "--reference-columns": number }

const GridCard = memo(ReferenceCard)

export function ReferenceGrid({
  items,
  activeId,
  selectedIds,
  selectionMode,
  view,
  imageUrls,
  failedImages,
  loading,
  loadingMore = false,
  hasMore = false,
  error,
  hasActiveFilters = false,
  onRetry,
  onClearFilters,
  onLoadMore,
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
  readonly loadingMore?: boolean
  readonly hasMore?: boolean
  readonly error: string | null
  readonly hasActiveFilters?: boolean
  readonly onRetry: () => void
  readonly onClearFilters?: () => void
  readonly onLoadMore?: () => void
  readonly onOpen: (item: InspirationReference) => void
  readonly onToggleSelect: (item: InspirationReference) => void
  readonly onExtendSelect: (item: InspirationReference) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const width = useElementWidth(container)
  const display: ReferenceCardDisplay = view
  const columnStyle: MasonryStyle & GridStyle = {
    "--reference-columns": view.columns
  }
  const canLoadMore = hasMore && onLoadMore !== undefined && !loading

  useEffect(() => {
    if (!canLoadMore || loadingMore) return
    const target = sentinel.current
    const root = container.current?.closest(".library-grid-scroll")
    if (target === null) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore()
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: LOAD_MORE_ROOT_MARGIN
      }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [canLoadMore, items.length, loadingMore, onLoadMore])

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
    <GridCard
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
  const footer = (
    <>
      {error !== null && (
        <div className="flex flex-col items-center gap-2 px-6 py-4 text-center">
          <p className="text-body-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}
      {canLoadMore && (
        <div
          ref={sentinel}
          className="flex items-center justify-center py-6"
          aria-hidden={!loadingMore}
        >
          {loadingMore && (
            <p
              className="flex items-center gap-2 text-body-sm text-muted-foreground"
              aria-live="polite"
            >
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading more references
            </p>
          )}
        </div>
      )}
    </>
  )

  if (view.layout === "justified") {
    let rendered = -1

    return (
      <div ref={container} className="p-3" aria-label={label} aria-busy={loading || loadingMore}>
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
                  {card(tile.item.reference, rendered, { height: tile.height })}
                </div>
              )
            })}
          </div>
        ))}
        {footer}
      </div>
    )
  }

  return (
    <div aria-label={label} aria-busy={loading || loadingMore}>
      <div
        ref={container}
        className={view.layout === "grid" ? "reference-grid p-3" : "reference-masonry p-3"}
        style={columnStyle}
      >
        {items.map((item, index) =>
          card(
            item,
            index,
            view.layout === "grid" ? GRID_FRAME : masonryFrame(item)
          )
        )}
      </div>
      {footer}
    </div>
  )
}
