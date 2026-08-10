import { HealthReport } from "@starter/contracts"
import { Clock, Effect } from "effect"
import { RUNTIME_LABEL, SERVER_VERSION } from "../../version"

export class HealthService extends Effect.Service<HealthService>()("HealthService", {
  effect: Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis

    const report = Effect.fn("HealthService.report")(function* () {
      const now = yield* Clock.currentTimeMillis

      return new HealthReport({
        status: "ok",
        runtime: RUNTIME_LABEL,
        version: SERVER_VERSION,
        uptimeMillis: now - startedAt
      })
    })

    return { report } as const
  })
}) {}
