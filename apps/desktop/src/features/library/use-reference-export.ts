import {
  ExportReference,
  type InspirationReference
} from "@refnest/contracts"
import { save } from "@tauri-apps/plugin-dialog"
import { Effect } from "effect"
import { useCallback, useState } from "react"

import { isTauriRuntime } from "@/features/window/tauri-runtime"
import { LocalApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"
import { referenceExtension } from "./library-format"

const pickDestination = (reference: InspirationReference) =>
  Effect.tryPromise({
    try: () => {
      if (!isTauriRuntime()) {
        throw new Error("Exporting is only available in the desktop app.")
      }

      const extension = referenceExtension(reference).toLocaleLowerCase()
      return save({
        title: "Export reference",
        defaultPath: `${reference.title}.${extension}`,
        filters: [{ name: referenceExtension(reference), extensions: [extension] }]
      })
    },
    catch: toApiFailure
  })

const exportReference = (reference: InspirationReference) =>
  Effect.gen(function* () {
    const destinationPath = yield* pickDestination(reference)
    if (destinationPath === null) return null

    const api = yield* LocalApiClient
    return yield* api.referenceExport
      .exportLocal({
        path: { id: reference.id },
        payload: new ExportReference({ destinationPath })
      })
      .pipe(Effect.mapError(toApiFailure))
  })

/**
 * Export is host-only: the sidecar writes the copy, because it is the process
 * that can read the library's files. The dialog only supplies the path.
 */
export const useReferenceExport = () => {
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exportedPath, setExportedPath] = useState<string | null>(null)

  const exportToFile = useCallback(
    async (reference: InspirationReference) => {
      setPending(true)
      setActionError(null)
      setExportedPath(null)

      try {
        const result = await appRuntime.runPromise(
          Effect.either(exportReference(reference))
        )
        if (result._tag === "Left") {
          setActionError(result.left.message)
          return null
        }

        if (result.right !== null) setExportedPath(result.right.path)
        return result.right
      } finally {
        setPending(false)
      }
    },
    []
  )

  return {
    pending,
    actionError,
    exportedPath,
    clearActionError: useCallback(() => setActionError(null), []),
    exportToFile
  } as const
}
