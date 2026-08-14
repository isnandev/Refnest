export const ASSET_RANGE_CHUNK_BYTES = 1_024 * 1_024

export type AssetRange =
  | { readonly _tag: "Full" }
  | { readonly _tag: "Partial"; readonly start: number; readonly end: number }
  | { readonly _tag: "Unsatisfiable" }

const UNSATISFIABLE = { _tag: "Unsatisfiable" } as const

const parseByteOffset = (value: string) => {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** Resolves one HTTP byte range and bounds each response chunk for media playback. */
export const resolveAssetRange = (
  header: string | undefined,
  size: number
): AssetRange => {
  if (header === undefined) return { _tag: "Full" }
  if (!Number.isSafeInteger(size) || size <= 0) return UNSATISFIABLE

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return UNSATISFIABLE

  const startText = match[1] ?? ""
  const endText = match[2] ?? ""
  if (startText.length === 0 && endText.length === 0) return UNSATISFIABLE

  let start: number
  let requestedEnd: number

  if (startText.length === 0) {
    const suffixLength = parseByteOffset(endText)
    if (suffixLength === null || suffixLength <= 0) return UNSATISFIABLE
    start = Math.max(0, size - suffixLength)
    requestedEnd = size - 1
  } else {
    const parsedStart = parseByteOffset(startText)
    if (parsedStart === null || parsedStart >= size) return UNSATISFIABLE
    start = parsedStart

    if (endText.length === 0) {
      requestedEnd = size - 1
    } else {
      const parsedEnd = parseByteOffset(endText)
      if (parsedEnd === null || parsedEnd < start) return UNSATISFIABLE
      requestedEnd = Math.min(parsedEnd, size - 1)
    }
  }

  return {
    _tag: "Partial",
    start,
    end: Math.min(requestedEnd, start + ASSET_RANGE_CHUNK_BYTES - 1)
  }
}
