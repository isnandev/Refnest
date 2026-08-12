import {
  deserializeMessage,
  isJSONRPCNotification,
  isJSONRPCRequest,
  parseJSONRPCMessage,
  serializeMessage,
  type JSONRPCMessage,
  type RequestId
} from "@modelcontextprotocol/server"
import type { Readable, Writable } from "node:stream"
import { isLoopbackHostname } from "../security/outbound-url-policy"
import { REFNEST_MCP_PROTOCOL_VERSION } from "./mcp-constants"

const MAX_STDIO_REQUEST_BYTES = 10 * 1_024 * 1_024
const MAX_HTTP_RESPONSE_BYTES = 24 * 1_024 * 1_024
const MAX_SIDECAR_REQUEST_MILLIS = 120_000

export type StdioBridgeConfig = {
  readonly url: string
  readonly token: string
}

export class StdioBridgeConfigError extends Error {}

export const readStdioBridgeConfig = (
  environment: Readonly<Record<string, string | undefined>>
): StdioBridgeConfig => {
  const configuredUrl = environment["REFNEST_MCP_URL"]?.trim()
  const token = environment["REFNEST_MCP_TOKEN"]?.trim()
  if (configuredUrl === undefined || configuredUrl.length === 0) {
    throw new StdioBridgeConfigError("REFNEST_MCP_URL is required.")
  }
  if (token === undefined || token.length === 0) {
    throw new StdioBridgeConfigError("REFNEST_MCP_TOKEN is required.")
  }
  if (token.length > 16_384) {
    throw new StdioBridgeConfigError("REFNEST_MCP_TOKEN is too long.")
  }

  let url: URL
  try {
    url = new URL(configuredUrl)
  } catch {
    throw new StdioBridgeConfigError("REFNEST_MCP_URL must be a valid URL.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new StdioBridgeConfigError("REFNEST_MCP_URL must use HTTP or HTTPS.")
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new StdioBridgeConfigError("REFNEST_MCP_URL must use a loopback host.")
  }
  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new StdioBridgeConfigError(
      "REFNEST_MCP_URL cannot contain credentials, a query, or a fragment."
    )
  }
  if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
    throw new StdioBridgeConfigError("REFNEST_MCP_URL must target /mcp.")
  }
  url.pathname = "/mcp"

  return { url: url.toString(), token }
}

const write = (output: Writable, value: string): Promise<void> =>
  new Promise((resolve, reject) => {
    output.write(value, (error) => {
      if (error === null || error === undefined) resolve()
      else reject(error)
    })
  })

const safeBridgeError = (id: RequestId | null, message: string) =>
  `${JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code: -32000, message }
  })}\n`

type BoundedStdioLine =
  | { readonly _tag: "line"; readonly value: string }
  | { readonly _tag: "too_large" }

/** Buffers at most one request budget plus a possible CR before discarding. */
const readBoundedStdioLines = async function* (
  input: Readable
): AsyncGenerator<BoundedStdioLine> {
  const maxBufferedBytes = MAX_STDIO_REQUEST_BYTES + 1
  let chunks: Array<Buffer> = []
  let bufferedBytes = 0
  let hasPendingBytes = false
  let discarding = false

  const reset = () => {
    chunks = []
    bufferedBytes = 0
    hasPendingBytes = false
  }

  const append = (chunk: Buffer) => {
    if (chunk.byteLength === 0) return true
    hasPendingBytes = true
    if (bufferedBytes + chunk.byteLength > maxBufferedBytes) return false
    chunks.push(chunk)
    bufferedBytes += chunk.byteLength
    return true
  }

  const finishLine = (): BoundedStdioLine => {
    const bytes = Buffer.concat(chunks, bufferedBytes)
    const contentLength =
      bytes.byteLength > 0 && bytes[bytes.byteLength - 1] === 0x0d
        ? bytes.byteLength - 1
        : bytes.byteLength
    reset()
    return contentLength > MAX_STDIO_REQUEST_BYTES
      ? { _tag: "too_large" }
      : { _tag: "line", value: bytes.subarray(0, contentLength).toString("utf8") }
  }

  for await (const rawChunk of input) {
    const chunk =
      typeof rawChunk === "string"
        ? Buffer.from(rawChunk)
        : rawChunk instanceof Uint8Array
          ? Buffer.from(
              rawChunk.buffer,
              rawChunk.byteOffset,
              rawChunk.byteLength
            )
          : Buffer.from(String(rawChunk))
    let offset = 0

    while (offset < chunk.byteLength) {
      const newline = chunk.indexOf(0x0a, offset)
      if (newline === -1) {
        if (!discarding && !append(chunk.subarray(offset))) {
          reset()
          discarding = true
          yield { _tag: "too_large" }
        }
        break
      }

      if (discarding) {
        discarding = false
        reset()
      } else if (!append(chunk.subarray(offset, newline))) {
        reset()
        yield { _tag: "too_large" }
      } else {
        yield finishLine()
      }
      offset = newline + 1
    }
  }

  if (!discarding && hasPendingBytes) yield finishLine()
}

