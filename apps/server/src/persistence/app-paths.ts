import { Context, Effect, Layer } from "effect"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"

export type AppPathsShape = {
  readonly databasePath: string
  readonly dataDirectory: string
  readonly managedWorkspacesDirectory: string
  readonly previewsDirectory: string
  readonly toolsDirectory: string
  readonly defaultWorkspacePath: string
}

export class AppPaths extends Context.Tag("AppPaths")<AppPaths, AppPathsShape>() {}

const resolveDataDirectory = (databasePath: string) =>
  databasePath === ":memory:"
    ? join(tmpdir(), `refnest-${process.pid}`)
    : dirname(databasePath)

export const appPathsLive = (databasePath: string) =>
  Layer.effect(
    AppPaths,
    Effect.tryPromise({
      try: async () => {
        const dataDirectory = resolveDataDirectory(databasePath)
        const managedWorkspacesDirectory = join(dataDirectory, "workspaces")
        const previewsDirectory = join(dataDirectory, "previews")
        const toolsDirectory = join(dataDirectory, "tools")
        const defaultWorkspacePath =
          process.env["REFNEST_DEFAULT_WORKSPACE_PATH"]?.trim() ||
          join(dataDirectory, "Inspiration Vault")

        await Promise.all([
          mkdir(dataDirectory, { recursive: true }),
          mkdir(managedWorkspacesDirectory, { recursive: true }),
          mkdir(previewsDirectory, { recursive: true }),
          mkdir(toolsDirectory, { recursive: true })
        ])

        return AppPaths.of({
          databasePath,
          dataDirectory,
          managedWorkspacesDirectory,
          previewsDirectory,
          toolsDirectory,
          defaultWorkspacePath
        })
      },
      catch: (cause) => new Error(`RefNest storage paths could not be prepared: ${String(cause)}`)
    })
  )
