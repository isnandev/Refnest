import type { InspirationReference, ReferenceId } from "@refnest/contracts"
import { CircleAlert, RefreshCw, SearchX } from "lucide-react"
import type { CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { ReferenceCard } from "./reference-card"

type MasonryStyle = CSSProperties & { "--reference-columns": number }

export function ReferenceGrid({
  items,
  activeId,
  selectedIds,
  selectionMode,
  columns,
  imageUrls,
  failedImages,
  loading,
  error,
  onRetry,
  onOpen,
  onToggleSelect,
  onExtendSelect
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly activeId: ReferenceId | null
  readonly selectedIds: ReadonlySet<ReferenceId>
  readonly selectionMode: boolean
  readonly columns: number
  readonly imageUrls: ReadonlyMap<ReferenceId, string>
  readonly failedImages: ReadonlySet<ReferenceId>
  readonly loading: boolean
  readonly error: string | null
  readonly onRetry: () => void
  readonly onOpen: (item: InspirationReference) => void
  readonly onToggleSelect: (item: InspirationReference) => void
  readonly onExtendSelect: (item: InspirationReference) => void
}) {
  const masonryStyle: MasonryStyle = { "--reference-columns": columns }

  if (loading && items.length === 0) {
    return (
      <div
        className="reference-masonry p-3"
        style={masonryStyle}
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
          Try another search or clear the current filter.
        </p>
      </div>
    )
  }

  return (
    <div
      className="reference-masonry p-3"
      style={masonryStyle}
      aria-label={`${items.length} reference thumbnails`}
      aria-busy={loading}
    >
      {items.map((item, index) => (
        <ReferenceCard
          key={item.id}
          item={item}
          imageUrl={imageUrls.get(item.id)}
          imageFailed={failedImages.has(item.id)}
          selected={selectedIds.has(item.id)}
          active={item.id === activeId}
          selectionMode={selectionMode}
          eager={index < 8}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onExtendSelect={onExtendSelect}
        />
      ))}
    </div>
  )
}
