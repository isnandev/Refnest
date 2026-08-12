import {
  type BrowseWorkspaceDirectory,
  type CreateWorkspace,
  LibraryNotFound,
  Workspace,
  WorkspaceDirectory,
  WorkspaceDirectoryListing,
  WorkspaceId,
  WorkspaceOperationFailed
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { homedir } from "node:os"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  statSync
} from "node:fs"
import { basename, dirname, join, parse, resolve } from "node:path"
import {
  prepareContainedPath,
  resolveContainedDirectory
} from "../../persistence/path-policy"
import { seedDefaultSmartFolders } from "../smart-folders/smart-folder-defaults"
import { AppPaths } from "../../persistence/app-paths"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { SqliteDatabase } from "../../persistence/sqlite-database"

const INVALID_FOLDER_NAME = /[<>:"/\\|?*\u0000-\u001f]/

type WorkspaceRow = {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly created_at: string
}

const operationFailure = (
  operation: "browse" | "create",
  path: string,
  reason: string
) => new WorkspaceOperationFailed({ operation, path, reason })

const failureReason = (cause: unknown) => {
  if (cause instanceof Error && "code" in cause) {
    switch (cause.code) {
      case "EEXIST":
        return "A folder with this workspace name already exists."
      case "EACCES":
      case "EPERM":
        return "This folder cannot be accessed with the current permissions."
      case "ENOENT":
        return "This folder no longer exists."
    }
  }

  return "The folder operation failed."
}

const isWorkspaceFolderName = (name: string) =>
  name !== "." &&
  name !== ".." &&
  !INVALID_FOLDER_NAME.test(name) &&
  !/[. ]$/.test(name)

const fromRow = (row: WorkspaceRow) =>
  new Workspace({
    id: WorkspaceId.make(row.id),
    name: row.name,
    path: resolveContainedDirectory(row.path, row.path).path,
    createdAt: decodeSqliteDateTime(row.created_at)
  })

export type WorkspaceRepositoryShape = {
  readonly list: Effect.Effect<ReadonlyArray<Workspace>, WorkspaceOperationFailed>
  readonly get: (
    id: WorkspaceId
  ) => Effect.Effect<Workspace, LibraryNotFound | WorkspaceOperationFailed>
  readonly browse: (
    request: BrowseWorkspaceDirectory
  ) => Effect.Effect<WorkspaceDirectoryListing, WorkspaceOperationFailed>
  readonly create: (
    input: CreateWorkspace
  ) => Effect.Effect<Workspace, WorkspaceOperationFailed>
  readonly createManaged: (
    name: string
  ) => Effect.Effect<Workspace, WorkspaceOperationFailed>
}

export class WorkspaceRepository extends Context.Tag("WorkspaceRepository")<
  WorkspaceRepository,
  WorkspaceRepositoryShape
>() {}

const makeWorkspaceRepository = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const appPaths = yield* AppPaths

  const selectAll = connection.query<WorkspaceRow, []>(`
    SELECT id, name, path, created_at
    FROM workspaces
    ORDER BY created_at ASC
  `)
  const selectById = connection.query<WorkspaceRow, [WorkspaceId]>(`
    SELECT id, name, path, created_at
    FROM workspaces
    WHERE id = ?
  `)
  const insertWorkspace = connection.query<
    never,
    [WorkspaceId, string, string, string]
  >(`
    INSERT INTO workspaces (id, name, path, created_at)
    VALUES (?, ?, ?, ?)
  `)

  yield* Effect.try({
    try: () => {
      const existing = selectAll.all()

      if (existing.length === 0) {
        const parent = resolveContainedDirectory(
          dirname(appPaths.defaultWorkspacePath),
          dirname(appPaths.defaultWorkspacePath)
        )
        const prepared = prepareContainedPath(
          parent.path,
          appPaths.defaultWorkspacePath
        )
        const createdDirectory = !existsSync(prepared.path)
        if (createdDirectory) mkdirSync(prepared.path)
        const workspacePath = resolveContainedDirectory(
          prepared.path,
          prepared.path
        ).path
        const now = new Date().toISOString()
        const id = WorkspaceId.make("workspace_default")
        try {
          insertWorkspace.run(id, basename(workspacePath), workspacePath, now)
          seedDefaultSmartFolders(connection, id, now)
        } catch (cause) {
          if (createdDirectory) {
            const rollback = resolveContainedDirectory(parent.path, workspacePath)
            rmdirSync(rollback.path)
          }
          throw cause
        }
        return
      }

      for (const row of existing) {
        seedDefaultSmartFolders(connection, WorkspaceId.make(row.id), row.created_at)
      }
    },
    catch: (cause) =>
      operationFailure(
        "create",
        appPaths.defaultWorkspacePath,
        `The initial workspace could not be prepared: ${failureReason(cause)}`
      )
  })

  const list = Effect.try({
    try: () => selectAll.all().map(fromRow),
    catch: () =>
      operationFailure("browse", appPaths.dataDirectory, "Workspaces could not be loaded.")
  })

  const get = Effect.fn("WorkspaceRepository.get")(function* (id: WorkspaceId) {
    const row = yield* Effect.try({
      try: () => selectById.get(id),
      catch: () =>
        operationFailure("browse", appPaths.dataDirectory, "The workspace could not be loaded.")
    })

    if (row === null) {
      return yield* new LibraryNotFound({ resource: "workspace", id })
    }

    return fromRow(row)
  })

  const browse = Effect.fn("WorkspaceRepository.browse")(function* (
    request: BrowseWorkspaceDirectory
  ) {
    const currentPath = resolve(request.path ?? homedir())

    return yield* Effect.try({
      try: () => {
        if (!statSync(currentPath).isDirectory()) {
          throw new Error("the selected path is not a directory")
        }

        const directories = readdirSync(currentPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map(
            (entry) =>
              new WorkspaceDirectory({
                name: entry.name,
                path: join(currentPath, entry.name)
              })
          )
          .sort((left, right) => left.name.localeCompare(right.name))
        const root = parse(currentPath).root

        return new WorkspaceDirectoryListing({
          path: currentPath,
          parentPath: currentPath === root ? null : dirname(currentPath),
          homePath: resolve(homedir()),
          directories
        })
      },
      catch: (cause) =>
        operationFailure("browse", currentPath, failureReason(cause))
    })
  })

  const create = Effect.fn("WorkspaceRepository.create")(function* (
    input: CreateWorkspace
  ) {
    const folderName = input.name.trim()

    if (!isWorkspaceFolderName(folderName)) {
      return yield* operationFailure(
        "create",
        input.parentPath,
        "Use a folder name without reserved path characters or a trailing period."
      )
    }

    const parentPath = resolve(input.parentPath)
    const requestedWorkspacePath = join(parentPath, folderName)

    return yield* Effect.try({
      try: () => {
        const parent = resolveContainedDirectory(parentPath, parentPath)
        const prepared = prepareContainedPath(parent.path, requestedWorkspacePath)

        mkdirSync(prepared.path)
        const workspacePath = resolveContainedDirectory(
          prepared.path,
          prepared.path
        ).path
        const now = new Date().toISOString()
        const id = WorkspaceId.make(`workspace_${crypto.randomUUID()}`)

        try {
          connection.transaction(() => {
            insertWorkspace.run(id, folderName, workspacePath, now)
            seedDefaultSmartFolders(connection, id, now)
          }).immediate()
        } catch (cause) {
          const rollback = resolveContainedDirectory(parent.path, workspacePath)
          rmdirSync(rollback.path)
          throw cause
        }

        return new Workspace({
          id,
          name: folderName,
          path: workspacePath,
          createdAt: decodeSqliteDateTime(now)
        })
      },
      catch: (cause) =>
        operationFailure("create", requestedWorkspacePath, failureReason(cause))
    })
  })

  const createManaged = Effect.fn("WorkspaceRepository.createManaged")(
    function* (name: string) {
      return yield* create({
        name,
        parentPath: appPaths.managedWorkspacesDirectory
      })
    }
  )

  return WorkspaceRepository.of({ list, get, browse, create, createManaged })
})

export const WorkspaceRepositoryLive = Layer.effect(
  WorkspaceRepository,
  makeWorkspaceRepository
)