const readBoundedBody = async (response: Response): Promise<string> => {
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTTP_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error("response_limit")
  }
  if (response.body === null) return ""

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > MAX_HTTP_RESPONSE_BYTES) throw new Error("response_limit")
      text += decoder.decode(chunk.value, { stream: true })
    }
    return text + decoder.decode()
  } catch (cause) {
    await reader.cancel().catch(() => undefined)
    throw cause
  } finally {
    reader.releaseLock()
  }
}

const parseHttpMessages = (
  contentType: string | null,
  body: string
): ReadonlyArray<JSONRPCMessage> => {
  if (body.trim().length === 0) return []
  if (contentType?.toLocaleLowerCase().includes("text/event-stream")) {
    const messages: Array<JSONRPCMessage> = []
    for (const event of body.replaceAll("\r\n", "\n").split("\n\n")) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
      if (data.length > 0) messages.push(parseJSONRPCMessage(JSON.parse(data)))
    }
    return messages
  }

  const parsed: unknown = JSON.parse(body)
  return Array.isArray(parsed)
    ? parsed.map(parseJSONRPCMessage)
    : [parseJSONRPCMessage(parsed)]
}

export type StdioBridgeOptions = {
  readonly input: Readable
  readonly output: Writable
  readonly errorOutput: Writable
  readonly config: StdioBridgeConfig
  readonly fetch?: typeof fetch
  readonly signal?: AbortSignal
}

