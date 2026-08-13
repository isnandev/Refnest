import {
  FolderId,
  HexColor,
  InspirationReference,
  ReferenceDescription,
  ReferenceId,
  ReferenceKind,
  ReferenceMimeType,
  ReferenceSource,
  ReferenceSourceUrl,
  ReferenceTag,
  ReferenceTitle,
  WorkspaceId
} from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { join } from "node:path"
import { resolveContainedFile } from "../../persistence/path-policy"

export type ReferenceRow = {
  readonly id: string
  readonly workspace_id: string
  readonly workspace_path: string
  readonly folder_id: string | null
  readonly title: string
  readonly description: string
  readonly source_url: string
  readonly source: string
  readonly kind: string
  readonly asset_relative_path: string
  readonly preview_path: string | null
  readonly mime_type: string
  readonly width: number | null
  readonly height: number | null
  readonly duration_seconds: number | null
  readonly file_size_bytes: number
  readonly favorite: number
  readonly rating: number
  readonly status: string
  readonly tags_json: string
  readonly colors_json: string
  readonly created_at: string
  readonly updated_at: string
  readonly file_created_at: string | null
  readonly file_modified_at: string | null
  readonly last_viewed_at: string | null
}

export type CapturedReference = {
  readonly workspaceId: WorkspaceId
  readonly folderId: FolderId | null
  readonly title: string
  readonly description: string
  readonly sourceUrl: string
  readonly source: ReferenceSource
  readonly kind: ReferenceKind
  readonly assetPath: string
  readonly previewPath: string | null
  readonly mimeType: string
  readonly width: number | null
  readonly height: number | null
  readonly durationSeconds: number | null
  readonly fileSizeBytes: number
  readonly tags: ReadonlyArray<string>
  readonly colors: ReadonlyArray<string>
  /** ISO timestamps read off the source file, or null when there was no file. */
  readonly fileCreatedAt: string | null
  readonly fileModifiedAt: string | null
}

const CapturedReferenceCandidate = Schema.Struct({
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  title: ReferenceTitle,
  description: ReferenceDescription,
  sourceUrl: ReferenceSourceUrl,
  source: ReferenceSource,
  kind: ReferenceKind,
  assetPath: Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(32_767)),
  previewPath: Schema.NullOr(
    Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(32_767))
  ),
  mimeType: ReferenceMimeType,
  width: Schema.NullOr(Schema.Int.pipe(Schema.positive())),
  height: Schema.NullOr(Schema.Int.pipe(Schema.positive())),
  durationSeconds: Schema.NullOr(Schema.Number.pipe(Schema.nonNegative())),
  fileSizeBytes: Schema.Int.pipe(Schema.positive()),
  tags: Schema.Array(ReferenceTag).pipe(Schema.maxItems(64)),
  colors: Schema.Array(HexColor).pipe(Schema.maxItems(16)),
  fileCreatedAt: Schema.NullOr(Schema.NonEmptyTrimmedString),
  fileModifiedAt: Schema.NullOr(Schema.NonEmptyTrimmedString)
})

export type DecodedCapturedReference = typeof CapturedReferenceCandidate.Type

export const normalizeReferenceTags = (tags: ReadonlyArray<string>) => {
  const seen = new Set<string>()
  const normalized: Array<string> = []
  for (const tag of tags) {
    const trimmed = tag.trim()
    const key = trimmed.toLocaleLowerCase()
    if (trimmed.length > 0 && !seen.has(key)) {
      seen.add(key)
      normalized.push(trimmed)
    }
  }
  return normalized
}

export const normalizeReferenceColors = (colors: ReadonlyArray<string>) =>
  [...new Set(colors.map((color) => color.trim().toUpperCase()))]

