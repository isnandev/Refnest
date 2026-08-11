import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN
} from "@starter/contracts"
import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"

export const SIDEBAR = {
  collapsedWidth: 56,
  defaultWidth: 272,
  minWidth: SIDEBAR_WIDTH_MIN,
  maxWidth: SIDEBAR_WIDTH_MAX
} as const

const COMPACT_WINDOW_QUERY = "(max-width: 899px)"

export type SidebarPreferences = {
  readonly width: number
  readonly collapsed: boolean
}

const clampWidth = (width: number) =>
  Math.min(SIDEBAR.maxWidth, Math.max(SIDEBAR.minWidth, width))

const normalizePreferences = (
  preferences: SidebarPreferences
): SidebarPreferences => ({
  width: clampWidth(preferences.width),
  collapsed: preferences.collapsed
})

/** Sidebar interaction state, persisted through the shared settings owner. */
export const useSidebar = (
  autoCollapse: boolean,
  persisted: SidebarPreferences,
  settingsReady: boolean,
  onPreferencesChange: (preferences: SidebarPreferences) => void
) => {
  const [prefs, setPrefs] = useState<SidebarPreferences>(() =>
    normalizePreferences(persisted)
  )
  const prefsRef = useRef(prefs)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ pointerX: number; width: number } | null>(null)

  const width = prefs.collapsed ? SIDEBAR.collapsedWidth : prefs.width

  const applyPreferences = useCallback(
    (next: SidebarPreferences, persist: boolean) => {
      const normalized = normalizePreferences(next)
      prefsRef.current = normalized
      setPrefs(normalized)

      if (persist) {
        onPreferencesChange(normalized)
      }
    },
    [onPreferencesChange]
  )

  useEffect(() => {
    if (!settingsReady || dragging) return

    applyPreferences(persisted, false)
  }, [
    applyPreferences,
    dragging,
    persisted.collapsed,
    persisted.width,
    settingsReady
  ])

  useEffect(() => {
    if (!autoCollapse || !settingsReady) return

    const compactWindow = window.matchMedia(COMPACT_WINDOW_QUERY)
    const collapseForCompactWindow = ({ matches }: MediaQueryListEvent | MediaQueryList) => {
      if (matches && !prefsRef.current.collapsed) {
        applyPreferences({ ...prefsRef.current, collapsed: true }, true)
      }
    }

    collapseForCompactWindow(compactWindow)
    compactWindow.addEventListener("change", collapseForCompactWindow)

    return () => compactWindow.removeEventListener("change", collapseForCompactWindow)
  }, [applyPreferences, autoCollapse, settingsReady])

  const toggle = useCallback(() => {
    applyPreferences(
      { ...prefsRef.current, collapsed: !prefsRef.current.collapsed },
      true
    )
  }, [applyPreferences])

  const setWidth = useCallback(
    (next: number, persist: boolean) => {
      applyPreferences(
        {
          ...prefsRef.current,
          collapsed: false,
          width: clampWidth(next)
        },
        persist
      )
    },
    [applyPreferences]
  )

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (prefsRef.current.collapsed || dragStart.current !== null) return

      dragStart.current = {
        pointerX: event.clientX,
        width: prefsRef.current.width
      }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    []
  )

  const resize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (start === null) return

    setWidth(start.width + (event.clientX - start.pointerX), false)
  }, [setWidth])

  const endResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (start === null) return

    dragStart.current = null
    setDragging(false)
    setWidth(start.width + (event.clientX - start.pointerX), true)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [setWidth])

  const nudge = useCallback(
    (delta: number) => {
      setWidth(prefsRef.current.width + delta, true)
    },
    [setWidth]
  )

  const onDividerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        nudge(-16)
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        nudge(16)
      }
    },
    [nudge]
  )

  return {
    collapsed: prefs.collapsed,
    dragging,
    width,
    toggle,
    startResize,
    resize,
    endResize,
    onDividerKeyDown
  } as const
}
