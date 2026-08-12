import { Deferred, Effect, Queue, Ref, Schema } from "effect"
import type { OutboundUrlPolicyShape } from "../../security/outbound-url-policy"
import type { CdpClient } from "./cdp-client"
import { CaptureFailure } from "./capture-failure"
import { MAX_BROWSER_REDIRECTS } from "./capture-limits"
import { MAX_BROWSER_NETWORK_BYTES } from "./capture-limits"

const MAX_PENDING_BROWSER_EVENTS = 512
const MAX_TRACKED_BROWSER_REQUESTS = 2_048

const PausedRequest = Schema.Struct({
  requestId: Schema.String,
  networkId: Schema.optional(Schema.String),
  redirectedRequestId: Schema.optional(Schema.String),
  resourceType: Schema.optional(Schema.String),
  responseStatusCode: Schema.optional(Schema.Number),
  request: Schema.Struct({ url: Schema.String })
})

const NetworkDataReceived = Schema.Struct({
  dataLength: Schema.Number,
  encodedDataLength: Schema.optional(Schema.Number)
})

type RedirectState = {
  readonly urlsByRequest: ReadonlyMap<string, string>
  readonly count: number
}

const failure = (reason: string) => new CaptureFailure({ reason })

const cdpCommand = (
  client: CdpClient,
  method: string,
  params: Readonly<Record<string, unknown>> = {}
) =>
  Effect.tryPromise({
    try: () => client.command(method, params),
    catch: (cause) =>
      failure(
        cause instanceof Error
          ? cause.message
          : `Chromium could not apply ${method}.`
      )
  })

const countRedirect = (
  state: Ref.Ref<RedirectState>,
  paused: typeof PausedRequest.Type
) =>
  Ref.modify(state, (current) => {
    const key = paused.networkId ?? paused.requestId
    const previousUrl = current.urlsByRequest.get(key)
    const hasRedirectStatus =
      paused.responseStatusCode !== undefined &&
      paused.responseStatusCode >= 300 &&
      paused.responseStatusCode < 400
    const redirected =
      paused.redirectedRequestId !== undefined ||
      hasRedirectStatus ||
      (previousUrl !== undefined && previousUrl !== paused.request.url)
    const urlsByRequest = new Map(current.urlsByRequest)
    if (!urlsByRequest.has(key) && urlsByRequest.size >= MAX_TRACKED_BROWSER_REQUESTS) {
      const oldest = urlsByRequest.keys().next().value
      if (oldest !== undefined) urlsByRequest.delete(oldest)
    }
    urlsByRequest.set(key, paused.request.url)
    const count = current.count + (redirected ? 1 : 0)

    return [count, { urlsByRequest, count }] as const
  })

export const guardBrowserRequests = <A, E, R>(
  client: CdpClient,
  policy: OutboundUrlPolicyShape,
  use: Effect.Effect<A, E, R>
): Effect.Effect<A, E | CaptureFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const queue = yield* Queue.dropping<unknown>(MAX_PENDING_BROWSER_EVENTS)
      const networkDataQueue = yield* Queue.dropping<unknown>(
        MAX_PENDING_BROWSER_EVENTS
      )
      const rejected = yield* Deferred.make<CaptureFailure>()
      const networkBytes = yield* Ref.make(0)
      const redirects = yield* Ref.make<RedirectState>({
        urlsByRequest: new Map(),
        count: 0
      })
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.on("Fetch.requestPaused", (params) => {
            if (!queue.unsafeOffer(params)) {
              Deferred.unsafeDone(
                rejected,
                Effect.succeed(
                  failure("The page exceeded the pending browser-request limit.")
                )
              )
            }
          })
        ),
        (dispose) => Effect.sync(dispose)
      )
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.on("Network.dataReceived", (params) => {
            if (!networkDataQueue.unsafeOffer(params)) {
              Deferred.unsafeDone(
                rejected,
                Effect.succeed(
                  failure("The page exceeded the pending browser-network event limit.")
                )
              )
            }
          })
        ),
        (dispose) => Effect.sync(dispose)
      )

      const rejectRequest = (requestId: string, error: CaptureFailure) =>
        Effect.gen(function* () {
          yield* cdpCommand(client, "Fetch.failRequest", {
            requestId,
            errorReason: "BlockedByClient"
          }).pipe(Effect.ignore)
          yield* Deferred.succeed(rejected, error)
        })

      const inspectRequest = (params: unknown) =>
        Effect.gen(function* () {
          const paused = yield* Schema.decodeUnknown(PausedRequest)(params).pipe(
            Effect.mapError(() =>
              failure("Chromium exposed an invalid paused network request.")
            )
          )
          const url = yield* Effect.try({
            try: () => new URL(paused.request.url),
            catch: () => failure("Chromium requested an invalid destination URL.")
          })
          yield* policy.validate(url).pipe(
            Effect.mapError((error) => failure(error.reason))
          )
          const redirectCount = yield* countRedirect(redirects, paused)
          if (redirectCount > MAX_BROWSER_REDIRECTS) {
            return yield* failure(
              `The page exceeded the ${MAX_BROWSER_REDIRECTS}-redirect browser limit.`
            )
          }
          yield* cdpCommand(client, "Fetch.continueRequest", {
            requestId: paused.requestId
          })
        }).pipe(
          Effect.catchAll((error) => {
            let requestId = ""
            try {
              requestId = Schema.decodeUnknownSync(PausedRequest)(params).requestId
            } catch {
              // An empty id makes the best-effort CDP failure a no-op; the
              // typed rejection still stops the capture.
            }
            return rejectRequest(requestId, error)
          })
        )

      yield* Queue.take(queue).pipe(
        Effect.flatMap(inspectRequest),
        Effect.forever,
        Effect.forkScoped
      )
      yield* Queue.take(networkDataQueue).pipe(
        Effect.flatMap((params) =>
          Schema.decodeUnknown(NetworkDataReceived)(params).pipe(
            Effect.mapError(() =>
              failure("Chromium exposed invalid network-byte accounting data.")
            ),
            Effect.flatMap((data) =>
              Ref.updateAndGet(
                networkBytes,
                (total) =>
                  total + Math.max(data.dataLength, data.encodedDataLength ?? 0)
              )
            ),
            Effect.flatMap((total) =>
              total > MAX_BROWSER_NETWORK_BYTES
                ? Deferred.succeed(
                    rejected,
                    failure(
                      `The page exceeded the ${MAX_BROWSER_NETWORK_BYTES}-byte browser network limit.`
                    )
                  )
                : Effect.void
            ),
            Effect.catchAll((error) => Deferred.succeed(rejected, error))
          )
        ),
        Effect.forever,
        Effect.forkScoped
      )
      yield* cdpCommand(client, "Fetch.enable", {
        patterns: [{ urlPattern: "*", requestStage: "Request" }]
      })
      yield* Effect.addFinalizer(() =>
        cdpCommand(client, "Fetch.disable").pipe(Effect.ignore)
      )

      const policyRejection = Deferred.await(rejected).pipe(
        Effect.flatMap((error) => Effect.fail(error))
      )
      return yield* Effect.raceFirst(use, policyRejection)
    })
  )
