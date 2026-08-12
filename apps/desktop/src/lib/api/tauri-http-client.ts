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
 * Placeholder origin. The webview never learns where any sidecar actually
 * listens — the Rust shell holds the addresses and the bearer tokens and only
 * ever accepts a sidecar-relative path.
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
const makeTauriHttpClient = (command: "api_request" | "api_request_local") =>
  HttpClient.make((request, url) =>
    Effect.gen(function* () {
      const body = yield* readBody(request, request.body)

      const proxy = yield* Effect.tryPromise({
        try: () =>
          invoke<ProxyResponse>(command, {
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

/** Goes to whichever library is active — this device's, or one on the network. */
export const TauriHttpClient = makeTauriHttpClient("api_request")

/**
 * Always goes to the sidecar this device spawned. Window bounds, appearance,
 * the saved library list, and sharing belong to the machine in front of the
 * user and must resolve before any network does.
 */
export const LocalTauriHttpClient = makeTauriHttpClient("api_request_local")
