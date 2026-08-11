import { HttpApiBuilder } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { ApiLive } from "../src/http/api"
import { SettingsRepositoryTest } from "./settings-repository-test"

const ApiUnderTest = Layer.merge(
  ApiLive.pipe(Layer.provide(SettingsRepositoryTest)),
  BunHttpServer.layerContext
)

export const webHandler = Effect.acquireRelease(
  Effect.sync(() => HttpApiBuilder.toWebHandler(ApiUnderTest)),
  ({ dispose }) => Effect.promise(() => dispose())
)

export const jsonRequest = (method: string, path: string, body?: unknown) =>
  new Request(`http://sidecar.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } })
  })
