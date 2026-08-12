import { Context, Data, Effect, Layer } from "effect"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import {
  hasIpv6Prefix,
  ipv4FromWords,
  isIpv4Mapped,
  parseIpv4,
  parseIpv6,
  unwrapIpLiteral
} from "./ip-address"

export class OutboundUrlPolicyFailure extends Data.TaggedError(
  "OutboundUrlPolicyFailure"
)<{
  readonly reason: string
}> {}

export type HostnameResolver = (
  hostname: string
) => Effect.Effect<ReadonlyArray<string>, OutboundUrlPolicyFailure>

export type OutboundUrlPolicyOptions = {
  readonly allowLoopback?: boolean
  readonly requireLoopback?: boolean
}

export type OutboundUrlPolicyShape = {
  readonly validate: (
    url: URL,
    options?: OutboundUrlPolicyOptions
  ) => Effect.Effect<URL, OutboundUrlPolicyFailure>
}

export class OutboundUrlPolicy extends Context.Tag("OutboundUrlPolicy")<
  OutboundUrlPolicy,
  OutboundUrlPolicyShape
>() {}

const failure = (reason: string) => new OutboundUrlPolicyFailure({ reason })



const isPublicIpv4 = (octets: ReadonlyArray<number>) => {
  const first = octets[0]
  const second = octets[1]
  const third = octets[2]
  if (first === undefined || second === undefined || third === undefined) {
    return false
  }

  if (first === 0 || first === 10 || first === 127) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (first === 192 && second === 168) return false
  if (first === 192 && second === 0 && third === 0) return false
  if (first === 192 && second === 0 && third === 2) return false
  if (first === 192 && second === 31 && third === 196) return false
  if (first === 192 && second === 52 && third === 193) return false
  if (first === 192 && second === 88 && third === 99) return false
  if (first === 192 && second === 175 && third === 48) return false
  if (first === 198 && (second === 18 || second === 19)) return false
  if (first === 198 && second === 51 && third === 100) return false
  if (first === 203 && second === 0 && third === 113) return false
  if (first >= 224) return false

  return true
}




const isPublicIpv6 = (words: ReadonlyArray<number>) => {
  if (isIpv4Mapped(words)) {
    const high = words[6]
    const low = words[7]
    return high !== undefined && low !== undefined
      ? isPublicIpv4(ipv4FromWords(high, low))
      : false
  }

  // IPv4-compatible, NAT64, 6to4, and ISATAP forms either belong to a
  // special-use range or can conceal an address class Chromium would resolve
  // differently. They are not accepted as capture destinations.
  if (words.slice(0, 6).every((word) => word === 0)) return false
  if (hasIpv6Prefix(words, [0x64, 0xff9b, 0, 0, 0, 0], 96)) return false
  if (hasIpv6Prefix(words, [0x64, 0xff9b, 1], 48)) return false
  if (words[0] === 0x2002) return false
  if (
    (words[4] === 0 || words[4] === 0x0200) &&
    words[5] === 0x5efe
  ) {
    return false
  }

  // Globally routable unicast currently lives in 2000::/3. Exclude the IETF
  // special-purpose block and documentation allocations inside that range.
  if (!hasIpv6Prefix(words, [0x2000], 3)) return false
  if (hasIpv6Prefix(words, [0x2001, 0], 23)) return false
  if (hasIpv6Prefix(words, [0x2001, 0x0db8], 32)) return false
  if (hasIpv6Prefix(words, [0x3fff], 20)) return false

  return true
}

export const isLoopbackIpAddress = (address: string) => {
  const unwrapped = unwrapIpLiteral(address)
  const version = isIP(unwrapped)
  if (version === 4) return parseIpv4(unwrapped)?.[0] === 127
  if (version !== 6) return false
  const words = parseIpv6(unwrapped)
  return (
    words !== null &&
    words.slice(0, 7).every((word) => word === 0) &&
    words[7] === 1
  )
}

export const isPublicIpAddress = (address: string) => {
  const unwrapped = unwrapIpLiteral(address)
  const version = isIP(unwrapped)
  if (version === 4) {
    const octets = parseIpv4(unwrapped)
    return octets !== null && isPublicIpv4(octets)
  }
  if (version === 6) {
    const words = parseIpv6(unwrapped)
    return words !== null && isPublicIpv6(words)
  }
  return false
}

export const isLoopbackHostname = (hostname: string) => {
  const normalized = hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "")
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isLoopbackIpAddress(normalized)
  )
}

export const makeOutboundUrlPolicy = (
  resolveHostname: HostnameResolver
): OutboundUrlPolicyShape => ({
  validate: Effect.fn("OutboundUrlPolicy.validate")(function* (
    input: URL,
    options: OutboundUrlPolicyOptions = {}
  ) {
    const url = yield* Effect.try({
      try: () => new URL(input.toString()),
      catch: () => failure("Enter a valid HTTP or HTTPS URL.")
    })

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return yield* failure("Only HTTP and HTTPS destinations are supported.")
    }
    if (url.username.length > 0 || url.password.length > 0) {
      return yield* failure("Destinations containing credentials are not accepted.")
    }

    const hostname = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "")
    const addresses = isIP(hostname) === 0
      ? yield* resolveHostname(hostname)
      : [hostname]
    if (addresses.length === 0) {
      return yield* failure("The destination hostname did not resolve to an address.")
    }

    for (const address of addresses) {
      if (options.requireLoopback === true) {
        if (isLoopbackIpAddress(address)) continue
        return yield* failure(
          "The destination does not resolve exclusively to loopback addresses."
        )
      }
      if (isPublicIpAddress(address)) continue
      if (options.allowLoopback === true && isLoopbackIpAddress(address)) continue
      return yield* failure(
        "The destination resolves to a non-public network address."
      )
    }

    return url
  })
})

const liveResolver: HostnameResolver = (hostname) =>
  Effect.tryPromise({
    try: async () =>
      (await lookup(hostname, { all: true, verbatim: true })).map(
        (record) => record.address
      ),
    catch: () => failure("The destination hostname could not be resolved.")
  })

export const OutboundUrlPolicyLive = Layer.succeed(
  OutboundUrlPolicy,
  OutboundUrlPolicy.of(makeOutboundUrlPolicy(liveResolver))
)
