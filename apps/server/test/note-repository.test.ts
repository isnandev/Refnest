import { describe, expect, it } from "@effect/vitest"
import { CreateNote, NoteId } from "@refnest/contracts"
import { Effect } from "effect"
import { NoteRepository } from "../src/features/notes/note-repository"

describe("NoteRepository", () => {
  it.effect("creates a note and lists it first", () =>
    Effect.gen(function* () {
      const notes = yield* NoteRepository

      const created = yield* notes.create(new CreateNote({ title: "First", body: "body" }))
      yield* notes.create(new CreateNote({ title: "Second", body: "" }))

      const listed = yield* notes.list
      expect(listed.map((note) => note.title)).toStrictEqual(["Second", "First"])
      expect(yield* notes.findById(created.id)).toStrictEqual(created)
    }).pipe(Effect.provide(NoteRepository.Default)))

  it.effect("fails with NoteNotFound for an unknown id", () =>
    Effect.gen(function* () {
      const notes = yield* NoteRepository

      const result = yield* notes.findById(NoteId.make("note_404")).pipe(Effect.flip)
      expect(result._tag).toBe("NoteNotFound")
    }).pipe(Effect.provide(NoteRepository.Default)))

  it.effect("removes a note once and then reports it missing", () =>
    Effect.gen(function* () {
      const notes = yield* NoteRepository

      const created = yield* notes.create(new CreateNote({ title: "Temp", body: "" }))
      yield* notes.remove(created.id)

      expect(yield* notes.list).toStrictEqual([])
      const result = yield* notes.remove(created.id).pipe(Effect.flip)
      expect(result._tag).toBe("NoteNotFound")
    }).pipe(Effect.provide(NoteRepository.Default)))
})
