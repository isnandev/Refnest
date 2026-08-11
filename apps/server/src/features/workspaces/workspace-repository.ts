import { FileSystem, Path } from "@effect/platform"
import type { PlatformError } from "@effect/platform/Error"
import { BunFileSystem, BunPath } from "@effect/platform-bun"
import {
  type BrowseWorkspaceDirectory,
  type CreateWorkspace,
  Workspace,
  WorkspaceDirectory,
  WorkspaceDirectoryListing,
  WorkspaceId,
  WorkspaceOperationFailed
} from "@starter/contracts"
import { homedir } from "node:os"
import { DateTime, Effect, Ref } from "effect"

const INVALID_FOLDER_NAME = /[<>:"/\\|?*\u0000-\u001f]/

const operationFailure = (
  operation: "browse" | "create",
  path: string,
  reason: string
) => new WorkspaceOperationFailed({ operation, path, reason })

const platformFailure =
  (operation: "browse" | "create", path: string) =>
  (cause: PlatformError): WorkspaceOperationFailed => {
    const reason =
      cause._tag === "SystemError"
        ? cause.reason === "AlreadyExists"
          ? "A folder with this workspace name already exists."
          : cause.reason === "PermissionDenied"
            ? "This folder cannot be accessed with the current permissions."
            : cause.reason === "NotFound"
              ? "This folder no longer exists."
              : `The folder operation failed: ${cause.reason}.`
        : "The folder path is not valid."

    return operationFailure(operation, path, reason)
  }

const isWorkspaceFolderName = (name: string) =>
  name !== "." &&
  name !== ".." &&
  !INVALID_FOLDER_NAME.test(name) &&
  !/[. ]$/.test(name)

/** Filesystem-backed workspace operations exposed to the HTTP layer. */
export class WorkspaceRepository extends Effect.Service<WorkspaceRepository>()(
  "WorkspaceRepository",
  {
    dependencies: [BunFileSystem.layer, BunPath.layer],
    effect: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const paths = yield* Path.Path
      const createdAt = yield* DateTime.now
      const starterWorkspace = new Workspace({
        id: WorkspaceId.make("workspace_starter"),
        name: "Tauri Effect",
        path: paths.resolve(process.cwd()),
        createdAt
      })
      const workspaces = yield* Ref.make<ReadonlyArray<Workspace>>([starterWorkspace])

      const list = Ref.get(workspaces)

      const browse = Effect.fn("WorkspaceRepository.browse")(function* (
        request: BrowseWorkspaceDirectory
      ) {
        const currentPath = paths.resolve(request.path ?? homedir())
        const names = yield* fileSystem
          .readDirectory(currentPath)
          .pipe(Effect.mapError(platformFailure("browse", currentPath)))
        const entries = yield* Effect.forEach(
          names,
          (name) => {
            const entryPath = paths.join(currentPath, name)

            return fileSystem.stat(entryPath).pipe(
              Effect.map((info) =>
                info.type === "Directory"
                  ? new WorkspaceDirectory({ name, path: entryPath })
                  : null
              ),
              Effect.catchAll(() => Effect.succeed(null))
            )
          },
          { concurrency: 16 }
        )
        const directories = entries
          .filter((entry): entry is WorkspaceDirectory => entry !== null)
          .sort((left, right) => left.name.localeCompare(right.name))
        const root = paths.parse(currentPath).root

        return new WorkspaceDirectoryListing({
          path: currentPath,
          parentPath: currentPath === root ? null : paths.dirname(currentPath),
          homePath: paths.resolve(homedir()),
          directories
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

        const parentPath = paths.resolve(input.parentPath)
        const parentInfo = yield* fileSystem
          .stat(parentPath)
          .pipe(Effect.mapError(platformFailure("create", parentPath)))

        if (parentInfo.type !== "Directory") {
          return yield* operationFailure(
            "create",
            parentPath,
            "Choose a folder as the workspace location."
          )
        }

        const workspacePath = paths.join(parentPath, folderName)
        yield* fileSystem
          .makeDirectory(workspacePath)
          .pipe(Effect.mapError(platformFailure("create", workspacePath)))

        const workspace = new Workspace({
          id: WorkspaceId.make(`workspace_${crypto.randomUUID()}`),
          name: folderName,
          path: workspacePath,
          createdAt: yield* DateTime.now
        })

        yield* Ref.update(workspaces, (current) => [...current, workspace])

        return workspace
      })

      return { list, browse, create } as const
    })
  }
) {}
