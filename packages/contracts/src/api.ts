import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { HealthReport } from "./health"
import { CreateNote, Note, NoteId, NoteNotFound } from "./note"

const noteIdParam = HttpApiSchema.param("id", NoteId)

export const healthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check")`/health`.addSuccess(HealthReport)
)

export const notesGroup = HttpApiGroup.make("notes")
  .add(HttpApiEndpoint.get("list")`/notes`.addSuccess(Schema.Array(Note)))
  .add(HttpApiEndpoint.get("byId")`/notes/${noteIdParam}`.addSuccess(Note).addError(NoteNotFound))
  .add(HttpApiEndpoint.post("create")`/notes`.setPayload(CreateNote).addSuccess(Note, { status: 201 }))
  .add(
    HttpApiEndpoint.del("remove")`/notes/${noteIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(NoteNotFound)
  )

/** The single source of truth for the wire contract: server handlers and the desktop client both derive from it. */
export const StarterApi = HttpApi.make("starter").add(healthGroup).add(notesGroup)

export type StarterApi = typeof StarterApi
