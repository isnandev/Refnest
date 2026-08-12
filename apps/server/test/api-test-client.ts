import { HttpApiBuilder } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer, Redacted } from "effect"
import { applicationServicesLive } from "../src/application-services"
import { SidecarConfig } from "../src/config"
import { ApiLive } from "../src/http/api"
import { withBearerAuth } from "../src/http/auth"
import { temporaryDatabase } from "../test-bun/temporary-database"

export const webHandler = Effect.gen(function* () {
  const database = yield* temporaryDatabase
  const apiUnderTest = Layer.merge(
    ApiLive.pipe(
      Layer.provide(applicationServicesLive(database.path))
    ),
    BunHttpServer.layerContext
  )
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => HttpApiBuilder.toWebHandler(apiUnderTest)),
    ({ dispose }) => Effect.promise(() => dispose())
  )

  return { ...server, databasePath: database.path }
})

export const TEST_BEARER_TOKEN = "refnest-test-token"

const TestSidecarConfig = SidecarConfig.make({
  host: "127.0.0.1",
  port: 0,
  token: Redacted.make(TEST_BEARER_TOKEN)
})

export const authenticatedWebHandler = Effect.gen(function* () {
  const database = yield* temporaryDatabase
  const apiUnderTest = Layer.merge(
    ApiLive.pipe(
      Layer.provide(applicationServicesLive(database.path))
    ),
    BunHttpServer.layerContext
  )
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpApiBuilder.toWebHandler(apiUnderTest, {
        middleware: (app) =>
          withBearerAuth(app).pipe(
            Effect.provideService(SidecarConfig, TestSidecarConfig)
          )
      })
    ),
    ({ dispose }) => Effect.promise(() => dispose())
  )

  return { ...server, databasePath: database.path, directory: database.directory }
})

export const jsonRequest = (method: string, path: string, body?: unknown) =>
  new Request(`http://sidecar.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } })
  })

export const authenticatedJsonRequest = (
  method: string,
  path: string,
  body?: unknown
) => {
  const request = jsonRequest(method, path, body)
  const headers = new Headers(request.headers)
  headers.set("authorization", `Bearer ${TEST_BEARER_TOKEN}`)
  return new Request(request, { headers })
}
