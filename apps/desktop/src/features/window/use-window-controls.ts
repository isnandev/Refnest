import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCallback, useEffect, useState } from "react"

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window

/** Wraps the native window chrome for the custom (frameless) title bar. */
export const useWindowControls = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const isTauri = isTauriRuntime()

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    const window = getCurrentWindow()
    let alive = true

    window.isMaximized().then((value) => {
      if (alive) setIsMaximized(value)
    })

    const unlisten = window.onResized(() => {
      window.isMaximized().then((value) => {
        if (alive) setIsMaximized(value)
      })
    })

    return () => {
      alive = false
      unlisten.then((off) => off())
    }
  }, [])

  const minimize = useCallback(() => getCurrentWindow().minimize(), [])
  const toggleMaximize = useCallback(() => getCurrentWindow().toggleMaximize(), [])
  const close = useCallback(() => getCurrentWindow().close(), [])

  return { isTauri, isMaximized, minimize, toggleMaximize, close } as const
}