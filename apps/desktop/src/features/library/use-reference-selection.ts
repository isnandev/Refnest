import type { ReferenceId } from "@refnest/contracts"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/**
 * The inclusive run between the last touched item and this one, in the order
 * the grid renders. An unknown anchor falls back to the target alone.
 */
export const selectionRange = (
  ordered: ReadonlyArray<ReferenceId>,
  anchorId: ReferenceId | null,
  targetId: ReferenceId
): ReadonlyArray<ReferenceId> => {
  const target = ordered.indexOf(targetId)
  if (target === -1) return []

  const anchor = anchorId === null ? -1 : ordered.indexOf(anchorId)
  if (anchor === -1) return [targetId]

  return anchor <= target
    ? ordered.slice(anchor, target + 1)
    : ordered.slice(target, anchor + 1)
}

/** Drops selected ids the current folder, search, or filter no longer shows. */
export const retainVisible = (
  ids: ReadonlySet<ReferenceId>,
  ordered: ReadonlyArray<ReferenceId>
): ReadonlySet<ReferenceId> => {
  if (ids.size === 0) return ids

  const visible = new Set(ordered)
  const next = new Set([...ids].filter((id) => visible.has(id)))
  return next.size === ids.size ? ids : next
}

/**
 * Owns which references are marked for a bulk action. Selection is a separate
 * concern from the one reference the inspector describes: holding or ticking
 * items builds a set, clicking one opens it.
 */
export const useReferenceSelection = (
  orderedIds: ReadonlyArray<ReferenceId>
) => {
  const [ids, setIds] = useState<ReadonlySet<ReferenceId>>(() => new Set())
  const anchor = useRef<ReferenceId | null>(null)

  useEffect(() => {
    setIds((current) => retainVisible(current, orderedIds))
  }, [orderedIds])

  const toggle = useCallback((id: ReferenceId) => {
    anchor.current = id
    setIds((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  const extendTo = useCallback(
    (id: ReferenceId) => {
      const run = selectionRange(orderedIds, anchor.current, id)
      anchor.current = id
      setIds((current) => new Set([...current, ...run]))
    },
    [orderedIds]
  )

  const selectAll = useCallback(() => {
    anchor.current = orderedIds.at(-1) ?? null
    setIds(new Set(orderedIds))
  }, [orderedIds])

  const clear = useCallback(() => {
    anchor.current = null
    setIds((current) => (current.size === 0 ? current : new Set()))
  }, [])

  return useMemo(
    () => ({
      ids,
      count: ids.size,
      /** Any selection at all puts the grid in selection mode. */
      active: ids.size > 0,
      allVisibleSelected:
        orderedIds.length > 0 && ids.size === orderedIds.length,
      isSelected: (id: ReferenceId) => ids.has(id),
      toggle,
      extendTo,
      selectAll,
      clear
    }),
    [clear, extendTo, ids, orderedIds.length, selectAll, toggle]
  )
}

export type ReferenceSelection = ReturnType<typeof useReferenceSelection>
