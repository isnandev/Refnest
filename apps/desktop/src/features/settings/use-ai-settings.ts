import {
  UpdateAiSettings,
  type AiSettings
} from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useState } from "react"

import { ApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

export type AiSettingsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly settings: AiSettings }
  | { readonly status: "failed"; readonly message: string }

const loadAiSettings = Effect.gen(function* () {
  const api = yield* ApiClient
  return yield* api.aiSettings.getSettings()
}).pipe(Effect.mapError(toApiFailure))

const saveAiSettings = (payload: UpdateAiSettings) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.aiSettings.updateSettings({ payload })
  }).pipe(Effect.mapError(toApiFailure))

/** Owns the sidecar's AI provider document for the whole app. */
export const useAiSettings = () => {
  const [state, setState] = useState<AiSettingsState>({ status: "loading" })
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setState({ status: "loading" })
    const result = await appRuntime.runPromise(
      Effect.either(loadAiSettings)
    )
    setState(
      result._tag === "Right"
        ? { status: "ready", settings: result.right }
        : { status: "failed", message: result.left.message }
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(async (patch: UpdateAiSettings) => {
    setPending(true)
    setActionError(null)
    try {
      const result = await appRuntime.runPromise(
        Effect.either(saveAiSettings(patch))
      )
      if (result._tag === "Left") {
        setActionError(result.left.message)
        return null
      }

      setState({ status: "ready", settings: result.right })
      return result.right
    } finally {
      setPending(false)
    }
  }, [])

  return {
    state,
    pending,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    refresh,
    save
  } as const
}
