import { Database } from "bun:sqlite"
import {
  DEFAULT_DESKTOP_SETTINGS,
  DesktopSettings,
  mergeDesktopSettings,
  SettingsPersistenceFailed,
  type UpdateDesktopSettings
} from "@starter/contracts"
import { Effect, Layer, Schema } from "effect"
import { SettingsRepository } from "./settings-repository"

type SettingsRow = {
  readonly value: string
}

const persistenceFailure = (operation: "load" | "save") =>
  new SettingsPersistenceFailed({
    operation,
    reason:
      operation === "load"
        ? "Settings could not be loaded from device storage."
        : "Settings could not be saved to device storage."
  })

const decodeSettings = Schema.decodeUnknownSync(DesktopSettings)

const makeRepository = (databasePath: string) =>
  Effect.gen(function* () {
    const database = yield* Effect.acquireRelease(
      Effect.try({
        try: () => new Database(databasePath, { create: true, strict: true }),
        catch: () => persistenceFailure("load")
      }),
      (opened) => Effect.sync(() => opened.close())
    )

    yield* Effect.try({
      try: () => {
        database.run("PRAGMA busy_timeout = 5000")
        database.run("PRAGMA journal_mode = WAL")
        database.run(`
          CREATE TABLE IF NOT EXISTS desktop_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `)
        database
          .query<never, [string, string]>(`
            INSERT OR IGNORE INTO desktop_settings (id, value, updated_at)
            VALUES (1, ?, ?)
          `)
          .run(
            JSON.stringify(DEFAULT_DESKTOP_SETTINGS),
            new Date().toISOString()
          )
      },
      catch: () => persistenceFailure("load")
    })

    const select = database.query<SettingsRow, []>(`
      SELECT value FROM desktop_settings WHERE id = 1
    `)
    const replace = database.query<never, [string, string]>(`
      UPDATE desktop_settings
      SET value = ?, updated_at = ?
      WHERE id = 1
    `)

    const read = () => {
      const row = select.get()

      if (row === null) {
        throw new Error("desktop settings row is missing")
      }

      return decodeSettings(JSON.parse(row.value))
    }

    const get = Effect.fn("SettingsRepository.get")(function* () {
      return yield* Effect.try({
        try: read,
        catch: () => persistenceFailure("load")
      })
    })

    const write = database.transaction((patch: UpdateDesktopSettings) => {
      const next = mergeDesktopSettings(read(), patch)
      replace.run(JSON.stringify(next), new Date().toISOString())
      return next
    })

    const update = Effect.fn("SettingsRepository.update")(function* (
      patch: UpdateDesktopSettings
    ) {
      return yield* Effect.try({
        try: () => write.immediate(patch),
        catch: () => persistenceFailure("save")
      })
    })

    return SettingsRepository.of({ get, update })
  })

/** Production layer; the database is opened and closed with the sidecar scope. */
export const settingsRepositoryLive = (databasePath: string) =>
  Layer.scoped(SettingsRepository, makeRepository(databasePath))
