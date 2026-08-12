import { EnvironmentRejected } from "@refnest/contracts"
import { Effect } from "effect"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { isPrivateNetworkAddress } from "../../security/private-network"

const rejected = (reason: string) => new EnvironmentRejected({ reason })

/** IPv6 literals need brackets before they can go into a URL. */
export const formatBaseUrl = (host: string, port: number) =>
  isIP(host) === 6 ? `http://[${host}]:${port}` : `http://${host}:${port}`

/**
 * A saved library must live on the local network. Refusing a public address is
 * what keeps a mistyped or hostile connect string from pointing this device's
 * credential at the open internet, where it would travel in clear.
 */
export const assertPrivateHost = Effect.fn("assertPrivateHost")(function* (
  host: string
) {
  if (isIP(host) !== 0) {
    if (!isPrivateNetworkAddress(host)) {
      return yield* rejected(
        "That address is not on a local network. RefNest only shares over private networks."
      )
    }
    return host
  }

  const addresses = yield* Effect.tryPromise({
    try: async () =>
      (await lookup(host, { all: true, verbatim: true })).map(
        (record) => record.address
      ),
    catch: () => rejected("That address could not be resolved on this network.")
  })

  if (addresses.length === 0) {
    return yield* rejected("That address could not be resolved on this network.")
  }
  for (const address of addresses) {
    if (!isPrivateNetworkAddress(address)) {
      return yield* rejected(
        "That address resolves outside the local network. RefNest only shares over private networks."
      )
    }
  }

  return host
})
