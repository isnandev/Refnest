import { Copy, Minus, Square, X } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { useWindowControls } from "./use-window-controls"

const controlButton =
  "flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"

/**
 * Frameless title bar: the whole strip is a drag region, with native-style
 * window controls at the right edge. Dragging it moves the window, and
 * double-clicking toggles maximize (handled natively by the drag region).
 */
export function TitleBar({
  leading,
  children
}: {
  leading: ReactNode
  children?: ReactNode
}) {
  const { isTauri, isMaximized, minimize, toggleMaximize, close } =
    useWindowControls()

  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-[52px] shrink-0 items-stretch justify-between select-none"
    >
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center px-4">
        {leading}
      </div>

      <div className="flex items-center">
        {children !== undefined && <div className="flex items-center gap-1 px-2">{children}</div>}

        {isTauri && (
          <div className="flex h-full items-stretch">
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
      </div>
    </header>
  )
}
