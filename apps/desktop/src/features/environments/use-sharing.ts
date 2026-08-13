import {
  UpdateSharing,
  type PairedDevice,
  type PairedDeviceId,
  type PairingInvite,
  type SharingStatus
} from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useState } from "react"

import { LocalApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"
import { pairingInviteRemainingMillis } from "./pairing-invite-time"

const readStatus = Effect.gen(function* () {
  const api = yield* LocalApiClient
  return yield* api.sharing.status()
}).pipe(Effect.mapError(toApiFailure))

const writeStatus = (payload: UpdateSharing) =>
  Effect.gen(function* () {
    const api = yield* LocalApiClient
    return yield* api.sharing.update({ payload })
  }).pipe(Effect.mapError(toApiFailure))

const readDevices = Effect.gen(function* () {
  const api = yield* LocalApiClient
  return yield* api.sharing.devices()
}).pipe(Effect.mapError(toApiFailure))

const createInvite = Effect.gen(function* () {
  const api = yield* LocalApiClient
  return yield* api.sharing.invite()
}).pipe(Effect.mapError(toApiFailure))

const dropInvite = Effect.gen(function* () {
  const api = yield* LocalApiClient
  return yield* api.sharing.cancelInvite()
}).pipe(Effect.mapError(toApiFailure))

const revoke = (id: PairedDeviceId) =>
  Effect.gen(function* () {
    const api = yield* LocalApiClient
    return yield* api.sharing.revokeDevice({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

/** Owns whether this device answers on the local network, and who may ask. */
export const useSharing = () => {
  const [status, setStatus] = useState<SharingStatus | null>(null)
  const [devices, setDevices] = useState<ReadonlyArray<PairedDevice>>([])
  const [invite, setInvite] = useState<PairingInvite | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [statusResult, deviceResult] = await Promise.all([
      appRuntime.runPromise(Effect.either(readStatus)),
      appRuntime.runPromise(Effect.either(readDevices))
    ])
    setLoading(false)

    if (statusResult._tag === "Left") {
      setActionError(statusResult.left.message)
      return
    }

    setStatus(statusResult.right)
    if (deviceResult._tag === "Right") setDevices(deviceResult.right)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** An expired code is worse than no code: drop it as soon as it lapses. */
  useEffect(() => {
    if (invite === null) return

    const remaining = pairingInviteRemainingMillis(invite)
    if (remaining <= 0) {
      setInvite(null)
      return
    }

    const timer = window.setTimeout(() => setInvite(null), remaining)
    return () => window.clearTimeout(timer)
  }, [invite])

  const update = useCallback(
    async (patch: UpdateSharing) => {
      setActionError(null)
      setPending(true)
      const result = await appRuntime.runPromise(
        Effect.either(writeStatus(patch))
      )
      setPending(false)

      if (result._tag === "Left") {
        setActionError(result.left.message)
        return false
      }

      setStatus(result.right)
      if (!result.right.listening) setInvite(null)
      // A refused bind is reported in the status, not as a failure: the toggle
      // stays where the user put it and the reason is shown beside it.
      return result.right.reason === null
    },
    []
  )

  const addDevice = useCallback(async () => {
    setActionError(null)
    setPending(true)
    const result = await appRuntime.runPromise(Effect.either(createInvite))
    setPending(false)

    if (result._tag === "Left") {
      setActionError(result.left.message)
      return null
    }

    setInvite(result.right)
    return result.right
  }, [])

  const cancelInvite = useCallback(async () => {
    setInvite(null)
    await appRuntime.runPromise(Effect.either(dropInvite))
  }, [])

  const revokeDevice = useCallback(
    async (id: PairedDeviceId) => {
      setActionError(null)
      setPending(true)
      const result = await appRuntime.runPromise(Effect.either(revoke(id)))
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

  return {
    status,
    devices,
    invite,
    loading,
    pending,
    actionError,
    refresh,
    update,
    addDevice,
    cancelInvite,
    revokeDevice
  } as const
}
