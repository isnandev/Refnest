import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { PairingService } from "./pairing-service"
import { SharingService } from "./sharing-service"

/** Device-local: who may reach this library, and on which port. */
export const SharingHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "sharing",
  (handlers) =>
    Effect.gen(function* () {
      const sharing = yield* SharingService

      return handlers
        .handle("status", () => sharing.status)
        .handle("update", ({ payload }) => sharing.update(payload))
        .handle("invite", () => sharing.invite)
        .handle("cancelInvite", () => sharing.cancelInvite)
        .handle("devices", () => sharing.devices)
        .handle("revokeDevice", ({ path }) => sharing.revokeDevice(path.id))
    })
)

/**
 * The only unauthenticated handler in the system, and it lives on the shared
 * listener alone. `withSharedAuth` hides it entirely unless an invite is
 * currently outstanding.
 */
export const SharedPairingHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "pairing",
  (handlers) =>
    Effect.gen(function* () {
      const pairing = yield* PairingService

      return handlers.handle("redeem", ({ payload }) => pairing.redeem(payload))
    })
)
