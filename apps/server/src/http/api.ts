import { HttpApiBuilder } from "@effect/platform"
import { StarterApi } from "@starter/contracts"
import { Layer } from "effect"
import { HealthHttpLive } from "../features/health/health-http"
import { NotesHttpLive } from "../features/notes/notes-http"

/** The one place every feature group is attached to the wire contract. */
export const ApiLive = HttpApiBuilder.api(StarterApi).pipe(
  Layer.provide(HealthHttpLive),
  Layer.provide(NotesHttpLive)
)
