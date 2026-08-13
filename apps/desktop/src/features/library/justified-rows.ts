export type JustifiedItem = {
  readonly key: string
  /** Width divided by height. */
  readonly ratio: number
}

export type JustifiedTile<A extends JustifiedItem> = {
  readonly item: A
  readonly width: number
  readonly height: number
}

export type JustifiedRow<A extends JustifiedItem> = {
  readonly height: number
  readonly tiles: ReadonlyArray<JustifiedTile<A>>
}

/**
 * Rows of equal height and full width, the way a contact sheet reads: each row
 * is filled at the target height and then scaled so its tiles reach both edges.
 * The last row keeps the target height instead of stretching a single image
 * across the viewport.
 */
export const packJustifiedRows = <A extends JustifiedItem>(
  items: ReadonlyArray<A>,
  containerWidth: number,
  targetHeight: number,
  gap: number
): ReadonlyArray<JustifiedRow<A>> => {
  if (items.length === 0 || containerWidth <= 0 || targetHeight <= 0) return []

  const rows: Array<JustifiedRow<A>> = []
  let pending: Array<A> = []
  let ratioSum = 0

  const flush = (stretch: boolean) => {
    if (pending.length === 0) return

    const available = containerWidth - gap * (pending.length - 1)
    const height =
      stretch && available > 0 && ratioSum > 0
        ? available / ratioSum
        : targetHeight
    const row = pending

    rows.push({
      height,
      tiles: row.map((item) => ({
        item,
        width: item.ratio * height,
        height
      }))
    })

    pending = []
    ratioSum = 0
  }

  for (const item of items) {
    pending.push(item)
    ratioSum += item.ratio

    const naturalWidth = ratioSum * targetHeight + gap * (pending.length - 1)
    if (naturalWidth >= containerWidth) flush(true)
  }

  flush(false)
  return rows
}
