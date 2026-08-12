import { Context, Data, Effect, Layer } from "effect"
import {
  isLoopbackHostname,
  OutboundUrlPolicy
} from "../../security/outbound-url-policy"

export class AiProviderPolicyFailure extends Data.TaggedError(
  "AiProviderPolicyFailure"
)<{
  readonly reason: string
}> {}

export type NormalizedAiProvider = {
  readonly baseUrl: string
  readonly completionUrl: URL
  readonly origin: string
}

export type AiProviderPolicyShape = {
  readonly normalize: (
    input: string,
    localProvider: boolean
  ) => Effect.Effect<NormalizedAiProvider, AiProviderPolicyFailure>
}

export class AiProviderPolicy extends Context.Tag("AiProviderPolicy")<
  AiProviderPolicy,
  AiProviderPolicyShape
>() {}

const failure = (reason: string) => new AiProviderPolicyFailure({ reason })

const makeAiProviderPolicy = Effect.gen(function* () {
  const outbound = yield* OutboundUrlPolicy

  const normalize = Effect.fn("AiProviderPolicy.normalize")(function* (
    input: string,
    localProvider: boolean
  ) {
    const parsed = yield* Effect.try({
      try: () => new URL(input.trim()),
      catch: () => failure("Enter a valid AI provider base URL.")
    })
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return yield* failure("AI provider URLs cannot contain credentials.")
    }
    if (parsed.search.length > 0 || parsed.hash.length > 0) {
      return yield* failure("AI provider base URLs cannot contain a query or fragment.")
    }

    if (localProvider) {
      if (!isLoopbackHostname(parsed.hostname)) {
        return yield* failure(
          "Local-provider mode only accepts loopback hostnames and addresses."
        )
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return yield* failure("Local AI providers must use HTTP or HTTPS.")
      }
    } else if (parsed.protocol !== "https:") {
      return yield* failure("Public AI providers must use HTTPS.")
    }

    yield* outbound
      .validate(parsed, localProvider ? { requireLoopback: true } : undefined)
      .pipe(Effect.mapError((error) => failure(error.reason)))

    const pathname = parsed.pathname.replace(/\/+$/, "")
    const baseUrl = `${parsed.origin}${pathname === "" || pathname === "/" ? "" : pathname}`
    const completionUrl = new URL(
      baseUrl.endsWith("/chat/completions")
        ? baseUrl
        : `${baseUrl}/chat/completions`
    )

    return {
      baseUrl,
      completionUrl,
      origin: parsed.origin
    }
  })

  return AiProviderPolicy.of({ normalize })
})

export const AiProviderPolicyLive = Layer.effect(
  AiProviderPolicy,
  makeAiProviderPolicy
)
