import { useEffect, useRef } from "react"

import { captureUrlFromText } from "./capture-url"
import { isEditingSurface } from "./editing-surface"
import { isImportableType } from "./importable-files"

/**
 * A second paste of the same link inside this window is the habit of checking
 * whether the first one took, not a request for two copies. Pasted content gets
 * no such guard: two screenshots are never the same bytes, and the clipboard
 * stamps each paste with the moment it happened, so there is nothing to compare.
 */
const REPEAT_WINDOW_MS = 2_000

/**
 * What the clipboard holds, added to the library: content becomes an import,
 * a link becomes a capture, and both land in the folder being viewed. Anything
 * else — prose, a file path, a paste inside a field — is left to the surface it
 * actually landed in.
 */
export const usePasteToLibrary = ({
  enabled,
  onPasteUrl,
  onPasteFile
}: {
  readonly enabled: boolean
  readonly onPasteUrl: (url: string) => void
  readonly onPasteFile: (file: File) => void
}) => {
  const onPasteUrlRef = useRef(onPasteUrl)
  onPasteUrlRef.current = onPasteUrl
  const onPasteFileRef = useRef(onPasteFile)
  onPasteFileRef.current = onPasteFile
  const lastLink = useRef<{ url: string; at: number } | null>(null)

  useEffect(() => {
    if (!enabled) return

    const onPaste = (event: ClipboardEvent) => {
      if (isEditingSurface(event.target)) return

      const clipboard = event.clipboardData
      if (clipboard === null) return

      // Content first: a file copied out of the file manager also carries its
      // path as text, and the bytes are the better answer of the two.
      const file = [...clipboard.files].find((candidate) =>
        isImportableType(candidate.type)
      )
      if (file !== undefined) {
        event.preventDefault()
        onPasteFileRef.current(file)
        return
      }

      const url = captureUrlFromText(clipboard.getData("text"))
      if (url === null) return

      event.preventDefault()
      const at = Date.now()
      const previous = lastLink.current
      lastLink.current = { url, at }
      if (
        previous !== null &&
        previous.url === url &&
        at - previous.at < REPEAT_WINDOW_MS
      ) {
        return
      }

      onPasteUrlRef.current(url)
    }

    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [enabled])
}
