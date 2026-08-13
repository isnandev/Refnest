import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { WorkspaceId } from "./workspace"

export const FOLDER_NAME_MAX_LENGTH = 120
export const REFERENCE_TITLE_MAX_LENGTH = 200
export const REFERENCE_DESCRIPTION_MAX_LENGTH = 4_000
export const REFERENCE_TAG_MAX_LENGTH = 60
export const REFERENCE_SOURCE_URL_MAX_LENGTH = 8_192
export const REFERENCE_MIME_TYPE_MAX_LENGTH = 255
export const REFERENCE_IMPORT_PATH_MAX_LENGTH = 32_767

export const FolderId = Schema.NonEmptyTrimmedString.pipe(Schema.brand("FolderId"))
export type FolderId = typeof FolderId.Type

export const ReferenceId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("ReferenceId")
)
export type ReferenceId = typeof ReferenceId.Type

export const SmartFolderId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("SmartFolderId")
)
export type SmartFolderId = typeof SmartFolderId.Type

export const FolderName = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(FOLDER_NAME_MAX_LENGTH)
)
export const ReferenceTitle = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(REFERENCE_TITLE_MAX_LENGTH)
)
export const ReferenceDescription = Schema.String.pipe(
  Schema.maxLength(REFERENCE_DESCRIPTION_MAX_LENGTH)
)
export const ReferenceSourceUrl = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(REFERENCE_SOURCE_URL_MAX_LENGTH),
  Schema.filter((value) => {
    try {
      const url = new URL(value)
      return url.protocol === "http:" || url.protocol === "https:"
        ? true
        : "a reference source URL must use HTTP or HTTPS"
    } catch {
      return "a reference source URL must be valid"
    }
  })
)
export const ReferenceMimeType = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(REFERENCE_MIME_TYPE_MAX_LENGTH),
  Schema.pattern(
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i,
    { message: () => "a MIME type must contain a valid type and subtype" }
  )
)
export const ReferenceTag = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(REFERENCE_TAG_MAX_LENGTH)
)
export type ReferenceTag = typeof ReferenceTag.Type
export const HexColor = Schema.String.pipe(
  Schema.pattern(/^#[0-9a-f]{6}$/i, {
    message: () => "a color must use six-digit hexadecimal notation"
  })
)
export type HexColor = typeof HexColor.Type

export const ReferenceKind = Schema.Literal(
  "web-capture",
  "image",
  "video",
  "pdf"
)
export type ReferenceKind = typeof ReferenceKind.Type

export const RemoteReferenceSource = Schema.Literal(
  "website",
  "youtube",
  "instagram",
  "x",
  "pinterest",
  "dribbble"
)
export type RemoteReferenceSource = typeof RemoteReferenceSource.Type

export const ReferenceSource = Schema.Union(
  RemoteReferenceSource,
  Schema.Literal("local-file")
)
export type ReferenceSource = typeof ReferenceSource.Type

export const ReferenceStatus = Schema.Literal("active", "trash")
export type ReferenceStatus = typeof ReferenceStatus.Type

export const REFERENCE_RATING_MAX = 5

/** Zero is "unrated" rather than a bad rating, so clearing a star is possible. */
export const ReferenceRating = Schema.Int.pipe(
  Schema.between(0, REFERENCE_RATING_MAX)
)
export type ReferenceRating = typeof ReferenceRating.Type

export const ReferenceSortField = Schema.Literal(
  "date-added",
  "date-modified",
  "date-created",
  "name",
  "size",
  "rating"
)
export type ReferenceSortField = typeof ReferenceSortField.Type

export const ReferenceSortDirection = Schema.Literal("asc", "desc")
export type ReferenceSortDirection = typeof ReferenceSortDirection.Type

export const ReferenceView = Schema.Literal(
  "all",
  "uncategorized",
  "untagged",
  "recently-used",
  "favorites",
  "trash"
)
export type ReferenceView = typeof ReferenceView.Type

export class LibraryFolder extends Schema.Class<LibraryFolder>("LibraryFolder")({
  id: FolderId,
  workspaceId: WorkspaceId,
  parentId: Schema.NullOr(FolderId),
  name: FolderName,
  relativePath: Schema.String,
  directItemCount: Schema.Int.pipe(Schema.nonNegative()),
  itemCount: Schema.Int.pipe(Schema.nonNegative()),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc
}) {}

