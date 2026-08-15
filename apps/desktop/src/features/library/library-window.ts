export const LIBRARY_PAGE_SIZE = 48

/** First paint shows one page, or everything when the folder is smaller. */
export const initialLibraryLimit = (
  total: number,
  pageSize = LIBRARY_PAGE_SIZE
) => Math.min(Math.max(0, total), pageSize)

/** Grows the window by one page and never walks past the filtered set. */
export const nextLibraryLimit = (
  shown: number,
  total: number,
  pageSize = LIBRARY_PAGE_SIZE
) => Math.min(Math.max(0, total), Math.max(0, shown) + pageSize)

/**
 * Append a page without repeating an id already on screen. A stale overlap
 * from a refresh or a retry must not double a card.
 */
export const appendUniqueById = <A extends { readonly id: string }>(
  current: ReadonlyArray<A>,
  incoming: ReadonlyArray<A>
): ReadonlyArray<A> => {
  if (incoming.length === 0) return current

  const seen = new Set(current.map((item) => item.id))
  const extra = incoming.filter((item) => !seen.has(item.id))
  return extra.length === 0 ? current : [...current, ...extra]
}
