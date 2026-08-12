import {
  Environment,
  EnvironmentId,
  EnvironmentNotFound,
  EnvironmentRejected,
  type UpdateEnvironment
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { SqliteDatabase } from "../../persistence/sqlite-database"

type EnvironmentRow = {
  readonly id: string
  readonly name: string
  readonly host: string
  readonly port: number
  readonly device_token: string
  readonly created_at: string
  readonly last_connected_at: string | null
}

/** Host and port are restated as non-null: a stored row always has both. */
export type StoredEnvironment = {
  readonly environment: Environment
  readonly host: string
  readonly port: number
  readonly deviceToken: string
}

const rejected = (reason: string) => new EnvironmentRejected({ reason })

const fromRow = (row: EnvironmentRow) =>
  new Environment({
    id: EnvironmentId.make(row.id),
    name: row.name,
    kind: "remote",
    host: row.host,
    port: row.port,
    createdAt: decodeSqliteDateTime(row.created_at),
    lastConnectedAt:
      row.last_connected_at === null
        ? null
        : decodeSqliteDateTime(row.last_connected_at)
  })

export type NewEnvironment = {
  readonly id: EnvironmentId
  readonly name: string
  readonly host: string
  readonly port: number
  readonly deviceToken: string
}

export type EnvironmentRepositoryShape = {
  readonly list: Effect.Effect<ReadonlyArray<Environment>, EnvironmentRejected>
  readonly get: (
    id: EnvironmentId
  ) => Effect.Effect<StoredEnvironment, EnvironmentNotFound | EnvironmentRejected>
  readonly insert: (
    environment: NewEnvironment
  ) => Effect.Effect<Environment, EnvironmentRejected>
  readonly update: (
    id: EnvironmentId,
    patch: UpdateEnvironment
  ) => Effect.Effect<Environment, EnvironmentNotFound | EnvironmentRejected>
  readonly remove: (
    id: EnvironmentId
  ) => Effect.Effect<void, EnvironmentNotFound | EnvironmentRejected>
  readonly touch: (id: EnvironmentId) => Effect.Effect<void>
}

export class EnvironmentRepository extends Context.Tag("EnvironmentRepository")<
  EnvironmentRepository,
  EnvironmentRepositoryShape
>() {}

const makeRepository = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase

  const selectAll = connection.query<EnvironmentRow, []>(`
    SELECT id, name, host, port, device_token, created_at, last_connected_at
    FROM environments
    ORDER BY created_at ASC
  `)
  const selectOne = connection.query<EnvironmentRow, [string]>(`
    SELECT id, name, host, port, device_token, created_at, last_connected_at
    FROM environments
    WHERE id = ?
  `)
  const insertRow = connection.query<
    never,
    [string, string, string, number, string, string]
  >(`
    INSERT INTO environments (id, name, host, port, device_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const updateRow = connection.query<never, [string, string, number, string]>(`
    UPDATE environments SET name = ?, host = ?, port = ? WHERE id = ?
  `)
  const deleteRow = connection.query<never, [string]>(`
    DELETE FROM environments WHERE id = ?
  `)
  const touchRow = connection.query<never, [string, string]>(`
    UPDATE environments SET last_connected_at = ? WHERE id = ?
  `)

  const list = Effect.try({
    try: () => selectAll.all().map(fromRow),
    catch: () => rejected("Saved libraries could not be read from device storage.")
  })

  const readRow = (id: EnvironmentId) =>
    Effect.try({
      try: () => selectOne.get(id),
      catch: () => rejected("Saved libraries could not be read from device storage.")
    }).pipe(
      Effect.flatMap((row) =>
        row === null
          ? Effect.fail(new EnvironmentNotFound({ id }))
          : Effect.succeed(row)
      )
    )

  const get = Effect.fn("EnvironmentRepository.get")(function* (
    id: EnvironmentId
  ) {
    const row = yield* readRow(id)
    return {
      environment: fromRow(row),
      host: row.host,
      port: row.port,
      deviceToken: row.device_token
    }
  })

  const insert = Effect.fn("EnvironmentRepository.insert")(function* (
    environment: NewEnvironment
  ) {
    const createdAt = new Date().toISOString()

    yield* Effect.try({
      try: () =>
        insertRow.run(
          environment.id,
          environment.name,
          environment.host,
          environment.port,
          environment.deviceToken,
          createdAt
        ),
      catch: (cause) =>
        String(cause).includes("UNIQUE")
          ? rejected("That library is already saved on this device.")
          : rejected("The library could not be saved to device storage.")
    })

    return fromRow({
      id: environment.id,
      name: environment.name,
      host: environment.host,
      port: environment.port,
      device_token: environment.deviceToken,
      created_at: createdAt,
      last_connected_at: null
    })
  })

  const update = Effect.fn("EnvironmentRepository.update")(function* (
    id: EnvironmentId,
    patch: UpdateEnvironment
  ) {
    const row = yield* readRow(id)
    const next = {
      name: patch.name ?? row.name,
      host: patch.host ?? row.host,
      port: patch.port ?? row.port
    }

    yield* Effect.try({
      try: () => updateRow.run(next.name, next.host, next.port, id),
      catch: (cause) =>
        String(cause).includes("UNIQUE")
          ? rejected("Another saved library already uses that address.")
          : rejected("The library could not be saved to device storage.")
    })

    return fromRow({ ...row, ...next })
  })

  const remove = Effect.fn("EnvironmentRepository.remove")(function* (
    id: EnvironmentId
  ) {
    yield* readRow(id)
    yield* Effect.try({
      try: () => deleteRow.run(id),
      catch: () => rejected("The library could not be removed from device storage.")
    })
  })

  /** Best-effort bookkeeping: a failed timestamp write must not fail a request. */
  const touch = (id: EnvironmentId) =>
    Effect.try({
      try: () => touchRow.run(new Date().toISOString(), id),
      catch: () => rejected("unused")
    }).pipe(Effect.ignore)

  return EnvironmentRepository.of({ list, get, insert, update, remove, touch })
})

export const EnvironmentRepositoryLive = Layer.effect(
  EnvironmentRepository,
  makeRepository
)