export class CreateLibraryFolder extends Schema.Class<CreateLibraryFolder>(
  "CreateLibraryFolder"
)({
  workspaceId: WorkspaceId,
  parentId: Schema.NullOr(FolderId),
  name: FolderName
}) {}

export class UpdateLibraryFolder extends Schema.Class<UpdateLibraryFolder>(
  "UpdateLibraryFolder"
)({
  name: Schema.optional(FolderName),
  parentId: Schema.optional(Schema.NullOr(FolderId))
}) {}

export class ListLibraryFolders extends Schema.Class<ListLibraryFolders>(
  "ListLibraryFolders"
)({
  workspaceId: WorkspaceId
}) {}

export class InspirationReference extends Schema.Class<InspirationReference>(
  "InspirationReference"
)({
  id: ReferenceId,
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  title: ReferenceTitle,
  description: ReferenceDescription,
  sourceUrl: ReferenceSourceUrl,
  source: ReferenceSource,
  kind: ReferenceKind,
  assetUrl: Schema.NonEmptyTrimmedString,
  previewUrl: Schema.NullOr(Schema.NonEmptyTrimmedString),
  mimeType: ReferenceMimeType,
  width: Schema.NullOr(Schema.Int.pipe(Schema.positive())),
  height: Schema.NullOr(Schema.Int.pipe(Schema.positive())),
  durationSeconds: Schema.NullOr(Schema.Number.pipe(Schema.nonNegative())),
  fileSizeBytes: Schema.Int.pipe(Schema.nonNegative()),
  favorite: Schema.Boolean,
  rating: ReferenceRating,
  status: ReferenceStatus,
  tags: Schema.Array(ReferenceTag),
  colors: Schema.Array(HexColor),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  /**
   * The source file's own timestamps, kept apart from `createdAt`, which is
   * when this library first saw it. Null when the reference never was a file
   * on this machine — a web capture has no birth time to report.
   */
  fileCreatedAt: Schema.NullOr(Schema.DateTimeUtc),
  fileModifiedAt: Schema.NullOr(Schema.DateTimeUtc),
  lastViewedAt: Schema.NullOr(Schema.DateTimeUtc)
}) {}

export class ImportLocalReference extends Schema.Class<ImportLocalReference>(
  "ImportLocalReference"
)({
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  path: Schema.NonEmptyTrimmedString.pipe(
    Schema.maxLength(REFERENCE_IMPORT_PATH_MAX_LENGTH)
  )
}) {}

/**
 * The decoded ceiling for pasted content, well above any clipboard image and
 * far below what the desktop's IPC hop should be asked to carry — base64 adds a
 * third on top of this. Anything larger belongs to the path-based import, which
 * never puts the bytes on the wire at all.
 */
export const REFERENCE_PASTE_MAX_BYTES = 32 * 1_024 * 1_024

/**
 * The clipboard holds content, not a path, so a pasted image arrives as bytes.
 * Everything else about it — what it is, whether it is safe to keep — is read
 * from those bytes by the sidecar rather than taken from the caller.
 */
export class ImportPastedReference extends Schema.Class<ImportPastedReference>(
  "ImportPastedReference"
)({
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  /** What the clipboard called the content, when it named it at all. */
  name: Schema.optional(
    Schema.NonEmptyTrimmedString.pipe(
      Schema.maxLength(REFERENCE_TITLE_MAX_LENGTH)
    )
  ),
  bytes: Schema.Uint8ArrayFromBase64.pipe(
    Schema.filter((value) =>
      value.byteLength === 0
        ? "pasted content cannot be empty"
        : value.byteLength > REFERENCE_PASTE_MAX_BYTES
          ? `pasted content can be at most ${REFERENCE_PASTE_MAX_BYTES} bytes`
          : true
    )
  )
}) {}

export class ListReferences extends Schema.Class<ListReferences>("ListReferences")({
  workspaceId: WorkspaceId,
  folderId: Schema.optional(FolderId),
  smartFolderId: Schema.optional(SmartFolderId),
  view: Schema.optional(ReferenceView),
  query: Schema.optional(Schema.String),
  includeSubfolders: Schema.optional(Schema.BooleanFromString),
  sort: Schema.optional(ReferenceSortField),
  direction: Schema.optional(ReferenceSortDirection)
}) {}

