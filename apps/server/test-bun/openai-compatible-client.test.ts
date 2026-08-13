import { describe, expect, it } from "bun:test"
import { FolderId } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiProviderPolicyLive } from "../src/features/ai/ai-provider-policy"
import type { AiProviderSettings } from "../src/features/ai/ai-settings-repository"
import {
  type MetadataRequest,
  OpenAiCompatibleClient,
  OpenAiCompatibleClientLive
} from "../src/features/ai/openai-compatible-client"
import { localSourceUrl } from "../src/features/references/local-source-url"
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

const metadataRequest = (
  overrides: Partial<MetadataRequest> = {}
): MetadataRequest => ({
  currentTitle: "Saved reference",
  currentDescription: "",
  sourceUrl: "https://example.com/product",
  source: "website",
  kind: "web-capture",
  assetPath: "",
  previewPath: null,
  mimeType: "image/png",
  folders: [],
  ...overrides
})

/** The smallest PNG a vision endpoint would be handed: one opaque pixel. */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

const withTemporaryDirectory = async (run: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "refnest-ai-client-"))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const ClientTest = OpenAiCompatibleClientLive.pipe(
  Layer.provide(
    AiProviderPolicyLive.pipe(Layer.provide(OutboundUrlPolicyLive))
  )
)

describe("OpenAI-compatible metadata client", () => {
  it("targets chat completions, sends provider auth, and parses fenced metadata", async () => {
    const observedRequests: Array<{
      readonly path: string
      readonly authorization: string | null
      readonly responseFormat: unknown
    }> = []
    let responseNumber = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        responseNumber += 1
        const body = (await request.json()) as {
          readonly response_format?: unknown
        }
        observedRequests.push({
          path: new URL(request.url).pathname,
          authorization: request.headers.get("authorization"),
          responseFormat: body.response_format
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
          const request = metadataRequest({
            folders: [
              {
                id: FolderId.make("folder_editorial"),
                name: "Editorial"
              }
            ]
          })
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
              authorization: "Bearer provider-secret",
              responseFormat: { type: "json_object" }
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

  it("attaches the stored asset and hides the local placeholder URL", async () => {
    await withTemporaryDirectory(async (directory) => {
      const assetPath = join(directory, "c7b39de4.png")
      await Bun.write(assetPath, ONE_PIXEL_PNG)

      let observedPrompt: Record<string, unknown> = {}
      let observedImageUrl: string | null = null
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          const body = (await request.json()) as {
            readonly messages: ReadonlyArray<{
              readonly role: string
              readonly content:
                | string
                | ReadonlyArray<{
                    readonly type: string
                    readonly text?: string
                    readonly image_url?: { readonly url: string }
                  }>
            }>
          }
          const user = body.messages.find((message) => message.role === "user")
          if (user !== undefined && Array.isArray(user.content)) {
            for (const part of user.content) {
              if (part.type === "text" && part.text !== undefined) {
                observedPrompt = JSON.parse(part.text) as Record<string, unknown>
              }
              if (part.type === "image_url" && part.image_url !== undefined) {
                observedImageUrl = part.image_url.url
              }
            }
          }

          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Muted product shot",
                    description: "A single flat colour.",
                    tags: ["Product"],
                    colors: ["#FFFFFF"],
                    suggestedFolderId: null
                  })
                }
              }
            ]
          })
        }
      })

      try {
        await Effect.runPromise(
          Effect.gen(function* () {
            const client = yield* OpenAiCompatibleClient
            yield* client.generateMetadata(
              providerSettings(`http://127.0.0.1:${server.port}/v1`),
              metadataRequest({
                sourceUrl: localSourceUrl("c7b39de4.webp"),
                source: "local-file",
                kind: "image",
                assetPath,
                previewPath: null
              })
            )

            expect(observedImageUrl).toStartWith("data:image/png;base64,")
            expect(observedPrompt["imageAttached"]).toBe(true)
            expect(observedPrompt["sourceFile"]).toBe("c7b39de4.webp")
            expect(observedPrompt["sourceUrl"]).toBeUndefined()
            expect(JSON.stringify(observedPrompt)).not.toContain(
              "local.refnest.invalid"
            )
          }).pipe(Effect.provide(ClientTest))
        )
      } finally {
        await server.stop(true)
      }
    })
  })

  it("recovers metadata from a reply the model wrapped in prose", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({
          choices: [
            {
              message: {
                content:
                  "Sure! Here is the metadata:\n{\"title\":\"  Studio landing page  \",\"description\":\"Warm editorial layout.\",\"tags\":[\"Landing\",\"landing\",\"\",\"Warm\"],\"colors\":[\"#fff\",\"e8d5c4\",\"not-a-color\"],\"suggestedFolderId\":\"folder_invented\"}\nLet me know if you want changes."
              }
            }
          ]
        })
      }
    })

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenAiCompatibleClient
          const metadata = yield* client.generateMetadata(
            providerSettings(`http://127.0.0.1:${server.port}/v1`),
            metadataRequest({
              folders: [{ id: FolderId.make("folder_real"), name: "Real" }]
            })
          )

          expect(metadata.title).toBe("Studio landing page")
          expect(metadata.tags).toStrictEqual(["Landing", "Warm"])
          expect(metadata.colors).toStrictEqual(["#FFFFFF", "#E8D5C4"])
          // An id that was never offered would move the reference nowhere.
          expect(metadata.suggestedFolderId).toBeNull()
        }).pipe(Effect.provide(ClientTest))
      )
    } finally {
      await server.stop(true)
    }
  })

  it("retries without response_format when the provider rejects it", async () => {
    const observedFormats: Array<unknown> = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as {
          readonly response_format?: unknown
        }
        observedFormats.push(body.response_format)
        if (body.response_format !== undefined) {
          return Response.json({ error: "unknown parameter" }, { status: 400 })
        }
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Legacy provider reply",
                  description: "",
                  tags: [],
                  colors: [],
                  suggestedFolderId: null
                })
              }
            }
          ]
        })
      }
    })

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenAiCompatibleClient
          const metadata = yield* client.generateMetadata(
            providerSettings(`http://127.0.0.1:${server.port}/v1`),
            metadataRequest()
          )

          expect(metadata.title).toBe("Legacy provider reply")
          expect(observedFormats).toStrictEqual([
            { type: "json_object" },
            undefined
          ])
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
          const request = metadataRequest()

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
