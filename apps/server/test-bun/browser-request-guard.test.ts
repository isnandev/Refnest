import { describe, expect, it } from "bun:test"
import { Deferred, Effect, Schema } from "effect"
import {
  CdpClient,
  type CdpTransport
} from "../src/features/quick-save/cdp-client"
import { guardBrowserRequests } from "../src/features/quick-save/browser-request-guard"
import { MAX_BROWSER_NETWORK_BYTES } from "../src/features/quick-save/capture-limits"
import {
  makeOutboundUrlPolicy,
  type HostnameResolver
} from "../src/security/outbound-url-policy"

const CdpRequest = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.optional(Schema.Unknown)
})
const decodeRequest = Schema.decodeUnknownSync(Schema.parseJson(CdpRequest))

class PausedRequestTransport implements CdpTransport {
  readonly #messages = new Set<(data: unknown) => void>()
  readonly #errors = new Set<() => void>()
  readonly #closes = new Set<() => void>()
  readonly commands: Array<string> = []
  #open = true
  #triggerId: number | null = null

  constructor(private readonly destination: string) {}

  readonly isOpen = () => this.#open

  readonly send = (message: string) => {
    const request = decodeRequest(message)
    this.commands.push(request.method)

    if (request.method === "Probe.trigger") {
      this.#triggerId = request.id
      this.#emit({
        method: "Fetch.requestPaused",
        params: {
          requestId: "paused-1",
          networkId: "network-1",
          resourceType: "Image",
          request: { url: this.destination }
        }
      })
      return
    }

    if (request.method === "Probe.flood") {
      this.#emit({
        method: "Network.dataReceived",
        params: {
          dataLength: MAX_BROWSER_NETWORK_BYTES + 1,
          encodedDataLength: MAX_BROWSER_NETWORK_BYTES + 1
        }
      })
      return
    }

    this.#emit({ id: request.id, result: {} })
    if (
      request.method === "Fetch.continueRequest" ||
      request.method === "Fetch.failRequest"
    ) {
      const triggerId = this.#triggerId
      this.#triggerId = null
      if (triggerId !== null) this.#emit({ id: triggerId, result: {} })
    }
  }

  readonly close = () => {
    this.#open = false
    for (const listener of this.#closes) listener()
  }

  readonly onMessage = (listener: (data: unknown) => void) => {
    this.#messages.add(listener)
    return () => {
      this.#messages.delete(listener)
    }
  }

  readonly onError = (listener: () => void) => {
    this.#errors.add(listener)
    return () => {
      this.#errors.delete(listener)
    }
  }

  readonly onClose = (listener: () => void) => {
    this.#closes.add(listener)
    return () => {
      this.#closes.delete(listener)
    }
  }

  #emit(message: unknown) {
    const encoded = JSON.stringify(message)
    for (const listener of this.#messages) listener(encoded)
  }
}

const resolver: HostnameResolver = (hostname) =>
  Effect.succeed(hostname === "cdn.public.test" ? ["93.184.216.34"] : [])

describe("Chromium request guard", () => {
  it("continues public subresources only after destination validation", async () => {
    const transport = new PausedRequestTransport("https://cdn.public.test/image.png")
    const client = CdpClient.fromTransport(transport)
    try {
      await Effect.runPromise(
        guardBrowserRequests(
          client,
          makeOutboundUrlPolicy(resolver),
          Effect.tryPromise(() => client.command("Probe.trigger"))
        )
      )
      expect(transport.commands).toContain("Fetch.continueRequest")
      expect(transport.commands).not.toContain("Fetch.failRequest")
    } finally {
      await client.close()
    }
  })

  it("fails a loopback subresource and surfaces a typed capture failure", async () => {
    const transport = new PausedRequestTransport("http://127.0.0.1/private.png")
    const client = CdpClient.fromTransport(transport)
    try {
      const rejected = await Effect.runPromise(
        Deferred.make<void>().pipe(
          Effect.flatMap((neverCompletes) =>
            guardBrowserRequests(
              client,
              makeOutboundUrlPolicy(resolver),
              Effect.zipRight(
                Effect.tryPromise(() => client.command("Probe.trigger")),
                Deferred.await(neverCompletes)
              )
            )
          ),
          Effect.either
        )
      )

      expect(rejected).toMatchObject({
        _tag: "Left",
        left: { _tag: "CaptureFailure" }
      })
      expect(transport.commands).toContain("Fetch.failRequest")
    } finally {
      await client.close()
    }
  })

  it("interrupts a page that exceeds the browser network budget", async () => {
    const transport = new PausedRequestTransport("https://cdn.public.test/image.png")
    const client = CdpClient.fromTransport(transport)
    try {
      const rejected = await Effect.runPromise(
        guardBrowserRequests(
          client,
          makeOutboundUrlPolicy(resolver),
          Effect.tryPromise(() => client.command("Probe.flood"))
        ).pipe(Effect.either)
      )

      expect(rejected).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "CaptureFailure",
          reason: expect.stringContaining("network limit")
        }
      })
    } finally {
      await client.close()
    }
  })
})
