import {
  ImportLocalReference,
  ImportPastedReference,
  REFERENCE_PASTE_MAX_BYTES,
  REFERENCE_TITLE_MAX_LENGTH,
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
import { importNotificationCopy } from "./capture-job"
import { IMPORTABLE_EXTENSIONS, importablePaths } from "./importable-files"
import { notifyDesktop } from "./os-capture-notification"

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
          extensions: [...IMPORTABLE_EXTENSIONS]
        }
      ]
    })
  },
  catch: toApiFailure
})

const importPaths = (
  workspaceId: WorkspaceId,
  folderId: FolderId | null,
  paths: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
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

const importSelectedFiles = (
  workspaceId: WorkspaceId,
  folderId: FolderId | null
) =>
  Effect.gen(function* () {
    const paths = yield* pickReferenceFiles
    if (paths === null) return { imported: [], failures: [] } as const

    return yield* importPaths(workspaceId, folderId, paths)
  })

/**
 * Pasted content has no path to send, so the bytes themselves travel. The
 * clipboard's own name is passed along only as a suggestion — the sidecar reads
 * the bytes to decide what this actually is.
 */
const importPastedContent = (
  workspaceId: WorkspaceId,
  folderId: FolderId | null,
  file: File
) =>
  Effect.gen(function* () {
    const bytes = yield* Effect.tryPromise({
      try: async () => new Uint8Array(await file.arrayBuffer()),
      catch: toApiFailure
    })
    const name = file.name.trim().slice(0, REFERENCE_TITLE_MAX_LENGTH)
    const api = yield* ApiClient
    const reference = yield* api.referenceImport
      .importPasted({
        payload: new ImportPastedReference({
          workspaceId,
          folderId,
          ...(name.length === 0 ? {} : { name }),
          bytes
        })
      })
      .pipe(Effect.mapError(toApiFailure))

    return { imported: [reference], failures: [] } as const
  })

/** Owns native file selection and the typed local import requests. */
export const useReferenceImport = ({
  workspaceId,
  canImport,
  desktopNotifications = true,
  onImported
}: {
  readonly workspaceId: WorkspaceId | null
  /** Import is host-only, so a remote library refuses rather than 404s. */
  readonly canImport: boolean
  readonly desktopNotifications?: boolean
  readonly onImported: (references: ReadonlyArray<InspirationReference>) => void
}) => {
  const [pending, setPending] = useState(false)
  /** How many files the run in flight carries, so progress can be reported. */
  const [pendingCount, setPendingCount] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const onImportedRef = useRef(onImported)
  onImportedRef.current = onImported

  useEffect(() => {
    setPending(false)
    setPendingCount(0)
    setActionError(null)
  }, [workspaceId])

  const run = useCallback(
    async (
      operation: Effect.Effect<
        {
          readonly imported: ReadonlyArray<InspirationReference>
          readonly failures: ReadonlyArray<ApiFailure>
        },
        ApiFailure,
        ApiClient
      >,
      count: number
    ) => {
      setPending(true)
      setPendingCount(count)
      setActionError(null)
      try {
        const result = await appRuntime.runPromise(Effect.either(operation))
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
        if (result.right.imported.length > 0 || result.right.failures.length > 0) {
          void notifyDesktop(
            importNotificationCopy(
              result.right.imported.length,
              result.right.failures.length
            ),
            desktopNotifications
          )
        }

        return result.right.imported
      } catch (cause) {
        const error = cause instanceof ApiFailure ? cause : toApiFailure(cause)
        setActionError(error.message)
        return []
      } finally {
        setPending(false)
        setPendingCount(0)
      }
    },
    [desktopNotifications]
  )

  /** Says why nothing happened, rather than letting a refusal look like a bug. */
  const refuse = useCallback((what: string) => {
    setActionError(
      `${what} can only be added to the library running on this machine.`
    )
    return [] as ReadonlyArray<InspirationReference>
  }, [])

  const selectAndImport = useCallback(
    async (folderId: FolderId | null) => {
      if (workspaceId === null) return []
      if (!canImport) return refuse("Files")

      return run(importSelectedFiles(workspaceId, folderId), 0)
    },
    [canImport, refuse, run, workspaceId]
  )

  /**
   * The dropped paths, filtered to what the library will take. A drop that
   * carried nothing importable says so rather than reporting a silent success.
   */
  const importFiles = useCallback(
    async (paths: ReadonlyArray<string>, folderId: FolderId | null) => {
      if (workspaceId === null) return []
      if (!canImport) return refuse("Dropped files")

      const importable = importablePaths(paths)
      if (importable.length === 0) {
        setActionError(
          paths.length === 1
            ? "That file is not an image, video, or PDF the library can import."
            : "None of those files are images, videos, or PDFs the library can import."
        )
        return []
      }

      return run(
        importPaths(workspaceId, folderId, importable),
        importable.length
      )
    },
    [canImport, refuse, run, workspaceId]
  )

  /** The clipboard's own content, sent as bytes because it never was a file. */
  const importPastedFile = useCallback(
    async (file: File, folderId: FolderId | null) => {
      if (workspaceId === null) return []
      if (!canImport) return refuse("Pasted images")

      if (file.size > REFERENCE_PASTE_MAX_BYTES) {
        setActionError(
          `A pasted file can be at most ${Math.floor(REFERENCE_PASTE_MAX_BYTES / (1_024 * 1_024))} MB. Drag it onto the window instead — a dropped file is read from disk rather than carried through the clipboard.`
        )
        return []
      }

      return run(importPastedContent(workspaceId, folderId, file), 1)
    },
    [canImport, refuse, run, workspaceId]
  )

  return {
    pending,
    pendingCount,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    selectAndImport,
    importFiles,
    importPastedFile
  } as const
}
