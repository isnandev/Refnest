import { SharingAddress } from "@refnest/contracts"
import { networkInterfaces } from "node:os"
import { isPrivateNetworkAddress } from "../../security/private-network"

type NetworkAddressEntry = {
  readonly address: string
  readonly family: string | number
  readonly internal: boolean
}

type NetworkAddressMap = Readonly<
  Record<string, ReadonlyArray<NetworkAddressEntry> | undefined>
>

const VIRTUAL_INTERFACE =
  /\b(?:docker|hyper-v|podman|virtualbox|vmware|wsl)\b|\bvboxnet\b|\bvirbr\b|^vEthernet\b/i
const PHYSICAL_INTERFACE =
  /\b(?:ethernet|local area connection|wi-?fi|wireless|wlan)\b|^(?:en|eth|wl)/i

const interfacePreference = (name: string) => {
  if (VIRTUAL_INTERFACE.test(name)) return 2
  if (PHYSICAL_INTERFACE.test(name)) return 0
  return 1
}

/**
 * Lists every dialable IPv4 address, with ordinary LAN adapters ahead of
 * virtual-machine bridges. Virtual addresses remain available for people who
 * intentionally pair over one; they are simply not advertised as the default.
 */
export const collectSharingAddresses = (
  interfaces: NetworkAddressMap
): ReadonlyArray<SharingAddress> => {
  const found: Array<SharingAddress> = []

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue
      if (entry.internal) continue
      if (!isPrivateNetworkAddress(entry.address)) continue
      found.push(new SharingAddress({ interfaceName, address: entry.address }))
    }
  }

  return found.sort((left, right) => {
    const preference =
      interfacePreference(left.interfaceName) -
      interfacePreference(right.interfaceName)
    if (preference !== 0) return preference

    const interfaceOrder = left.interfaceName.localeCompare(right.interfaceName)
    return interfaceOrder !== 0
      ? interfaceOrder
      : left.address.localeCompare(right.address, undefined, { numeric: true })
  })
}

export const localSharingAddresses = () =>
  collectSharingAddresses(networkInterfaces())
