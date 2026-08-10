import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

export const NoteId = Schema.NonEmptyTrimmedString.pipe(Schema.brand("NoteId"))
export type NoteId = typeof NoteId.Type

/** Shared with the UI so field-level validation and the wire contract cannot drift. */
export const NOTE_TITLE_MAX_LENGTH = 120
export const NOTE_BODY_MAX_LENGTH = 4000

export const NoteTitle = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(NOTE_TITLE_MAX_LENGTH)
)
export const NoteBody = Schema.String.pipe(Schema.maxLength(NOTE_BODY_MAX_LENGTH))

export class Note extends Schema.Class<Note>("Note")({
  id: NoteId,
  title: NoteTitle,
  body: NoteBody,
  createdAt: Schema.DateTimeUtc
}) {}

export class CreateNote extends Schema.Class<CreateNote>("CreateNote")({
  title: NoteTitle,
  body: NoteBody
}) {}

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
  "NoteNotFound",
  { id: NoteId },
  HttpApiSchema.annotations({ status: 404 })
) {}
