import { ChevronRight, Waypoints } from "lucide-react"

import { APP_SECTION_LABELS, type AppSection } from "./use-app-view"

/** Current shell location, kept in the fixed title bar above the main scroller. */
export function AppBreadcrumb({ activeSection }: { activeSection: AppSection }) {
  return (
    <nav
      data-tauri-drag-region
      aria-label="Breadcrumb"
      className="pointer-events-none min-w-0"
    >
      <ol
        data-tauri-drag-region
        className="flex min-w-0 items-center gap-2 text-label text-muted-foreground"
      >
        <li data-tauri-drag-region className="flex shrink-0 items-center gap-2">
          <Waypoints className="size-4" aria-hidden="true" />
          <span data-tauri-drag-region>Workspace</span>
        </li>
        <li data-tauri-drag-region aria-hidden="true">
          <ChevronRight className="size-3.5" />
        </li>
        <li
          data-tauri-drag-region
          aria-current="page"
          className="truncate font-medium text-foreground"
        >
          {APP_SECTION_LABELS[activeSection]}
        </li>
      </ol>
    </nav>
  )
}
