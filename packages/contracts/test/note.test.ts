import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import { CreateNote, Note, NoteId } from "../src/note"

describe("Note contract", () => {
  it.effect("decodes an encoded note back to the same value", () =>
    Effect.gen(function* () {
      const note = new Note({
        id: NoteId.make("note_1"),
        title: "Curate visual references",
        body: "Bun owns the system, Rust owns the window.",
        createdAt: DateTime.unsafeMake("2026-08-10T00:00:00.000Z")
      })

      const encoded = yield* Schema.encode(Note)(note)
      expect(encoded.createdAt).toBe("2026-08-10T00:00:00.000Z")

      const decoded = yield* Schema.decodeUnknown(Note)(encoded)
      expect(decoded).toStrictEqual(note)
    }))

  it.effect("rejects a blank title at the boundary", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknown(CreateNote)({ title: "   ", body: "" }).pipe(Effect.either)
      expect(result._tag).toBe("Left")
    }))
})
