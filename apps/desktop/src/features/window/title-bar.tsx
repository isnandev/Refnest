import { Copy, Minus, Square, X } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { useWindowControls } from "./use-window-controls"

const controlButton =
  "flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"

/**
 * Frameless title bar: the whole strip is a drag region, with native-style
 * window controls at the right edge. Dragging it moves the window, and
 * double-clicking toggles maximize (handled natively by the drag region).
 */
export function TitleBar({
  title,
  children
}: {
  title: string
  children?: ReactNode
}) {
  const { isTauri, isMaximized, minimize, toggleMaximize, close } =
    useWindowControls()

  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-stretch justify-between select-none"
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-3 px-3">
        <h1 className="truncate text-h2">{title}</h1>
        {children}
      </div>

      {isTauri && (
        <div className="flex items-stretch">
          <button
            type="button"
            className={controlButton}
            onClick={minimize}
            aria-label="Minimize window"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            className={controlButton}
            onClick={toggleMaximize}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
          >
            {isMaximized ? (
              <Copy className="size-4" aria-hidden="true" />
            ) : (
              <Square className="size-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className={cn(
              controlButton,
              "hover:bg-danger hover:text-danger-foreground"
            )}
            onClick={close}
            aria-label="Close window"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </header>
  )
}