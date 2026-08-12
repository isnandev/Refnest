/**
 * Address parsing shared by the two policies that disagree about what they
 * want: capture must never reach a private address, and local-network sharing
 * must never answer a public one. Both parse the same way so they cannot drift.
 */

export const unwrapIpLiteral = (address: string) =>
  address.startsWith("[") && address.endsWith("]")
    ? address.slice(1, -1)
    : address

export const parseIpv4 = (address: string): ReadonlyArray<number> | null => {
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

export const ipv4FromWords = (
  high: number,
  low: number
): ReadonlyArray<number> => [high >>> 8, high & 0xff, low >>> 8, low & 0xff]

export const parseIpv6 = (address: string): ReadonlyArray<number> | null => {
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

export const hasIpv6Prefix = (
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

export const isIpv4Mapped = (words: ReadonlyArray<number>) =>
  words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff
