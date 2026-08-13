import {
  DeviceNotFound,
  formatConnectString,
  PairedDeviceId,
  PairingInvite,
  SharingFailed,
  SharingRejected,
  SharingStatus,
  type PairedDevice,
  type UpdateSharing
} from "@refnest/contracts"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { deviceName } from "../../device-identity"
import { PairingService } from "./pairing-service"
import { ShareListener } from "./share-listener"
import { localSharingAddresses } from "./sharing-addresses"
import { SharingSettingsRepository } from "./sharing-settings-repository"

/**
 * Bound on every interface so whichever network the other device is on works,
 * with the peer check in the middleware doing the actual restricting.
 */
const BIND_HOSTNAME = "0.0.0.0"

const decodeInstant = Schema.decodeUnknownSync(Schema.DateTimeUtc)

export type SharingServiceShape = {
  readonly status: Effect.Effect<SharingStatus, SharingFailed>
  readonly update: (
    patch: UpdateSharing
  ) => Effect.Effect<SharingStatus, SharingRejected | SharingFailed>
  readonly invite: Effect.Effect<PairingInvite, SharingRejected | SharingFailed>
  readonly cancelInvite: Effect.Effect<void, SharingFailed>
  readonly devices: Effect.Effect<ReadonlyArray<PairedDevice>, SharingFailed>
  readonly revokeDevice: (
    id: PairedDeviceId
  ) => Effect.Effect<void, DeviceNotFound | SharingFailed>
  /** Re-applies stored sharing state at boot, without failing the boot. */
  readonly restore: Effect.Effect<void>
}

export class SharingService extends Context.Tag("SharingService")<
  SharingService,
  SharingServiceShape
>() {}

const makeService = Effect.gen(function* () {
  const settings = yield* SharingSettingsRepository
  const listener = yield* ShareListener
  const pairing = yield* PairingService
  const lastFailure = yield* Ref.make<string | null>(null)

  const buildStatus = Effect.gen(function* () {
    const stored = yield* settings.read
    const runningPort = yield* listener.runningPort
    const deviceCount = yield* pairing.devices.pipe(
      Effect.map((devices) => devices.length)
    )
    const reason = yield* Ref.get(lastFailure)

    return new SharingStatus({
      enabled: stored.enabled,
      listening: runningPort !== null,
      port: runningPort ?? stored.port,
      libraryName: deviceName(),
      addresses: runningPort === null ? [] : localSharingAddresses(),
      deviceCount,
      reason
    })
  })

  const applyState = (enabled: boolean, port: number) =>
    enabled
      ? listener.start(BIND_HOSTNAME, port).pipe(
          Effect.tap(() => Ref.set(lastFailure, null)),
          Effect.tapError((error) => Ref.set(lastFailure, error.reason)),
          Effect.asVoid
        )
      : listener.stop.pipe(Effect.tap(() => Ref.set(lastFailure, null)))

  const update = Effect.fn("SharingService.update")(function* (
    patch: UpdateSharing
  ) {
    const stored = yield* settings.read
    const next = {
      enabled: patch.enabled ?? stored.enabled,
      port: patch.port ?? stored.port
    }

    // Persist first, so a bind failure still leaves the user's intent stored
    // and visible rather than silently reverting the toggle.
    yield* settings.write(next)
    yield* applyState(next.enabled, next.port)

    return yield* buildStatus
  })

  const invite = Effect.gen(function* () {
    const runningPort = yield* listener.runningPort
    if (runningPort === null) {
      return yield* new SharingRejected({
        reason: "Turn on local network sharing before adding a device."
      })
    }

    const addresses = localSharingAddresses()
    const first = addresses[0]
    if (first === undefined) {
      return yield* new SharingRejected({
        reason: "This device is not on a local network right now."
      })
    }

    const issued = yield* pairing.issue

    return new PairingInvite({
      code: issued.code,
      expiresAt: decodeInstant(issued.expiresAt.toISOString()),
      connectString: formatConnectString({
        host: first.address,
        port: runningPort,
        code: issued.code
      })
    })
  })

  const restore = Effect.gen(function* () {
    const stored = yield* settings.read
    if (!stored.enabled) return
    yield* applyState(true, stored.port)
  }).pipe(Effect.ignore)

  return SharingService.of({
    status: buildStatus,
    update,
    invite,
    cancelInvite: pairing.cancel,
    devices: pairing.devices,
    revokeDevice: pairing.revoke,
    restore
  })
})

export const SharingServiceLive = Layer.effect(SharingService, makeService)
