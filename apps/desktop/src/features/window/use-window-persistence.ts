import {
  UpdateDesktopSettings,
  WindowPlacement,
  type DesktopSettings
} from "@starter/contracts"
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi"
import {
  availableMonitors,
  getCurrentWindow,
  type CloseRequestedEvent
} from "@tauri-apps/api/window"
import { useEffect, useRef } from "react"

import { isTauriRuntime } from "./tauri-runtime"
import { normalizeWindowPlacementForMonitors } from "./window-placement"

const SHOW_FALLBACK_MS = 2_000
const SAVE_DELAY_MS = 240
const CLOSE_SAVE_TIMEOUT_MS = 900

const after = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

type NormalBounds = Omit<WindowPlacement, "maximized">

/** Restores the native window before reveal and persists its last normal bounds. */
export const useWindowPersistence = (
  savedPlacement: DesktopSettings["windowPlacement"],
  settingsReady: boolean,
  onFlush: (patch?: UpdateDesktopSettings) => Promise<boolean>
) => {
  const started = useRef(false)
  const onFlushRef = useRef(onFlush)
  onFlushRef.current = onFlush

  useEffect(() => {
    if (!isTauriRuntime()) return

    const fallback = window.setTimeout(() => {
      void getCurrentWindow().show().catch(() => undefined)
    }, SHOW_FALLBACK_MS)

    return () => window.clearTimeout(fallback)
  }, [])

  useEffect(() => {
    if (!isTauriRuntime() || !settingsReady || started.current) return
    started.current = true

    const appWindow = getCurrentWindow()
    let disposed = false
    let closing = false
    let saveTimer: number | null = null
    let normalBounds: NormalBounds | null =
      savedPlacement === null
        ? null
        : {
            x: savedPlacement.x,
            y: savedPlacement.y,
            width: savedPlacement.width,
            height: savedPlacement.height
          }
    const unlisteners: Array<() => void> = []

    const readPlacement = async (): Promise<WindowPlacement | null> => {
      const maximized = await appWindow.isMaximized()

      if (!maximized) {
        const [position, size] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.outerSize()
        ])

        normalBounds = {
          x: Math.round(position.x),
          y: Math.round(position.y),
          width: Math.round(size.width),
          height: Math.round(size.height)
        }
      }

      return normalBounds === null
        ? null
        : new WindowPlacement({ ...normalBounds, maximized })
    }

    const persistCurrentPlacement = async () => {
      try {
        const placement = await readPlacement()
        if (placement === null) return

        await onFlushRef.current(
          new UpdateDesktopSettings({ windowPlacement: placement })
        )
      } catch {
        // Window persistence must never prevent normal interaction or shutdown.
      }
    }

    const scheduleSave = () => {
      if (closing || disposed) return
      if (saveTimer !== null) window.clearTimeout(saveTimer)

      saveTimer = window.setTimeout(() => {
        saveTimer = null
        void persistCurrentPlacement()
      }, SAVE_DELAY_MS)
    }

    const closeAfterSaving = async (event: CloseRequestedEvent) => {
      if (closing) return

      event.preventDefault()
      closing = true
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer)
        saveTimer = null
      }

      await Promise.race([
        persistCurrentPlacement(),
        after(CLOSE_SAVE_TIMEOUT_MS)
      ])
      await appWindow.close()
    }

    const addListener = async (listener: Promise<() => void>) => {
      const unlisten = await listener
      if (disposed) {
        unlisten()
      } else {
        unlisteners.push(unlisten)
      }
    }

    const initialize = async () => {
      try {
        const monitors = await availableMonitors()
        const placement =
          savedPlacement === null
            ? null
            : normalizeWindowPlacementForMonitors(
                savedPlacement,
                monitors.map(({ workArea }) => workArea)
              )

        if (placement !== null) {
          await appWindow.unmaximize()
          await appWindow.setSize(
            new PhysicalSize(placement.width, placement.height)
          )
          await appWindow.setPosition(
            new PhysicalPosition(placement.x, placement.y)
          )
          normalBounds = {
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height
          }

          if (placement.maximized) await appWindow.maximize()
        }
      } catch {
        // Tauri's configured centered bounds are the safe fallback.
      }

      if (disposed) return

      await appWindow.show()

      try {
        if (normalBounds === null) await readPlacement()

        await addListener(appWindow.onMoved(scheduleSave))
        await addListener(appWindow.onResized(scheduleSave))
        await addListener(appWindow.onCloseRequested(closeAfterSaving))
      } catch {
        // The window remains usable even if an OS event listener is unavailable.
      }
    }

    void initialize()

    return () => {
      disposed = true
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      for (const unlisten of unlisteners) unlisten()
    }
  }, [savedPlacement, settingsReady])
}
