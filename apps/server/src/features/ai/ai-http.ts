import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { AiService } from "./ai-service"

/** Host-only: this is the surface that reads and writes the provider credential. */
export const AiSettingsHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "aiSettings",
  (handlers) =>
    Effect.gen(function* () {
      const ai = yield* AiService

      return handlers
        .handle("getSettings", () => ai.getSettings())
        .handle("updateSettings", ({ payload }) => ai.updateSettings(payload))
    })
)

export const AiEnrichHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "aiEnrich",
  (handlers) =>
    Effect.gen(function* () {
      const ai = yield* AiService

      return handlers.handle("enrichReference", ({ path }) =>
        ai.enrichReference(path.id)
      )
    })
)

/** Shared: enrichment runs against the host's key, which the caller never sees. */
export const SharedAiEnrichHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "aiEnrich",
  (handlers) =>
    Effect.gen(function* () {
      const ai = yield* AiService

      return handlers.handle("enrichReference", ({ path }) =>
        ai.enrichReference(path.id)
      )
    })
)
