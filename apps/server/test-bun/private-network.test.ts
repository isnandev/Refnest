import { describe, expect, it } from "bun:test"
import { isPrivateNetworkAddress } from "../src/security/private-network"

describe("what counts as a local network", () => {
  it("accepts the ranges a home or studio network actually uses", () => {
    for (const address of [
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.20",
      "169.254.10.5",
      "127.0.0.1",
      // Mesh VPNs such as Tailscale live here, and reaching a laptop over one
      // is the same use case as reaching it across the room.
      "100.64.0.1"
    ]) {
      expect(isPrivateNetworkAddress(address)).toBe(true)
    }
  })

  it("accepts IPv6 loopback, unique-local, and link-local", () => {
    for (const address of [
      "::1",
      "fc00::1",
      "fd12:3456:789a::1",
      "fe80::1",
      "[fe80::1]",
      // Bun reports an IPv4 peer on a dual-stack socket this way.
      "::ffff:192.168.1.11"
    ]) {
      expect(isPrivateNetworkAddress(address)).toBe(true)
    }
  })

  it("refuses routable addresses", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "172.32.0.1",
      "172.15.255.255",
      "192.169.1.1",
      "2001:4860:4860::8888",
      "::ffff:8.8.8.8"
    ]) {
      expect(isPrivateNetworkAddress(address)).toBe(false)
    }
  })

  it("refuses special-use ranges that are not local networks", () => {
    // These are the ranges that made "not public" the wrong definition: the
    // capture policy excludes them too, but none of them is a LAN.
    for (const address of [
      "203.0.113.5", // TEST-NET-3 documentation
      "198.51.100.7", // TEST-NET-2 documentation
      "192.0.2.9", // TEST-NET-1 documentation
      "198.18.0.1", // benchmarking
      "192.88.99.1", // 6to4 relay anycast
      "2001:db8::1", // documentation
      "224.0.0.1", // multicast
      "0.0.0.0"
    ]) {
      expect(isPrivateNetworkAddress(address)).toBe(false)
    }
  })

  it("refuses anything that is not an address at all", () => {
    for (const value of ["", "localhost", "studio-pc", "192.168.1", "not an ip"]) {
      expect(isPrivateNetworkAddress(value)).toBe(false)
    }
  })
})
