import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

/** Long enough that a normal click never trips it, short enough to feel direct. */
const LONG_PRESS_MS = 420
/** A press that travels this far is a scroll or a drag, not a hold. */
const MOVE_TOLERANCE_PX = 8

/**
 * Press-and-hold as a gesture. The timer starts on a primary, unmodified
 * pointer press and is cancelled by movement, release, or the context menu.
 * A gesture that fired swallows the click the browser sends afterwards, so a
 * hold that selects never also opens the item underneath it.
 */
export const useLongPress = (onLongPress: () => void) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ readonly x: number; readonly y: number } | null>(null)
  const fired = useRef(false)
  const callback = useRef(onLongPress)
  const [pressing, setPressing] = useState(false)

  useEffect(() => {
    callback.current = onLongPress
  }, [onLongPress])

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
    setPressing(false)
  }, [])

  useEffect(() => cancel, [cancel])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      fired.current = false
      origin.current = { x: event.clientX, y: event.clientY }
      setPressing(true)
      timer.current = setTimeout(() => {
        fired.current = true
        cancel()
        callback.current()
      }, LONG_PRESS_MS)
    },
    [cancel]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const start = origin.current
      if (start === null) return
      if (
        Math.abs(event.clientX - start.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - start.y) > MOVE_TOLERANCE_PX
      ) {
        cancel()
      }
    },
    [cancel]
  )

  return {
    /** True while the hold is being counted, so the surface can acknowledge it. */
    pressing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: cancel
    },
    /** True once per fired gesture; call it from the click that follows. */
    consumeLongPress: useCallback(() => {
      const value = fired.current
      fired.current = false
      return value
    }, [])
  } as const
}
