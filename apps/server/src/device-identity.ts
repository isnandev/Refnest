import { ENVIRONMENT_NAME_MAX_LENGTH } from "@refnest/contracts"
import { hostname } from "node:os"

/**
 * What this machine calls itself, both as the name of the local library and as
 * the name a paired device stores for it. Bounded and never empty, because it
 * has to satisfy `EnvironmentName` on the wire.
 */
export const deviceName = () => {
  const reported = hostname().trim()
  if (reported.length === 0) return "This device"
  return reported.slice(0, ENVIRONMENT_NAME_MAX_LENGTH)
}
