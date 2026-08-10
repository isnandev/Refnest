import { HttpApiBuilder } from "@effect/platform"
import { StarterApi } from "@starter/contracts"
import { Effect, Layer } from "effect"
import { HealthService } from "./health-service"

export const HealthHttpLive = HttpApiBuilder.group(StarterApi, "health", (handlers) =>
  Effect.gen(function* () {
    const health = yield* HealthService

    return handlers.handle("check", () => health.report())
  })
).pipe(Layer.provide(HealthService.Default))
