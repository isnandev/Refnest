import { CreateNote, Note, NoteId, NoteNotFound } from "@starter/contracts"
import { DateTime, Effect, Ref } from "effect"

/**
 * In-memory on purpose: the starter demonstrates the seams, not a database.
 * Swap this layer for a persistent one and nothing above it changes.
 */
export class NoteRepository extends Effect.Service<NoteRepository>()("NoteRepository", {
  effect: Effect.gen(function* () {
    const notes = yield* Ref.make<ReadonlyArray<Note>>([])
    const sequence = yield* Ref.make(0)

    const list = Ref.get(notes)

    const findById = Effect.fn("NoteRepository.findById")(function* (id: NoteId) {
      const current = yield* Ref.get(notes)
      const found = current.find((note) => note.id === id)

      return found ?? (yield* new NoteNotFound({ id }))
    })

    const create = Effect.fn("NoteRepository.create")(function* (input: CreateNote) {
      const createdAt = yield* DateTime.now
      const next = yield* Ref.updateAndGet(sequence, (n) => n + 1)
      const note = new Note({
        id: NoteId.make(`note_${next}`),
        title: input.title,
        body: input.body,
        createdAt
      })

      yield* Ref.update(notes, (current) => [note, ...current])

      return note
    })

    const remove = Effect.fn("NoteRepository.remove")(function* (id: NoteId) {
      const removed = yield* Ref.modify(notes, (current) => {
        const kept = current.filter((note) => note.id !== id)

        return [kept.length !== current.length, kept] as const
      })

      if (!removed) {
        return yield* new NoteNotFound({ id })
      }
    })

    return { list, findById, create, remove } as const
  })
}) {}
