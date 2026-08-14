import {
  AiNotConfigured,
  AiRequestFailed,
  FolderId,
  type ReferenceKind,
  type ReferenceSource
} from "@refnest/contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { ImageCodec } from "../converter/image-codec"
import { localSourceFileName } from "../references/local-source-url"
import { AiProviderPolicy } from "./ai-provider-policy"
import { prepareAiImage } from "./ai-image"
import {
  MAX_METADATA_COLORS,
  MAX_METADATA_TAGS,
  type MetadataResponse,
  readMetadataResponse
} from "./ai-metadata-response"
import { readAiResponseText } from "./ai-response-reader"
import type { AiProviderSettings } from "./ai-settings-repository"

export type { MetadataResponse } from "./ai-metadata-response"

export type MetadataFolderOption = {
  readonly id: FolderId
  readonly name: string
}

export type MetadataRequest = {
  readonly currentTitle: string
  readonly currentDescription: string
  readonly currentTags: ReadonlyArray<string>
  readonly currentColors: ReadonlyArray<string>
  readonly sourceUrl: string
  readonly source: ReferenceSource
  readonly kind: ReferenceKind
  readonly assetPath: string
  readonly previewPath: string | null
  readonly mimeType: string
  readonly folders: ReadonlyArray<MetadataFolderOption>
}

const ChatCompletionResponse = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({ content: Schema.String })
    })
  ).pipe(Schema.minItems(1))
})

const requestFailure = (reason: string) => new AiRequestFailed({ reason })

const discardBody = (response: Response) =>
  Effect.promise(async () => {
    await response.body?.cancel().catch(() => undefined)
  })

/**
 * A locally imported file is recorded against a placeholder URL that is
 * designed never to resolve. Handing that to a model reads as an image it is
 * expected to fetch, so the file name goes in its place.
 */
const describeSource = (request: MetadataRequest) => {
  const fileName = localSourceFileName(request.sourceUrl)
  return fileName === null
    ? { sourceUrl: request.sourceUrl }
    : { sourceFile: fileName }
}

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
  const imageCodec = yield* ImageCodec

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

      const preparedImage = yield* prepareAiImage(request).pipe(
        Effect.provideService(ImageCodec, imageCodec)
      )
      const image = preparedImage?.dataUrl ?? null
      const folderOptions = request.folders.map((folder) => ({
        id: folder.id,
        name: folder.name
      }))
      const text = JSON.stringify({
        task: "Describe and organize this saved design inspiration.",
        currentTitle: request.currentTitle,
        currentDescription: request.currentDescription,
        currentTags: request.currentTags,
        currentColors: request.currentColors,
        ...describeSource(request),
        source: request.source,
        kind: request.kind,
        imageAttached: image !== null,
        folders: folderOptions,
        output: {
          title: "concise descriptive title",
          description: "what is visually useful about this reference",
          tags: `up to ${MAX_METADATA_TAGS} useful visual/product tags`,
          colors: `up to ${MAX_METADATA_COLORS} dominant #RRGGBB colors`,
          suggestedFolderId: "one listed folder id or null"
        }
      })
      const messages = [
        { role: "system", content: settings.metadataPrompt },
        {
          role: "user",
          content:
            image === null
              ? text
              : [
                  { type: "text", text },
                  { type: "image_url", image_url: { url: image } }
                ]
        }
      ]
      const headers: Record<string, string> = {
        "content-type": "application/json"
      }
      if (settings.apiKey !== null && settings.apiKey.length > 0) {
        headers["authorization"] = `Bearer ${settings.apiKey}`
      }

      const postCompletion = (jsonMode: boolean) =>
        Effect.tryPromise({
          try: () =>
            fetch(provider.completionUrl, {
              method: "POST",
              headers,
              redirect: "error",
              body: JSON.stringify({
                model: settings.model,
                temperature: 0.2,
                // Asking for JSON is what stops a chat-tuned model from
                // answering in prose; the system prompt names JSON too,
                // which providers require before honouring this.
                ...(jsonMode
                  ? { response_format: { type: "json_object" } }
                  : {}),
                messages
              }),
              signal: AbortSignal.timeout(60_000)
            }),
          catch: () =>
            requestFailure("The OpenAI-compatible provider could not be reached.")
        })

      let response = yield* postCompletion(true)
      if (response.status === 400) {
        // A server that does not know response_format rejects the whole
        // request, and a bare 400 is the only notice it gives, so the call is
        // retried once without it rather than failing enrichment outright.
        yield* discardBody(response)
        response = yield* postCompletion(false)
      }

      if (!response.ok) {
        yield* discardBody(response)
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

      return yield* readMetadataResponse(content, {
        currentTitle: request.currentTitle,
        currentDescription: request.currentDescription,
        currentTags: request.currentTags,
        currentColors: request.currentColors,
        localColors: preparedImage?.colors ?? [],
        imageAttached: image !== null,
        folderIds: new Set(folderOptions.map((folder) => folder.id))
      })
    }
  )

  return OpenAiCompatibleClient.of({ generateMetadata })
})

export const OpenAiCompatibleClientLive = Layer.effect(
  OpenAiCompatibleClient,
  makeOpenAiCompatibleClient
)
