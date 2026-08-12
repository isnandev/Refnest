import {
  ConnectEnvironment,
  Environment,
  EnvironmentConnection,
  EnvironmentId,
  EnvironmentNotFound,
  EnvironmentProbe,
  EnvironmentRejected,
  LOCAL_ENVIRONMENT_ID,
  PairingFailed,
  RedeemPairing,
  type UpdateEnvironment
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { platform } from "node:os"
import { deviceName } from "../../device-identity"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { assertPrivateHost, formatBaseUrl } from "./environment-address"
import { EnvironmentRepository } from "./environment-repository"
import { RemoteLibraryClient } from "./remote-library-client"

const rejected = (reason: string) => new EnvironmentRejected({ reason })

/**
 * The local sidecar is not a stored row: it is always present, never removable,
 * and needs no address or credential. It is synthesised so the UI can list one
 * uniform set of libraries.
 */
const localEnvironment = () =>
  new Environment({
    id: LOCAL_ENVIRONMENT_ID,
    name: deviceName(),
    kind: "local",
    host: null,
    port: null,
    createdAt: decodeSqliteDateTime("1970-01-01T00:00:00.000Z"),
    lastConnectedAt: null
  })

export type EnvironmentServiceShape = {
  readonly list: Effect.Effect<ReadonlyArray<Environment>, EnvironmentRejected>
  readonly connect: (
    payload: ConnectEnvironment
  ) => Effect.Effect<Environment, EnvironmentRejected | PairingFailed>
  readonly update: (
    id: EnvironmentId,
    patch: UpdateEnvironment
  ) => Effect.Effect<Environment, EnvironmentNotFound | EnvironmentRejected>
  readonly forget: (
    id: EnvironmentId
  ) => Effect.Effect<void, EnvironmentNotFound | EnvironmentRejected>
  readonly probe: (
    id: EnvironmentId
  ) => Effect.Effect<EnvironmentProbe, EnvironmentNotFound>
  readonly connection: (
    id: EnvironmentId
  ) => Effect.Effect<
    EnvironmentConnection,
    EnvironmentNotFound | EnvironmentRejected
  >
}

export class EnvironmentService extends Context.Tag("EnvironmentService")<
  EnvironmentService,
  EnvironmentServiceShape
>() {}

const makeService = Effect.gen(function* () {
  const repository = yield* EnvironmentRepository
  const remote = yield* RemoteLibraryClient

  const list = repository.list.pipe(
    Effect.map((stored) => [localEnvironment(), ...stored])
  )

  const connect = Effect.fn("EnvironmentService.connect")(function* (
    payload: ConnectEnvironment
  ) {
    const host = yield* assertPrivateHost(payload.host)
    const baseUrl = formatBaseUrl(host, payload.port)
    const grant = yield* remote.pair(
      baseUrl,
      new RedeemPairing({
        code: payload.code,
        deviceName: deviceName(),
        platform: platform()
      })
    )

    return yield* repository.insert({
      id: EnvironmentId.make(crypto.randomUUID()),
      name: payload.name ?? grant.libraryName,
      host,
      port: payload.port,
      deviceToken: grant.token
    })
  })

  const update = Effect.fn("EnvironmentService.update")(function* (
    id: EnvironmentId,
    patch: UpdateEnvironment
  ) {
    if (id === LOCAL_ENVIRONMENT_ID) {
      return yield* rejected("This device's own library cannot be edited.")
    }
    if (patch.host !== undefined) {
      yield* assertPrivateHost(patch.host)
    }
    return yield* repository.update(id, patch)
  })

  const forget = Effect.fn("EnvironmentService.forget")(function* (
    id: EnvironmentId
  ) {
    if (id === LOCAL_ENVIRONMENT_ID) {
      return yield* rejected("This device's own library cannot be removed.")
    }
    return yield* repository.remove(id)
  })

  const probe = Effect.fn("EnvironmentService.probe")(function* (
    id: EnvironmentId
  ) {
    if (id === LOCAL_ENVIRONMENT_ID) {
      return new EnvironmentProbe({
        reachable: true,
        serverVersion: null,
        reason: null
      })
    }

    const stored = yield* repository.get(id).pipe(
      Effect.catchTag("EnvironmentRejected", (error) =>
        Effect.succeed(
          new EnvironmentProbe({
            reachable: false,
            serverVersion: null,
            reason: error.reason
          })
        )
      )
    )
    if (stored instanceof EnvironmentProbe) return stored

    const report = yield* remote
      .health(formatBaseUrl(stored.host, stored.port), stored.deviceToken)
      .pipe(Effect.either)

    if (report._tag === "Left") {
      return new EnvironmentProbe({
        reachable: false,
        serverVersion: null,
        reason: report.left.reason
      })
    }

    yield* repository.touch(id)
    return new EnvironmentProbe({
      reachable: true,
      serverVersion: report.right.version,
      reason: null
    })
  })

  const connection = Effect.fn("EnvironmentService.connection")(function* (
    id: EnvironmentId
  ) {
    if (id === LOCAL_ENVIRONMENT_ID) {
      return yield* rejected(
        "The local library is reached directly, not through a saved connection."
      )
    }

    const stored = yield* repository.get(id)
    yield* repository.touch(id)

    return new EnvironmentConnection({
      baseUrl: formatBaseUrl(stored.host, stored.port),
      token: stored.deviceToken
    })
  })

  return EnvironmentService.of({
    list,
    connect,
    update,
    forget,
    probe,
    connection
  })
})

export const EnvironmentServiceLive = Layer.effect(
  EnvironmentService,
  makeService
)
