import { CAPTURE_URL_MAX_LENGTH } from "@refnest/contracts"

/**
 * The link in a pasted string, or null when the clipboard held something else.
 * Strict on purpose: only a whole URL counts, so pasting prose or a filename
 * into the grid does nothing rather than guessing at an address inside it.
 */
export const captureUrlFromText = (text: string): string | null => {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > CAPTURE_URL_MAX_LENGTH) {
    return null
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    // The sidecar refuses a capture URL carrying credentials, so an accidental
    // paste of one is dropped here rather than queued to fail.
    if (url.username.length > 0 || url.password.length > 0) return null

    return trimmed
  } catch {
    return null
  }
}
