import { useCallback, useEffect, useRef, useState } from "react"

/** Clipboard feedback shared by pairing and integration settings. */
export const useCopyText = () => {
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const clearTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current)
    },
    []
  )

  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedValue(value)
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => setCopiedValue(null), 2_000)
      return true
    } catch {
      setCopiedValue(null)
      return false
    }
  }, [])

  return { copiedValue, copy } as const
}
