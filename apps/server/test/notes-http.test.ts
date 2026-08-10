import { describe, expect, it } from "@effect/vitest"
import { HttpApiBuilder } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { ApiLive } from "../src/http/api"

/** The API plus the platform services `toWebHandler` needs to run a router in-process. */
const ApiUnderTest = Layer.merge(ApiLive, BunHttpServer.layerContext)

const webHandler = Effect.acquireRelease(
  Effect.sync(() => HttpApiBuilder.toWebHandler(ApiUnderTest)),
  ({ dispose }) => Effect.promise(() => dispose())
)

const jsonRequest = (method: string, path: string, body?: unknown) =>
  new Request(`http://sidecar.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } })
  })

describe("notes over HTTP", () => {
  it.scoped("serves the full note lifecycle with contract-derived status codes", () =>
    Effect.gen(function* () {
      const { handler } = yield* webHandler

      const empty = yield* Effect.promise(() => handler(jsonRequest("GET", "/notes")))
      expect(empty.status).toBe(200)
      expect(yield* Effect.promise(() => empty.json())).toStrictEqual([])

      const created = yield* Effect.promise(() =>
        handler(jsonRequest("POST", "/notes", { title: "Wire the sidecar", body: "bun -> rust -> app" }))
      )
      expect(created.status).toBe(201)
      const note = (yield* Effect.promise(() => created.json())) as { id: string; title: string }
      expect(note.title).toBe("Wire the sidecar")

      const fetched = yield* Effect.promise(() => handler(jsonRequest("GET", `/notes/${note.id}`)))
      expect(fetched.status).toBe(200)

      const removed = yield* Effect.promise(() => handler(jsonRequest("DELETE", `/notes/${note.id}`)))
      expect(removed.status).toBe(204)

      const missing = yield* Effect.promise(() => handler(jsonRequest("GET", `/notes/${note.id}`)))
      expect(missing.status).toBe(404)
    }))

  it.scoped("rejects a payload that violates the contract", () =>
    Effect.gen(function* () {
      const { handler } = yield* webHandler

      const response = yield* Effect.promise(() =>
        handler(jsonRequest("POST", "/notes", { title: "   ", body: "" }))
      )
      expect(response.status).toBe(400)
    }))

  it.scoped("reports health", () =>
    Effect.gen(function* () {
      const { handler } = yield* webHandler

      const response = yield* Effect.promise(() => handler(jsonRequest("GET", "/health")))
      expect(response.status).toBe(200)
      const report = (yield* Effect.promise(() => response.json())) as { status: string }
      expect(report.status).toBe("ok")
    }))
})
