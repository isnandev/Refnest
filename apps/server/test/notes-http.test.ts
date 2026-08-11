import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { jsonRequest, webHandler } from "./api-test-client"

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
