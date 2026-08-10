import {
  ChevronsLeft,
  ChevronsRight,
  Files,
  HeartPulse,
  Settings,
  SquareTerminal
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type NavItem = {
  label: string
  icon: LucideIcon
  active?: boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Notes", icon: Files, active: true },
  { label: "Health", icon: HeartPulse },
  { label: "Output", icon: SquareTerminal },
  { label: "Settings", icon: Settings }
]

/**
 * Navigation rail. Expanded it shows labels; collapsed it becomes a compact
 * icon rail with an expand control.
 */
export function Sidebar({
  width,
  collapsed,
  dragging,
  onToggle
}: {
  width: number
  collapsed: boolean
  dragging: boolean
  onToggle: () => void
}) {
  return (
    <aside
      style={{ width: `${width}px` }}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out",
        dragging && "transition-none"
      )}
    >
      <div
        className={cn(
          "flex h-10 shrink-0 items-center",
          collapsed ? "justify-center px-0" : "justify-between px-3"
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <>
            <h2 className="text-label uppercase tracking-wide text-muted-foreground">
              Workspace
            </h2>
            <button
              type="button"
              onClick={onToggle}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon

          return (
            <button
              key={item.label}
              type="button"
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-body-sm transition-colors",
                collapsed && "justify-center px-0",
                item.active
                  ? "bg-surface-muted font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />

              {!collapsed && <span className="truncate">{item.label}</span>}

              {!collapsed && item.active && (
                <span
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-lime"
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}