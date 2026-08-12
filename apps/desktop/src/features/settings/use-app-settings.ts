import {
  DEFAULT_DESKTOP_SETTINGS,
  mergeDesktopSettings,
  UpdateDesktopSettings,
  type DesktopSettings
} from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useRef, useState } from "react"

import { ApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

export type AppSettings = Pick<
  DesktopSettings,
  | "autoCollapseSidebar"
  | "autoConvertImports"
  | "reduceMotion"
  | "sidebarBackgroundOpacity"
>

export type AppSettingsStatus = "loading" | "ready" | "failed"

const SAVE_DELAY_MS = 180

const loadDesktopSettings = Effect.gen(function* () {
  const api = yield* ApiClient
  return yield* api.settings.get()
}).pipe(Effect.mapError(toApiFailure))

const saveDesktopSettings = (patch: UpdateDesktopSettings) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.settings.update({ payload: patch })
  }).pipe(Effect.mapError(toApiFailure))

const mergePatches = (
  current: UpdateDesktopSettings | null,
  next: UpdateDesktopSettings
) => new UpdateDesktopSettings({ ...current, ...next })

/** Owns the single Bun/SQLite-backed desktop settings document. */
export const useAppSettings = () => {
  const [settings, setSettings] = useState<DesktopSettings>(
    DEFAULT_DESKTOP_SETTINGS
  )
  const [status, setStatus] = useState<AppSettingsStatus>("loading")
  const [saveError, setSaveError] = useState<string | null>(null)
  const pendingPatch = useRef<UpdateDesktopSettings | null>(null)
  const saveTimer = useRef<number | null>(null)
  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true))

  useEffect(() => {
    let alive = true

    const load = async () => {
      const result = await appRuntime.runPromise(
        Effect.either(loadDesktopSettings)
      )

      if (!alive) return

      if (result._tag === "Left") {
        setStatus("failed")
        setSaveError(result.left.message)
        return
      }

      setSettings(
        pendingPatch.current === null
          ? result.right
          : mergeDesktopSettings(result.right, pendingPatch.current)
      )
      setStatus("ready")
      setSaveError(null)
    }

    void load()

    return () => {
      alive = false
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset["reducedMotion"] = settings.reduceMotion
      ? "true"
      : "false"
  }, [settings.reduceMotion])

  const flush = useCallback(
    async (extraPatch?: UpdateDesktopSettings): Promise<boolean> => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }

      const patch =
        extraPatch === undefined
          ? pendingPatch.current
          : mergePatches(pendingPatch.current, extraPatch)
      pendingPatch.current = null

      if (patch === null) {
        return saveChain.current
      }

      const operation = saveChain.current.then(async () => {
        try {
          const result = await appRuntime.runPromise(
            Effect.either(saveDesktopSettings(patch))
          )

          if (result._tag === "Left") {
            pendingPatch.current =
              pendingPatch.current === null
                ? patch
                : mergePatches(patch, pendingPatch.current)
            setSaveError(result.left.message)
            return false
          }

          setSaveError(null)
          return true
        } catch {
          pendingPatch.current =
            pendingPatch.current === null
              ? patch
              : mergePatches(patch, pendingPatch.current)
          setSaveError("Settings could not be saved to device storage.")
          return false
        }
      })

      saveChain.current = operation
      return operation
    },
    []
  )

  const update = useCallback(
    (patch: UpdateDesktopSettings) => {
      setSettings((current) => mergeDesktopSettings(current, patch))
      pendingPatch.current = mergePatches(pendingPatch.current, patch)

      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
      }

      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void flush()
      }, SAVE_DELAY_MS)
    },
    [flush]
  )

  const resetPreferences = useCallback(() => {
    update(
      new UpdateDesktopSettings({
        themePreference: DEFAULT_DESKTOP_SETTINGS.themePreference,
        autoCollapseSidebar: DEFAULT_DESKTOP_SETTINGS.autoCollapseSidebar,
        autoConvertImports: DEFAULT_DESKTOP_SETTINGS.autoConvertImports,
        reduceMotion: DEFAULT_DESKTOP_SETTINGS.reduceMotion,
        sidebarBackgroundOpacity:
          DEFAULT_DESKTOP_SETTINGS.sidebarBackgroundOpacity
      })
    )
  }, [update])

  return {
    settings,
    status,
    saveError,
    update,
    flush,
    resetPreferences
  } as const
}
