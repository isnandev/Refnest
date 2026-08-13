import {
  AiRequestFailed,
  FolderId,
  HexColor,
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_TAG_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  ReferenceDescription,
  ReferenceTag,
  ReferenceTitle
} from "@refnest/contracts"
import { Effect, Schema } from "effect"
import {
  normalizeReferenceColors,
  normalizeReferenceTags
} from "../references/reference-model"

export const MAX_METADATA_TAGS = 12
export const MAX_METADATA_COLORS = 8

export const MetadataResponse = Schema.Struct({
  title: ReferenceTitle,
  description: ReferenceDescription,
  tags: Schema.Array(ReferenceTag).pipe(Schema.maxItems(MAX_METADATA_TAGS)),
  colors: Schema.Array(HexColor).pipe(Schema.maxItems(MAX_METADATA_COLORS)),
  suggestedFolderId: Schema.NullOr(FolderId)
})
export type MetadataResponse = typeof MetadataResponse.Type

/** What a reply is measured against: the title it may replace, the folders it may pick. */
export type MetadataContext = {
  readonly currentTitle: string
  readonly currentDescription: string
  readonly currentTags: ReadonlyArray<string>
  readonly currentColors: ReadonlyArray<string>
  readonly localColors: ReadonlyArray<string>
  readonly imageAttached: boolean
  readonly folderIds: ReadonlySet<string>
}

const requestFailure = (reason: string) => new AiRequestFailed({ reason })

/**
 * Braces inside strings do not nest, so the scan tracks quoting rather than
 * counting every brace it sees.
 */
const balancedObject = (content: string): string | null => {
  const start = content.indexOf("{")
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < content.length; index += 1) {
    const character = content[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === "\"") inString = false
      continue
    }
    if (character === "\"") inString = true
    else if (character === "{") depth += 1
    else if (character === "}") {
      depth -= 1
      if (depth === 0) return content.slice(start, index + 1)
    }
  }
  return null
}

/**
 * A model that has been asked for JSON still fences it, or introduces it with a
 * sentence, often enough that one strict parse throws away usable replies.
 */
const readJsonObject = (content: string): unknown => {
  const trimmed = content.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  const candidates = [unfenced, balancedObject(unfenced)]

  for (const candidate of candidates) {
    if (candidate === null || candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // The next candidate is the fallback; an unusable reply fails below.
    }
  }
  return null
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const asText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength).trim() : ""

const asList = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : []

const HEX_SHORTHAND = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_FULL = /^#?([0-9a-f]{6})$/i

/** `#abc`, `aabbcc` and `#AABBCC` all describe a colour the contract accepts. */
const asHexColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const text = value.trim()

  const shorthand = HEX_SHORTHAND.exec(text)
  if (shorthand !== null) {
    const [, red = "", green = "", blue = ""] = shorthand
    return `#${red}${red}${green}${green}${blue}${blue}`.toUpperCase()
  }

  const full = HEX_FULL.exec(text)
  return full === null ? null : `#${(full[1] ?? "").toUpperCase()}`
}

const normalizedColors = (values: ReadonlyArray<unknown>) =>
  normalizeReferenceColors(
    values.map(asHexColor).filter((color): color is string => color !== null)
  ).slice(0, MAX_METADATA_COLORS)

const IMAGE_UNAVAILABLE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:image|attachment|visual)\b[^.]{0,100}\b(?:not available|unavailable|not accessible|cannot be accessed|can't be accessed)\b/i,
  /\b(?:cannot|can't|unable to)\b[^.]{0,80}\b(?:view|see|access|inspect|analy[sz]e)\b[^.]{0,40}\b(?:image|attachment|visual)\b/i
]

const claimsImageIsUnavailable = (payload: unknown) => {
  const raw = asRecord(payload)
  const reply = `${asText(raw["title"], REFERENCE_TITLE_MAX_LENGTH)} ${asText(
    raw["description"],
    REFERENCE_DESCRIPTION_MAX_LENGTH
  )}`
  return IMAGE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(reply))
}

/**
 * The reply is advisory, not authoritative: a title that ran long, a shorthand
 * colour, or a thirteenth tag is worth trimming rather than rejecting. Only a
 * folder id is treated strictly, because moving a reference into a folder that
 * was never offered would fail far away from here.
 */
const normalizeMetadata = (payload: unknown, context: MetadataContext) => {
  const raw = asRecord(payload)
  const title = asText(raw["title"], REFERENCE_TITLE_MAX_LENGTH)
  const description = asText(
    raw["description"],
    REFERENCE_DESCRIPTION_MAX_LENGTH
  )
  const suggestedFolderId = asText(raw["suggestedFolderId"], 256)
  const tags = normalizeReferenceTags(
    asList(raw["tags"])
      .map((tag) => asText(tag, REFERENCE_TAG_MAX_LENGTH))
      .filter((tag) => tag.length > 0)
  ).slice(0, MAX_METADATA_TAGS)
  const providerColors = normalizedColors(asList(raw["colors"]))
  const localColors = normalizedColors(context.localColors)

  return {
    title: title.length > 0 ? title : context.currentTitle,
    description:
      description.length > 0 ? description : context.currentDescription,
    tags:
      tags.length > 0
        ? tags
        : normalizeReferenceTags(context.currentTags).slice(0, MAX_METADATA_TAGS),
    colors:
      localColors.length > 0
        ? localColors
        : providerColors.length > 0
          ? providerColors
          : normalizedColors(context.currentColors),
    suggestedFolderId: context.folderIds.has(suggestedFolderId)
      ? suggestedFolderId
      : null
  }
}

/**
 * Turns the completion text into metadata the library can store, or into an
 * error that says which half of the exchange went wrong: a provider that
 * answered in prose, or a reply that carried nothing usable.
 */
export const readMetadataResponse = (
  content: string,
  context: MetadataContext
): Effect.Effect<MetadataResponse, AiRequestFailed> =>
  Effect.gen(function* () {
    const payload = readJsonObject(content)
    if (payload === null) {
      return yield* requestFailure(
        "The AI provider replied with text instead of the requested JSON metadata."
      )
    }

    if (context.imageAttached && claimsImageIsUnavailable(payload)) {
      return yield* requestFailure(
        "The AI provider could not inspect the attached image. Check that the selected model supports vision and try again."
      )
    }

    return yield* Schema.decodeUnknown(MetadataResponse)(
      normalizeMetadata(payload, context)
    ).pipe(
      Effect.mapError(() =>
        requestFailure("The AI metadata did not contain a usable title.")
      )
    )
  })
