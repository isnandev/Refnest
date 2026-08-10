import { HttpApp, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Redacted } from "effect"
import { SidecarConfig } from "../config"

/**
 * The sidecar already binds loopback only; the bearer token is what stops any
 * *other* local process from driving it. Only the Rust shell knows the token,
 * so the webview can never call the system directly.
 */
export const withBearerAuth = (app: HttpApp.Default): HttpApp.Default<never, SidecarConfig> =>
  Effect.gen(function* () {
    const config = yield* SidecarConfig
    const request = yield* HttpServerRequest.HttpServerRequest

    if (request.headers["authorization"] !== `Bearer ${Redacted.value(config.token)}`) {
      return HttpServerResponse.empty({ status: 401 })
    }

    return yield* app
  })
