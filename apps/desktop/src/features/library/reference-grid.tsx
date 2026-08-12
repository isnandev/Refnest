import type { InspirationReference, ReferenceId } from "@refnest/contracts"
import { Check, CircleAlert, RefreshCw, SearchX } from "lucide-react"
import type { CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { referenceAspectRatio } from "./library-format"
import { ReferencePreview } from "./reference-preview"

export function ReferenceGrid({
  items,
  selectedId,
  zoom,
  imageUrls,
  failedImages,
  loading,
  error,
  onRetry,
  onSelect
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly selectedId: ReferenceId | null
  readonly zoom: number
  readonly imageUrls: ReadonlyMap<ReferenceId, string>
  readonly failedImages: ReadonlySet<ReferenceId>
  readonly loading: boolean
  readonly error: string | null
  readonly onRetry: () => void
  readonly onSelect: (item: InspirationReference) => void
}) {
  if (loading && items.length === 0) {
    return (
      <div
        className="reference-masonry p-3"
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

  const gridStyle: CSSProperties & { "--reference-column-width": string } = {
    columnGap: "12px",
    "--reference-column-width": `${Math.round(126 * zoom)}px`
  }

  return (
    <div
      className="reference-masonry p-3"
      style={gridStyle}
      aria-label={`${items.length} reference thumbnails`}
      aria-busy={loading}
    >
      {items.map((item, index) => {
        const selected = item.id === selectedId

        return (
          <button
            key={item.id}
            type="button"
            title={item.title}
            aria-label={`Inspect ${item.title}`}
            aria-pressed={selected}
            className={cn(
              "reference-card group relative mb-3 block w-full overflow-hidden rounded-sm border bg-surface text-left transition-[border-color,transform] duration-150 ease-out",
              "hover:-translate-y-0.5 hover:border-input",
              selected && "border-lime ring-2 ring-lime ring-offset-2 ring-offset-stage"
            )}
            style={{ aspectRatio: referenceAspectRatio(item) }}
            onClick={() => onSelect(item)}
          >
            <ReferencePreview
              reference={item}
              url={imageUrls.get(item.id)}
              failed={failedImages.has(item.id)}
              alt=""
              eager={index < 8}
              className="size-full object-cover object-top transition-transform duration-200 ease-out group-hover:scale-[1.015]"
            />

            <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-surface-inverse/90 px-2 py-1 text-caption text-on-inverse opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
              {item.title}
            </span>

            {selected && (
              <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-lime text-on-lime">
                <Check className="size-3" aria-hidden="true" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
