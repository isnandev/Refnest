import { HttpApiBuilder } from "@effect/platform"
import { StarterApi } from "@starter/contracts"
import { Effect, Layer } from "effect"
import { NoteRepository } from "./note-repository"

export const NotesHttpLive = HttpApiBuilder.group(StarterApi, "notes", (handlers) =>
  Effect.gen(function* () {
    const notes = yield* NoteRepository

    return handlers
      .handle("list", () => notes.list)
      .handle("byId", ({ path }) => notes.findById(path.id))
      .handle("create", ({ payload }) => notes.create(payload))
      .handle("remove", ({ path }) => notes.remove(path.id))
  })
).pipe(Layer.provide(NoteRepository.Default))
