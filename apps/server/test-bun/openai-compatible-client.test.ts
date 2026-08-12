import { describe, expect, it } from "bun:test"
import { FolderId } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { AiProviderPolicyLive } from "../src/features/ai/ai-provider-policy"
import type { AiProviderSettings } from "../src/features/ai/ai-settings-repository"
import {
  OpenAiCompatibleClient,
  OpenAiCompatibleClientLive
} from "../src/features/ai/openai-compatible-client"
import { OutboundUrlPolicyLive } from "../src/security/outbound-url-policy"

const providerSettings = (
  baseUrl: string,
  enabled = true
): AiProviderSettings => ({
  baseUrl,
  model: "vision-model",
  apiKey: "provider-secret",
  localProvider: true,
  enabled
})

const ClientTest = OpenAiCompatibleClientLive.pipe(
  Layer.provide(
    AiProviderPolicyLive.pipe(Layer.provide(OutboundUrlPolicyLive))
  )
)

describe("OpenAI-compatible metadata client", () => {
  it("targets chat completions, sends provider auth, and parses fenced metadata", async () => {
    const observedRequests: Array<{ readonly path: string; readonly authorization: string | null }> = []
    let responseNumber = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        responseNumber += 1
        observedRequests.push({
          path: new URL(request.url).pathname,
          authorization: request.headers.get("authorization")
        })

        if (responseNumber === 1) {
          return Response.json({
            choices: [
              {
                message: {
                  content:
                    "```json\n{\"title\":\"Editorial product page\",\"description\":\"A restrained product story.\",\"tags\":[\"Editorial\",\"Dark\"],\"colors\":[\"#101010\",\"#F5F5F5\"],\"suggestedFolderId\":\"folder_editorial\"}\n```"
                }
              }
            ]
          })
        }

        return Response.json({ choices: [{ message: { content: "not-json" } }] })
      }
    })

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenAiCompatibleClient
          const request = {
            currentTitle: "Saved reference",
            currentDescription: "",
            sourceUrl: "https://example.com/product",
            source: "website" as const,
            kind: "web-capture" as const,
            previewPath: null,
            folders: [
              {
                id: FolderId.make("folder_editorial"),
                name: "Editorial"
              }
            ]
          }
          const baseUrl = `http://127.0.0.1:${server.port}/v1/`
          const metadata = yield* client.generateMetadata(
            providerSettings(baseUrl),
            request
          )

          expect(metadata).toMatchObject({
            title: "Editorial product page",
            tags: ["Editorial", "Dark"],
            suggestedFolderId: "folder_editorial"
          })
          expect(observedRequests).toStrictEqual([
            {
              path: "/v1/chat/completions",
              authorization: "Bearer provider-secret"
            }
          ])

          const malformed = yield* client
            .generateMetadata(providerSettings(baseUrl), request)
            .pipe(Effect.either)
          expect(malformed._tag).toBe("Left")
          if (malformed._tag === "Left") {
            expect(malformed.left._tag).toBe("AiRequestFailed")
          }

          const disabled = yield* client
            .generateMetadata(providerSettings(baseUrl, false), request)
            .pipe(Effect.either)
          expect(disabled._tag).toBe("Left")
          if (disabled._tag === "Left") {
            expect(disabled.left._tag).toBe("AiNotConfigured")
          }
          expect(observedRequests).toHaveLength(2)
        }).pipe(Effect.provide(ClientTest))
      )
    } finally {
      await server.stop(true)
    }
  })

  it("refuses redirects and does not expose provider error bodies", async () => {
    let redirectedRequests = 0
    const redirectTarget = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        redirectedRequests += 1
        return Response.json({})
      }
    })
    const redirectingProvider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response(null, {
          status: 307,
          headers: {
            location: `http://127.0.0.1:${redirectTarget.port}/credential-leak`
          }
        })
      }
    })
    const rejectingProvider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response("provider-secret must remain private", { status: 401 })
      }
    })

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenAiCompatibleClient
          const request = {
            currentTitle: "Saved reference",
            currentDescription: "",
            sourceUrl: "https://example.com/product",
            source: "website" as const,
            kind: "web-capture" as const,
            previewPath: null,
            folders: []
          }

          const redirected = yield* client
            .generateMetadata(
              providerSettings(`http://127.0.0.1:${redirectingProvider.port}/v1`),
              request
            )
            .pipe(Effect.either)
          expect(redirected._tag).toBe("Left")
          expect(redirectedRequests).toBe(0)

          const rejected = yield* client
            .generateMetadata(
              providerSettings(`http://127.0.0.1:${rejectingProvider.port}/v1`),
              request
            )
            .pipe(Effect.either)
          expect(rejected._tag).toBe("Left")
          if (rejected._tag === "Left") {
            expect(rejected.left.message).not.toContain("provider-secret")
          }
        }).pipe(Effect.provide(ClientTest))
      )
    } finally {
      await Promise.all([
        redirectTarget.stop(true),
        redirectingProvider.stop(true),
        rejectingProvider.stop(true)
      ])
    }
  })
})
