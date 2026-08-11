import { HttpApiBuilder } from "@effect/platform"
import { StarterApi } from "@starter/contracts"
import { Layer } from "effect"
import { HealthHttpLive } from "../features/health/health-http"
import { NotesHttpLive } from "../features/notes/notes-http"
import { SettingsHttpLive } from "../features/settings/settings-http"
import { WorkspacesHttpLive } from "../features/workspaces/workspaces-http"

/** The one place every feature group is attached to the wire contract. */
export const ApiLive = HttpApiBuilder.api(StarterApi).pipe(
  Layer.provide(HealthHttpLive),
  Layer.provide(NotesHttpLive),
  Layer.provide(SettingsHttpLive),
  Layer.provide(WorkspacesHttpLive)
)
