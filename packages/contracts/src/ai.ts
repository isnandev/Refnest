import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

const AiProviderBaseUrl = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(2_048)
)
const AiModelName = Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(200))
const AiApiKey = Schema.String.pipe(Schema.maxLength(16_384))

export class AiSettings extends Schema.Class<AiSettings>("AiSettings")({
  baseUrl: AiProviderBaseUrl,
  model: AiModelName,
  hasApiKey: Schema.Boolean,
  localProvider: Schema.Boolean,
  enabled: Schema.Boolean
}) {}

export class UpdateAiSettings extends Schema.Class<UpdateAiSettings>(
  "UpdateAiSettings"
)({
  baseUrl: Schema.optional(AiProviderBaseUrl),
  model: Schema.optional(AiModelName),
  apiKey: Schema.optional(AiApiKey),
  localProvider: Schema.optional(Schema.Boolean),
  enabled: Schema.optional(Schema.Boolean)
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
