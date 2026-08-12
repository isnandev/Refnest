import { useEffect } from "react"

/** A key pressed inside a field or a modal belongs to that surface, not the grid. */
const handledElsewhere = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[role="dialog"]') !== null
  )
}

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
      if (handledElsewhere(event.target)) return

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
