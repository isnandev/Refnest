import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import { SIDEBAR, useSidebar } from "./use-sidebar"

/**
 * Two-pane app shell: collapsible sidebar on the left, content on the right,
 * separated by a draggable divider. Fills the available window area.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const sidebar = useSidebar()

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1",
        sidebar.dragging && "cursor-col-resize select-none"
      )}
    >
      <Sidebar
        width={sidebar.width}
        collapsed={sidebar.collapsed}
        dragging={sidebar.dragging}
        onToggle={sidebar.toggle}
      />

      {!sidebar.collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR.minWidth}
          aria-valuemax={SIDEBAR.maxWidth}
          aria-valuenow={sidebar.width}
          tabIndex={0}
          onPointerDown={sidebar.startResize}
          onPointerMove={sidebar.resize}
          onPointerUp={sidebar.endResize}
          onPointerCancel={sidebar.endResize}
          onKeyDown={sidebar.onDividerKeyDown}
          className={cn(
            "relative w-[5px] shrink-0 cursor-col-resize touch-none outline-none",
            "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:transition-colors",
            sidebar.dragging
              ? "before:bg-primary"
              : "hover:before:bg-primary/40"
          )}
        />
      )}

      <main className="min-w-0 flex-1 overflow-y-auto overscroll-none bg-surface rounded-tl-xl">{children}</main>
    </div>
  )
}