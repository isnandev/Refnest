import { describe, expect, it } from "@effect/vitest"
import {
  AiSettings,
  DEFAULT_AI_METADATA_PROMPT,
  UpdateAiSettings
} from "@refnest/contracts"
import { Effect, Schema } from "effect"

describe("AI contracts", () => {
  it.effect("encodes only redacted public provider settings", () =>
    Effect.gen(function* () {
      const settings = yield* Schema.decodeUnknown(AiSettings)({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        hasApiKey: true,
        localProvider: false,
        enabled: true,
        metadataPrompt: DEFAULT_AI_METADATA_PROMPT,
        apiKey: "must-not-survive"
      })
      const encoded = yield* Schema.encode(AiSettings)(settings)

      expect(encoded.hasApiKey).toBe(true)
      expect(encoded.metadataPrompt).toBe(DEFAULT_AI_METADATA_PROMPT)
      expect("apiKey" in encoded).toBe(false)
    }))

  it.effect("accepts a partial secret update and rejects blank provider fields", () =>
    Effect.gen(function* () {
      const update = yield* Schema.decodeUnknown(UpdateAiSettings)({
        apiKey: "secret",
        enabled: true
      })
      const invalid = yield* Schema.decodeUnknown(UpdateAiSettings)({
        baseUrl: "   "
      }).pipe(Effect.either)

      expect(update.apiKey).toBe("secret")
      expect(invalid._tag).toBe("Left")
    }))
})
