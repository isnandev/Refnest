export type SelectionTag = {
  readonly tag: string
  readonly count: number
}

/**
 * Every tag anywhere in a bulk selection, with how many of the selected
 * references carry it. The count is what makes a bulk removal readable: a tag
 * on three of twelve is a different decision from one on all twelve.
 */
export const selectionTags = (
  items: ReadonlyArray<{ readonly tags: ReadonlyArray<string> }>
): ReadonlyArray<SelectionTag> => {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const tag of new Set(item.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) =>
      right.count - left.count || left.tag.localeCompare(right.tag)
    )
}
