import { describe, expect, it } from "bun:test"
import { PassThrough } from "node:stream"
import { REFNEST_MCP_PROTOCOL_VERSION } from "../src/mcp/mcp-constants"
import {
  readStdioBridgeConfig,
  runStdioBridge,
  StdioBridgeConfigError
} from "../src/mcp/stdio-bridge"

const collect = (stream: PassThrough) => {
  let value = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    value += chunk
  })
  return () => value
}

const nextChunk = (stream: PassThrough): Promise<void> =>
  new Promise((resolve) => {
    stream.once("data", () => resolve())
  })

describe("RefNest MCP stdio bridge", () => {
  it("accepts only an explicit authenticated loopback MCP endpoint", () => {
    expect(
      readStdioBridgeConfig({
        REFNEST_MCP_URL: "http://127.0.0.1:4317/mcp/",
        REFNEST_MCP_TOKEN: "stdio-secret"
      })
    ).toStrictEqual({
      url: "http://127.0.0.1:4317/mcp",
      token: "stdio-secret"
    })

    const rejected = [
      {},
      { REFNEST_MCP_URL: "http://127.0.0.1:4317/mcp" },
      {
        REFNEST_MCP_URL: "https://example.com/mcp",
        REFNEST_MCP_TOKEN: "secret"
      },
      {
        REFNEST_MCP_URL: "file:///mcp",
        REFNEST_MCP_TOKEN: "secret"
      },
      {
        REFNEST_MCP_URL: "http://user:password@localhost:4317/mcp",
        REFNEST_MCP_TOKEN: "secret"
      },
      {
        REFNEST_MCP_URL: "http://localhost:4317/health",
        REFNEST_MCP_TOKEN: "secret"
      }
    ]
    for (const environment of rejected) {
      expect(() => readStdioBridgeConfig(environment)).toThrow(
        StdioBridgeConfigError
      )
    }
  })

  it("forwards JSON-RPC with bearer auth and writes only protocol data to stdout", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    const stdout = collect(output)
    const stderr = collect(errorOutput)
    const token = "stdio-transport-secret"
    const config = {
      url: "http://127.0.0.1:4317/mcp",
      token
    }
    let observedUrl = ""
    let observedAuthorization = ""
    let observedProtocol = ""
    let observedRedirect: string | undefined

    const fakeFetch = (async (input, init) => {
      observedUrl = String(input)
      observedRedirect = init?.redirect
      const headers = new Headers(init?.headers)
      observedAuthorization = headers.get("authorization") ?? ""
      observedProtocol = headers.get("mcp-protocol-version") ?? ""
      const request = JSON.parse(String(init?.body)) as { id?: number }
      if (request.id === undefined) {
        return new Response(null, { status: 202 })
      }
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
          capabilities: {},
          serverInfo: { name: "refnest", version: "test" }
        }
      }
      return new Response(`event: message\ndata: ${JSON.stringify(response)}\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    }) as typeof fetch

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config,
      fetch: fakeFetch
    })
    const responseWritten = nextChunk(output)
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "initialize",
        params: {
          protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "stdio-test", version: "1.0.0" }
        }
      })}\n${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      })}\n`
    )
    await responseWritten
    input.end()
    await running

    expect(observedUrl).toBe(config.url)
    expect(observedAuthorization).toBe(`Bearer ${token}`)
    expect(observedProtocol).toBe(REFNEST_MCP_PROTOCOL_VERSION)
    expect(observedRedirect).toBe("error")
    const lines = stdout().trim().split("\n")
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      result: { protocolVersion: REFNEST_MCP_PROTOCOL_VERSION }
    })
    expect(stdout()).not.toContain(token)
    expect(stdout()).not.toContain(config.url)
    expect(stderr()).toBe("")
  })

  it("fails closed with generic protocol and stderr messages when the sidecar is unavailable", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    const stdout = collect(output)
    const stderr = collect(errorOutput)
    const token = "never-leak-this-token"
    const url = "http://127.0.0.1:4317/mcp"
    const providerBody = "provider-internal-response"
    const fakeFetch = (async () => {
      throw new Error(`${token} ${url} ${providerBody}`)
    }) as unknown as typeof fetch

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config: { url, token },
      fetch: fakeFetch
    })
    const responseWritten = nextChunk(output)
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 9,
        method: "tools/list",
        params: {}
      })}\n`
    )
    await responseWritten
    input.end()
    await running

    expect(JSON.parse(stdout().trim())).toStrictEqual({
      jsonrpc: "2.0",
      id: 9,
      error: {
        code: -32000,
        message: "The RefNest MCP sidecar is unavailable."
      }
    })
    expect(stderr()).toBe(
      "RefNest MCP stdio bridge: sidecar request failed.\n"
    )
    for (const secret of [token, url, providerBody, "stack"]) {
      expect(stdout()).not.toContain(secret)
      expect(stderr()).not.toContain(secret)
    }
  })

  it("rejects an oversized request before waiting for a line delimiter", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    const stdout = collect(output)
    const stderr = collect(errorOutput)
    const controller = new AbortController()
    const outputWritten = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2_000)
      output.once("data", () => {
        clearTimeout(timeout)
        resolve(true)
      })
    })

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config: {
        url: "http://127.0.0.1:4317/mcp",
        token: "request-limit-secret"
      },
      fetch: (async () => {
        throw new Error("oversized input must not be forwarded")
      }) as unknown as typeof fetch,
      signal: controller.signal
    })
    input.write(Buffer.alloc(10 * 1_024 * 1_024 + 2, 0x20))
    const rejectedBeforeDelimiter = await outputWritten
    controller.abort()
    await running

    expect(rejectedBeforeDelimiter).toBe(true)
    expect(JSON.parse(stdout().trim())).toStrictEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "The MCP request is too large." }
    })
    expect(stderr()).toBe("")
  })

  it("cancels an oversized sidecar response body", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    const stdout = collect(output)
    const stderr = collect(errorOutput)
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("still-streaming"))
      },
      cancel() {
        cancelled = true
      }
    })
    const fakeFetch = (async () =>
      new Response(body, {
        status: 200,
        headers: {
          "content-length": String(24 * 1_024 * 1_024 + 1),
          "content-type": "application/json"
        }
      })) as unknown as typeof fetch

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config: {
        url: "http://127.0.0.1:4317/mcp",
        token: "response-limit-secret"
      },
      fetch: fakeFetch
    })
    const responseWritten = nextChunk(output)
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/list",
        params: {}
      })}\n`
    )
    await responseWritten
    input.end()
    await running

    expect(cancelled).toBe(true)
    expect(JSON.parse(stdout().trim())).toStrictEqual({
      jsonrpc: "2.0",
      id: 10,
      error: {
        code: -32000,
        message: "The RefNest MCP sidecar is unavailable."
      }
    })
    expect(stderr()).toBe(
      "RefNest MCP stdio bridge: sidecar request failed.\n"
    )
  })

  it("cancels a streamed sidecar response when it crosses the byte limit", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(24 * 1_024 * 1_024 + 1))
      },
      cancel() {
        cancelled = true
      }
    })
    const fakeFetch = (async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as unknown as typeof fetch

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config: {
        url: "http://127.0.0.1:4317/mcp",
        token: "stream-limit-secret"
      },
      fetch: fakeFetch
    })
    const responseWritten = nextChunk(output)
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/list",
        params: {}
      })}\n`
    )
    await responseWritten
    input.end()
    await running

    expect(cancelled).toBe(true)
  })

  it("aborts an in-flight sidecar request when stdin reaches EOF", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    const stdout = collect(output)
    const stderr = collect(errorOutput)
    const cleanupController = new AbortController()
    let markStarted: (() => void) | undefined
    let requestWasAborted = false
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const fakeFetch = (async (_input, init) => {
      markStarted?.()
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            requestWasAborted = true
            reject(new Error("aborted"))
          },
          { once: true }
        )
      })
    }) as typeof fetch

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config: {
        url: "http://127.0.0.1:4317/mcp",
        token: "eof-secret"
      },
      fetch: fakeFetch,
      signal: cleanupController.signal
    })
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 13,
        method: "tools/list",
        params: {}
      })}\n`
    )
    await started
    input.end()

    const completedOnEof = await Promise.race([
      running.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 300)
      })
    ])
    if (!completedOnEof) {
      cleanupController.abort()
      await running
    }

    expect(completedOnEof).toBe(true)
    expect(requestWasAborted).toBe(true)
    expect(stdout()).toBe("")
    expect(stderr()).toBe("")
  })

  it("aborts an in-flight sidecar request without leaking shutdown noise", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const errorOutput = new PassThrough()
    const stdout = collect(output)
    const stderr = collect(errorOutput)
    const controller = new AbortController()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const fakeFetch = (async (_input, init) => {
      markStarted?.()
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        )
      })
    }) as typeof fetch

    const running = runStdioBridge({
      input,
      output,
      errorOutput,
      config: {
        url: "http://127.0.0.1:4317/mcp",
        token: "shutdown-secret"
      },
      fetch: fakeFetch,
      signal: controller.signal
    })
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/list",
        params: {}
      })}\n`
    )
    await started
    controller.abort()
    await running

    expect(stdout()).toBe("")
    expect(stderr()).toBe("")
  })
})
