import { getCurrentWebview } from "@tauri-apps/api/webview"
import { useEffect, useRef, useState } from "react"

import { isTauriRuntime } from "@/features/window/tauri-runtime"
import { importablePaths } from "./importable-files"

export type ReferenceDropState = {
  /** True while files are held over the window. */
  readonly over: boolean
  readonly importable: number
  readonly rejected: number
}

const IDLE: ReferenceDropState = { over: false, importable: 0, rejected: 0 }

const describe = (paths: ReadonlyArray<string>): ReferenceDropState => {
  const importable = importablePaths(paths).length
  return { over: true, importable, rejected: paths.length - importable }
}

/**
 * Files dropped on the window, as an import. Tauri handles the drop natively,
 * so the webview's own event is the only place the paths ever appear — an HTML
 * drop listener on the grid would never see them. The hover state is reported
 * whether or not this library can accept the files, because a drop that lands
 * nowhere should still say why.
 */
export const useReferenceDrop = ({
  canImport,
  onDrop
}: {
  readonly canImport: boolean
  readonly onDrop: (paths: ReadonlyArray<string>) => void
}) => {
  const [state, setState] = useState<ReferenceDropState>(IDLE)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    if (!isTauriRuntime()) return

    let unlisten: (() => void) | null = null
    let cancelled = false

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === "enter") {
          setState(describe(payload.paths))
          return
        }
        if (payload.type === "leave") {
          setState(IDLE)
          return
        }
        if (payload.type !== "drop") return

        setState(IDLE)
        if (canImport) onDropRef.current(payload.paths)
      })
      .then((dispose) => {
        if (cancelled) dispose()
        else unlisten = dispose
      })
      .catch(() => setState(IDLE))

    return () => {
      cancelled = true
      unlisten?.()
      unlisten = null
    }
  }, [canImport])

  return state
}
