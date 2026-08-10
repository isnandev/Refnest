import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"

export const SIDEBAR = {
  collapsedWidth: 52,
  defaultWidth: 264,
  minWidth: 208,
  maxWidth: 480
} as const

const STORAGE_KEY = "starter.sidebar"

type SidebarPrefs = {
  width: number
  collapsed: boolean
}

const clampWidth = (width: number) =>
  Math.min(SIDEBAR.maxWidth, Math.max(SIDEBAR.minWidth, width))

const loadPrefs = (): SidebarPrefs => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) {
      return { width: SIDEBAR.defaultWidth, collapsed: false }
    }

    const parsed = JSON.parse(stored) as Partial<SidebarPrefs>
    return {
      width:
        typeof parsed.width === "number"
          ? clampWidth(parsed.width)
          : SIDEBAR.defaultWidth,
      collapsed: parsed.collapsed === true
    }
  } catch {
    return { width: SIDEBAR.defaultWidth, collapsed: false }
  }
}

/** Sidebar width/collapse state, persisted, with pointer-drag resizing. */
export const useSidebar = () => {
  const [prefs, setPrefs] = useState<SidebarPrefs>(loadPrefs)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ pointerX: number; width: number } | null>(null)

  const width = prefs.collapsed ? SIDEBAR.collapsedWidth : prefs.width

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  }, [prefs])

  const toggle = useCallback(() => {
    setPrefs((current) => ({ ...current, collapsed: !current.collapsed }))
  }, [])

  const setWidth = useCallback((next: number) => {
    setPrefs((current) => ({
      ...current,
      collapsed: false,
      width: clampWidth(next)
    }))
  }, [])

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (prefs.collapsed || dragStart.current !== null) return

      dragStart.current = { pointerX: event.clientX, width: prefs.width }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [prefs.collapsed, prefs.width]
  )

  const resize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (start === null) return

    setWidth(start.width + (event.clientX - start.pointerX))
  }, [setWidth])

  const endResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return

    dragStart.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const nudge = useCallback(
    (delta: number) => {
      setWidth(prefs.width + delta)
    },
    [prefs.width, setWidth]
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