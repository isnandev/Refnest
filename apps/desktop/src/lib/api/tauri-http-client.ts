import {
  HttpBody,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse
} from "@effect/platform"
import { invoke } from "@tauri-apps/api/core"
import { Effect } from "effect"

/**
 * Placeholder origin. The webview never learns where the sidecar actually
 * listens — the Rust shell holds the address and the bearer token and only ever
 * accepts a sidecar-relative path.
 */
export const SIDECAR_BASE_URL = "http://sidecar.local"

interface ProxyResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: ReadonlyArray<number>
}

/** Statuses the Fetch spec forbids a body on; `Response` throws if one is supplied. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

const readBody = (
  request: HttpClientRequest.HttpClientRequest,
  body: HttpBody.HttpBody
): Effect.Effect<string | undefined, HttpClientError.RequestError> => {
  switch (body._tag) {
    case "Empty":
      return Effect.succeed(undefined)
    case "Uint8Array":
      return Effect.succeed(new TextDecoder().decode(body.body))
    case "Raw":
      return typeof body.body === "string"
        ? Effect.succeed(body.body)
        : Effect.fail(
            new HttpClientError.RequestError({
              request,
              reason: "Encode",
              description: "the tauri transport only forwards text bodies"
            })
          )
    default:
      return Effect.fail(
        new HttpClientError.RequestError({
          request,
          reason: "Encode",
          description: `the tauri transport cannot forward a ${body._tag} body`
        })
      )
  }
}

/**
 * An `HttpClient` whose transport is a Tauri command rather than `fetch`, so the
 * generated `HttpApiClient` keeps working end to end while every byte still
 * travels through the Rust shell.
 */
export const TauriHttpClient = HttpClient.make((request, url) =>
  Effect.gen(function* () {
    const body = yield* readBody(request, request.body)

    const proxy = yield* Effect.tryPromise({
      try: () =>
        invoke<ProxyResponse>("api_request", {
          request: {
            method: request.method,
            path: `${url.pathname}${url.search}`,
            headers: request.headers,
            body: body ?? null
          }
        }),
      catch: (cause) =>
        new HttpClientError.RequestError({ request, reason: "Transport", cause })
    })

    return HttpClientResponse.fromWeb(
      request,
      new Response(
        NULL_BODY_STATUSES.has(proxy.status) || proxy.body.length === 0
          ? null
          : Uint8Array.from(proxy.body),
        { status: proxy.status, headers: proxy.headers }
      )
    )
  })
)
