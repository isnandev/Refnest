import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

const AiProviderBaseUrl = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(2_048)
)
const AiModelName = Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(200))
const AiApiKey = Schema.String.pipe(Schema.maxLength(16_384))
const AiMetadataPrompt = Schema.String.pipe(Schema.maxLength(8_192))

/** System prompt for reference enrichment. The JSON reply contract stays fixed. */
export const DEFAULT_AI_METADATA_PROMPT = [
  "You label saved design references.",
  "Reply with a single JSON object and nothing else: no prose, no apology, no code fence.",
  "Any image is attached to the user message as inline data, so never ask for a URL and never try to fetch one.",
  "When no image is attached, work from the supplied text and still return the JSON object.",
  "Use practical design vocabulary, and choose suggestedFolderId from the listed folder ids or null, never an invented one."
].join(" ")

export class AiSettings extends Schema.Class<AiSettings>("AiSettings")({
  baseUrl: AiProviderBaseUrl,
  model: AiModelName,
  hasApiKey: Schema.Boolean,
  localProvider: Schema.Boolean,
  enabled: Schema.Boolean,
  metadataPrompt: AiMetadataPrompt
}) {}

export class UpdateAiSettings extends Schema.Class<UpdateAiSettings>(
  "UpdateAiSettings"
)({
  baseUrl: Schema.optional(AiProviderBaseUrl),
  model: Schema.optional(AiModelName),
  apiKey: Schema.optional(AiApiKey),
  localProvider: Schema.optional(Schema.Boolean),
  enabled: Schema.optional(Schema.Boolean),
  metadataPrompt: Schema.optional(AiMetadataPrompt)
}) {}

export class AiSettingsRejected extends Schema.TaggedError<AiSettingsRejected>()(
  "AiSettingsRejected",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}

export class AiNotConfigured extends Schema.TaggedError<AiNotConfigured>()(
  "AiNotConfigured",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}

export class AiRequestFailed extends Schema.TaggedError<AiRequestFailed>()(
  "AiRequestFailed",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 502 })
) {
  override get message(): string {
    return this.reason
  }
}
