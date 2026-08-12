import { Data } from "effect"

/**
 * A per-file conversion problem that the caller can act on. Batch conversions
 * report these against individual files instead of failing the whole request.
 */
export class ConversionFailure extends Data.TaggedError("ConversionFailure")<{
  readonly reason: string
}> {}

/** Both codec and file-level problems carry a user-facing reason. */
export const conversionReason = (error: { readonly reason: string }) =>
  error.reason
