import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SidecarHealthState } from "./use-sidecar-health"

interface SidecarStatusProps {
  readonly state: SidecarHealthState
}

/** Status is never carried by colour alone — every variant states its word. */
export function SidecarStatus({ state }: SidecarStatusProps) {
  if (state.status === "starting") {
    return (
      <Badge variant="neutral">
        <LoaderCircle className="animate-spin" aria-hidden="true" />
        Starting
      </Badge>
    )
  }

  if (state.status === "offline") {
    return (
      <Badge variant="danger">
        <CircleAlert aria-hidden="true" />
        Offline
      </Badge>
    )
  }

  return (
    <Badge variant="success">
      <CircleCheck aria-hidden="true" />
      Sidecar online
    </Badge>
  )
}
