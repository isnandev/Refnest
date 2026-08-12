import { describe, expect, it } from "bun:test"
import { Note } from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { jsonRequest, webHandler } from "./api-test-client"

describe("notes over HTTP", () => {
  it("serves the full note lifecycle with contract-derived status codes", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const { handler } = yield* webHandler

      const empty = yield* Effect.promise(() => handler(jsonRequest("GET", "/notes")))
      expect(empty.status).toBe(200)
      expect(yield* Effect.promise(() => empty.json())).toStrictEqual([])

      const created = yield* Effect.promise(() =>
        handler(jsonRequest("POST", "/notes", { title: "Wire the sidecar", body: "bun -> rust -> app" }))
      )
      expect(created.status).toBe(201)
      const note = yield* Effect.promise(() => created.json()).pipe(
        Effect.flatMap(Schema.decodeUnknown(Note))
      )
      expect(note.title).toBe("Wire the sidecar")

      const fetched = yield* Effect.promise(() => handler(jsonRequest("GET", `/notes/${note.id}`)))
      expect(fetched.status).toBe(200)

      const removed = yield* Effect.promise(() => handler(jsonRequest("DELETE", `/notes/${note.id}`)))
      expect(removed.status).toBe(204)

      const missing = yield* Effect.promise(() => handler(jsonRequest("GET", `/notes/${note.id}`)))
      expect(missing.status).toBe(404)
    })))
  })

  it("rejects a payload that violates the contract", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const { handler } = yield* webHandler

      const response = yield* Effect.promise(() =>
        handler(jsonRequest("POST", "/notes", { title: "   ", body: "" }))
      )
      expect(response.status).toBe(400)
    })))
  })

  it("reports health", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const { handler } = yield* webHandler

      const response = yield* Effect.promise(() => handler(jsonRequest("GET", "/health")))
      expect(response.status).toBe(200)
      const report = yield* Effect.promise(() => response.json())
      expect(report).toMatchObject({ status: "ok" })
    })))
  })
})
