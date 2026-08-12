import {
  HealthReport,
  PairingFailed,
  PairingGrant,
  RedeemPairing
} from "@refnest/contracts"
import { Context, Effect, Layer, Schema } from "effect"

const PAIR_TIMEOUT_MILLIS = 10_000
const PROBE_TIMEOUT_MILLIS = 5_000

export type RemoteLibraryTransportShape = {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>
}

/** Behind a tag so pairing and probing can be exercised without a second process. */
export class RemoteLibraryTransport extends Context.Tag("RemoteLibraryTransport")<
  RemoteLibraryTransport,
  RemoteLibraryTransportShape
>() {}

export type RemoteLibraryClientShape = {
  readonly pair: (
    baseUrl: string,
    payload: RedeemPairing
  ) => Effect.Effect<PairingGrant, PairingFailed>
  readonly health: (
    baseUrl: string,
    token: string
  ) => Effect.Effect<HealthReport, PairingFailed>
}

export class RemoteLibraryClient extends Context.Tag("RemoteLibraryClient")<
  RemoteLibraryClient,
  RemoteLibraryClientShape
>() {}

const decodeGrant = Schema.decodeUnknown(PairingGrant)
const decodeHealth = Schema.decodeUnknown(HealthReport)
const encodeRedeem = Schema.encode(RedeemPairing)

const failed = (reason: string) => new PairingFailed({ reason })

export const makeRemoteLibraryClient = (
  transport: RemoteLibraryTransportShape
): RemoteLibraryClientShape => {
  const pair = Effect.fn("RemoteLibraryClient.pair")(function* (
    baseUrl: string,
    payload: RedeemPairing
  ) {
    const body = yield* encodeRedeem(payload).pipe(
      Effect.mapError(() => failed("The pairing request could not be prepared."))
    )
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        transport.fetch(`${baseUrl}/pair`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal
        }),
      catch: () => failed("That library did not answer. Check the address and that sharing is on.")
    })

    if (response.status === 403) {
      return yield* failed("That pairing code is not valid. Ask the other device for a new one.")
    }
    if (response.status === 404) {
      return yield* failed("That library is not accepting new devices right now.")
    }
    if (!response.ok) {
      return yield* failed(`That library refused the pairing request (${response.status}).`)
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => failed("That library returned an unreadable pairing response.")
    })

    return yield* decodeGrant(json).pipe(
      Effect.mapError(() =>
        failed("That library returned a pairing response this version cannot read.")
      )
    )
  }, Effect.timeoutFail({
    duration: PAIR_TIMEOUT_MILLIS,
    onTimeout: () => failed("That library did not answer in time.")
  }))

  const health = Effect.fn("RemoteLibraryClient.health")(function* (
    baseUrl: string,
    token: string
  ) {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        transport.fetch(`${baseUrl}/health`, {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
          signal
        }),
      catch: () => failed("That library could not be reached.")
    })

    if (response.status === 401 || response.status === 403) {
      return yield* failed("This device is no longer paired with that library.")
    }
    if (!response.ok) {
      return yield* failed(`That library answered with ${response.status}.`)
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => failed("That library returned an unreadable response.")
    })

    return yield* decodeHealth(json).pipe(
      Effect.mapError(() => failed("That library is running a version this device cannot read."))
    )
  }, Effect.timeoutFail({
    duration: PROBE_TIMEOUT_MILLIS,
    onTimeout: () => failed("That library did not answer in time.")
  }))

  return { pair, health }
}

export const RemoteLibraryTransportLive = Layer.succeed(
  RemoteLibraryTransport,
  RemoteLibraryTransport.of({ fetch: (url, init) => fetch(url, init) })
)

export const RemoteLibraryClientLive = Layer.effect(
  RemoteLibraryClient,
  Effect.gen(function* () {
    const transport = yield* RemoteLibraryTransport
    return RemoteLibraryClient.of(makeRemoteLibraryClient(transport))
  })
)
