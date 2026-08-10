import { describe, expect, it } from "@effect/vitest"
import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Layer, Redacted } from "effect"
import { SidecarConfig } from "../src/config"
import { withBearerAuth } from "../src/http/auth"

const TOKEN = "test-token"

const ConfigTest = Layer.succeed(
  SidecarConfig,
  SidecarConfig.make({ host: "127.0.0.1", port: 0, token: Redacted.make(TOKEN) })
)

const guarded = withBearerAuth(Effect.succeed(HttpServerResponse.text("reached")))

const runWithHeaders = (headers: Record<string, string>) =>
  guarded.pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(new Request("http://127.0.0.1/health", { headers }))
    ),
    Effect.provide(ConfigTest)
  )

describe("withBearerAuth", () => {
  it.effect("rejects a request without the sidecar token", () =>
    Effect.gen(function* () {
      const response = yield* runWithHeaders({})
      expect(response.status).toBe(401)
    }))

  it.effect("rejects a request carrying the wrong token", () =>
    Effect.gen(function* () {
      const response = yield* runWithHeaders({ authorization: "Bearer nope" })
      expect(response.status).toBe(401)
    }))

  it.effect("passes a request carrying the sidecar token through", () =>
    Effect.gen(function* () {
      const response = yield* runWithHeaders({ authorization: `Bearer ${TOKEN}` })
      expect(response.status).toBe(200)
    }))
})
