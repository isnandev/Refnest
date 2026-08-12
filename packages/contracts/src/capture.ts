import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { FolderId, ReferenceId, RemoteReferenceSource } from "./library"
import { WorkspaceId } from "./workspace"

export const CAPTURE_URL_MAX_LENGTH = 8_192

export const CaptureJobId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("CaptureJobId")
)
export type CaptureJobId = typeof CaptureJobId.Type

export class CreateQuickSave extends Schema.Class<CreateQuickSave>(
  "CreateQuickSave"
)({
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  url: Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(CAPTURE_URL_MAX_LENGTH)),
  autoMetadata: Schema.optional(Schema.Boolean)
}) {}

export const CaptureJobStatus = Schema.Literal(
  "queued",
  "capturing",
  "enriching",
  "completed",
  "failed"
)
export type CaptureJobStatus = typeof CaptureJobStatus.Type

export class CaptureJob extends Schema.Class<CaptureJob>("CaptureJob")({
  id: CaptureJobId,
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  url: Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(CAPTURE_URL_MAX_LENGTH)),
  source: RemoteReferenceSource,
  status: CaptureJobStatus,
  autoMetadata: Schema.Boolean,
  referenceId: Schema.NullOr(ReferenceId),
  error: Schema.NullOr(Schema.NonEmptyTrimmedString),
  warning: Schema.NullOr(Schema.NonEmptyTrimmedString),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc
}) {}

export class ListCaptureJobs extends Schema.Class<ListCaptureJobs>("ListCaptureJobs")({
  workspaceId: WorkspaceId
}) {}

export class CaptureJobNotFound extends Schema.TaggedError<CaptureJobNotFound>()(
  "CaptureJobNotFound",
  { id: CaptureJobId },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class QuickSaveRejected extends Schema.TaggedError<QuickSaveRejected>()(
  "QuickSaveRejected",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}
