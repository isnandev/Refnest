import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { SettingsRepository } from "./settings-repository"

export const SettingsHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "settings",
  (handlers) =>
    Effect.gen(function* () {
      const settings = yield* SettingsRepository

      return handlers
        .handle("get", () => settings.get())
        .handle("update", ({ payload }) => settings.update(payload))
    })
)
