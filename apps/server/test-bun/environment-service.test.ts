import { describe, expect, it } from "bun:test"
import {
  ConnectEnvironment,
  LOCAL_ENVIRONMENT_ID,
  UpdateEnvironment
} from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { applicationServicesLive } from "../src/application-services"
import {
  EnvironmentService,
  type EnvironmentServiceShape
} from "../src/features/environments/environment-service"
import { RemoteLibraryTransport } from "../src/features/environments/remote-library-client"
import { temporaryDatabase } from "./temporary-database"

const GRANT = {
  deviceId: "device-1",
  token: "granted-token",
  libraryName: "Studio PC",
  serverVersion: "0.1.0"
}

const HEALTH = {
  status: "ok",
  runtime: "bun 1.3.14",
  version: "0.1.0",
  uptimeMillis: 1234
}

type Call = { readonly url: string; readonly init: RequestInit }

/** Answers pairing and health without a second process. */
const stubTransport = (calls: Array<Call>, pairStatus = 201) =>
  Layer.succeed(
    RemoteLibraryTransport,
    RemoteLibraryTransport.of({
      fetch: (url, init) => {
        calls.push({ url, init })

        if (url.endsWith("/pair")) {
          return Promise.resolve(
            new Response(JSON.stringify(GRANT), {
              status: pairStatus,
              headers: { "content-type": "application/json" }
            })
          )
        }

        return Promise.resolve(
          new Response(JSON.stringify(HEALTH), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
      }
    })
  )

const withEnvironments = <A>(
  calls: Array<Call>,
  use: (environments: EnvironmentServiceShape) => Effect.Effect<A, never, never>,
  pairStatus = 201
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const database = yield* temporaryDatabase

        return yield* Effect.gen(function* () {
          return yield* use(yield* EnvironmentService)
        }).pipe(
          Effect.provide(
            applicationServicesLive(database.path, {
              remoteLibraryTransport: stubTransport(calls, pairStatus)
            })
          )
        )
      })
    )
  )

describe("the saved library registry", () => {
  it("always lists this device first, before anything paired", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const before = yield* environments.list.pipe(Effect.orDie)
        expect(before).toHaveLength(1)
        expect(before[0]?.id).toBe(LOCAL_ENVIRONMENT_ID)
        expect(before[0]?.kind).toBe("local")

        yield* environments
          .connect(
            new ConnectEnvironment({
              host: "192.168.1.50",
              port: 4317,
              code: "K7M2QW9X"
            })
          )
          .pipe(Effect.orDie)

        const after = yield* environments.list.pipe(Effect.orDie)
        expect(after).toHaveLength(2)
        expect(after[0]?.id).toBe(LOCAL_ENVIRONMENT_ID)
        expect(after[1]?.name).toBe("Studio PC")
        expect(after[1]?.kind).toBe("remote")
        expect(calls[0]?.url).toBe("http://192.168.1.50:4317/pair")
      })
    )
  })

  it("refuses an address outside the local network", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const rejected = yield* environments
          .connect(
            new ConnectEnvironment({
              // Documentation range: routable, and exactly what a mistyped or
              // hostile connect string would aim a credential at.
              host: "203.0.113.5",
              port: 4317,
              code: "K7M2QW9X"
            })
          )
          .pipe(Effect.either)

        expect(rejected._tag).toBe("Left")
        if (rejected._tag === "Left") {
          expect(rejected.left.message).toContain("local network")
        }
        // Nothing was sent: the address is refused before any credential moves.
        expect(calls).toHaveLength(0)
      })
    )
  })

  it("hands the shell an address and credential for a saved library", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const saved = yield* environments
          .connect(
            new ConnectEnvironment({
              host: "192.168.1.50",
              port: 4317,
              code: "K7M2QW9X"
            })
          )
          .pipe(Effect.orDie)

        const connection = yield* environments
          .connection(saved.id)
          .pipe(Effect.orDie)

        expect(connection.baseUrl).toBe("http://192.168.1.50:4317")
        expect(connection.token).toBe(GRANT.token)
      })
    )
  })

  it("has no connection to hand out for this device's own library", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const rejected = yield* environments
          .connection(LOCAL_ENVIRONMENT_ID)
          .pipe(Effect.either)

        expect(rejected._tag).toBe("Left")
        const forgotten = yield* environments
          .forget(LOCAL_ENVIRONMENT_ID)
          .pipe(Effect.either)
        expect(forgotten._tag).toBe("Left")
      })
    )
  })

  it("moves a library to a new address without re-pairing", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const saved = yield* environments
          .connect(
            new ConnectEnvironment({
              host: "192.168.1.50",
              port: 4317,
              code: "K7M2QW9X"
            })
          )
          .pipe(Effect.orDie)

        yield* environments
          .update(saved.id, new UpdateEnvironment({ host: "192.168.1.77" }))
          .pipe(Effect.orDie)

        const connection = yield* environments
          .connection(saved.id)
          .pipe(Effect.orDie)

        // Same credential, new address: the token is host-issued, not bound to
        // wherever DHCP put the host this week.
        expect(connection.baseUrl).toBe("http://192.168.1.77:4317")
        expect(connection.token).toBe(GRANT.token)
        expect(calls.filter((call) => call.url.endsWith("/pair"))).toHaveLength(1)
      })
    )
  })

  it("reports an unreachable library instead of failing the request", async () => {
    const calls: Array<Call> = []

    await withEnvironments(
      calls,
      (environments) =>
        Effect.gen(function* () {
          const rejected = yield* environments
            .connect(
              new ConnectEnvironment({
                host: "192.168.1.50",
                port: 4317,
                code: "K7M2QW9X"
              })
            )
            .pipe(Effect.either)

          expect(rejected._tag).toBe("Left")
          if (rejected._tag === "Left") {
            expect(rejected.left.message).toContain("pairing code")
          }
        }),
      403
    )
  })

  it("probes this device's own library as always reachable", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const probe = yield* environments
          .probe(LOCAL_ENVIRONMENT_ID)
          .pipe(Effect.orDie)

        expect(probe.reachable).toBe(true)
        expect(calls).toHaveLength(0)
      })
    )
  })

  it("probes a saved library through its stored credential", async () => {
    const calls: Array<Call> = []

    await withEnvironments(calls, (environments) =>
      Effect.gen(function* () {
        const saved = yield* environments
          .connect(
            new ConnectEnvironment({
              host: "192.168.1.50",
              port: 4317,
              code: "K7M2QW9X"
            })
          )
          .pipe(Effect.orDie)

        const probe = yield* environments.probe(saved.id).pipe(Effect.orDie)

        expect(probe.reachable).toBe(true)
        expect(probe.serverVersion).toBe("0.1.0")

        const health = calls.find((call) => call.url.endsWith("/health"))
        expect(health?.url).toBe("http://192.168.1.50:4317/health")
        expect(
          (health?.init.headers as Record<string, string>)["authorization"]
        ).toBe(`Bearer ${GRANT.token}`)
      })
    )
  })
})
