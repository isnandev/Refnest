import type { InspirationReference } from "@refnest/contracts"
import { Star } from "lucide-react"

import { BulkActionPopover } from "./bulk-action-popover"
import { ReferenceRating } from "./reference-rating"

/** A shared rating only shows when the whole selection already agrees on one. */
const sharedRating = (items: ReadonlyArray<InspirationReference>) => {
  const first = items[0]?.rating ?? 0
  return items.every((item) => item.rating === first) ? first : 0
}

export function BulkRatingPopover({
  items,
  disabled,
  onRate
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly disabled: boolean
  readonly onRate: (rating: number) => void
}) {
  const rating = sharedRating(items)

  return (
    <BulkActionPopover
      icon={Star}
      label="Rate"
      title="Rate references"
      description={`Give ${items.length} ${items.length === 1 ? "reference" : "references"} the same rating. The star they already hold clears it.`}
      disabled={disabled}
      disabledReason="Restore these references before rating them."
    >
      {(close) => (
        <div className="flex justify-center py-1">
          <ReferenceRating
            rating={rating}
            disabled={false}
            onChange={(next) => {
              close()
              onRate(next)
            }}
          />
        </div>
      )}
    </BulkActionPopover>
  )
}
