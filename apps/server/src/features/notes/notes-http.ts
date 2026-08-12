import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { NoteRepository } from "./note-repository"

export const NotesHttpLive = HttpApiBuilder.group(RefNestApi, "notes", (handlers) =>
  Effect.gen(function* () {
    const notes = yield* NoteRepository

    return handlers
      .handle("list", () => notes.list)
      .handle("byId", ({ path }) => notes.findById(path.id))
      .handle("create", ({ payload }) => notes.create(payload))
      .handle("remove", ({ path }) => notes.remove(path.id))
  })
)

/** One repository, two listeners: the note store is in memory and must not fork. */
export const SharedNotesHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "notes",
  (handlers) =>
    Effect.gen(function* () {
      const notes = yield* NoteRepository

      return handlers
        .handle("list", () => notes.list)
        .handle("byId", ({ path }) => notes.findById(path.id))
        .handle("create", ({ payload }) => notes.create(payload))
        .handle("remove", ({ path }) => notes.remove(path.id))
    })
)
