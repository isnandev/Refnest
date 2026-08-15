import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"

import { LIBRARY_PAGE_SIZE, nextLibraryLimit } from "./library-window"

/**
 * Renders the filtered list a page at a time. The source of truth stays the
 * full set — this only decides how many cards mount.
 * ponytail: client window over the full list, add ListReferences limit/offset
 * if the sidecar fetch becomes the bottleneck.
 */
export const useLibraryWindow = <A>(
  items: ReadonlyArray<A>,
  resetKey: string,
  pageSize = LIBRARY_PAGE_SIZE
) => {
  const [limit, setLimit] = useState(pageSize)
  const [isPending, start] = useTransition()
  const advancing = useRef(false)
  const generation = useRef(0)
  const seenKey = useRef(resetKey)
  const seenPageSize = useRef(pageSize)
  const totalRef = useRef(items.length)
  totalRef.current = items.length

  const reset = seenKey.current !== resetKey || seenPageSize.current !== pageSize
  if (reset) {
    seenKey.current = resetKey
    seenPageSize.current = pageSize
    generation.current += 1
    advancing.current = false
    setLimit(pageSize)
  }

  useEffect(() => {
    advancing.current = false
  }, [limit])

  const loadMore = useCallback(() => {
    if (advancing.current) return
    advancing.current = true
    const request = generation.current
    start(() => {
      setLimit((current) => {
        if (request !== generation.current) {
          advancing.current = false
          return current
        }
        const next = nextLibraryLimit(current, totalRef.current, pageSize)
        if (next === current) {
          advancing.current = false
          return current
        }
        return next
      })
    })
  }, [pageSize, start])

  const shownLimit = reset ? pageSize : limit
  const shown = useMemo(
    () => items.slice(0, Math.min(shownLimit, items.length)),
    [items, shownLimit]
  )

  return {
    items: shown,
    hasMore: shownLimit < items.length,
    loadingMore: isPending && shownLimit < items.length,
    loadMore
  } as const
}
