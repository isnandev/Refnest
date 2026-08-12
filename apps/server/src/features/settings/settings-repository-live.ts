import {
  DEFAULT_DESKTOP_SETTINGS,
  decodeStoredDesktopSettings,
  mergeDesktopSettings,
  SettingsPersistenceFailed,
  type UpdateDesktopSettings
} from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { SqliteDatabase } from "../../persistence/sqlite-database"
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

const makeRepository = Effect.gen(function* () {
  const { connection: database } = yield* SqliteDatabase

  yield* Effect.try({
    try: () => {
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

  /**
   * Lenient by design: a document written before environments existed, or one
   * missing a field a later build added, should cost the user their
   * preferences at worst — never the ability to open the app.
   */
  const read = () => {
    const row = select.get()

    if (row === null) {
      throw new Error("desktop settings row is missing")
    }

    return decodeStoredDesktopSettings(JSON.parse(row.value))
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

/** Uses the scope-owned application database rather than opening another connection. */
export const settingsRepositoryLive = Layer.effect(
  SettingsRepository,
  makeRepository
)
