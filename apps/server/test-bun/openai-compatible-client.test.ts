import { describe, expect, it } from "bun:test"
import { DEFAULT_AI_METADATA_PROMPT, FolderId } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiProviderPolicyLive } from "../src/features/ai/ai-provider-policy"
import type { AiProviderSettings } from "../src/features/ai/ai-settings-repository"
import { ImageCodecLive } from "../src/features/converter/image-codec"
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
  enabled,
  metadataPrompt: DEFAULT_AI_METADATA_PROMPT
})

const metadataRequest = (
  overrides: Partial<MetadataRequest> = {}
): MetadataRequest => ({
  currentTitle: "Saved reference",
  currentDescription: "",
  sourceUrl: "https://example.com/product",
  source: "website",
  kind: "pdf",
  assetPath: "",
  previewPath: null,
  mimeType: "application/pdf",
  currentTags: ["Existing tag"],
  currentColors: ["#112233"],
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
    Layer.merge(
      AiProviderPolicyLive.pipe(Layer.provide(OutboundUrlPolicyLive)),
      ImageCodecLive
    )
  )
)

describe("OpenAI-compatible metadata client", () => {
  it("targets chat completions, sends provider auth, and parses fenced metadata", async () => {
    const observedRequests: Array<{
      readonly path: string
      readonly authorization: string | null
      readonly responseFormat: unknown
      readonly systemPrompt: string | null
    }> = []
    let responseNumber = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        responseNumber += 1
        const body = (await request.json()) as {
          readonly response_format?: unknown
          readonly messages?: ReadonlyArray<{
            readonly role: string
            readonly content: unknown
          }>
        }
        observedRequests.push({
          path: new URL(request.url).pathname,
          authorization: request.headers.get("authorization"),
          responseFormat: body.response_format,
          systemPrompt:
            body.messages?.find((message) => message.role === "system")
              ?.content === undefined
              ? null
              : String(
                  body.messages.find((message) => message.role === "system")
                    ?.content
                )
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
            {
              ...providerSettings(baseUrl),
              metadataPrompt: "Label this as product photography."
            },
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
              responseFormat: { type: "json_object" },
              systemPrompt: "Label this as product photography."
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

  it("downscales an oversized visible image and derives its palette locally", async () => {
    await withTemporaryDirectory(async (directory) => {
      const assetPath = join(directory, "oversized.png")
      await Bun.write(
        assetPath,
        Buffer.concat([
          ONE_PIXEL_PNG,
          Buffer.alloc(5 * 1_024 * 1_024 + 1 - ONE_PIXEL_PNG.byteLength)
        ])
      )

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
                    readonly image_url?: { readonly url: string }
                  }>
            }>
          }
          const user = body.messages.find((message) => message.role === "user")
          if (user !== undefined && Array.isArray(user.content)) {
            observedImageUrl =
              user.content.find((part) => part.type === "image_url")?.image_url
                ?.url ?? null
          }

          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Visible image",
                    description: "A visible image.",
                    tags: ["Image"],
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
              metadataRequest({
                kind: "image",
                mimeType: "image/png",
                assetPath,
                previewPath: null
              })
            )

            expect(observedImageUrl).toStartWith("data:image/jpeg;base64,")
            expect(metadata.colors.length).toBeGreaterThan(0)
          }).pipe(Effect.provide(ClientTest))
        )
      } finally {
        await server.stop(true)
      }
    })
  })

  it("rejects a provider reply that claims the attached image is unavailable", async () => {
    await withTemporaryDirectory(async (directory) => {
      const assetPath = join(directory, "visible.png")
      await Bun.write(assetPath, ONE_PIXEL_PNG)
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch() {
          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Unspecified design inspiration (image)",
                    description:
                      "The attached image is not available for visual review in this interface, so no concrete style can be assessed.",
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
            const result = yield* client
              .generateMetadata(
                providerSettings(`http://127.0.0.1:${server.port}/v1`),
                metadataRequest({
                  kind: "image",
                  mimeType: "image/png",
                  assetPath,
                  previewPath: null
                })
              )
              .pipe(Effect.either)

            expect(result._tag).toBe("Left")
            if (result._tag === "Left") {
              expect(result.left.reason).toContain("could not inspect")
            }
          }).pipe(Effect.provide(ClientTest))
        )
      } finally {
        await server.stop(true)
      }
    })
  })

  it("preserves existing collections when the provider omits them", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Text-only metadata",
                  description: "Useful supplied context.",
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
            metadataRequest({ kind: "pdf", mimeType: "application/pdf" })
          )

          expect(metadata.tags).toStrictEqual(["Existing tag"])
          expect(metadata.colors).toStrictEqual(["#112233"])
        }).pipe(Effect.provide(ClientTest))
      )
    } finally {
      await server.stop(true)
    }
  })

  it("does not call the provider when an image cannot be prepared", async () => {
    let requests = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        requests += 1
        return Response.json({})
      }
    })

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenAiCompatibleClient
          const result = yield* client
            .generateMetadata(
              providerSettings(`http://127.0.0.1:${server.port}/v1`),
              metadataRequest({
                kind: "image",
                mimeType: "image/png",
                assetPath: "missing-image.png"
              })
            )
            .pipe(Effect.either)

          expect(result._tag).toBe("Left")
          if (result._tag === "Left") {
            expect(result.left.reason).toContain("could not be prepared")
          }
          expect(requests).toBe(0)
        }).pipe(Effect.provide(ClientTest))
      )
    } finally {
      await server.stop(true)
    }
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
