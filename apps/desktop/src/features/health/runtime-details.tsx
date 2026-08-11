import { Boxes, Cable, Database } from "lucide-react"

import { SidecarStatus } from "./sidecar-status"
import type { SidecarHealthState } from "./use-sidecar-health"

const DETAILS = [
  { label: "Runtime", value: "Bun sidecar", icon: Boxes },
  { label: "Transport", value: "Tauri HTTP bridge", icon: Cable },
  { label: "Storage", value: "Effect Ref · session", icon: Database }
] as const

interface RuntimeDetailsProps {
  readonly state: SidecarHealthState
}

export function RuntimeDetails({ state }: RuntimeDetailsProps) {
  return (
    <section id="runtime" className="scroll-mt-20 pt-10" aria-labelledby="runtime-title">
      <h2 id="runtime-title" className="text-h2">
        Runtime details
      </h2>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <dl>
          {DETAILS.map((detail) => {
            const Icon = detail.icon

            return (
              <div
                key={detail.label}
                className="grid gap-1 border-b px-4 py-3 sm:grid-cols-[minmax(150px,0.7fr)_minmax(0,1fr)] sm:items-center"
              >
                <dt className="flex items-center gap-2.5 text-muted-foreground">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{detail.label}</span>
                </dt>
                <dd className="pl-6 font-medium sm:pl-0">{detail.value}</dd>
              </div>
            )
          })}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted px-4 py-3">
          <p className="text-body-sm text-muted-foreground">
            <span className="font-medium text-foreground">Connection</span>
            <span aria-hidden="true"> · </span>
            Live desktop bridge status
          </p>
          <SidecarStatus state={state} />
        </div>
      </div>
    </section>
  )
}
