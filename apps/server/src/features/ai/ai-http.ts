import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { AiService } from "./ai-service"

export const AiHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "ai",
  (handlers) =>
    Effect.gen(function* () {
      const ai = yield* AiService

      return handlers
        .handle("getSettings", () => ai.getSettings())
        .handle("updateSettings", ({ payload }) => ai.updateSettings(payload))
        .handle("enrichReference", ({ path }) =>
          ai.enrichReference(path.id)
        )
    })
)
