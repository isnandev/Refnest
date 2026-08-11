import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { HealthReport } from "./health"
import { CreateNote, Note, NoteId, NoteNotFound } from "./note"
import {
  DesktopSettings,
  SettingsPersistenceFailed,
  UpdateDesktopSettings
} from "./settings"
import {
  BrowseWorkspaceDirectory,
  CreateWorkspace,
  Workspace,
  WorkspaceDirectoryListing,
  WorkspaceOperationFailed
} from "./workspace"

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

export const workspacesGroup = HttpApiGroup.make("workspaces")
  .add(HttpApiEndpoint.get("list")`/workspaces`.addSuccess(Schema.Array(Workspace)))
  .add(
    HttpApiEndpoint.get("browse")`/workspaces/directories`
      .setUrlParams(BrowseWorkspaceDirectory)
      .addSuccess(WorkspaceDirectoryListing)
      .addError(WorkspaceOperationFailed)
  )
  .add(
    HttpApiEndpoint.post("create")`/workspaces`
      .setPayload(CreateWorkspace)
      .addSuccess(Workspace, { status: 201 })
      .addError(WorkspaceOperationFailed)
  )

export const settingsGroup = HttpApiGroup.make("settings")
  .add(
    HttpApiEndpoint.get("get")`/settings`
      .addSuccess(DesktopSettings)
      .addError(SettingsPersistenceFailed)
  )
  .add(
    HttpApiEndpoint.patch("update")`/settings`
      .setPayload(UpdateDesktopSettings)
      .addSuccess(DesktopSettings)
      .addError(SettingsPersistenceFailed)
  )

/** The single source of truth for the wire contract: server handlers and the desktop client both derive from it. */
export const StarterApi = HttpApi.make("starter")
  .add(healthGroup)
  .add(notesGroup)
  .add(workspacesGroup)
  .add(settingsGroup)

export type StarterApi = typeof StarterApi
