import { isIP } from "node:net"
import {
  hasIpv6Prefix,
  ipv4FromWords,
  isIpv4Mapped,
  parseIpv4,
  parseIpv6,
  unwrapIpLiteral
} from "./ip-address"

/**
 * An explicit allowlist, deliberately not "whatever the capture policy calls
 * non-public".
 *
 * That complement looked equivalent and is not: the capture policy also
 * excludes documentation, benchmark, 6to4 and NAT64 ranges, none of which are
 * local networks. Defining sharing against it would have accepted a peer from
 * 203.0.113.0/24 as though it were on the LAN.
 *
 * 100.64.0.0/10 is included because mesh VPNs such as Tailscale put devices
 * there, and reaching a laptop over one is the same use case as reaching it
 * across the room.
 */
const isPrivateIpv4 = (octets: ReadonlyArray<number>) => {
  const first = octets[0]
  const second = octets[1]
  if (first === undefined || second === undefined) return false

  if (first === 10) return true
  if (first === 127) return true
  if (first === 169 && second === 254) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  if (first === 100 && second >= 64 && second <= 127) return true

  return false
}

const isPrivateIpv6 = (words: ReadonlyArray<number>) => {
  if (isIpv4Mapped(words)) {
    const high = words[6]
    const low = words[7]
    return high !== undefined && low !== undefined
      ? isPrivateIpv4(ipv4FromWords(high, low))
      : false
  }

  // ::1
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) {
    return true
  }
  // fc00::/7 unique local, fe80::/10 link local
  return hasIpv6Prefix(words, [0xfc00], 7) || hasIpv6Prefix(words, [0xfe80], 10)
}

/**
 * True only for addresses on a local network or this machine. The share
 * listener answers nothing else, and a saved library may point nowhere else.
 */
export const isPrivateNetworkAddress = (address: string) => {
  // Bun reports an IPv4 peer on a dual-stack socket as ::ffff:192.168.1.11.
  const unwrapped = unwrapIpLiteral(address)
  const version = isIP(unwrapped)

  if (version === 4) {
    const octets = parseIpv4(unwrapped)
    return octets !== null && isPrivateIpv4(octets)
  }
  if (version === 6) {
    const words = parseIpv6(unwrapped)
    return words !== null && isPrivateIpv6(words)
  }

  return false
}
