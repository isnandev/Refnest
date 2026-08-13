import { useEffect } from "react"

import { isEditingSurface } from "./editing-surface"

/** Selection keys for the grid: clear with Escape, take everything with Ctrl/Cmd+A. */
export const useLibraryShortcuts = ({
  enabled,
  onSelectAll,
  onClearSelection
}: {
  readonly enabled: boolean
  readonly onSelectAll: () => void
  readonly onClearSelection: () => void
}) => {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditingSurface(event.target)) return

      if (event.key === "Escape") {
        onClearSelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault()
        onSelectAll()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enabled, onClearSelection, onSelectAll])
}
