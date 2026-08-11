import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

export const WORKSPACE_NAME_MAX_LENGTH = 80

export const WorkspaceId = Schema.NonEmptyTrimmedString.pipe(Schema.brand("WorkspaceId"))
export type WorkspaceId = typeof WorkspaceId.Type

export const WorkspaceName = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(WORKSPACE_NAME_MAX_LENGTH)
)
export const WorkspacePath = Schema.NonEmptyTrimmedString

export class Workspace extends Schema.Class<Workspace>("Workspace")({
  id: WorkspaceId,
  name: WorkspaceName,
  path: WorkspacePath,
  createdAt: Schema.DateTimeUtc
}) {}

export class CreateWorkspace extends Schema.Class<CreateWorkspace>("CreateWorkspace")({
  name: WorkspaceName,
  parentPath: WorkspacePath
}) {}

export class BrowseWorkspaceDirectory extends Schema.Class<BrowseWorkspaceDirectory>(
  "BrowseWorkspaceDirectory"
)({
  path: Schema.optional(WorkspacePath)
}) {}

export class WorkspaceDirectory extends Schema.Class<WorkspaceDirectory>(
  "WorkspaceDirectory"
)({
  name: Schema.NonEmptyTrimmedString,
  path: WorkspacePath
}) {}

export class WorkspaceDirectoryListing extends Schema.Class<WorkspaceDirectoryListing>(
  "WorkspaceDirectoryListing"
)({
  path: WorkspacePath,
  parentPath: Schema.NullOr(WorkspacePath),
  homePath: WorkspacePath,
  directories: Schema.Array(WorkspaceDirectory)
}) {}

export const WorkspaceOperation = Schema.Literal("browse", "create")

export class WorkspaceOperationFailed extends Schema.TaggedError<WorkspaceOperationFailed>()(
  "WorkspaceOperationFailed",
  {
    operation: WorkspaceOperation,
    path: Schema.String,
    reason: Schema.NonEmptyTrimmedString
  },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}
