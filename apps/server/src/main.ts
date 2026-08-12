import { HttpApiBuilder, HttpServer } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { encodeHandshakeLine, Handshake } from "@refnest/contracts"
import { Console, Effect, Layer, Redacted } from "effect"
import { SidecarConfig } from "./config"
import { applicationServicesLive } from "./application-services"
import { SharingService } from "./features/sharing/sharing-service"
import { ApiLive } from "./http/api"
import { withBearerAuth } from "./http/auth"

const BunServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* SidecarConfig

    return BunHttpServer.layer({ hostname: config.host, port: config.port })
  })
)

const databasePath = process.env["REFNEST_DATABASE_PATH"]?.trim() || ":memory:"
const ApplicationLive = applicationServicesLive(databasePath)

/**
 * Merged rather than provided, so the one application graph stays reachable
 * below. Providing it twice would open a second SQLite connection and a second
 * share listener against the same database.
 */
const ApiWithPersistenceLive = ApiLive.pipe(Layer.provideMerge(ApplicationLive))

/**
 * The device listener. The share listener is not a second branch here: it is
 * started and stopped at runtime by `ShareListener`, so toggling sharing never
 * drops this one's ephemeral port or the window's connection to it.
 */
const HttpLive = HttpApiBuilder.serve(withBearerAuth).pipe(
  Layer.provideMerge(ApiWithPersistenceLive),
  Layer.provideMerge(BunServerLive)
)

/**
 * Printed once the listener is up, so the shell never has to guess a port or
 * race the boot. Anything else on stdout is ignored by the reader.
 */
const announce = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  const config = yield* SidecarConfig
  const address = server.address

  if (address._tag !== "TcpAddress") {
    return yield* Effect.dieMessage(`sidecar expected a TCP address, got ${address._tag}`)
  }

  const line = yield* encodeHandshakeLine(
    new Handshake({
      host: address.hostname,
      port: address.port,
      token: Redacted.value(config.token)
    })
  ).pipe(Effect.orDie)

  yield* Console.log(line)
})

/**
 * Sharing survives a restart: if it was on when the app last closed, the LAN
 * listener comes back. A bind failure is recorded in the sharing status rather
 * than failing the boot — the desktop must still start when port 4317 is taken.
 */
const restoreSharing = Effect.gen(function* () {
  const sharing = yield* SharingService
  yield* sharing.restore
})

const MainLive = Layer.effectDiscard(announce.pipe(Effect.zipRight(restoreSharing))).pipe(
  Layer.provide(HttpLive),
  Layer.provide(SidecarConfig.Default)
)

BunRuntime.runMain(Layer.launch(MainLive))
