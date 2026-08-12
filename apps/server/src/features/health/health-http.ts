import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { HealthService } from "./health-service"

export const HealthHttpLive = HttpApiBuilder.group(RefNestApi, "health", (handlers) =>
  Effect.gen(function* () {
    const health = yield* HealthService

    return handlers.handle("check", () => health.report())
  })
)

/**
 * The wiring is per-API, but the service is not: both listeners resolve the one
 * `HealthService` in the application graph, so uptime and version read
 * identically whichever way a client arrived.
 */
export const SharedHealthHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "health",
  (handlers) =>
    Effect.gen(function* () {
      const health = yield* HealthService

      return handlers.handle("check", () => health.report())
    })
)