export const decodeCapturedReference = (
  input: CapturedReference,
  assetPath: string,
  previewPath: string | null,
  fileSizeBytes: number
) =>
  Effect.gen(function* () {
    const sourceUrl = yield* Effect.try({
      try: () => new URL(input.sourceUrl.trim()).toString(),
      catch: () => new Error("The captured source URL is invalid.")
    })

    return yield* Schema.decodeUnknown(CapturedReferenceCandidate)({
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      sourceUrl,
      assetPath,
      previewPath,
      mimeType: input.mimeType.trim().toLocaleLowerCase(),
      fileSizeBytes,
      tags: normalizeReferenceTags(input.tags),
      colors: normalizeReferenceColors(input.colors)
    })
  })

const assetUrl = (
  workspaceId: WorkspaceId,
  referenceId: ReferenceId,
  variant: "asset" | "preview"
) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/references/${encodeURIComponent(referenceId)}/assets/${variant}`

export type StoredReference = InspirationReference & {
  readonly assetPath: string
  readonly previewPath: string | null
}

export const decodeStoredReference = (
  row: ReferenceRow,
  previewsRoot: string
): Effect.Effect<StoredReference, Error> =>
  Effect.gen(function* () {
    const asset = yield* Effect.try({
      try: () =>
        resolveContainedFile(
          row.workspace_path,
          join(row.workspace_path, ...row.asset_relative_path.split("/"))
        ),
      catch: () => new Error("The stored asset path is invalid or missing.")
    })
    const storedPreviewPath = row.preview_path
    const preview = storedPreviewPath === null
      ? null
      : yield* Effect.try({
          try: () => resolveContainedFile(previewsRoot, storedPreviewPath),
          catch: () => new Error("The stored preview path is invalid or missing.")
        })
    const id = ReferenceId.make(row.id)
    const workspaceId = WorkspaceId.make(row.workspace_id)
    const serializedCollections = yield* Effect.try({
      try: () => ({
        tags: JSON.parse(row.tags_json),
        colors: JSON.parse(row.colors_json)
      }),
      catch: () => new Error("The stored reference collections are invalid.")
    })
    const publicReference = yield* Schema.decodeUnknown(InspirationReference)({
      id,
      workspaceId,
      folderId: row.folder_id,
      title: row.title,
      description: row.description,
      sourceUrl: row.source_url,
      source: row.source,
      kind: row.kind,
      assetUrl: assetUrl(workspaceId, id, "asset"),
      previewUrl:
        preview === null ? null : assetUrl(workspaceId, id, "preview"),
      mimeType: row.mime_type,
      width: row.width,
      height: row.height,
      durationSeconds: row.duration_seconds,
      fileSizeBytes: row.file_size_bytes,
      favorite: row.favorite === 1,
      rating: row.rating,
      status: row.status,
      tags: serializedCollections.tags,
      colors: serializedCollections.colors,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fileCreatedAt: row.file_created_at,
      fileModifiedAt: row.file_modified_at,
      lastViewedAt: row.last_viewed_at
    }).pipe(
      Effect.mapError(() => new Error("The stored reference metadata is invalid."))
    )

    return Object.assign(publicReference, {
      assetPath: asset.path,
      previewPath: preview?.path ?? null
    })
  })

export const toPublicReference = (
  reference: StoredReference
): InspirationReference =>
  new InspirationReference({
    id: reference.id,
    workspaceId: reference.workspaceId,
    folderId: reference.folderId,
    title: reference.title,
    description: reference.description,
    sourceUrl: reference.sourceUrl,
    source: reference.source,
    kind: reference.kind,
    assetUrl: reference.assetUrl,
    previewUrl: reference.previewUrl,
    mimeType: reference.mimeType,
    width: reference.width,
    height: reference.height,
    durationSeconds: reference.durationSeconds,
    fileSizeBytes: reference.fileSizeBytes,
    favorite: reference.favorite,
    rating: reference.rating,
    status: reference.status,
    tags: reference.tags,
    colors: reference.colors,
    createdAt: reference.createdAt,
    updatedAt: reference.updatedAt,
    fileCreatedAt: reference.fileCreatedAt,
    fileModifiedAt: reference.fileModifiedAt,
    lastViewedAt: reference.lastViewedAt
  })
