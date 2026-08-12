import { Context, Data, Effect, Layer } from "effect"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

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

const parseIpv4 = (address: string): ReadonlyArray<number> | null => {
  const parts = address.split(".")
  if (parts.length !== 4) return null

  const octets: Array<number> = []
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    octets.push(octet)
  }

  return octets
}

const ipv4FromWords = (high: number, low: number): ReadonlyArray<number> => [
  high >>> 8,
  high & 0xff,
  low >>> 8,
  low & 0xff
]

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

const parseIpv6 = (address: string): ReadonlyArray<number> | null => {
  let normalized = address.toLocaleLowerCase()
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1)
  }
  if (normalized.includes("%")) return null

  const lastColon = normalized.lastIndexOf(":")
  const dottedTail = lastColon < 0 ? "" : normalized.slice(lastColon + 1)
  if (dottedTail.includes(".")) {
    const ipv4 = parseIpv4(dottedTail)
    if (ipv4 === null) return null
    const first = ipv4[0]
    const second = ipv4[1]
    const third = ipv4[2]
    const fourth = ipv4[3]
    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      return null
    }
    normalized = `${normalized.slice(0, lastColon)}:${((first << 8) | second).toString(16)}:${((third << 8) | fourth).toString(16)}`
  }

  const halves = normalized.split("::")
  if (halves.length > 2) return null
  const readHalf = (value: string): ReadonlyArray<string> =>
    value.length === 0 ? [] : value.split(":")
  const left = readHalf(halves[0] ?? "")
  const right = readHalf(halves[1] ?? "")
  const hasCompression = halves.length === 2

  if (
    (!hasCompression && left.length !== 8) ||
    (hasCompression && left.length + right.length > 7)
  ) {
    return null
  }

  const missing = hasCompression ? 8 - left.length - right.length : 0
  const pieces = [...left, ...Array.from({ length: missing }, () => "0"), ...right]
  if (pieces.length !== 8) return null

  const words: Array<number> = []
  for (const piece of pieces) {
    if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
    words.push(Number.parseInt(piece, 16))
  }
  return words
}

const hasIpv6Prefix = (
  words: ReadonlyArray<number>,
  prefix: ReadonlyArray<number>,
  bits: number
) => {
  const completeWords = Math.floor(bits / 16)
  for (let index = 0; index < completeWords; index += 1) {
    if (words[index] !== prefix[index]) return false
  }

  const remainingBits = bits % 16
  if (remainingBits === 0) return true
  const word = words[completeWords]
  const prefixWord = prefix[completeWords]
  if (word === undefined || prefixWord === undefined) return false
  const mask = (0xffff << (16 - remainingBits)) & 0xffff
  return (word & mask) === (prefixWord & mask)
}

const isIpv4Mapped = (words: ReadonlyArray<number>) =>
  words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff

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
  const unwrapped = address.startsWith("[") && address.endsWith("]")
    ? address.slice(1, -1)
    : address
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
  const unwrapped = address.startsWith("[") && address.endsWith("]")
    ? address.slice(1, -1)
    : address
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
