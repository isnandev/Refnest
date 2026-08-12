import { describe, expect, it } from "bun:test"
import { AiSettings } from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { jsonRequest, webHandler } from "../test/api-test-client"

describe("AI settings over HTTP", () => {
  it("accepts provider credentials without returning the secret", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler } = yield* webHandler
          const updatedResponse = yield* Effect.promise(() =>
            handler(
              jsonRequest("PUT", "/ai/settings", {
                baseUrl: "http://127.0.0.1:11434/v1/",
                model: "local-vision",
                apiKey: "provider-secret",
                localProvider: true,
                enabled: true
              })
            )
          )
          expect(updatedResponse.status).toBe(200)
          const updatedJson: unknown = yield* Effect.promise(() =>
            updatedResponse.json()
          )
          const updated = yield* Schema.decodeUnknown(AiSettings)(updatedJson)
          expect(updated).toMatchObject({
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "local-vision",
            hasApiKey: true,
            localProvider: true,
            enabled: true
          })
          expect(JSON.stringify(updatedJson)).not.toContain("provider-secret")
          expect(
            typeof updatedJson === "object" &&
              updatedJson !== null &&
              "apiKey" in updatedJson
          ).toBe(false)

          const loadedResponse = yield* Effect.promise(() =>
            handler(jsonRequest("GET", "/ai/settings"))
          )
          expect(loadedResponse.status).toBe(200)
          expect(
            yield* Effect.promise(() => loadedResponse.json()).pipe(
              Effect.flatMap(Schema.decodeUnknown(AiSettings))
            )
          ).toStrictEqual(updated)

          const invalid = yield* Effect.promise(() =>
            handler(
              jsonRequest("PUT", "/ai/settings", {
                baseUrl: "   "
              })
            )
          )
          expect(invalid.status).toBe(400)
        })
      )
    )
  })
})
