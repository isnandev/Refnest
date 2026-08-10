import { Data } from "effect"

/**
 * One feature-facing failure. Transport, decoding, and sidecar errors all carry
 * different shapes; the UI only needs something it can put in front of a person.
 */
export class ApiFailure extends Data.TaggedError("ApiFailure")<{
  readonly message: string
}> {}

export const toApiFailure = (cause: unknown): ApiFailure => {
  if (cause instanceof Error) {
    return new ApiFailure({ message: cause.message })
  }

  if (typeof cause === "object" && cause !== null && "_tag" in cause) {
    return new ApiFailure({ message: String(cause._tag) })
  }

  return new ApiFailure({ message: "the sidecar call failed" })
}
