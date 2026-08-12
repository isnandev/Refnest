import { describe, expect, it } from "bun:test"
import { CreateWorkspace } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import {
  WorkspaceRepository,
  WorkspaceRepositoryLive
} from "../src/features/workspaces/workspace-repository"
import { appPathsLive } from "../src/persistence/app-paths"
import { sqliteDatabaseLive } from "../src/persistence/sqlite-database"
import { temporaryDatabase } from "./temporary-database"

const workspaceLayer = (databasePath: string) => {
  const infrastructure = Layer.merge(
    appPathsLive(databasePath),
    sqliteDatabaseLive(databasePath)
  )
  return WorkspaceRepositoryLive.pipe(Layer.provide(infrastructure))
}

describe("workspace repository", () => {
  it("persists a created workspace across database reopen", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const parentPath = join(database.directory, "Workspace parents")
          yield* Effect.tryPromise(() => mkdir(parentPath))

          const created = yield* Effect.scoped(
            Effect.gen(function* () {
              const workspaces = yield* WorkspaceRepository
              return yield* workspaces.create(
                new CreateWorkspace({
                  name: "Design research",
                  parentPath
                })
              )
            }).pipe(Effect.provide(workspaceLayer(database.path)))
          )

          const reopened = yield* Effect.scoped(
            Effect.gen(function* () {
              const workspaces = yield* WorkspaceRepository
              return yield* workspaces.list
            }).pipe(Effect.provide(workspaceLayer(database.path)))
          )

          expect(reopened.map((workspace) => workspace.id)).toContain(created.id)
          expect(reopened.find((workspace) => workspace.id === created.id)).toMatchObject({
            name: "Design research",
            path: created.path
          })
        })
      )
    )
  })
})
