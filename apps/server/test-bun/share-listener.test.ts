import { describe, expect, it } from "bun:test"
import { PairedDeviceId } from "@refnest/contracts"
import { Effect } from "effect"
import { applicationServicesLive } from "../src/application-services"
import { PairingService, type PairingServiceShape } from "../src/features/sharing/pairing-service"
import { ShareListener } from "../src/features/sharing/share-listener"
import { temporaryDatabase } from "./temporary-database"

type SharedFixture = {
  readonly baseUrl: string
  readonly pairing: PairingServiceShape
}

/**
 * Binds the real LAN listener on an ephemeral loopback port. Loopback counts as
 * private, so the peer policy admits these requests exactly as it would admit a
 * device on the same network — which is the point of testing over a socket
 * rather than through a web handler with no peer at all.
 */
const withSharedListener = <A>(
  use: (fixture: SharedFixture) => Effect.Effect<A, never, never>
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const database = yield* temporaryDatabase

        return yield* Effect.gen(function* () {
          const listener = yield* ShareListener
          const pairing = yield* PairingService
          const port = yield* listener.start("127.0.0.1", 0)

          return yield* use({
            baseUrl: `http://127.0.0.1:${port}`,
            pairing
          })
        }).pipe(Effect.provide(applicationServicesLive(database.path)))
      })
    )
  )

const redeem = (baseUrl: string, code: string) =>
  Effect.promise(() =>
    fetch(`${baseUrl}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        deviceName: "Test laptop",
        platform: "win32"
      })
    })
  )

const get = (baseUrl: string, path: string, token?: string) =>
  Effect.promise(() =>
    fetch(`${baseUrl}${path}`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` }
    })
  )

describe("the shared listener's endpoint surface", () => {
  it("serves the library but not the host-only endpoints", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const granted = yield* redeem(baseUrl, invite.code)
        expect(granted.status).toBe(201)
        const { token } = (yield* Effect.promise(() => granted.json())) as {
          readonly token: string
        }

        // Shared: browsing the library is the whole point.
        expect((yield* get(baseUrl, "/workspaces", token)).status).toBe(200)
        expect((yield* get(baseUrl, "/health", token)).status).toBe(200)

        // Host-only. These are absent from `RefNestSharedApi` rather than
        // denied by middleware, so they cannot be re-exposed by a policy bug.
        expect(
          (yield* get(baseUrl, "/workspaces/directories", token)).status
        ).toBe(404)
        expect((yield* get(baseUrl, "/settings", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/ai/settings", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/environments", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/sharing", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/mcp", token)).status).toBe(404)
      })
    )
  })

  it("refuses every request that carries no valid device token", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const granted = yield* redeem(baseUrl, invite.code)
        const { token } = (yield* Effect.promise(() => granted.json())) as {
          readonly token: string
        }

        expect((yield* get(baseUrl, "/workspaces")).status).toBe(401)
        expect((yield* get(baseUrl, "/workspaces", "not-a-token")).status).toBe(401)
        expect((yield* get(baseUrl, "/workspaces", `${token}x`)).status).toBe(401)
      })
    )
  })
})

describe("pairing", () => {
  it("is unreachable unless an invite is outstanding", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        // The unauthenticated surface exists only during the pairing window.
        expect((yield* redeem(baseUrl, "K7M2QW9X")).status).toBe(404)

        const invite = yield* pairing.issue.pipe(Effect.orDie)
        expect((yield* redeem(baseUrl, invite.code)).status).toBe(201)

        // Consuming the invite closes the window again.
        expect((yield* redeem(baseUrl, invite.code)).status).toBe(404)
      })
    )
  })

  it("burns an invite after repeated wrong guesses", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const wrong = invite.code === "AAAAAAAA" ? "BBBBBBBB" : "AAAAAAAA"

        for (let attempt = 0; attempt < 5; attempt += 1) {
          expect((yield* redeem(baseUrl, wrong)).status).toBe(403)
        }

        // The right code no longer helps: the attempt budget is spent, and the
        // endpoint is gone rather than answering "correct but too late".
        expect((yield* redeem(baseUrl, invite.code)).status).toBe(404)
      })
    )
  })

  it("stops answering a revoked device", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const granted = yield* redeem(baseUrl, invite.code)
        const grant = (yield* Effect.promise(() => granted.json())) as {
          readonly token: string
          readonly deviceId: string
        }

        expect((yield* get(baseUrl, "/workspaces", grant.token)).status).toBe(200)

        yield* pairing
          .revoke(PairedDeviceId.make(grant.deviceId))
          .pipe(Effect.orDie)

        expect((yield* get(baseUrl, "/workspaces", grant.token)).status).toBe(401)
      })
    )
  })

  it("issues a distinct token per device", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const first = yield* pairing.issue.pipe(Effect.orDie)
        const firstResponse = yield* redeem(baseUrl, first.code)
        const firstGrant = (yield* Effect.promise(() =>
          firstResponse.json()
        )) as { readonly token: string }

        const second = yield* pairing.issue.pipe(Effect.orDie)
        const secondResponse = yield* redeem(baseUrl, second.code)
        const secondGrant = (yield* Effect.promise(() =>
          secondResponse.json()
        )) as { readonly token: string }

        expect(firstGrant.token).not.toBe(secondGrant.token)

        const devices = yield* pairing.devices.pipe(Effect.orDie)
        expect(devices).toHaveLength(2)
      })
    )
  })
})

describe("the share listener's lifecycle", () => {
  it("releases its port on stop and rebinds afterwards", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          return yield* Effect.gen(function* () {
            const listener = yield* ShareListener

            const first = yield* listener.start("127.0.0.1", 0)
            expect(yield* listener.runningPort).toBe(first)

            yield* listener.stop
            expect(yield* listener.runningPort).toBeNull()

            // Reachable again on a fresh port: stopping must actually close
            // the socket, not just forget about it.
            const second = yield* listener.start("127.0.0.1", 0)
            expect(yield* listener.runningPort).toBe(second)

            const response = yield* Effect.promise(() =>
              fetch(`http://127.0.0.1:${second}/workspaces`)
            )
            expect(response.status).toBe(401)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })

  it("reports a taken port instead of hanging", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          return yield* Effect.gen(function* () {
            const listener = yield* ShareListener
            const port = yield* listener.start("127.0.0.1", 0)

            const blocker = Bun.serve({ port: 0, fetch: () => new Response("busy") })
            yield* Effect.addFinalizer(() => Effect.sync(() => blocker.stop(true)))
            const takenPort = Number(blocker.port)

            const conflict = yield* listener
              .start("127.0.0.1", takenPort)
              .pipe(Effect.either)

            expect(conflict._tag).toBe("Left")
            if (conflict._tag === "Left") {
              expect(conflict.left.reason).toContain(String(takenPort))
              expect(conflict.left.reason).toContain("already in use")
            }
            // The failed start does not leave a phantom listener behind.
            expect(yield* listener.runningPort).toBeNull()
            expect(port).not.toBe(takenPort)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })
})
