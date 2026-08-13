import { describe, expect, it } from "bun:test"
import { collectSharingAddresses } from "../src/features/sharing/sharing-addresses"

const address = (
  value: string,
  options: { readonly internal?: boolean; readonly family?: string } = {}
) => ({
  address: value,
  family: options.family ?? "IPv4",
  internal: options.internal ?? false
})

describe("sharing addresses", () => {
  it("prefers a physical LAN adapter over WSL and other virtual adapters", () => {
    const addresses = collectSharingAddresses({
      "vEthernet (WSL (Hyper-V firewall))": [address("172.31.128.1")],
      "Wi-Fi": [address("192.168.1.20")],
      "VMware Network Adapter VMnet1": [address("192.168.56.1")]
    })

    expect(addresses.map((entry) => entry.address)).toEqual([
      "192.168.1.20",
      "172.31.128.1",
      "192.168.56.1"
    ])
  })

  it("keeps usable private alternatives and removes undialable addresses", () => {
    const addresses = collectSharingAddresses({
      Tailscale: [address("100.64.0.5")],
      Loopback: [address("127.0.0.1", { internal: true })],
      Public: [address("8.8.8.8")],
      IPv6: [address("fd12:3456::1", { family: "IPv6" })]
    })

    expect(addresses.map((entry) => entry.address)).toEqual(["100.64.0.5"])
  })
})
