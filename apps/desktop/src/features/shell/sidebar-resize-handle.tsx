import type {
  KeyboardEventHandler,
  PointerEventHandler
} from "react"

import { cn } from "@/lib/utils"
import { SIDEBAR } from "./use-sidebar"

export function SidebarResizeHandle({
  collapsed = false,
  dragging,
  width,
  label = "Resize sidebar",
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown
}: {
  collapsed?: boolean
  dragging: boolean
  width: number
  label?: string
  className?: string
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
}) {
  if (collapsed) {
    return (
      <div
        className={cn("w-px shrink-0 bg-border", className)}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={SIDEBAR.minWidth}
      aria-valuemax={SIDEBAR.maxWidth}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      className={cn(
        "relative z-40 w-px shrink-0 cursor-col-resize touch-none outline-none",
        "after:absolute after:inset-y-0 after:-left-2 after:w-[17px]",
        "before:absolute before:inset-y-0 before:left-0 before:w-px before:transition-colors",
        dragging
          ? "before:bg-primary"
          : "before:bg-border hover:before:bg-primary/40 focus-visible:before:bg-ring",
        className
      )}
    />
  )
}
