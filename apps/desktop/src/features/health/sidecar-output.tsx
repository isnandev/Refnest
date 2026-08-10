import type { SidecarHealthState } from "./use-sidecar-health"

interface SidecarOutputProps {
  readonly state: SidecarHealthState
}

const render = (state: SidecarHealthState) => {
  switch (state.status) {
    case "starting":
      return "waiting for the sidecar handshake…"
    case "offline":
      return state.message
    case "online":
      return JSON.stringify(state.report, null, 2)
  }
}

/**
 * A recessed matte panel, reserved by the design source for machine output.
 * This is the sidecar speaking for itself: the raw `GET /health` payload that
 * travelled webview -> Rust -> Bun and back.
 */
export function SidecarOutput({ state }: SidecarOutputProps) {
  return (
    <section
      className="rounded-md bg-surface-inverse p-4"
      aria-label="Sidecar health response"
    >
      <p className="text-caption text-on-inverse-muted">GET /health</p>
      <pre className="mt-2 font-mono text-code whitespace-pre-wrap text-on-inverse">
        {render(state)}
      </pre>
    </section>
  )
}
