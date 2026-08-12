import { Effect } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type TemporaryDatabase = {
  readonly directory: string
  readonly path: string
}

export const temporaryDatabase = Effect.acquireRelease(
  Effect.tryPromise({
    try: async () => {
      const directory = await mkdtemp(join(tmpdir(), "refnest-server-test-"))
      return {
        directory,
        path: join(directory, "refnest.sqlite3")
      } satisfies TemporaryDatabase
    },
    catch: (cause) =>
      new Error(`A temporary test database could not be prepared: ${String(cause)}`)
  }),
  ({ directory }) =>
    Effect.tryPromise({
      try: () => rm(directory, { recursive: true, force: true }),
      catch: () => undefined
    }).pipe(Effect.ignore)
)
