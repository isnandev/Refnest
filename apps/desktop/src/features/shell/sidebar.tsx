import type { Workspace } from "@starter/contracts"
import {
  ChevronsLeft,
  ChevronsRight,
  FilePlus2,
  Files,
  HeartPulse,
  Search,
  Settings2,
  SquareTerminal
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CSSProperties } from "react"

import type { WorkspacesState } from "@/features/workspaces/use-workspaces"
import { WorkspaceSelector } from "@/features/workspaces/workspace-selector"
import { cn } from "@/lib/utils"
import { APP_SECTION_LABELS, type AppSection } from "./use-app-view"

type NavItem = {
  section: AppSection
  icon: LucideIcon
}

const WORKSPACE_ITEMS: readonly NavItem[] = [
  { section: "overview", icon: Files },
  { section: "new-note", icon: FilePlus2 }
]

const SYSTEM_ITEMS: readonly NavItem[] = [
  { section: "runtime", icon: HeartPulse },
  { section: "output", icon: SquareTerminal }
]

const SETTINGS_ITEM: NavItem = {
  section: "settings",
  icon: Settings2
}

const commandShortcut =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘K"
    : "Ctrl K"

function NavItemLink({
  item,
  active,
  collapsed
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
}) {
  const Icon = item.icon
  const label = APP_SECTION_LABELS[item.section]

  return (
    <a
      href={`#${item.section}`}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[34px] w-full items-center gap-2.5 rounded-sm px-2.5 text-label transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-surface font-medium text-primary"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />

      {!collapsed && <span className="truncate">{label}</span>}

      {!collapsed && active && (
        <span
          className="ml-auto size-1.5 shrink-0 rounded-full bg-lime"
          aria-hidden="true"
        />
      )}
    </a>
  )
}

/**
 * Navigation rail. Expanded it shows labels; collapsed it becomes a compact
 * icon rail with an expand control.
 */
export function Sidebar({
  activeSection,
  backgroundOpacity,
  width,
  collapsed,
  dragging,
  workspaceState,
  selectedWorkspace,
  onSelectWorkspace,
  onOpenCommandMenu,
  onCreateWorkspace,
  onToggle
}: {
  activeSection: AppSection
  backgroundOpacity: number
  width: number
  collapsed: boolean
  dragging: boolean
  workspaceState: WorkspacesState
  selectedWorkspace: Workspace | null
  onSelectWorkspace: (workspace: Workspace) => void
  onOpenCommandMenu: () => void
  onCreateWorkspace: () => void
  onToggle: () => void
}) {
  const sidebarStyle = {
    width: `${width}px`,
    "--sidebar-opacity": `${backgroundOpacity}%`
  } satisfies CSSProperties & { "--sidebar-opacity": string }

  return (
    <aside
      aria-label="Workspace navigation"
      style={sidebarStyle}
      className={cn(
        "sidebar-surface flex h-full shrink-0 flex-col overflow-hidden backdrop-blur-xl transition-[width] duration-200 ease-out",
        dragging && "transition-none"
      )}
    >
      <div
        className={cn(
          "flex h-[52px] shrink-0 items-center",
          collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <>
            <WorkspaceSelector
              state={workspaceState}
              selectedWorkspace={selectedWorkspace}
              onSelect={onSelectWorkspace}
              onCreate={onCreateWorkspace}
            />
            <button
              type="button"
              onClick={onToggle}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 px-2 pb-3 pt-2">
        <button
          type="button"
          onClick={onOpenCommandMenu}
          title={collapsed ? "Open command menu" : undefined}
          aria-label={collapsed ? "Open command menu" : undefined}
          className={cn(
            "flex h-9 w-full items-center gap-2.5 rounded-sm border bg-surface/80 px-2.5 text-body-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          {!collapsed && (
            <>
              <span className="truncate">Search commands</span>
              <span className="ml-auto text-caption" aria-hidden="true">
                {commandShortcut}
              </span>
            </>
          )}
        </button>

        <div className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-2.5 pb-1 text-caption text-muted-foreground">Workspace</p>
          )}
          {WORKSPACE_ITEMS.map((item) => (
            <NavItemLink
              key={item.section}
              item={item}
              active={activeSection === item.section}
              collapsed={collapsed}
            />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-2.5 pb-1 text-caption text-muted-foreground">System</p>
          )}
          {SYSTEM_ITEMS.map((item) => (
            <NavItemLink
              key={item.section}
              item={item}
              active={activeSection === item.section}
              collapsed={collapsed}
            />
          ))}
        </div>

        <div className="mt-auto">
          <NavItemLink
            item={SETTINGS_ITEM}
            active={activeSection === "settings"}
            collapsed={collapsed}
          />
        </div>
      </nav>
    </aside>
  )
}
