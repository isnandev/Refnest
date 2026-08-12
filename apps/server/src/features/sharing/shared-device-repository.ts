import {
  DeviceNotFound,
  PairedDevice,
  PairedDeviceId,
  SharingFailed
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { SqliteDatabase } from "../../persistence/sqlite-database"

type DeviceRow = {
  readonly id: string
  readonly name: string
  readonly platform: string
  readonly created_at: string
  readonly last_seen_at: string | null
}

export type InviteRecord = {
  readonly codeHash: string
  readonly expiresAt: string
  readonly consumedAt: string | null
  readonly attempts: number
}

type InviteRow = {
  readonly code_hash: string
  readonly expires_at: string
  readonly consumed_at: string | null
  readonly attempts: number
}

export type NewSharedDevice = {
  readonly id: PairedDeviceId
  readonly name: string
  readonly platform: string
  readonly tokenHash: string
  readonly tokenPrefix: string
}

const failed = (reason: string) => new SharingFailed({ reason })

const fromRow = (row: DeviceRow) =>
  new PairedDevice({
    id: PairedDeviceId.make(row.id),
    name: row.name,
    platform: row.platform,
    createdAt: decodeSqliteDateTime(row.created_at),
    lastSeenAt:
      row.last_seen_at === null ? null : decodeSqliteDateTime(row.last_seen_at)
  })

export type SharedDeviceRepositoryShape = {
  readonly list: Effect.Effect<ReadonlyArray<PairedDevice>, SharingFailed>
  readonly count: Effect.Effect<number, SharingFailed>
  readonly insert: (
    device: NewSharedDevice
  ) => Effect.Effect<PairedDevice, SharingFailed>
  readonly findActiveByTokenHash: (
    tokenHash: string
  ) => Effect.Effect<PairedDeviceId | null>
  readonly touch: (id: PairedDeviceId) => Effect.Effect<void>
  readonly revoke: (
    id: PairedDeviceId
  ) => Effect.Effect<void, DeviceNotFound | SharingFailed>
  readonly readInvite: Effect.Effect<InviteRecord | null, SharingFailed>
  readonly replaceInvite: (
    codeHash: string,
    expiresAt: string
  ) => Effect.Effect<void, SharingFailed>
  readonly clearInvite: Effect.Effect<void, SharingFailed>
  readonly recordInviteAttempt: Effect.Effect<void>
  readonly consumeInvite: Effect.Effect<void, SharingFailed>
}

export class SharedDeviceRepository extends Context.Tag("SharedDeviceRepository")<
  SharedDeviceRepository,
  SharedDeviceRepositoryShape
>() {}

const makeRepository = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase

  const selectDevices = connection.query<DeviceRow, []>(`
    SELECT id, name, platform, created_at, last_seen_at
    FROM shared_devices
    WHERE revoked_at IS NULL
    ORDER BY created_at ASC
  `)
  const countDevices = connection.query<{ readonly total: number }, []>(`
    SELECT COUNT(*) AS total FROM shared_devices WHERE revoked_at IS NULL
  `)
  const insertDevice = connection.query<
    never,
    [string, string, string, string, string, string]
  >(`
    INSERT INTO shared_devices (
      id, name, platform, token_hash, token_prefix, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const selectByTokenHash = connection.query<{ readonly id: string }, [string]>(`
    SELECT id FROM shared_devices
    WHERE token_hash = ? AND revoked_at IS NULL
  `)
  const touchDevice = connection.query<never, [string, string]>(`
    UPDATE shared_devices SET last_seen_at = ? WHERE id = ?
  `)
  const revokeDevice = connection.query<never, [string, string]>(`
    UPDATE shared_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
  `)
  const selectActiveDevice = connection.query<{ readonly id: string }, [string]>(`
    SELECT id FROM shared_devices WHERE id = ? AND revoked_at IS NULL
  `)

  const selectInvite = connection.query<InviteRow, []>(`
    SELECT code_hash, expires_at, consumed_at, attempts
    FROM pairing_invites WHERE id = 1
  `)
  const upsertInvite = connection.query<never, [string, string, string]>(`
    INSERT INTO pairing_invites (id, code_hash, created_at, expires_at, consumed_at, attempts)
    VALUES (1, ?, ?, ?, NULL, 0)
    ON CONFLICT(id) DO UPDATE SET
      code_hash = excluded.code_hash,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      consumed_at = NULL,
      attempts = 0
  `)
  const deleteInvite = connection.query<never, []>(`
    DELETE FROM pairing_invites WHERE id = 1
  `)
  const bumpAttempts = connection.query<never, []>(`
    UPDATE pairing_invites SET attempts = attempts + 1 WHERE id = 1
  `)
  const markConsumed = connection.query<never, [string]>(`
    UPDATE pairing_invites SET consumed_at = ? WHERE id = 1
  `)

  const list = Effect.try({
    try: () => selectDevices.all().map(fromRow),
    catch: () => failed("Paired devices could not be read from device storage.")
  })

  const count = Effect.try({
    try: () => countDevices.get()?.total ?? 0,
    catch: () => failed("Paired devices could not be read from device storage.")
  })

  const insert = Effect.fn("SharedDeviceRepository.insert")(function* (
    device: NewSharedDevice
  ) {
    const createdAt = new Date().toISOString()

    yield* Effect.try({
      try: () =>
        insertDevice.run(
          device.id,
          device.name,
          device.platform,
          device.tokenHash,
          device.tokenPrefix,
          createdAt
        ),
      catch: () => failed("The paired device could not be saved.")
    })

    return fromRow({
      id: device.id,
      name: device.name,
      platform: device.platform,
      created_at: createdAt,
      last_seen_at: null
    })
  })

  const findActiveByTokenHash = (tokenHash: string) =>
    Effect.try({
      try: () => {
        const row = selectByTokenHash.get(tokenHash)
        return row === null ? null : PairedDeviceId.make(row.id)
      },
      catch: () => failed("unused")
    }).pipe(Effect.orElseSucceed(() => null))

  /** Bookkeeping only: a failed timestamp write must never fail the request. */
  const touch = (id: PairedDeviceId) =>
    Effect.try({
      try: () => touchDevice.run(new Date().toISOString(), id),
      catch: () => failed("unused")
    }).pipe(Effect.ignore)

  const revoke = Effect.fn("SharedDeviceRepository.revoke")(function* (
    id: PairedDeviceId
  ) {
    const existing = yield* Effect.try({
      try: () => selectActiveDevice.get(id),
      catch: () => failed("Paired devices could not be read from device storage.")
    })
    if (existing === null) {
      return yield* new DeviceNotFound({ id })
    }

    yield* Effect.try({
      try: () => revokeDevice.run(new Date().toISOString(), id),
      catch: () => failed("The device could not be revoked.")
    })
  })

  const readInvite = Effect.try({
    try: (): InviteRecord | null => {
      const row = selectInvite.get()
      return row === null
        ? null
        : {
            codeHash: row.code_hash,
            expiresAt: row.expires_at,
            consumedAt: row.consumed_at,
            attempts: row.attempts
          }
    },
    catch: () => failed("The pairing invite could not be read.")
  })

  const replaceInvite = (codeHash: string, expiresAt: string) =>
    Effect.try({
      try: () => upsertInvite.run(codeHash, new Date().toISOString(), expiresAt),
      catch: () => failed("The pairing invite could not be saved.")
    }).pipe(Effect.asVoid)

  const clearInvite = Effect.try({
    try: () => deleteInvite.run(),
    catch: () => failed("The pairing invite could not be cleared.")
  }).pipe(Effect.asVoid)

  const recordInviteAttempt = Effect.try({
    try: () => bumpAttempts.run(),
    catch: () => failed("unused")
  }).pipe(Effect.ignore)

  const consumeInvite = Effect.try({
    try: () => markConsumed.run(new Date().toISOString()),
    catch: () => failed("The pairing invite could not be closed.")
  }).pipe(Effect.asVoid)

  return SharedDeviceRepository.of({
    list,
    count,
    insert,
    findActiveByTokenHash,
    touch,
    revoke,
    readInvite,
    replaceInvite,
    clearInvite,
    recordInviteAttempt,
    consumeInvite
  })
})

export const SharedDeviceRepositoryLive = Layer.effect(
  SharedDeviceRepository,
  makeRepository
)
