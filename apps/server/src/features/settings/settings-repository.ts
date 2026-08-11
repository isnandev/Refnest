import {
  type DesktopSettings,
  type SettingsPersistenceFailed,
  type UpdateDesktopSettings
} from "@starter/contracts"
import { Context, type Effect } from "effect"

export type SettingsRepositoryShape = {
  readonly get: () => Effect.Effect<DesktopSettings, SettingsPersistenceFailed>
  readonly update: (
    patch: UpdateDesktopSettings
  ) => Effect.Effect<DesktopSettings, SettingsPersistenceFailed>
}

/** Persistence port consumed by the HTTP layer. */
export class SettingsRepository extends Context.Tag("SettingsRepository")<
  SettingsRepository,
  SettingsRepositoryShape
>() {}
