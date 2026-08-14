import type { InspirationReference } from "@refnest/contracts"
import { ChevronLeft, ChevronRight, PanelRight, X } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent
} from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  formatDimensions,
  formatReferenceKind,
  formatReferenceSource
} from "./library-format"
import { ReferencePreview } from "./reference-preview"
import { ReferenceVideoPlayer } from "./reference-video-player"

const MIN_VIEWER_ZOOM = 1
const MAX_VIEWER_ZOOM = 5
const WHEEL_ZOOM_SENSITIVITY = 0.002

export const zoomReferenceFromWheel = (zoom: number, deltaY: number) =>
  Math.min(
    MAX_VIEWER_ZOOM,
    Math.max(
      MIN_VIEWER_ZOOM,
      zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)
    )
  )

/**
 * The media viewer lives inside the library canvas instead of taking over the
 * app in a modal. Keeping the grid mounted behind it preserves scroll position
 * while this surface opens and closes, and the arrows still walk the order the
 * grid is showing.
 */
export function ReferenceViewer({
  item,
  open = item !== null,
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
  readonly open?: boolean
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
  const [zoom, setZoom] = useState(MIN_VIEWER_ZOOM)
  const viewerRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setZoom(MIN_VIEWER_ZOOM)
  }, [item?.id])

  useEffect(() => {
    if (open) {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) {
        returnFocusRef.current = activeElement
      }
      viewerRef.current?.focus({ preventScroll: true })
      return
    }

    const returnFocus = returnFocusRef.current
    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true })
    }
    returnFocusRef.current = null
  }, [open])

  if (item === null) return null

  const hasPrevious = index > 0
  const hasNext = index >= 0 && index < total - 1

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onOpenChange(false)
      return
    }
    if (event.key === "ArrowLeft" && hasPrevious) {
      event.preventDefault()
      onPrevious()
    }
    if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault()
      onNext()
    }
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (item.kind === "video" || imageUrl === undefined || event.deltaY === 0) {
      return
    }

    event.preventDefault()
    setZoom((current) => zoomReferenceFromWheel(current, event.deltaY))
  }

  return (
    <section
      ref={viewerRef}
      aria-label="Reference viewer"
      aria-hidden={!open}
      inert={!open}
      tabIndex={-1}
      className={cn(
        "library-inline-viewer absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface-inverse text-on-inverse outline-none",
        open && "is-open"
      )}
      onKeyDown={onKeyDown}
    >
      <header className="flex shrink-0 items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h3">{item.title}</h2>
          <p className="mt-1 truncate text-body-sm text-on-inverse-muted">
            {formatReferenceKind(item.kind)} ·{" "}
            {formatReferenceSource(item.source)} · {formatDimensions(item)}
            {index >= 0 && total > 0 && (
              <span className="numeric">
                {" "}
                · {index + 1} of {total}
              </span>
            )}
          </p>
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

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-14 py-4"
        onWheel={onWheel}
      >
        {item.kind === "video" ? (
          <ReferenceVideoPlayer
            url={videoUrl}
            posterUrl={imageFailed ? undefined : imageUrl}
            title={item.title}
            failed={videoFailed}
          />
        ) : (
          <div
            className="size-full origin-center transition-transform duration-150 ease-out"
            style={{ transform: `scale(${zoom})` }}
          >
            <ReferencePreview
              reference={item}
              url={imageUrl}
              failed={imageFailed}
              alt={item.title}
              eager
              className="size-full bg-transparent object-contain object-center text-on-inverse-muted"
            />
          </div>
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
    </section>
  )
}
