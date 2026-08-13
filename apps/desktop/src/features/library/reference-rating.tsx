import { REFERENCE_RATING_MAX } from "@refnest/contracts"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Five stars, and clicking the star a reference already carries clears it —
 * otherwise a rating could be raised but never taken back.
 */
export function ReferenceRating({
  rating,
  disabled,
  onChange
}: {
  readonly rating: number
  readonly disabled: boolean
  readonly onChange: (rating: number) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className="flex items-center gap-0.5"
    >
      {Array.from({ length: REFERENCE_RATING_MAX }, (_, index) => {
        const value = index + 1
        const filled = value <= rating

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
            disabled={disabled}
            className="rounded-xs p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            onClick={() => onChange(value === rating ? 0 : value)}
          >
            <Star
              aria-hidden="true"
              className={cn(
                "size-4",
                filled
                  ? "fill-current text-lime"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
