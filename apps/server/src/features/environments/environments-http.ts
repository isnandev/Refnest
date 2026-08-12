import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { EnvironmentService } from "./environment-service"

export const EnvironmentsHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "environments",
  (handlers) =>
    Effect.gen(function* () {
      const environments = yield* EnvironmentService

      return handlers
        .handle("list", () => environments.list)
        .handle("connect", ({ payload }) => environments.connect(payload))
        .handle("update", ({ path, payload }) =>
          environments.update(path.id, payload)
        )
        .handle("forget", ({ path }) => environments.forget(path.id))
        .handle("probe", ({ path }) => environments.probe(path.id))
        .handle("connection", ({ path }) => environments.connection(path.id))
    })
)
