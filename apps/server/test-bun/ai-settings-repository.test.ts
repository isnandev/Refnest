import { describe, expect, it } from "bun:test"
import { AiSettings } from "@refnest/contracts"
import { Effect, Layer, Schema } from "effect"
import {
  AiSettingsRepository,
  AiSettingsRepositoryLive
} from "../src/features/ai/ai-settings-repository"
import { AiProviderPolicyLive } from "../src/features/ai/ai-provider-policy"
import { sqliteDatabaseLive } from "../src/persistence/sqlite-database"
import {
  makeOutboundUrlPolicy,
  OutboundUrlPolicy
} from "../src/security/outbound-url-policy"
import { temporaryDatabase } from "./temporary-database"

const FakeOutboundUrlPolicy = Layer.succeed(
  OutboundUrlPolicy,
  OutboundUrlPolicy.of(
    makeOutboundUrlPolicy(() => Effect.succeed(["8.8.8.8"]))
  )
)

const ProviderPolicyTest = AiProviderPolicyLive.pipe(
  Layer.provide(FakeOutboundUrlPolicy)
)

describe("AI settings repository", () => {
  it("redacts secrets, normalizes provider settings, and supports clearing a key", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase
          const repositoryLayer = AiSettingsRepositoryLive.pipe(
            Layer.provide(
              Layer.merge(
                sqliteDatabaseLive(database.path),
                ProviderPolicyTest
              )
            )
          )

          yield* Effect.gen(function* () {
            const repository = yield* AiSettingsRepository
            const defaults = yield* repository.get()

            expect(defaults).toMatchObject({
              baseUrl: "https://api.openai.com/v1",
              model: "gpt-4.1-mini",
              hasApiKey: false,
              localProvider: false,
              enabled: false
            })

            const updated = yield* repository.update({
              baseUrl: "http://127.0.0.1:11434/v1///",
              model: "vision-model",
              apiKey: "  provider-secret  ",
              localProvider: true,
              enabled: true
            })
            const encoded = yield* Schema.encode(AiSettings)(updated)
            const provider = yield* repository.getProvider()

            expect(updated).toMatchObject({
              baseUrl: "http://127.0.0.1:11434/v1",
              model: "vision-model",
              hasApiKey: true,
              localProvider: true,
              enabled: true
            })
            expect("apiKey" in encoded).toBe(false)
            expect(provider.apiKey).toBe("provider-secret")
            expect(provider.baseUrl).toBe("http://127.0.0.1:11434/v1")
            expect(provider.localProvider).toBe(true)

            const sameOrigin = yield* repository.update({
              baseUrl: "http://127.0.0.1:11434/api/v1/"
            })
            expect(sameOrigin.hasApiKey).toBe(true)
            expect((yield* repository.getProvider()).apiKey).toBe("provider-secret")

            const changedOrigin = yield* repository.update({
              baseUrl: "https://provider.example/v1",
              localProvider: false
            })
            expect(changedOrigin.hasApiKey).toBe(false)
            expect((yield* repository.getProvider()).apiKey).toBeNull()

            const replacement = yield* repository.update({
              baseUrl: "https://another.example/v1/",
              apiKey: "replacement-secret"
            })
            expect(replacement.hasApiKey).toBe(true)
            expect(replacement.baseUrl).toBe("https://another.example/v1")
            expect((yield* repository.getProvider()).apiKey).toBe("replacement-secret")

            const insecurePublic = yield* repository
              .update({ baseUrl: "http://provider.example/v1" })
              .pipe(Effect.either)
            expect(insecurePublic._tag).toBe("Left")
            if (insecurePublic._tag === "Left") {
              expect(insecurePublic.left._tag).toBe("AiSettingsRejected")
            }

            const cleared = yield* repository.update({ apiKey: "   " })
            expect(cleared.hasApiKey).toBe(false)
            expect((yield* repository.getProvider()).apiKey).toBeNull()
          }).pipe(Effect.provide(repositoryLayer))
        })
      )
    )
  })
})
