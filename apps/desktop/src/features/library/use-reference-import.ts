import {
  ImportLocalReference,
  type FolderId,
  type InspirationReference,
  type WorkspaceId
} from "@refnest/contracts"
import { open } from "@tauri-apps/plugin-dialog"
import { Effect } from "effect"
import { useCallback, useEffect, useRef, useState } from "react"

import { isTauriRuntime } from "@/features/window/tauri-runtime"
import { ApiClient } from "@/lib/api/client"
import { ApiFailure, toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

const pickReferenceFiles = Effect.tryPromise({
  try: () => {
    if (!isTauriRuntime()) {
      throw new Error("File import is only available in the desktop app.")
    }

    return open({
      title: "Import references",
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Images, videos, and PDFs",
          extensions: [
            "avif",
            "avi",
            "bmp",
            "gif",
            "jpeg",
            "jpg",
            "m4v",
            "mkv",
            "mov",
            "mp4",
            "ogg",
            "ogv",
            "pdf",
            "png",
            "svg",
            "tif",
            "tiff",
            "webm",
            "webp"
          ]
        }
      ]
    })
  },
  catch: toApiFailure
})

const importSelectedFiles = (
  workspaceId: WorkspaceId,
  folderId: FolderId | null
) =>
  Effect.gen(function* () {
    const paths = yield* pickReferenceFiles
    if (paths === null) return { imported: [], failures: [] } as const

    const api = yield* ApiClient
    const outcomes = yield* Effect.forEach(
      paths,
      (path) =>
        api.referenceImport
          .importLocal({
            payload: new ImportLocalReference({ workspaceId, folderId, path })
          })
          .pipe(Effect.mapError(toApiFailure), Effect.either),
      { concurrency: 1 }
    )

    return {
      imported: outcomes.flatMap((outcome) =>
        outcome._tag === "Right" ? [outcome.right] : []
      ),
      failures: outcomes.flatMap((outcome) =>
        outcome._tag === "Left" ? [outcome.left] : []
      )
    } as const
  })

/** Owns native file selection and the typed local import requests. */
export const useReferenceImport = (
  workspaceId: WorkspaceId | null,
  onImported: (references: ReadonlyArray<InspirationReference>) => void
) => {
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const onImportedRef = useRef(onImported)
  onImportedRef.current = onImported

  useEffect(() => {
    setPending(false)
    setActionError(null)
  }, [workspaceId])

  const selectAndImport = useCallback(
    async (folderId: FolderId | null) => {
      if (workspaceId === null) return []

      setPending(true)
      setActionError(null)
      try {
        const result = await appRuntime.runPromise(
          Effect.either(importSelectedFiles(workspaceId, folderId))
        )
        if (result._tag === "Left") {
          setActionError(result.left.message)
          return []
        }

        if (result.right.imported.length > 0) {
          onImportedRef.current(result.right.imported)
        }
        if (result.right.failures.length > 0) {
          const importedCount = result.right.imported.length
          const failureCount = result.right.failures.length
          setActionError(
            `${importedCount > 0 ? `Imported ${importedCount}; ` : ""}${failureCount} ${failureCount === 1 ? "file" : "files"} could not be imported. ${result.right.failures[0]?.message ?? ""}`.trim()
          )
        }

        return result.right.imported
      } catch (cause) {
        const error = cause instanceof ApiFailure ? cause : toApiFailure(cause)
        setActionError(error.message)
        return []
      } finally {
        setPending(false)
      }
    },
    [workspaceId]
  )

  return {
    pending,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    selectAndImport
  } as const
}
