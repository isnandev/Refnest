import { HttpApp, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Option } from "effect"
import { PairingService } from "../features/sharing/pairing-service"
import { isPrivateNetworkAddress } from "../security/private-network"

/** Pairing is the one thing an unpaired device is allowed to ask for. */
const PAIRING_PATH = "/pair"

const readBearer = (headers: Record<string, string>) => {
  const value = headers["authorization"]
  if (value === undefined) return null
  const [scheme, token] = value.split(" ")
  if (scheme?.toLowerCase() !== "bearer") return null
  return token !== undefined && token.length > 0 ? token : null
}

/**
 * The LAN listener's front door.
 *
 * Order matters: the peer is checked before anything else, so a public caller
 * never reaches the pairing endpoint or a token comparison. A listener bound to
 * every interface that answered a public peer would be a bug, not a setting.
 *
 * This middleware only ever rejects — it never rewrites a response — because
 * `HttpApp.toHandled` has already sent the response by the time the inner app
 * returns.
 */
export const withSharedAuth = (
  app: HttpApp.Default
): HttpApp.Default<never, PairingService> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const pairing = yield* PairingService
    const peer = Option.getOrElse(request.remoteAddress, () => "")

    if (peer === "" || !isPrivateNetworkAddress(peer)) {
      return HttpServerResponse.empty({ status: 403 })
    }

    const path = new URL(request.url, "http://shared.invalid").pathname

    if (path === PAIRING_PATH) {
      // Absent rather than closed when nobody is pairing: the unauthenticated
      // surface exists only for the few minutes an invite is outstanding.
      const outstanding = yield* pairing.isInviteOutstanding.pipe(
        Effect.orElseSucceed(() => false)
      )
      return outstanding
        ? yield* app
        : HttpServerResponse.empty({ status: 404 })
    }

    const token = readBearer(request.headers)
    if (token === null) {
      return HttpServerResponse.empty({ status: 401 })
    }

    const device = yield* pairing.authenticate(token)
    if (device === null) {
      return HttpServerResponse.empty({ status: 401 })
    }

    return yield* app
  })