export class UpdateInspirationReference extends Schema.Class<UpdateInspirationReference>(
  "UpdateInspirationReference"
)({
  folderId: Schema.optional(Schema.NullOr(FolderId)),
  title: Schema.optional(ReferenceTitle),
  description: Schema.optional(ReferenceDescription),
  sourceUrl: Schema.optional(ReferenceSourceUrl),
  favorite: Schema.optional(Schema.Boolean),
  rating: Schema.optional(ReferenceRating),
  status: Schema.optional(ReferenceStatus),
  tags: Schema.optional(Schema.Array(ReferenceTag)),
  colors: Schema.optional(Schema.Array(HexColor))
}) {}

/**
 * Host-only: the destination is an absolute path on the machine running the
 * sidecar, so it can only mean something to a caller sitting at it.
 */
export class ExportReference extends Schema.Class<ExportReference>(
  "ExportReference"
)({
  destinationPath: Schema.NonEmptyTrimmedString.pipe(
    Schema.maxLength(REFERENCE_IMPORT_PATH_MAX_LENGTH)
  )
}) {}

export class ExportedReference extends Schema.Class<ExportedReference>(
  "ExportedReference"
)({
  path: Schema.NonEmptyTrimmedString,
  fileSizeBytes: Schema.Int.pipe(Schema.nonNegative())
}) {}

export const SmartFolderRuleKind = Schema.Literal(
  "recently-added",
  "recently-used",
  "favorites",
  "uncategorized",
  "untagged",
  "trash",
  "tag"
)
export type SmartFolderRuleKind = typeof SmartFolderRuleKind.Type

export class SmartFolder extends Schema.Class<SmartFolder>("SmartFolder")({
  id: SmartFolderId,
  workspaceId: WorkspaceId,
  name: FolderName,
  ruleKind: SmartFolderRuleKind,
  ruleValue: Schema.NullOr(ReferenceTag),
  withinDays: Schema.NullOr(Schema.Int.pipe(Schema.between(1, 3_650))),
  builtIn: Schema.Boolean,
  itemCount: Schema.Int.pipe(Schema.nonNegative()),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc
}) {}

export class ListSmartFolders extends Schema.Class<ListSmartFolders>(
  "ListSmartFolders"
)({
  workspaceId: WorkspaceId
}) {}

export class CreateSmartFolder extends Schema.Class<CreateSmartFolder>(
  "CreateSmartFolder"
)({
  workspaceId: WorkspaceId,
  name: FolderName,
  ruleKind: SmartFolderRuleKind,
  ruleValue: Schema.NullOr(ReferenceTag),
  withinDays: Schema.NullOr(Schema.Int.pipe(Schema.between(1, 3_650)))
}) {}

export class UpdateSmartFolder extends Schema.Class<UpdateSmartFolder>(
  "UpdateSmartFolder"
)({
  name: Schema.optional(FolderName),
  ruleKind: Schema.optional(SmartFolderRuleKind),
  ruleValue: Schema.optional(Schema.NullOr(ReferenceTag)),
  withinDays: Schema.optional(
    Schema.NullOr(Schema.Int.pipe(Schema.between(1, 3_650)))
  )
}) {}

export const LibraryResource = Schema.Literal(
  "workspace",
  "folder",
  "reference",
  "smart-folder"
)

export class LibraryNotFound extends Schema.TaggedError<LibraryNotFound>()(
  "LibraryNotFound",
  {
    resource: LibraryResource,
    id: Schema.NonEmptyTrimmedString
  },
  HttpApiSchema.annotations({ status: 404 })
) {
  override get message(): string {
    return `${this.resource} ${this.id} was not found`
  }
}

export const LibraryOperation = Schema.Literal(
  "list",
  "create",
  "update",
  "move",
  "trash",
  "delete",
  "read"
)

export class LibraryOperationFailed extends Schema.TaggedError<LibraryOperationFailed>()(
  "LibraryOperationFailed",
  {
    operation: LibraryOperation,
    reason: Schema.NonEmptyTrimmedString
  },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}
