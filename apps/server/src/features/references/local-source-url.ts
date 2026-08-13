/**
 * A file imported from disk has no address on the web, yet every reference
 * carries an absolute HTTP(S) source URL. `.invalid` is reserved by RFC 2606
 * so this placeholder can never resolve to a real host by accident.
 *
 * Anything that would hand a source URL to a browser, a fetch, or a model has
 * to tell the placeholder apart from an address that really exists, so the
 * host lives here rather than being spelled out at each of those seams.
 */
export const LOCAL_SOURCE_HOST = "local.refnest.invalid"

export const localSourceUrl = (fileName: string) =>
  `https://${LOCAL_SOURCE_HOST}/${encodeURIComponent(fileName)}`

/** The imported file name, or null when the URL points at a reachable source. */
export const localSourceFileName = (sourceUrl: string): string | null => {
  try {
    const url = new URL(sourceUrl)
    if (url.hostname !== LOCAL_SOURCE_HOST) return null
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim()
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}
