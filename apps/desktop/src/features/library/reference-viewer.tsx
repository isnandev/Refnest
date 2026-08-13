import type { InspirationReference } from "@refnest/contracts"
import { ChevronLeft, ChevronRight, PanelRight, X } from "lucide-react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/ui/dialog"
import {
  formatDimensions,
  formatReferenceKind,
  formatReferenceSource
} from "./library-format"
import { ReferencePreview } from "./reference-preview"
import { ReferenceVideoPlayer } from "./reference-video-player"

/**
 * Opening a reference shows its media, not a form. Metadata stays one click
 * away in the inspector so the reference keeps the whole viewport, and the
 * arrows walk the same order the grid is showing.
 */
export function ReferenceViewer({
  item,
  imageUrl,
  imageFailed,
  videoUrl,
  videoFailed,
  index,
  total,
  onOpenChange,
  onPrevious,
  onNext,
  onShowDetails
}: {
  readonly item: InspirationReference | null
  readonly imageUrl: string | undefined
  readonly imageFailed: boolean
  readonly videoUrl: string | undefined
  readonly videoFailed: boolean
  readonly index: number
  readonly total: number
  readonly onOpenChange: (open: boolean) => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onShowDetails: () => void
}) {
  if (item === null) return null

  const hasPrevious = index > 0
  const hasNext = index >= 0 && index < total - 1

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && hasPrevious) {
      event.preventDefault()
      onPrevious()
    }
    if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault()
      onNext()
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        variant="canvas"
        showCloseButton={false}
        onKeyDown={onKeyDown}
      >
        <header className="flex shrink-0 items-start gap-3 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate pr-0 text-h3">
              {item.title}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate text-on-inverse-muted">
              {formatReferenceKind(item.kind)} ·{" "}
              {formatReferenceSource(item.source)} · {formatDimensions(item)}
              {index >= 0 && total > 0 && (
                <span className="numeric">
                  {" "}
                  · {index + 1} of {total}
                </span>
              )}
            </DialogDescription>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost-inverse"
              size="sm"
              onClick={onShowDetails}
            >
              <PanelRight aria-hidden="true" />
              Details
            </Button>
            <Button
              type="button"
              variant="ghost-inverse"
              size="icon-sm"
              aria-label="Close viewer"
              title="Close viewer (Esc)"
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 py-4">
          {item.kind === "video" ? (
            <ReferenceVideoPlayer
              url={videoUrl}
              posterUrl={imageFailed ? undefined : imageUrl}
              title={item.title}
              failed={videoFailed}
            />
          ) : (
            <ReferencePreview
              reference={item}
              url={imageUrl}
              failed={imageFailed}
              alt={item.title}
              eager
              className="size-full bg-transparent object-contain object-center text-on-inverse-muted"
            />
          )}

          {hasPrevious && (
            <Button
              type="button"
              variant="ghost-inverse"
              size="icon-lg"
              aria-label="Previous reference"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              onClick={onPrevious}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          )}

          {hasNext && (
            <Button
              type="button"
              variant="ghost-inverse"
              size="icon-lg"
              aria-label="Next reference"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={onNext}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
