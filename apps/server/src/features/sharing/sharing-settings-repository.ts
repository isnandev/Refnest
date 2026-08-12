import { DEFAULT_SHARE_PORT, SharingFailed } from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { SqliteDatabase } from "../../persistence/sqlite-database"

export type StoredSharingSettings = {
  readonly enabled: boolean
  readonly port: number
}

type SharingRow = {
  readonly enabled: number
  readonly port: number
}

const failed = (reason: string) => new SharingFailed({ reason })

export type SharingSettingsRepositoryShape = {
  readonly read: Effect.Effect<StoredSharingSettings, SharingFailed>
  readonly write: (
    settings: StoredSharingSettings
  ) => Effect.Effect<void, SharingFailed>
}

export class SharingSettingsRepository extends Context.Tag(
  "SharingSettingsRepository"
)<SharingSettingsRepository, SharingSettingsRepositoryShape>() {}

const makeRepository = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase

  const select = connection.query<SharingRow, []>(`
    SELECT enabled, port FROM sharing_settings WHERE id = 1
  `)
  const update = connection.query<never, [number, number, string]>(`
    UPDATE sharing_settings SET enabled = ?, port = ?, updated_at = ? WHERE id = 1
  `)

  const read = Effect.try({
    try: (): StoredSharingSettings => {
      const row = select.get()
      return row === null
        ? { enabled: false, port: DEFAULT_SHARE_PORT }
        : { enabled: row.enabled === 1, port: row.port }
    },
    catch: () => failed("Sharing settings could not be read from device storage.")
  })

  const write = (settings: StoredSharingSettings) =>
    Effect.try({
      try: () =>
        update.run(
          settings.enabled ? 1 : 0,
          settings.port,
          new Date().toISOString()
        ),
      catch: () => failed("Sharing settings could not be saved.")
    }).pipe(Effect.asVoid)

  return SharingSettingsRepository.of({ read, write })
})

export const SharingSettingsRepositoryLive = Layer.effect(
  SharingSettingsRepository,
  makeRepository
)
