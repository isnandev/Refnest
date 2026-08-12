import { Config, Effect, Redacted } from "effect"

/**
 * Sidecar wiring, not application policy.
 *
 * Defaults are deliberately private: loopback only, an OS-assigned port, and a
 * freshly generated token per launch. The Rust shell learns all three from the
 * handshake line, so nothing has to be agreed on ahead of time.
 */
export class SidecarConfig extends Effect.Service<SidecarConfig>()("SidecarConfig", {
  effect: Effect.gen(function* () {
    const host = yield* Config.string("REFNEST_SERVER_HOST").pipe(Config.withDefault("127.0.0.1"))
    const port = yield* Config.integer("REFNEST_SERVER_PORT").pipe(Config.withDefault(0))
    const token = yield* Config.redacted("REFNEST_SERVER_TOKEN").pipe(
      Config.withDefault(Redacted.make(crypto.randomUUID()))
    )

    return { host, port, token } as const
  })
}) {}
