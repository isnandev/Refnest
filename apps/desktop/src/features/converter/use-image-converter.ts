import {
  ConvertLocalImages,
  ConvertReferenceImage,
  MAX_CONVERSION_BATCH,
  type FolderId,
  type ImageConversionReport,
  type ImageConvertFormat,
  type InspirationReference,
  type ReferenceId,
  type WorkspaceId
} from "@refnest/contracts"
import { open } from "@tauri-apps/plugin-dialog"
import { Effect } from "effect"
import { useCallback, useState } from "react"

import { isTauriRuntime } from "@/features/window/tauri-runtime"
import { ApiClient, LocalApiClient } from "@/lib/api/client"
import { ApiFailure, toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

const CONVERTIBLE_EXTENSIONS = ["jpeg", "jpg", "png", "webp"]

const requireDesktop = <A>(pick: () => Promise<A>) =>
  Effect.tryPromise({
    try: () => {
      if (!isTauriRuntime()) {
        throw new Error("Converting files is only available in the desktop app.")
      }
      return pick()
    },
    catch: toApiFailure
  })

const pickImageFiles = requireDesktop(() =>
  open({
    title: "Choose images to convert",
    multiple: true,
    directory: false,
    filters: [{ name: "Images", extensions: CONVERTIBLE_EXTENSIONS }]
  })
)

const pickOutputDirectory = requireDesktop(() =>
  open({
    title: "Choose where to save converted images",
    multiple: false,
    directory: true
  })
)

const runAction = async <A>(
  effect: Effect.Effect<A, ApiFailure, ApiClient | LocalApiClient>,
  onError: (message: string) => void
): Promise<A | null> => {
  try {
    const result = await appRuntime.runPromise(Effect.either(effect))
    if (result._tag === "Left") {
      onError(result.left.message)
      return null
    }
    return result.right
  } catch (cause) {
    onError((cause instanceof ApiFailure ? cause : toApiFailure(cause)).message)
    return null
  }
}

/** Native file selection plus the typed conversion requests the sidecar exposes. */
export const useImageConverter = () => {
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const selectImages = useCallback(async (): Promise<ReadonlyArray<string>> => {
    const paths = await runAction(pickImageFiles, setActionError)
    if (paths === null) return []
    return typeof paths === "string" ? [paths] : paths
  }, [])

  const selectOutputDirectory = useCallback(async () => {
    const directory = await runAction(pickOutputDirectory, setActionError)
    return typeof directory === "string" ? directory : null
  }, [])

  const convertLocal = useCallback(
    async (
      paths: ReadonlyArray<string>,
      outputDirectory: string,
      format: ImageConvertFormat,
      quality: number
    ): Promise<ImageConversionReport | null> => {
      if (paths.length === 0 || paths.length > MAX_CONVERSION_BATCH) {
        setActionError(
          `Choose between 1 and ${MAX_CONVERSION_BATCH} images to convert.`
        )
        return null
      }

      setPending(true)
      setActionError(null)
      try {
        return await runAction(
          Effect.gen(function* () {
            // Always this machine: the paths and the output folder are on the
            // local disk, not in whichever library is being browsed.
            const api = yield* LocalApiClient
            return yield* api.converter.convertLocal({
              payload: new ConvertLocalImages({
                paths,
                outputDirectory,
                format,
                quality
              })
            })
          }).pipe(Effect.mapError(toApiFailure)),
          setActionError
        )
      } finally {
        setPending(false)
      }
    },
    []
  )

  const convertReference = useCallback(
    async (
      referenceId: ReferenceId,
      workspaceId: WorkspaceId,
      folderId: FolderId | null,
      format: ImageConvertFormat,
      quality: number
    ): Promise<InspirationReference | null> => {
      setPending(true)
      setActionError(null)
      try {
        return await runAction(
          Effect.gen(function* () {
            // The reference lives in the active library. The converter group is
            // host-only, so callers gate this on that library being local.
            const api = yield* ApiClient
            return yield* api.converter.convertReference({
              path: { id: referenceId },
              payload: new ConvertReferenceImage({
                workspaceId,
                folderId,
                format,
                quality
              })
            })
          }).pipe(Effect.mapError(toApiFailure)),
          setActionError
        )
      } finally {
        setPending(false)
      }
    },
    []
  )

  return {
    pending,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    selectImages,
    selectOutputDirectory,
    convertLocal,
    convertReference
  } as const
}
