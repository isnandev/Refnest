import {
  AiNotConfigured,
  AiRequestFailed,
  FolderId,
  HexColor,
  ReferenceDescription,
  ReferenceTag,
  ReferenceTitle,
  type ReferenceKind,
  type ReferenceSource
} from "@refnest/contracts"
import { Buffer } from "node:buffer"
import { Context, Effect, Layer, Schema } from "effect"
import { AiProviderPolicy } from "./ai-provider-policy"
import { readAiResponseText } from "./ai-response-reader"
import type { AiProviderSettings } from "./ai-settings-repository"

export type MetadataFolderOption = {
  readonly id: FolderId
  readonly name: string
}

export type MetadataRequest = {
  readonly currentTitle: string
  readonly currentDescription: string
  readonly sourceUrl: string
  readonly source: ReferenceSource
  readonly kind: ReferenceKind
  readonly previewPath: string | null
  readonly folders: ReadonlyArray<MetadataFolderOption>
}

const MetadataResponse = Schema.Struct({
  title: ReferenceTitle,
  description: ReferenceDescription,
  tags: Schema.Array(ReferenceTag).pipe(Schema.maxItems(12)),
  colors: Schema.Array(HexColor).pipe(Schema.maxItems(8)),
  suggestedFolderId: Schema.NullOr(FolderId)
})
export type MetadataResponse = typeof MetadataResponse.Type

const ChatCompletionResponse = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({ content: Schema.String })
    })
  ).pipe(Schema.minItems(1))
})

const requestFailure = (reason: string) => new AiRequestFailed({ reason })

const readPreviewDataUrl = (path: string | null) =>
  Effect.tryPromise({
    try: async () => {
      if (path === null) return null
      const file = Bun.file(path)
      if (!(await file.exists()) || file.size > 5 * 1_024 * 1_024) return null
      const mimeType = file.type || "image/png"
      const bytes = await file.arrayBuffer()
      return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`
    },
    catch: () => requestFailure("The reference preview could not be prepared for AI.")
  })

const stripJsonFence = (content: string) =>
  content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")

export type OpenAiCompatibleClientShape = {
  readonly generateMetadata: (
    settings: AiProviderSettings,
    request: MetadataRequest
  ) => Effect.Effect<MetadataResponse, AiNotConfigured | AiRequestFailed>
}

export class OpenAiCompatibleClient extends Context.Tag("OpenAiCompatibleClient")<
  OpenAiCompatibleClient,
  OpenAiCompatibleClientShape
>() {}

const makeOpenAiCompatibleClient = Effect.gen(function* () {
  const providerPolicy = yield* AiProviderPolicy

  const generateMetadata = Effect.fn("OpenAiCompatibleClient.generateMetadata")(
    function* (settings: AiProviderSettings, request: MetadataRequest) {
      if (!settings.enabled) {
        return yield* new AiNotConfigured({
          reason: "Enable an OpenAI-compatible provider before enriching references."
        })
      }

      const provider = yield* providerPolicy
        .normalize(settings.baseUrl, settings.localProvider)
        .pipe(
          Effect.mapError(() =>
            new AiNotConfigured({
              reason: "The AI provider URL is not allowed by the configured provider mode."
            })
          )
        )

      const preview = yield* readPreviewDataUrl(request.previewPath)
      const folderOptions = request.folders.map((folder) => ({
        id: folder.id,
        name: folder.name
      }))
      const text = JSON.stringify({
        task: "Describe and organize this saved design inspiration.",
        currentTitle: request.currentTitle,
        currentDescription: request.currentDescription,
        sourceUrl: request.sourceUrl,
        source: request.source,
        kind: request.kind,
        folders: folderOptions,
        output: {
          title: "concise descriptive title",
          description: "what is visually useful about this reference",
          tags: "up to 12 useful visual/product tags",
          colors: "up to 8 dominant #RRGGBB colors",
          suggestedFolderId: "one listed folder id or null"
        }
      })
      const userContent =
        preview === null
          ? text
          : [
              { type: "text", text },
              { type: "image_url", image_url: { url: preview } }
            ]
      const headers: Record<string, string> = {
        "content-type": "application/json"
      }
      if (settings.apiKey !== null && settings.apiKey.length > 0) {
        headers["authorization"] = `Bearer ${settings.apiKey}`
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(provider.completionUrl, {
            method: "POST",
            headers,
            redirect: "error",
            body: JSON.stringify({
              model: settings.model,
              temperature: 0.2,
              messages: [
                {
                  role: "system",
                  content:
                    "Return only valid JSON. Preserve factual source information, use practical design vocabulary, and never invent a folder id."
                },
                { role: "user", content: userContent }
              ]
            }),
            signal: AbortSignal.timeout(60_000)
          }),
        catch: () => requestFailure("The OpenAI-compatible provider could not be reached.")
      })

      if (!response.ok) {
        yield* Effect.promise(async () => {
          await response.body?.cancel().catch(() => undefined)
        })
        return yield* requestFailure(
          `The AI provider returned status ${response.status}.`
        )
      }

      const responseText = yield* readAiResponseText(response)
      const unknownPayload = yield* Effect.try({
        try: () => JSON.parse(responseText),
        catch: () => requestFailure("The AI provider returned unreadable JSON.")
      })
      const completion = yield* Schema.decodeUnknown(ChatCompletionResponse)(
        unknownPayload
      ).pipe(
        Effect.mapError(() =>
          requestFailure("The AI provider response did not contain a completion.")
        )
      )
      const content = completion.choices[0]?.message.content
      if (content === undefined) {
        return yield* requestFailure("The AI provider returned an empty completion.")
      }

      const metadataJson = yield* Effect.try({
        try: () => JSON.parse(stripJsonFence(content)),
        catch: () => requestFailure("The AI provider did not return valid metadata JSON.")
      })

      return yield* Schema.decodeUnknown(MetadataResponse)(metadataJson).pipe(
        Effect.mapError(() =>
          requestFailure("The AI metadata did not match the required fields.")
        )
      )
    }
  )

  return OpenAiCompatibleClient.of({ generateMetadata })
})

export const OpenAiCompatibleClientLive = Layer.effect(
  OpenAiCompatibleClient,
  makeOpenAiCompatibleClient
)
