import { Context, Data, Effect, Layer } from "effect"
import {
  OutboundUrlPolicy,
  type OutboundUrlPolicyShape
} from "../../security/outbound-url-policy"
import { MAX_HTTP_REDIRECTS } from "./capture-limits"

export type CaptureHttpFailureKind =
  | "destination-rejected"
  | "redirect-limit"
  | "invalid-redirect"
  | "timeout"
  | "transport"
  | "response-too-large"

export class CaptureHttpFailure extends Data.TaggedError("CaptureHttpFailure")<{
  readonly kind: CaptureHttpFailureKind
  readonly reason: string
}> {}

export type CaptureHttpTransportShape = {
  readonly fetch: (url: URL, init: RequestInit) => Promise<Response>
}

export class CaptureHttpTransport extends Context.Tag("CaptureHttpTransport")<
  CaptureHttpTransport,
  CaptureHttpTransportShape
>() {}

export type CaptureHttpResponse = {
  readonly url: URL
  readonly status: number
  readonly headers: Headers
  readonly bytes: Uint8Array
}

export type CaptureHttpClientShape = {
  readonly head: (
    url: URL,
    timeoutMillis?: number
  ) => Effect.Effect<CaptureHttpResponse, CaptureHttpFailure>
  readonly getBytes: (
    url: URL,
    maxBytes: number,
    timeoutMillis?: number
  ) => Effect.Effect<CaptureHttpResponse, CaptureHttpFailure>
}

export class CaptureHttpClient extends Context.Tag("CaptureHttpClient")<
  CaptureHttpClient,
  CaptureHttpClientShape
>() {}

const httpFailure = (
  kind: CaptureHttpFailureKind,
  reason: string
): CaptureHttpFailure => new CaptureHttpFailure({ kind, reason })

const isRedirectStatus = (status: number) =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308

const cancelBody = async (response: Response) => {
  await response.body?.cancel().catch(() => undefined)
}

const readContentLength = (headers: Headers) => {
  const value = headers.get("content-length")
  if (value === null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

const readBoundedBody = async (
  response: Response,
  maxBytes: number,
  signal: AbortSignal
) => {
  const declaredLength = readContentLength(response.headers)
  if (declaredLength !== null && declaredLength > maxBytes) {
    await cancelBody(response)
    throw httpFailure(
      "response-too-large",
      `The remote response exceeds the ${maxBytes}-byte capture limit.`
    )
  }
  if (response.body === null) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  const cancel = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw httpFailure(
          "response-too-large",
          `The remote response exceeds the ${maxBytes}-byte capture limit.`
        )
      }
      chunks.push(next.value)
    }
  } finally {
    signal.removeEventListener("abort", cancel)
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const isCaptureHttpFailure = (cause: unknown): cause is CaptureHttpFailure =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "CaptureHttpFailure"

export const makeCaptureHttpClient = (
  policy: OutboundUrlPolicyShape,
  transport: CaptureHttpTransportShape
): CaptureHttpClientShape => {
  const request = (
    input: URL,
    method: "GET" | "HEAD",
    maxBytes: number,
    timeoutMillis: number
  ): Effect.Effect<CaptureHttpResponse, CaptureHttpFailure> => {
    const follow = (
      current: URL,
      redirects: number
    ): Effect.Effect<CaptureHttpResponse, CaptureHttpFailure> =>
      Effect.gen(function* () {
        const validated = yield* policy.validate(current).pipe(
          Effect.mapError((error) =>
            httpFailure("destination-rejected", error.reason)
          )
        )
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            transport.fetch(validated, {
              method,
              redirect: "manual",
              signal
            }),
          catch: (cause) =>
            isCaptureHttpFailure(cause)
              ? cause
              : httpFailure("transport", "The remote server could not be reached.")
        })

        if (!isRedirectStatus(response.status)) {
          const bytes = method === "HEAD"
            ? yield* Effect.tryPromise({
                try: async () => {
                  await cancelBody(response)
                  return new Uint8Array()
                },
                catch: () =>
                  httpFailure("transport", "The remote response could not be closed.")
              })
            : yield* Effect.tryPromise({
                try: (signal) => readBoundedBody(response, maxBytes, signal),
                catch: (cause) =>
                  isCaptureHttpFailure(cause)
                    ? cause
                    : httpFailure("transport", "The remote response could not be read.")
              })
          return {
            url: validated,
            status: response.status,
            headers: response.headers,
            bytes
          }
        }

        if (redirects >= MAX_HTTP_REDIRECTS) {
          yield* Effect.promise(() => cancelBody(response))
          return yield* httpFailure(
            "redirect-limit",
            `The remote server exceeded the ${MAX_HTTP_REDIRECTS}-redirect limit.`
          )
        }
        const location = response.headers.get("location")
        yield* Effect.promise(() => cancelBody(response))
        if (location === null) {
          return yield* httpFailure(
            "invalid-redirect",
            "The remote server returned a redirect without a destination."
          )
        }
        const next = yield* Effect.try({
          try: () => new URL(location, validated),
          catch: () =>
            httpFailure(
              "invalid-redirect",
              "The remote server returned an invalid redirect destination."
            )
        })
        return yield* follow(next, redirects + 1)
      })

    return follow(new URL(input.toString()), 0).pipe(
      Effect.timeoutFail({
        duration: timeoutMillis,
        onTimeout: () =>
          httpFailure(
            "timeout",
            "The remote server did not answer within the capture timeout."
          )
      })
    )
  }

  return {
    head: (url, timeoutMillis = 10_000) =>
      request(url, "HEAD", 0, timeoutMillis),
    getBytes: (url, maxBytes, timeoutMillis = 60_000) =>
      request(url, "GET", maxBytes, timeoutMillis)
  }
}

export const CaptureHttpTransportLive = Layer.succeed(
  CaptureHttpTransport,
  CaptureHttpTransport.of({
    fetch: (url, init) => fetch(url, init)
  })
)

export const CaptureHttpClientLive = Layer.effect(
  CaptureHttpClient,
  Effect.gen(function* () {
    const policy = yield* OutboundUrlPolicy
    const transport = yield* CaptureHttpTransport
    return CaptureHttpClient.of(makeCaptureHttpClient(policy, transport))
  })
)
