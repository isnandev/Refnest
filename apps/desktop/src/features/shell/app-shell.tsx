import type { Workspace } from "@starter/contracts"
import type { ReactNode } from "react"

import type { WorkspacesState } from "@/features/workspaces/use-workspaces"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import type { AppSection } from "./use-app-view"
import {
  SIDEBAR,
  useSidebar,
  type SidebarPreferences
} from "./use-sidebar"

/**
 * Two-pane app shell: collapsible sidebar on the left, content on the right,
 * separated by a draggable divider. Fills the available window area.
 */
export function AppShell({
  activeSection,
  autoCollapseSidebar,
  sidebarBackgroundOpacity,
  sidebarWidth,
  sidebarCollapsed,
  settingsReady,
  workspaceState,
  selectedWorkspace,
  onSelectWorkspace,
  onOpenCommandMenu,
  onCreateWorkspace,
  onSidebarPreferencesChange,
  header,
  children
}: {
  activeSection: AppSection
  autoCollapseSidebar: boolean
  sidebarBackgroundOpacity: number
  sidebarWidth: number
  sidebarCollapsed: boolean
  settingsReady: boolean
  workspaceState: WorkspacesState
  selectedWorkspace: Workspace | null
  onSelectWorkspace: (workspace: Workspace) => void
  onOpenCommandMenu: () => void
  onCreateWorkspace: () => void
  onSidebarPreferencesChange: (preferences: SidebarPreferences) => void
  header: ReactNode
  children: ReactNode
}) {
  const sidebar = useSidebar(
    autoCollapseSidebar,
    { width: sidebarWidth, collapsed: sidebarCollapsed },
    settingsReady,
    onSidebarPreferencesChange
  )

  return (
    <div
      className={cn(
        "flex h-full min-h-0",
        sidebar.dragging && "cursor-col-resize select-none"
      )}
    >
      <Sidebar
        activeSection={activeSection}
        backgroundOpacity={sidebarBackgroundOpacity}
        width={sidebar.width}
        collapsed={sidebar.collapsed}
        dragging={sidebar.dragging}
        workspaceState={workspaceState}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={onSelectWorkspace}
        onOpenCommandMenu={onOpenCommandMenu}
        onCreateWorkspace={onCreateWorkspace}
        onToggle={sidebar.toggle}
      />

      {!sidebar.collapsed ? (
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
            "relative z-10 w-px shrink-0 cursor-col-resize touch-none outline-none",
            "after:absolute after:inset-y-0 after:-left-2 after:w-[17px]",
            "before:absolute before:inset-y-0 before:left-0 before:w-px before:transition-colors",
            sidebar.dragging
              ? "before:bg-primary"
              : "before:bg-border hover:before:bg-primary/40"
          )}
        />
      ) : (
        <div className="w-px shrink-0 bg-border" aria-hidden="true" />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        {header}

        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-y-scroll overscroll-none"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
