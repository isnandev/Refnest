import {
  AiRequestFailed,
  AiSettings,
  AiSettingsRejected,
  DEFAULT_AI_METADATA_PROMPT,
  type UpdateAiSettings
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { AiProviderPolicy } from "./ai-provider-policy"

type AiSettingsRow = {
  readonly base_url: string
  readonly model: string
  readonly api_key: string | null
  readonly local_provider: number
  readonly enabled: number
  readonly metadata_prompt: string
}

export type AiProviderSettings = {
  readonly baseUrl: string
  readonly model: string
  readonly apiKey: string | null
  readonly localProvider: boolean
  readonly enabled: boolean
  readonly metadataPrompt: string
}

const storedMetadataPrompt = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ""
  return trimmed.length === 0 ? DEFAULT_AI_METADATA_PROMPT : trimmed
}

const requestFailure = (reason: string) => new AiRequestFailed({ reason })

const toPublicSettings = (row: AiSettingsRow) =>
  new AiSettings({
    baseUrl: row.base_url,
    model: row.model,
    hasApiKey: row.api_key !== null && row.api_key.length > 0,
    localProvider: row.local_provider === 1,
    enabled: row.enabled === 1,
    metadataPrompt: storedMetadataPrompt(row.metadata_prompt)
  })

const toProviderSettings = (row: AiSettingsRow): AiProviderSettings => ({
  baseUrl: row.base_url,
  model: row.model,
  apiKey: row.api_key,
  localProvider: row.local_provider === 1,
  enabled: row.enabled === 1,
  metadataPrompt: storedMetadataPrompt(row.metadata_prompt)
})

export type AiSettingsRepositoryShape = {
  readonly get: () => Effect.Effect<AiSettings, AiRequestFailed>
  readonly getProvider: () => Effect.Effect<AiProviderSettings, AiRequestFailed>
  readonly update: (
    patch: UpdateAiSettings
  ) => Effect.Effect<AiSettings, AiRequestFailed | AiSettingsRejected>
}

export class AiSettingsRepository extends Context.Tag("AiSettingsRepository")<
  AiSettingsRepository,
  AiSettingsRepositoryShape
>() {}

const makeAiSettingsRepository = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const providerPolicy = yield* AiProviderPolicy
  const select = connection.query<AiSettingsRow, []>(`
    SELECT base_url, model, api_key, local_provider, enabled, metadata_prompt
    FROM ai_settings
    WHERE id = 1
  `)
  const updateRow = connection.query<
    never,
    [string, string, string | null, number, number, string, string]
  >(`
    UPDATE ai_settings
    SET base_url = ?, model = ?, api_key = ?, local_provider = ?, enabled = ?, metadata_prompt = ?, updated_at = ?
    WHERE id = 1
  `)

  const read = () => {
    const row = select.get()
    if (row === null) {
      throw new Error("the AI settings row is missing")
    }
    return row
  }

  const load = Effect.fn("AiSettingsRepository.load")(function* () {
    return yield* Effect.try({
      try: read,
      catch: () => requestFailure("AI settings could not be loaded.")
    })
  })

  const get = Effect.fn("AiSettingsRepository.get")(function* () {
    return toPublicSettings(yield* load())
  })

  const getProvider = Effect.fn("AiSettingsRepository.getProvider")(function* () {
    return toProviderSettings(yield* load())
  })

  const update = Effect.fn("AiSettingsRepository.update")(function* (
    patch: UpdateAiSettings
  ) {
    const current = yield* load()
    const localProvider = patch.localProvider ?? (current.local_provider === 1)
    const currentOrigin = (() => {
      try {
        return new URL(current.base_url).origin
      } catch {
        return null
      }
    })()
    const nextProvider = yield* providerPolicy
      .normalize(patch.baseUrl ?? current.base_url, localProvider)
      .pipe(
        Effect.mapError((error) => new AiSettingsRejected({ reason: error.reason }))
      )
    const suppliedApiKey = patch.apiKey?.trim()
    const apiKey =
      suppliedApiKey !== undefined
        ? suppliedApiKey.length === 0
          ? null
          : suppliedApiKey
        : currentOrigin !== null && currentOrigin === nextProvider.origin
          ? current.api_key
          : null
    const next: AiSettingsRow = {
      base_url: nextProvider.baseUrl,
      model: (patch.model ?? current.model).trim(),
      api_key: apiKey,
      local_provider: localProvider ? 1 : 0,
      enabled: patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0,
      metadata_prompt: storedMetadataPrompt(
        patch.metadataPrompt ?? current.metadata_prompt
      )
    }

    yield* Effect.try({
      try: () =>
        updateRow.run(
          next.base_url,
          next.model,
          next.api_key,
          next.local_provider,
          next.enabled,
          next.metadata_prompt,
          new Date().toISOString()
        ),
      catch: () => requestFailure("AI settings could not be saved.")
    })
    return toPublicSettings(next)
  })

  return AiSettingsRepository.of({ get, getProvider, update })
})

export const AiSettingsRepositoryLive = Layer.effect(
  AiSettingsRepository,
  makeAiSettingsRepository
)
