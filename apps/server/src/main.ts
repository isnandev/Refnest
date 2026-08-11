import { HttpApiBuilder, HttpServer } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { encodeHandshakeLine, Handshake } from "@starter/contracts"
import { Console, Effect, Layer, Redacted } from "effect"
import { SidecarConfig } from "./config"
import { settingsRepositoryLive } from "./features/settings/settings-repository-live"
import { ApiLive } from "./http/api"
import { withBearerAuth } from "./http/auth"

const BunServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* SidecarConfig

    return BunHttpServer.layer({ hostname: config.host, port: config.port })
  })
)

const databasePath = process.env["STARTER_DATABASE_PATH"]?.trim() || ":memory:"
const ApiWithPersistenceLive = ApiLive.pipe(
  Layer.provide(settingsRepositoryLive(databasePath))
)

const HttpLive = HttpApiBuilder.serve(withBearerAuth).pipe(
  Layer.provide(ApiWithPersistenceLive),
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

const MainLive = Layer.effectDiscard(announce).pipe(
  Layer.provide(HttpLive),
  Layer.provide(SidecarConfig.Default)
)

BunRuntime.runMain(Layer.launch(MainLive))
