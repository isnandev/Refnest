import {
  FolderId,
  LibraryNotFound,
  LibraryOperationFailed,
  type ListReferences,
  ReferenceId,
  type ReferenceKind,
  type ReferenceSource,
  type ReferenceStatus,
  type SmartFolder,
  SmartFolderId,
  type UpdateInspirationReference,
  WorkspaceId
} from "@refnest/contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { basename, dirname, join } from "node:path"
import { renameSync } from "node:fs"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { AppPaths } from "../../persistence/app-paths"
import {
  prepareContainedPath,
  removeContainedFile,
  resolveContainedDirectory,
  resolveContainedFile
} from "../../persistence/path-policy"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { VideoThumbnailer } from "../converter/video-thumbnailer"
import { FolderService } from "../folders/folder-service"
import { matchesSmartFolder } from "../smart-folders/smart-folder-rules"
import { MAX_CAPTURE_OUTPUT_BYTES } from "../quick-save/capture-limits"
import {
  type CapturedReference,
  decodeCapturedReference,
  decodeStoredReference,
  normalizeReferenceColors,
  normalizeReferenceTags,
  type ReferenceRow,
  type StoredReference
} from "./reference-model"
import { sortReferences } from "./reference-sort"

export type { CapturedReference, StoredReference } from "./reference-model"

type SmartFolderRow = {
  readonly id: string
  readonly workspace_id: string
  readonly name: string
  readonly rule_kind: string
  readonly rule_value: string | null
  readonly within_days: number | null
  readonly built_in: number
  readonly created_at: string
  readonly updated_at: string
}

const operationFailure = (
  operation: "list" | "create" | "update" | "move" | "trash" | "read",
  reason: string
) => new LibraryOperationFailed({ operation, reason })

const samePath = (left: string, right: string) =>
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right

const matchesView = (
  reference: StoredReference,
  view: ListReferences["view"]
) => {
  switch (view ?? "all") {
    case "all":
      return reference.status === "active"
    case "uncategorized":
      return reference.status === "active" && reference.folderId === null
    case "untagged":
      return reference.status === "active" && reference.tags.length === 0
    case "recently-used":
      return reference.status === "active" && reference.lastViewedAt !== null
    case "favorites":
      return reference.status === "active" && reference.favorite
    case "trash":
      return reference.status === "trash"
  }
}

const smartFolderFromRow = (row: SmartFolderRow): SmartFolder => ({
  id: SmartFolderId.make(row.id),
  workspaceId: WorkspaceId.make(row.workspace_id),
  name: row.name,
  ruleKind: Schema.decodeUnknownSync(
    Schema.Literal(
      "recently-added",
      "recently-used",
      "favorites",
      "uncategorized",
      "untagged",
      "trash",
      "tag"
    )
  )(row.rule_kind),
  ruleValue: row.rule_value,
  withinDays: row.within_days,
  builtIn: row.built_in === 1,
  itemCount: 0,
  createdAt: decodeSqliteDateTime(row.created_at),
  updatedAt: decodeSqliteDateTime(row.updated_at)
})

export type ReferenceServiceShape = {
  readonly list: (
    input: ListReferences
  ) => Effect.Effect<
    ReadonlyArray<StoredReference>,
    LibraryNotFound | LibraryOperationFailed
  >
  readonly get: (
    id: ReferenceId
  ) => Effect.Effect<StoredReference, LibraryNotFound | LibraryOperationFailed>
  readonly peek: (
    id: ReferenceId
  ) => Effect.Effect<StoredReference, LibraryNotFound | LibraryOperationFailed>
  readonly peekScoped: (
    workspaceId: WorkspaceId,
    id: ReferenceId
  ) => Effect.Effect<StoredReference, LibraryNotFound | LibraryOperationFailed>
  readonly createCaptured: (
    input: CapturedReference
  ) => Effect.Effect<StoredReference, LibraryNotFound | LibraryOperationFailed>
  readonly update: (
    id: ReferenceId,
    input: UpdateInspirationReference
  ) => Effect.Effect<StoredReference, LibraryNotFound | LibraryOperationFailed>
  readonly updateScoped: (
    workspaceId: WorkspaceId,
    id: ReferenceId,
    input: UpdateInspirationReference
  ) => Effect.Effect<StoredReference, LibraryNotFound | LibraryOperationFailed>
  readonly remove: (
    id: ReferenceId
  ) => Effect.Effect<void, LibraryNotFound | LibraryOperationFailed>
  readonly removeScoped: (
    workspaceId: WorkspaceId,
    id: ReferenceId
  ) => Effect.Effect<void, LibraryNotFound | LibraryOperationFailed>
}

