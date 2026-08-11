import { HttpApiBuilder } from "@effect/platform"
import { StarterApi } from "@starter/contracts"
import { Effect } from "effect"
import { SettingsRepository } from "./settings-repository"

export const SettingsHttpLive = HttpApiBuilder.group(
  StarterApi,
  "settings",
  (handlers) =>
    Effect.gen(function* () {
      const settings = yield* SettingsRepository

      return handlers
        .handle("get", () => settings.get())
        .handle("update", ({ payload }) => settings.update(payload))
    })
)
