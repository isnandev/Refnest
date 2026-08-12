import {
  type CreateLibraryFolder,
  FolderId,
  LibraryFolder,
  LibraryNotFound,
  LibraryOperationFailed,
  type UpdateLibraryFolder,
  type Workspace,
  WorkspaceId
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { mkdirSync, renameSync, rmdirSync } from "node:fs"
import { join as joinPath } from "node:path"
import { posix } from "node:path"
import {
  prepareContainedPath,
  resolveContainedDirectory,
  resolveContainedFile
} from "../../persistence/path-policy"
import { AppPaths } from "../../persistence/app-paths"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { WorkspaceRepository } from "../workspaces/workspace-repository"

const INVALID_FOLDER_NAME = /[<>:"/\\|?*\u0000-\u001f]/

type FolderRow = {
  readonly id: string
  readonly workspace_id: string
  readonly parent_id: string | null
  readonly name: string
  readonly relative_path: string
  readonly created_at: string
  readonly updated_at: string
}

type ReferenceFolderRow = {
  readonly folder_id: string | null
}

type ReferencePathRow = {
  readonly id: string
  readonly asset_relative_path: string
  readonly preview_path: string | null
}

export type FolderDestination = {
  readonly workspace: Workspace
  readonly folder: LibraryFolder | null
  readonly relativePath: string
  readonly absolutePath: string
}

const operationFailure = (
  operation: "list" | "create" | "update" | "move" | "delete",
  reason: string
) => new LibraryOperationFailed({ operation, reason })

const isFolderName = (name: string) =>
  name !== "." &&
  name !== ".." &&
  !INVALID_FOLDER_NAME.test(name) &&
  !/[. ]$/.test(name)

const toAbsolutePath = (workspacePath: string, relativePath: string) =>
  relativePath.length === 0
    ? workspacePath
    : joinPath(workspacePath, ...relativePath.split("/"))

const toFolder = (
  row: FolderRow,
  directItemCount: number,
  itemCount: number
) =>
  new LibraryFolder({
    id: FolderId.make(row.id),
    workspaceId: WorkspaceId.make(row.workspace_id),
    parentId: row.parent_id === null ? null : FolderId.make(row.parent_id),
    name: row.name,
    relativePath: row.relative_path,
    directItemCount,
    itemCount,
    createdAt: decodeSqliteDateTime(row.created_at),
    updatedAt: decodeSqliteDateTime(row.updated_at)
  })

export type FolderServiceShape = {
  readonly list: (
    workspaceId: WorkspaceId
  ) => Effect.Effect<
    ReadonlyArray<LibraryFolder>,
    LibraryNotFound | LibraryOperationFailed
  >
  readonly get: (
    id: FolderId
  ) => Effect.Effect<LibraryFolder, LibraryNotFound | LibraryOperationFailed>
  readonly getScoped: (
    workspaceId: WorkspaceId,
    id: FolderId
  ) => Effect.Effect<LibraryFolder, LibraryNotFound | LibraryOperationFailed>
  readonly create: (
    input: CreateLibraryFolder
  ) => Effect.Effect<LibraryFolder, LibraryNotFound | LibraryOperationFailed>
  readonly update: (
    id: FolderId,
    input: UpdateLibraryFolder
  ) => Effect.Effect<LibraryFolder, LibraryNotFound | LibraryOperationFailed>
  readonly updateScoped: (
    workspaceId: WorkspaceId,
    id: FolderId,
    input: UpdateLibraryFolder
  ) => Effect.Effect<LibraryFolder, LibraryNotFound | LibraryOperationFailed>
  readonly remove: (
    id: FolderId
  ) => Effect.Effect<void, LibraryNotFound | LibraryOperationFailed>
  readonly removeScoped: (
    workspaceId: WorkspaceId,
    id: FolderId
  ) => Effect.Effect<void, LibraryNotFound | LibraryOperationFailed>
  readonly resolveDestination: (
    workspaceId: WorkspaceId,
    folderId: FolderId | null
  ) => Effect.Effect<FolderDestination, LibraryNotFound | LibraryOperationFailed>
}

export class FolderService extends Context.Tag("FolderService")<
  FolderService,
  FolderServiceShape
>() {}

const makeFolderService = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const workspaces = yield* WorkspaceRepository
  const appPaths = yield* AppPaths

  const selectById = connection.query<FolderRow, [FolderId]>(`
    SELECT id, workspace_id, parent_id, name, relative_path, created_at, updated_at
    FROM library_folders
    WHERE id = ?
  `)
  const selectByWorkspace = connection.query<FolderRow, [WorkspaceId]>(`
    SELECT id, workspace_id, parent_id, name, relative_path, created_at, updated_at
    FROM library_folders
    WHERE workspace_id = ?
    ORDER BY relative_path COLLATE NOCASE ASC
  `)
  const selectReferenceFolders = connection.query<ReferenceFolderRow, [WorkspaceId]>(`
    SELECT folder_id
    FROM inspiration_references
    WHERE workspace_id = ? AND status = 'active'
  `)
  const selectReferencePaths = connection.query<ReferencePathRow, [WorkspaceId]>(`
    SELECT id, asset_relative_path, preview_path
    FROM inspiration_references
    WHERE workspace_id = ?
  `)
  const insertFolder = connection.query<
    never,
    [FolderId, WorkspaceId, FolderId | null, string, string, string, string]
  >(`
    INSERT INTO library_folders (
      id, workspace_id, parent_id, name, relative_path, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const updateFolder = connection.query<
    never,
    [FolderId | null, string, string, string, FolderId]
  >(`
    UPDATE library_folders
    SET parent_id = ?, name = ?, relative_path = ?, updated_at = ?
    WHERE id = ?
  `)
  const updateFolderPath = connection.query<never, [string, string, FolderId]>(`
    UPDATE library_folders
    SET relative_path = ?, updated_at = ?
    WHERE id = ?
  `)
  const updateReferencePath = connection.query<never, [string, string, string]>(`
    UPDATE inspiration_references
    SET asset_relative_path = ?, updated_at = ?
    WHERE id = ?
  `)
  const deleteFolder = connection.query<never, [FolderId]>(`
    DELETE FROM library_folders WHERE id = ?
  `)
  const countChildren = connection.query<{ readonly count: number }, [FolderId]>(`
    SELECT COUNT(*) AS count FROM library_folders WHERE parent_id = ?
  `)
  const countReferences = connection.query<{ readonly count: number }, [FolderId]>(`
    SELECT COUNT(*) AS count FROM inspiration_references WHERE folder_id = ?
  `)

  const getWorkspace = (
    workspaceId: WorkspaceId,
    operation: "list" | "create" | "update" | "move" | "delete"
  ) =>
    workspaces.get(workspaceId).pipe(
      Effect.mapError((error) =>
        error._tag === "WorkspaceOperationFailed"
          ? operationFailure(operation, error.reason)
          : error
      )
    )

  const rowsForWorkspace = (workspaceId: WorkspaceId) =>
    Effect.try({
      try: () => selectByWorkspace.all(workspaceId),
      catch: () => operationFailure("list", "Folders could not be loaded.")
    })

  const list = Effect.fn("FolderService.list")(function* (
    workspaceId: WorkspaceId
  ) {
    yield* getWorkspace(workspaceId, "list")
    const rows = yield* rowsForWorkspace(workspaceId)
    const references = yield* Effect.try({
      try: () => selectReferenceFolders.all(workspaceId),
      catch: () => operationFailure("list", "Folder reference counts could not be loaded.")
    })
    const rowById = new Map(rows.map((row) => [row.id, row]))

    return yield* Effect.try({
      try: () =>
        rows.map((row) => {
          let directItemCount = 0
          let itemCount = 0

          for (const reference of references) {
            if (reference.folder_id === row.id) {
              directItemCount += 1
              itemCount += 1
              continue
            }

            if (reference.folder_id !== null) {
              const referenceFolder = rowById.get(reference.folder_id)
              if (
                referenceFolder?.relative_path.startsWith(`${row.relative_path}/`)
              ) {
                itemCount += 1
              }
            }
          }

          return toFolder(row, directItemCount, itemCount)
        }),
      catch: () => operationFailure("list", "Stored folder metadata is invalid.")
    })
  })

  const getRow = Effect.fn("FolderService.getRow")(function* (id: FolderId) {
    const row = yield* Effect.try({
      try: () => selectById.get(id),
      catch: () => operationFailure("list", "The folder could not be loaded.")
    })

    if (row === null) {
      return yield* new LibraryNotFound({ resource: "folder", id })
    }

    return row
  })

  const get = Effect.fn("FolderService.get")(function* (id: FolderId) {
    const row = yield* getRow(id)
    const folders = yield* list(WorkspaceId.make(row.workspace_id))
    const folder = folders.find((candidate) => candidate.id === id)

    if (folder === undefined) {
      return yield* new LibraryNotFound({ resource: "folder", id })
    }

    return folder
  })

  const getScoped = Effect.fn("FolderService.getScoped")(function* (
    workspaceId: WorkspaceId,
    id: FolderId
  ) {
    const folder = yield* get(id)
    if (folder.workspaceId !== workspaceId) {
      return yield* new LibraryNotFound({ resource: "folder", id })
    }
    return folder
  })

  const resolveDestination = Effect.fn("FolderService.resolveDestination")(
    function* (workspaceId: WorkspaceId, folderId: FolderId | null) {
      const workspace = yield* getWorkspace(workspaceId, "list")

      if (folderId === null) {
        const root = yield* Effect.try({
          try: () =>
            resolveContainedDirectory(workspace.path, workspace.path),
          catch: () =>
            operationFailure("list", "The workspace path is not safe to access.")
        })
        return {
          workspace,
          folder: null,
          relativePath: "",
          absolutePath: root.path
        } satisfies FolderDestination
      }

      const folder = yield* get(folderId)

      if (folder.workspaceId !== workspaceId) {
        return yield* operationFailure(
          "move",
          "The selected folder belongs to a different workspace."
        )
      }

      const absolutePath = yield* Effect.try({
        try: () =>
          resolveContainedDirectory(
            workspace.path,
            toAbsolutePath(workspace.path, folder.relativePath)
          ).path,
        catch: () =>
          operationFailure("list", "The folder path is not safe to access.")
      })

      return {
        workspace,
        folder,
        relativePath: folder.relativePath,
        absolutePath
      } satisfies FolderDestination
    }
  )

  const create = Effect.fn("FolderService.create")(function* (
    input: CreateLibraryFolder
  ) {
    const name = input.name.trim()
    if (!isFolderName(name)) {
      return yield* operationFailure(
        "create",
        "Use a folder name without reserved path characters or a trailing period."
      )
    }

    const destination = yield* resolveDestination(input.workspaceId, input.parentId)
    const relativePath = posix.join(destination.relativePath, name)
    const absolutePath = toAbsolutePath(destination.workspace.path, relativePath)
    const now = new Date().toISOString()
    const id = FolderId.make(`folder_${crypto.randomUUID()}`)

    yield* Effect.try({
      try: () => {
        const prepared = prepareContainedPath(
          destination.workspace.path,
          absolutePath
        )
        mkdirSync(prepared.path)
        try {
          insertFolder.run(
            id,
            input.workspaceId,
            input.parentId,
            name,
            relativePath,
            now,
            now
          )
        } catch (cause) {
          const rollback = resolveContainedDirectory(
            destination.workspace.path,
            prepared.path
          )
          rmdirSync(rollback.path)
          throw cause
        }
      },
      catch: () =>
        operationFailure(
          "create",
          "That folder already exists or cannot be created in this workspace."
        )
    })

    return yield* get(id)
  })

  const update = Effect.fn("FolderService.update")(function* (
    id: FolderId,
    input: UpdateLibraryFolder
  ) {
    const row = yield* getRow(id)
    const workspaceId = WorkspaceId.make(row.workspace_id)
    const workspace = yield* getWorkspace(workspaceId, "update")
    const nextName = input.name?.trim() ?? row.name

    if (!isFolderName(nextName)) {
      return yield* operationFailure(
        "update",
        "Use a folder name without reserved path characters or a trailing period."
      )
    }

    const nextParentId =
      input.parentId === undefined
        ? row.parent_id === null
          ? null
          : FolderId.make(row.parent_id)
        : input.parentId
    const parent = nextParentId === null ? null : yield* getRow(nextParentId)

    if (parent !== null && parent.workspace_id !== row.workspace_id) {
      return yield* operationFailure(
        "move",
        "A folder cannot be moved into another workspace."
      )
    }

    if (
      parent !== null &&
      (parent.id === row.id || parent.relative_path.startsWith(`${row.relative_path}/`))
    ) {
      return yield* operationFailure("move", "A folder cannot be moved inside itself.")
    }

    const nextRelativePath = posix.join(parent?.relative_path ?? "", nextName)
    if (nextRelativePath === row.relative_path) {
      return yield* get(id)
    }

    const oldAbsolutePath = toAbsolutePath(workspace.path, row.relative_path)
    const nextAbsolutePath = toAbsolutePath(workspace.path, nextRelativePath)
    const now = new Date().toISOString()

    const allRows = yield* rowsForWorkspace(workspaceId)
    const affectedFolders = allRows.filter(
      (candidate) =>
        candidate.id !== row.id &&
        candidate.relative_path.startsWith(`${row.relative_path}/`)
    )
    const affectedReferences = yield* Effect.try({
      try: () =>
        selectReferencePaths
          .all(workspaceId)
          .filter((reference) =>
            reference.asset_relative_path.startsWith(`${row.relative_path}/`)
          ),
      catch: () => operationFailure("move", "Folder contents could not be inspected.")
    })

    yield* Effect.try({
      try: () => {
        for (const reference of affectedReferences) {
          resolveContainedFile(
            workspace.path,
            toAbsolutePath(workspace.path, reference.asset_relative_path)
          )
          if (reference.preview_path !== null) {
            resolveContainedFile(appPaths.previewsDirectory, reference.preview_path)
          }
        }
        const source = resolveContainedDirectory(workspace.path, oldAbsolutePath)
        const destination = prepareContainedPath(
          workspace.path,
          nextAbsolutePath
        )
        renameSync(source.path, destination.path)
        try {
          connection.transaction(() => {
            updateFolder.run(nextParentId, nextName, nextRelativePath, now, id)

            for (const child of affectedFolders) {
              updateFolderPath.run(
                `${nextRelativePath}${child.relative_path.slice(row.relative_path.length)}`,
                now,
                FolderId.make(child.id)
              )
            }

            for (const reference of affectedReferences) {
              updateReferencePath.run(
                `${nextRelativePath}${reference.asset_relative_path.slice(row.relative_path.length)}`,
                now,
                reference.id
              )
            }
          }).immediate()
        } catch (cause) {
          const rollbackSource = resolveContainedDirectory(
            workspace.path,
            destination.path
          )
          const rollbackDestination = prepareContainedPath(
            workspace.path,
            source.path
          )
          renameSync(rollbackSource.path, rollbackDestination.path)
          throw cause
        }
      },
      catch: () =>
        operationFailure(
          "move",
          "The folder could not be renamed or moved. Check for a duplicate name or open files."
        )
    })

    return yield* get(id)
  })

  const remove = Effect.fn("FolderService.remove")(function* (id: FolderId) {
    const row = yield* getRow(id)
    const workspace = yield* getWorkspace(
      WorkspaceId.make(row.workspace_id),
      "delete"
    )
    const counts = yield* Effect.try({
      try: () => ({
        children: countChildren.get(id)?.count ?? 0,
        references: countReferences.get(id)?.count ?? 0
      }),
      catch: () => operationFailure("delete", "The folder contents could not be checked.")
    })

    if (counts.children > 0 || counts.references > 0) {
      return yield* operationFailure(
        "delete",
        "Move or delete this folder's references and subfolders first."
      )
    }

    const absolutePath = toAbsolutePath(workspace.path, row.relative_path)
    yield* Effect.try({
      try: () => {
        const contained = resolveContainedDirectory(workspace.path, absolutePath)
        rmdirSync(contained.path)
        deleteFolder.run(id)
      },
      catch: () =>
        operationFailure(
          "delete",
          "The folder is not empty or cannot be removed from the workspace."
        )
    })
  })

  const updateScoped = Effect.fn("FolderService.updateScoped")(function* (
    workspaceId: WorkspaceId,
    id: FolderId,
    input: UpdateLibraryFolder
  ) {
    yield* getScoped(workspaceId, id)
    return yield* update(id, input)
  })

  const removeScoped = Effect.fn("FolderService.removeScoped")(function* (
    workspaceId: WorkspaceId,
    id: FolderId
  ) {
    yield* getScoped(workspaceId, id)
    return yield* remove(id)
  })

  return FolderService.of({
    list,
    get,
    getScoped,
    create,
    update,
    updateScoped,
    remove,
    removeScoped,
    resolveDestination
  })
})

export const FolderServiceLive = Layer.effect(FolderService, makeFolderService)
