import { useEffect } from "react"

const LIBRARY_SYNC_INTERVAL_MILLIS = 1_500

/** Prevents a slow remote refresh from accumulating more polling requests. */
export const createLibrarySyncRunner = (
  refresh: () => Promise<unknown>
) => {
  let refreshing = false

  return async (visible: boolean) => {
    if (!visible || refreshing) return

    refreshing = true
    try {
      await refresh()
    } catch {
      // Background synchronization preserves the last good snapshot. Manual
      // refresh remains the surface that reports a connection failure.
    } finally {
      refreshing = false
    }
  }
}

/** Keeps the visible library current when another client, including MCP, writes it. */
export const useLibrarySync = (
  enabled: boolean,
  refresh: () => Promise<unknown>
) => {
  useEffect(() => {
    if (!enabled) return

    const run = createLibrarySyncRunner(refresh)
    const refreshWhenVisible = () => {
      void run(document.visibilityState === "visible")
    }
    const timer = window.setInterval(
      refreshWhenVisible,
      LIBRARY_SYNC_INTERVAL_MILLIS
    )

    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [enabled, refresh])
}
