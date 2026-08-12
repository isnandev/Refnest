import type { HealthReport } from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useState } from "react"
import { ApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

export type SidecarHealthState =
  | { readonly status: "starting" }
  | { readonly status: "online"; readonly report: HealthReport }
  | { readonly status: "offline"; readonly message: string }

const checkHealth = Effect.gen(function* () {
  const api = yield* ApiClient

  return yield* api.health.check()
}).pipe(Effect.mapError(toApiFailure))

/**
 * The first call also proves the whole chain: webview -> Rust shell -> Bun
 * sidecar. Until the handshake lands, the Rust command simply waits.
 */
export const useSidecarHealth = () => {
  const [state, setState] = useState<SidecarHealthState>({ status: "starting" })

  const check = useCallback(async () => {
    const result = await appRuntime.runPromise(Effect.either(checkHealth))

    setState(
      result._tag === "Right"
        ? { status: "online", report: result.right }
        : { status: "offline", message: result.left.message }
    )
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return { state, check } as const
}
