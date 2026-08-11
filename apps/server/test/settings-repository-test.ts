import {
  DEFAULT_DESKTOP_SETTINGS,
  mergeDesktopSettings,
  type DesktopSettings,
  type UpdateDesktopSettings
} from "@starter/contracts"
import { Effect, Layer, Ref } from "effect"
import { SettingsRepository } from "../src/features/settings/settings-repository"

export const SettingsRepositoryTest = Layer.effect(
  SettingsRepository,
  Effect.gen(function* () {
    const state = yield* Ref.make<DesktopSettings>(DEFAULT_DESKTOP_SETTINGS)

    const get = Effect.fn("SettingsRepositoryTest.get")(function* () {
      return yield* Ref.get(state)
    })

    const update = Effect.fn("SettingsRepositoryTest.update")(function* (
      patch: UpdateDesktopSettings
    ) {
      return yield* Ref.updateAndGet(state, (current) =>
        mergeDesktopSettings(current, patch)
      )
    })

    return SettingsRepository.of({ get, update })
  })
)
