import type { InspirationReference } from "@refnest/contracts"
import type { ReactNode } from "react"

import { formatFileSize } from "@/lib/format"
import {
  formatDimensions,
  formatLibraryDateTime,
  referenceExtension
} from "./library-format"
import { ReferenceRating } from "./reference-rating"

function PropertyRow({
  label,
  children
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 py-1 text-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  )
}

/**
 * What the library knows about the file, in the order the reference design
 * reads it. The dates are three different facts: when this library saw it, and
 * the two the file carried in with it.
 */
export function InspectorProperties({
  item,
  disabled,
  onRate
}: {
  readonly item: InspirationReference
  readonly disabled: boolean
  readonly onRate: (rating: number) => void
}) {
  return (
    <section className="mt-5">
      <h3 className="text-label">Properties</h3>
      <dl className="mt-2">
        <PropertyRow label="Rating">
          <ReferenceRating
            rating={item.rating}
            disabled={disabled}
            onChange={onRate}
          />
        </PropertyRow>
        <PropertyRow label="Dimensions">
          <span className="numeric">{formatDimensions(item)}</span>
        </PropertyRow>
        <PropertyRow label="Size">
          <span className="numeric">{formatFileSize(item.fileSizeBytes)}</span>
        </PropertyRow>
        <PropertyRow label="Type">{referenceExtension(item)}</PropertyRow>
        <PropertyRow label="Date Imported">
          <span className="numeric">{formatLibraryDateTime(item.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Date Created">
          <span className="numeric">
            {formatLibraryDateTime(item.fileCreatedAt)}
          </span>
        </PropertyRow>
        <PropertyRow label="Date Modified">
          <span className="numeric">
            {formatLibraryDateTime(item.fileModifiedAt)}
          </span>
        </PropertyRow>
      </dl>
    </section>
  )
}
