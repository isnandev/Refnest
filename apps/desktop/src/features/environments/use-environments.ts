import {
  ConnectEnvironment,
  LOCAL_ENVIRONMENT_ID,
  UpdateEnvironment,
  type Environment,
  type EnvironmentId,
  type EnvironmentProbe
} from "@refnest/contracts"
import { invoke } from "@tauri-apps/api/core"
import { Effect } from "effect"
import { useCallback, useEffect, useRef, useState } from "react"

import { LocalApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { isTauriRuntime } from "@/features/window/tauri-runtime"
import { appRuntime } from "@/lib/runtime"

export type EnvironmentReachability = "unknown" | "checking" | "reachable" | "unreachable"

export type EnvironmentStatus = {
  readonly reachability: EnvironmentReachability
  readonly serverVersion: string | null
  readonly reason: string | null
}

const UNKNOWN: EnvironmentStatus = {
  reachability: "unknown",
  serverVersion: null,
  reason: null
}

const listEnvironments = Effect.gen(function* () {
  const api = yield* LocalApiClient
  return yield* api.environments.list()
}).pipe(Effect.mapError(toApiFailure))

const connectEnvironment = (payload: ConnectEnvironment) =>
  Effect.gen(function* () {
    const api = yield* LocalApiClient
    return yield* api.environments.connect({ payload })
  }).pipe(Effect.mapError(toApiFailure))

const updateEnvironment = (id: EnvironmentId, payload: UpdateEnvironment) =>
  Effect.gen(function* () {
    const api = yield* LocalApiClient
    return yield* api.environments.update({ path: { id }, payload })
  }).pipe(Effect.mapError(toApiFailure))

const forgetEnvironment = (id: EnvironmentId) =>
  Effect.gen(function* () {
    const api = yield* LocalApiClient
    return yield* api.environments.forget({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

const probeEnvironment = (id: EnvironmentId) =>
  Effect.gen(function* () {
    const api = yield* LocalApiClient
    return yield* api.environments.probe({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

/**
 * Tells the Rust shell which library `api_request` should reach. The webview
 * passes an id and never an address or a token.
 */
const activate = async (id: EnvironmentId) => {
  if (!isTauriRuntime()) return
  await invoke("activate_environment", { environmentId: id })
}

/**
 * Owns the list of libraries this device can reach and which one is active.
 *
 * Switching is deliberately two steps — point the shell at the library, then
 * record the choice — so a failure to reach the new library leaves the app
 * pointed somewhere that works.
 */
export const useEnvironments = (
  activeEnvironmentId: EnvironmentId,
  ready: boolean,
  onActiveChange: (id: EnvironmentId) => void
) => {
  const [environments, setEnvironments] = useState<ReadonlyArray<Environment>>([])
  const [statuses, setStatuses] = useState<
    ReadonlyMap<EnvironmentId, EnvironmentStatus>
  >(() => new Map())
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const activated = useRef<EnvironmentId | null>(null)

  const refresh = useCallback(async () => {
    const result = await appRuntime.runPromise(Effect.either(listEnvironments))
    setLoading(false)

    if (result._tag === "Left") {
      setActionError(result.left.message)
      return
    }

    setEnvironments(result.right)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setStatus = useCallback(
    (id: EnvironmentId, status: EnvironmentStatus) => {
      setStatuses((current) => new Map(current).set(id, status))
    },
    []
  )

  const check = useCallback(
    async (id: EnvironmentId) => {
      if (id === LOCAL_ENVIRONMENT_ID) return
      setStatus(id, { ...UNKNOWN, reachability: "checking" })

      const result = await appRuntime.runPromise(
        Effect.either(probeEnvironment(id))
      )

      if (result._tag === "Left") {
        setStatus(id, {
          reachability: "unreachable",
          serverVersion: null,
          reason: result.left.message
        })
        return
      }

      const probe: EnvironmentProbe = result.right
      setStatus(id, {
        reachability: probe.reachable ? "reachable" : "unreachable",
        serverVersion: probe.serverVersion,
        reason: probe.reason
      })
    },
    [setStatus]
  )

  /**
   * The shell starts pointed at the local sidecar, so a saved remote has to be
   * re-activated on every launch before any library call is made.
   */
  useEffect(() => {
    if (!ready) return
    if (activated.current === activeEnvironmentId) return

    activated.current = activeEnvironmentId
    void activate(activeEnvironmentId).catch((cause: unknown) => {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "That library could not be opened."
      )
    })
  }, [activeEnvironmentId, ready])

  const select = useCallback(
    async (id: EnvironmentId) => {
      setActionError(null)
      setPending(true)
      try {
        await activate(id)
        activated.current = id
        onActiveChange(id)
        return true
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "That library could not be opened."
        )
        return false
      } finally {
        setPending(false)
      }
    },
    [onActiveChange]
  )

  const connect = useCallback(
    async (payload: ConnectEnvironment) => {
      setActionError(null)
      setPending(true)
      const result = await appRuntime.runPromise(
        Effect.either(connectEnvironment(payload))
      )
      setPending(false)

      if (result._tag === "Left") {
        setActionError(result.left.message)
        return null
      }

      await refresh()
      return result.right
    },
    [refresh]
  )

  const rename = useCallback(
    async (id: EnvironmentId, patch: UpdateEnvironment) => {
      setActionError(null)
      setPending(true)
      const result = await appRuntime.runPromise(
        Effect.either(updateEnvironment(id, patch))
      )
      setPending(false)

      if (result._tag === "Left") {
        setActionError(result.left.message)
        return false
      }

      await refresh()
      return true
    },
    [refresh]
  )

  const forget = useCallback(
    async (id: EnvironmentId) => {
      setActionError(null)
      setPending(true)

      // Never leave the app pointed at a library it just forgot.
      if (id === activeEnvironmentId) {
        await select(LOCAL_ENVIRONMENT_ID)
      }

      const result = await appRuntime.runPromise(
        Effect.either(forgetEnvironment(id))
      )
      setPending(false)

      if (result._tag === "Left") {
        setActionError(result.left.message)
        return false
      }

      await refresh()
      return true
    },
    [activeEnvironmentId, refresh, select]
  )

  const active =
    environments.find((environment) => environment.id === activeEnvironmentId) ??
    null

  return {
    environments,
    active,
    statuses,
    loading,
    pending,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    refresh,
    check,
    select,
    connect,
    rename,
    forget
  } as const
}
