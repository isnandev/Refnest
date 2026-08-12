import type { Workspace } from "@refnest/contracts"
import type { ReactNode } from "react"

import type { WorkspacesState } from "@/features/workspaces/use-workspaces"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import { SidebarResizeHandle } from "./sidebar-resize-handle"
import type { AppSection } from "./use-app-view"
import {
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

      <SidebarResizeHandle
        collapsed={sidebar.collapsed}
        dragging={sidebar.dragging}
        width={sidebar.width}
        onPointerDown={sidebar.startResize}
        onPointerMove={sidebar.resize}
        onPointerUp={sidebar.endResize}
        onPointerCancel={sidebar.endResize}
        onKeyDown={sidebar.onDividerKeyDown}
      />

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
