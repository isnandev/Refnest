import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  makeCaptureHttpClient,
  type CaptureHttpTransportShape
} from "../src/features/quick-save/capture-http-client"
import { MAX_HTTP_REDIRECTS } from "../src/features/quick-save/capture-limits"
import {
  makeOutboundUrlPolicy,
  type HostnameResolver
} from "../src/security/outbound-url-policy"

const publicResolver: HostnameResolver = () =>
  Effect.succeed(["93.184.216.34"])

describe("capture HTTP client", () => {
  it("revalidates redirects before contacting their destinations", async () => {
    const requested: Array<string> = []
    const transport: CaptureHttpTransportShape = {
      fetch: async (url) => {
        requested.push(url.toString())
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" }
        })
      }
    }
    const client = makeCaptureHttpClient(
      makeOutboundUrlPolicy(publicResolver),
      transport
    )

    const result = await Effect.runPromise(
      client.getBytes(new URL("https://public.test/start"), 1_024).pipe(
        Effect.either
      )
    )

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "CaptureHttpFailure",
        kind: "destination-rejected"
      }
    })
    expect(requested).toStrictEqual(["https://public.test/start"])
  })

  it("bounds redirect chains", async () => {
    let requestCount = 0
    const transport: CaptureHttpTransportShape = {
      fetch: async () => {
        requestCount += 1
        return new Response(null, {
          status: 302,
          headers: { location: `/redirect-${requestCount}` }
        })
      }
    }
    const client = makeCaptureHttpClient(
      makeOutboundUrlPolicy(publicResolver),
      transport
    )
    const result = await Effect.runPromise(
      client.getBytes(new URL("https://public.test/start"), 1_024).pipe(
        Effect.either
      )
    )

    expect(result).toMatchObject({
      _tag: "Left",
      left: { kind: "redirect-limit" }
    })
    expect(requestCount).toBe(MAX_HTTP_REDIRECTS + 1)
  })

  it("rejects declared and streamed bodies over the byte limit", async () => {
    const declared = makeCaptureHttpClient(
      makeOutboundUrlPolicy(publicResolver),
      {
        fetch: async () =>
          new Response("small", {
            headers: { "content-length": "2048" }
          })
      }
    )
    const streamed = makeCaptureHttpClient(
      makeOutboundUrlPolicy(publicResolver),
      {
        fetch: async () => new Response(new Uint8Array(1_025))
      }
    )

    for (const client of [declared, streamed]) {
      const result = await Effect.runPromise(
        client.getBytes(new URL("https://public.test/media"), 1_024).pipe(
          Effect.either
        )
      )
      expect(result).toMatchObject({
        _tag: "Left",
        left: { kind: "response-too-large" }
      })
    }
  })
})