export class ReferenceService extends Context.Tag("ReferenceService")<
  ReferenceService,
  ReferenceServiceShape
>() {}

const makeReferenceService = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const folders = yield* FolderService
  const appPaths = yield* AppPaths
  const videoThumbnails = yield* VideoThumbnailer

  const referenceColumns = `
    r.id,
    r.workspace_id,
    w.path AS workspace_path,
    r.folder_id,
    r.title,
    r.description,
    r.source_url,
    r.source,
    r.kind,
    r.asset_relative_path,
    r.preview_path,
    r.mime_type,
    r.width,
    r.height,
    r.duration_seconds,
    r.file_size_bytes,
    r.favorite,
    r.rating,
    r.status,
    r.tags_json,
    r.colors_json,
    r.created_at,
    r.updated_at,
    r.file_created_at,
    r.file_modified_at,
    r.last_viewed_at
  `
  const selectByWorkspace = connection.query<ReferenceRow, [WorkspaceId]>(`
    SELECT ${referenceColumns}
    FROM inspiration_references r
    INNER JOIN workspaces w ON w.id = r.workspace_id
    WHERE r.workspace_id = ?
    ORDER BY r.created_at DESC
  `)
  const selectById = connection.query<ReferenceRow, [ReferenceId]>(`
    SELECT ${referenceColumns}
    FROM inspiration_references r
    INNER JOIN workspaces w ON w.id = r.workspace_id
    WHERE r.id = ?
  `)
  const selectSmartFolder = connection.query<SmartFolderRow, [SmartFolderId]>(`
    SELECT id, workspace_id, name, rule_kind, rule_value, within_days, built_in,
      created_at, updated_at
    FROM smart_folders
    WHERE id = ?
  `)
  const touchReference = connection.query<never, [string, string, ReferenceId]>(`
    UPDATE inspiration_references
    SET last_viewed_at = ?, updated_at = ?
    WHERE id = ?
  `)
  const insertReference = connection.query<
    never,
    [
      ReferenceId,
      WorkspaceId,
      FolderId | null,
      string,
      string,
      string,
      ReferenceSource,
      ReferenceKind,
      string,
      string | null,
      string,
      number | null,
      number | null,
      number | null,
      number,
      string,
      string,
      string,
      string,
      string | null,
      string | null
    ]
  >(`
    INSERT INTO inspiration_references (
      id, workspace_id, folder_id, title, description, source_url, source, kind,
      asset_relative_path, preview_path, mime_type, width, height, duration_seconds,
      file_size_bytes, tags_json, colors_json, created_at, updated_at,
      file_created_at, file_modified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateReference = connection.query<
    never,
    [
      FolderId | null,
      string,
      string,
      string,
      number,
      number,
      ReferenceStatus,
      string,
      string,
      string,
      string,
      ReferenceId
    ]
  >(`
    UPDATE inspiration_references
    SET folder_id = ?, title = ?, description = ?, source_url = ?, favorite = ?,
      rating = ?, status = ?, tags_json = ?, colors_json = ?,
      asset_relative_path = ?, updated_at = ?
    WHERE id = ?
  `)
  const deleteReference = connection.query<never, [ReferenceId]>(`
    DELETE FROM inspiration_references WHERE id = ?
  `)

  const decodeRow = (row: ReferenceRow) =>
    decodeStoredReference(row).pipe(
      Effect.mapError(() =>
        operationFailure("read", "The stored reference metadata is invalid.")
      )
    )

  const loadRow = Effect.fn("ReferenceService.loadRow")(function* (
    id: ReferenceId
  ) {
    const row = yield* Effect.try({
      try: () => selectById.get(id),
      catch: () => operationFailure("read", "The reference could not be loaded.")
    })

    if (row === null) {
      return yield* new LibraryNotFound({ resource: "reference", id })
    }

    return row
  })

  const peek = Effect.fn("ReferenceService.peek")(function* (id: ReferenceId) {
    const row = yield* loadRow(id)
    return yield* decodeRow(row)
  })

  const peekScoped = Effect.fn("ReferenceService.peekScoped")(function* (
    workspaceId: WorkspaceId,
    id: ReferenceId
  ) {
    const reference = yield* peek(id)
    if (reference.workspaceId !== workspaceId) {
      return yield* new LibraryNotFound({ resource: "reference", id })
    }
    return reference
  })

  const get = Effect.fn("ReferenceService.get")(function* (id: ReferenceId) {
    yield* loadRow(id)
    const now = new Date().toISOString()
    yield* Effect.try({
      try: () => touchReference.run(now, now, id),
      catch: () => operationFailure("read", "The reference access time could not be saved.")
    })
    return yield* peek(id)
  })

  const list = Effect.fn("ReferenceService.list")(function* (
    input: ListReferences
  ) {
    yield* folders.resolveDestination(input.workspaceId, null)
    const rows = yield* Effect.try({
      try: () => selectByWorkspace.all(input.workspaceId),
      catch: () => operationFailure("list", "References could not be loaded.")
    })
    const references = yield* Effect.forEach(rows, decodeRow).pipe(
      Effect.mapError(() =>
        operationFailure("list", "Stored reference metadata is invalid.")
      )
    )

    let folderIds: ReadonlySet<FolderId> | null = null
    if (input.folderId !== undefined) {
      const selectedFolder = yield* folders.get(input.folderId)
      if (selectedFolder.workspaceId !== input.workspaceId) {
        return yield* operationFailure(
          "list",
          "The selected folder belongs to a different workspace."
        )
      }

      if (input.includeSubfolders ?? true) {
        const workspaceFolders = yield* folders.list(input.workspaceId)
        folderIds = new Set(
          workspaceFolders
            .filter(
              (folder) =>
                folder.id === input.folderId ||
                folder.relativePath.startsWith(`${selectedFolder.relativePath}/`)
            )
            .map((folder) => folder.id)
        )
      } else {
        folderIds = new Set([input.folderId])
      }
    }

    let smartFolder: SmartFolder | null = null
    if (input.smartFolderId !== undefined) {
      const smartFolderId = input.smartFolderId
      const row = yield* Effect.try({
        try: () => selectSmartFolder.get(smartFolderId),
        catch: () => operationFailure("list", "The smart folder could not be loaded.")
      })
      if (row === null) {
        return yield* new LibraryNotFound({
          resource: "smart-folder",
          id: smartFolderId
        })
      }
      if (row.workspace_id !== input.workspaceId) {
        return yield* new LibraryNotFound({
          resource: "smart-folder",
          id: smartFolderId
        })
      }
      smartFolder = yield* Effect.try({
        try: () => smartFolderFromRow(row),
        catch: () =>
          operationFailure("list", "Stored smart folder metadata is invalid.")
      })
    }

    const query = input.query?.trim().toLocaleLowerCase() ?? ""

    const matched = references.filter((reference) => {
      const folderMatches =
        folderIds === null ||
        (reference.folderId !== null && folderIds.has(reference.folderId))
      const smartFolderMatches =
        smartFolder === null
          ? matchesView(reference, input.view)
          : matchesSmartFolder(reference, smartFolder)
      const queryMatches =
        query.length === 0 ||
        reference.title.toLocaleLowerCase().includes(query) ||
        reference.description.toLocaleLowerCase().includes(query) ||
        reference.sourceUrl.toLocaleLowerCase().includes(query) ||
        reference.mimeType.toLocaleLowerCase().includes(query) ||
        reference.kind.toLocaleLowerCase().includes(query) ||
        reference.tags.some((tag) => tag.toLocaleLowerCase().includes(query)) ||
        reference.colors.some((color) => color.toLocaleLowerCase().includes(query))

      return folderMatches && smartFolderMatches && queryMatches
    })

    return sortReferences(matched, input.sort, input.direction)
  })

  const createCaptured = Effect.fn("ReferenceService.createCaptured")(function* (
    input: CapturedReference
  ) {
    const workspaceDestination = yield* folders.resolveDestination(
      input.workspaceId,
      null
    )
    const now = new Date().toISOString()
    const id = ReferenceId.make(`reference_${crypto.randomUUID()}`)
    let ownedPreviewPath = input.previewPath
    const cleanup = Effect.sync(() => {
      try {
        deleteReference.run(id)
      } catch {
        // The insert may not have happened, or SQLite may already be closed.
      }
      try {
        removeContainedFile(workspaceDestination.workspace.path, input.assetPath)
      } catch {
        // Never broaden cleanup when the candidate itself is not contained.
      }
      if (ownedPreviewPath !== null) {
        try {
          removeContainedFile(appPaths.previewsDirectory, ownedPreviewPath)
        } catch {
          // Never broaden cleanup when the candidate itself is not contained.
        }
      }
    })

    const persist = Effect.gen(function* () {
      const destination = yield* folders.resolveDestination(
        input.workspaceId,
        input.folderId
      )
      const files = yield* Effect.try({
        try: () => ({
          asset: resolveContainedFile(
            workspaceDestination.workspace.path,
            input.assetPath
          ),
          preview:
            input.previewPath === null
              ? null
              : resolveContainedFile(
                  appPaths.previewsDirectory,
                  input.previewPath
                )
        }),
        catch: () =>
          operationFailure(
            "create",
            "Captured artifact paths are invalid, missing, or outside their storage roots."
          )
      })
      if (!samePath(dirname(files.asset.path), destination.absolutePath)) {
        return yield* operationFailure(
          "create",
          "The captured asset is not inside the selected library folder."
        )
      }
      if (
        files.asset.size !== input.fileSizeBytes ||
        files.asset.size > MAX_CAPTURE_OUTPUT_BYTES ||
        (files.preview !== null && files.preview.size > MAX_CAPTURE_OUTPUT_BYTES)
      ) {
        return yield* operationFailure(
          "create",
          "Captured artifact sizes are invalid or exceed the output limit."
        )
      }

      const candidate = yield* decodeCapturedReference(
        input,
        files.asset.path,
        files.preview?.path ?? null,
        files.asset.size
      ).pipe(
        Effect.mapError(() =>
          operationFailure(
            "create",
            "Captured reference metadata did not match the required boundary."
          )
        )
      )

      if (candidate.kind === "video" && candidate.previewPath === null) {
        const generated = yield* videoThumbnails
          .generate(files.asset.path, id)
          .pipe(Effect.either)
        if (generated._tag === "Right") {
          ownedPreviewPath = generated.right
        }
      }

      const decoded =
        ownedPreviewPath === candidate.previewPath
          ? candidate
          : yield* decodeCapturedReference(
              input,
              files.asset.path,
              ownedPreviewPath,
              files.asset.size
            ).pipe(
              Effect.mapError(() =>
                operationFailure(
                  "create",
                  "The generated video thumbnail did not match the required boundary."
                )
              )
            )

      yield* Effect.try({
        try: () =>
          insertReference.run(
            id,
            decoded.workspaceId,
            decoded.folderId,
            decoded.title,
            decoded.description,
            decoded.sourceUrl,
            decoded.source,
            decoded.kind,
            files.asset.relativePath,
            decoded.previewPath,
            decoded.mimeType,
            decoded.width,
            decoded.height,
            decoded.durationSeconds,
            decoded.fileSizeBytes,
            JSON.stringify(decoded.tags),
            JSON.stringify(decoded.colors),
            now,
            now,
            decoded.fileCreatedAt,
            decoded.fileModifiedAt
          ),
        catch: () =>
          operationFailure("create", "The captured reference could not be saved.")
      })

      return yield* peek(id)
    })

    return yield* persist.pipe(Effect.onError(() => cleanup))
  })

  const update = Effect.fn("ReferenceService.update")(function* (
    id: ReferenceId,
    input: UpdateInspirationReference
  ) {
    const row = yield* loadRow(id)
    const current = yield* decodeRow(row)
    const nextFolderId =
      input.folderId === undefined ? current.folderId : input.folderId
    let nextAssetRelativePath = row.asset_relative_path
    let movedFrom: string | null = null
    let movedTo: string | null = null

    if (nextFolderId !== current.folderId) {
      const destination = yield* folders.resolveDestination(
        current.workspaceId,
        nextFolderId
      )
      nextAssetRelativePath =
        destination.relativePath.length === 0
          ? basename(row.asset_relative_path)
          : `${destination.relativePath}/${basename(row.asset_relative_path)}`
      const sourcePath = current.assetPath
      const destinationPath = join(
        destination.absolutePath,
        basename(row.asset_relative_path)
      )
      movedFrom = sourcePath
      movedTo = destinationPath

      yield* Effect.try({
        try: () => {
          const source = resolveContainedFile(
            destination.workspace.path,
            sourcePath
          )
          const target = prepareContainedPath(
            destination.workspace.path,
            destinationPath
          )
          renameSync(source.path, target.path)
        },
        catch: () =>
          operationFailure(
            "move",
            "The reference file could not be moved to the selected folder."
          )
      })
    }

    const now = new Date().toISOString()
    const tags = input.tags ?? current.tags
    const colors = input.colors ?? current.colors

    const saved = yield* Effect.try({
      try: () => {
        updateReference.run(
          nextFolderId,
          input.title ?? current.title,
          input.description ?? current.description,
          input.sourceUrl ?? current.sourceUrl,
          input.favorite === undefined ? (current.favorite ? 1 : 0) : input.favorite ? 1 : 0,
          input.rating ?? current.rating,
          input.status ?? current.status,
          JSON.stringify(normalizeReferenceTags(tags)),
          JSON.stringify(normalizeReferenceColors(colors)),
          nextAssetRelativePath,
          now,
          id
        )
        return true
      },
      catch: () => operationFailure("update", "The reference metadata could not be saved.")
    }).pipe(Effect.either)

    if (saved._tag === "Left") {
      if (movedFrom !== null && movedTo !== null) {
        const rollbackFrom = movedTo
        const rollbackTo = movedFrom
        yield* Effect.try({
          try: () => {
            const workspace = resolveContainedDirectory(
              row.workspace_path,
              row.workspace_path
            )
            const source = resolveContainedFile(workspace.path, rollbackFrom)
            const target = prepareContainedPath(workspace.path, rollbackTo)
            renameSync(source.path, target.path)
          },
          catch: () =>
            operationFailure(
              "move",
              "The file move could not be rolled back after a database failure."
            )
        })
      }
      return yield* saved.left
    }

    return yield* peek(id)
  })

  const remove = Effect.fn("ReferenceService.remove")(function* (id: ReferenceId) {
    yield* update(id, { status: "trash" })
  })

  const updateScoped = Effect.fn("ReferenceService.updateScoped")(function* (
    workspaceId: WorkspaceId,
    id: ReferenceId,
    input: UpdateInspirationReference
  ) {
    yield* peekScoped(workspaceId, id)
    return yield* update(id, input)
  })

  const removeScoped = Effect.fn("ReferenceService.removeScoped")(function* (
    workspaceId: WorkspaceId,
    id: ReferenceId
  ) {
    yield* peekScoped(workspaceId, id)
    return yield* remove(id)
  })

  return ReferenceService.of({
    list,
    get,
    peek,
    peekScoped,
    createCaptured,
    update,
    updateScoped,
    remove,
    removeScoped
  })
})

export const ReferenceServiceLive = Layer.effect(
  ReferenceService,
  makeReferenceService
)