/** Forwards stdio JSON-RPC to the authenticated live sidecar without opening SQLite. */
export const runStdioBridge = async ({
  input,
  output,
  errorOutput,
  config,
  fetch: fetchImplementation = fetch,
  signal
}: StdioBridgeOptions): Promise<void> => {
  const lifecycleAbort = new AbortController()
  const stopForInputClosure = () => lifecycleAbort.abort()
  const stopForExternalAbort = () => {
    lifecycleAbort.abort()
    input.destroy()
  }
  const isStopped = () => lifecycleAbort.signal.aborted
  let queuedLine: BoundedStdioLine | undefined
  let inputFinished = false
  let inputFailure: unknown
  let hasInputFailure = false
  let wakeConsumer: (() => void) | undefined
  let wakeProducer: (() => void) | undefined

  const notifyConsumer = () => {
    const wake = wakeConsumer
    wakeConsumer = undefined
    wake?.()
  }
  const notifyProducer = () => {
    const wake = wakeProducer
    wakeProducer = undefined
    wake?.()
  }
  const notifyQueue = () => {
    notifyConsumer()
    notifyProducer()
  }
  const waitForLine = (): Promise<void> =>
    new Promise((resolve) => {
      wakeConsumer = resolve
      if (queuedLine !== undefined || inputFinished || isStopped()) {
        notifyConsumer()
      }
    })
  const waitForQueueSpace = (): Promise<void> =>
    new Promise((resolve) => {
      wakeProducer = resolve
      if (queuedLine === undefined || isStopped()) notifyProducer()
    })

  lifecycleAbort.signal.addEventListener("abort", notifyQueue)
  const inputPump = (async () => {
    try {
      for await (const boundedLine of readBoundedStdioLines(input)) {
        while (queuedLine !== undefined && !isStopped()) {
          await waitForQueueSpace()
        }
        if (isStopped()) break
        queuedLine = boundedLine
        notifyConsumer()
      }
    } catch (cause) {
      hasInputFailure = true
      inputFailure = cause
    } finally {
      inputFinished = true
      stopForInputClosure()
      notifyQueue()
    }
  })()

  const takeLine = async (): Promise<BoundedStdioLine | undefined> => {
    while (queuedLine === undefined && !inputFinished && !isStopped()) {
      await waitForLine()
    }
    if (queuedLine !== undefined) {
      const boundedLine = queuedLine
      queuedLine = undefined
      notifyProducer()
      return boundedLine
    }
    if (hasInputFailure) throw inputFailure
    return undefined
  }

  if (signal?.aborted === true) stopForExternalAbort()
  else signal?.addEventListener("abort", stopForExternalAbort, { once: true })

  try {
    while (true) {
      const boundedLine = await takeLine()
      if (boundedLine === undefined) break
      if (isStopped()) break
      if (boundedLine._tag === "too_large") {
        await write(output, safeBridgeError(null, "The MCP request is too large."))
        continue
      }
      const line = boundedLine.value

      let message: JSONRPCMessage
      try {
        message = deserializeMessage(line)
      } catch {
        await write(output, safeBridgeError(null, "Invalid JSON-RPC message."))
        continue
      }

      const requestAbort = new AbortController()
      const forwardAbort = () => requestAbort.abort()
      lifecycleAbort.signal.addEventListener("abort", forwardAbort, {
        once: true
      })
      const requestTimeout = setTimeout(
        () => requestAbort.abort(),
        MAX_SIDECAR_REQUEST_MILLIS
      )

      try {
        const response = await fetchImplementation(config.url, {
          method: "POST",
          redirect: "error",
          headers: {
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
            "mcp-protocol-version": REFNEST_MCP_PROTOCOL_VERSION
          },
          body: line,
          signal: requestAbort.signal
        })
        const body = await readBoundedBody(response)
        const responseMessages = parseHttpMessages(
          response.headers.get("content-type"),
          body
        )
        if (responseMessages.length > 0) {
          for (const responseMessage of responseMessages) {
            await write(output, serializeMessage(responseMessage))
          }
          continue
        }
        if (response.ok || isJSONRPCNotification(message)) continue

        const id = isJSONRPCRequest(message) ? message.id : null
        await write(
          output,
          safeBridgeError(
            id,
            response.status === 401
              ? "The RefNest MCP bridge could not authenticate."
              : "The RefNest MCP sidecar rejected the request."
          )
        )
      } catch {
        if (isStopped()) break
        if (isJSONRPCRequest(message)) {
          await write(
            output,
            safeBridgeError(message.id, "The RefNest MCP sidecar is unavailable.")
          )
        }
        await write(errorOutput, "RefNest MCP stdio bridge: sidecar request failed.\n")
      } finally {
        clearTimeout(requestTimeout)
        lifecycleAbort.signal.removeEventListener("abort", forwardAbort)
      }
    }
    if (hasInputFailure) throw inputFailure
  } catch (cause) {
    if (hasInputFailure || !isStopped()) {
      stopForExternalAbort()
      throw cause
    }
  } finally {
    signal?.removeEventListener("abort", stopForExternalAbort)
    lifecycleAbort.signal.removeEventListener("abort", notifyQueue)
    await inputPump
  }
}

if (import.meta.main) {
  try {
    await runStdioBridge({
      input: process.stdin,
      output: process.stdout,
      errorOutput: process.stderr,
      config: readStdioBridgeConfig(process.env)
    })
  } catch (cause) {
    const message =
      cause instanceof StdioBridgeConfigError
        ? cause.message
        : "The bridge could not start."
    process.stderr.write(`RefNest MCP stdio bridge: ${message}\n`)
    process.exitCode = 1
  }
}
