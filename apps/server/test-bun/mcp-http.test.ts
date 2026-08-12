import { describe, expect, it } from "bun:test"
import {
  REFNEST_MCP_PROTOCOL_VERSION,
  REFNEST_MCP_TOOL_NAMES
} from "../src/mcp/mcp-constants"
import {
  authenticatedJsonRequest,
  authenticatedWebHandler,
  TEST_BEARER_TOKEN
} from "../test/api-test-client"
import { Effect } from "effect"

const rpcRequest = (
  body: Record<string, unknown> | undefined,
  token?: string,
  additionalHeaders: Record<string, string> = {},
  method = "POST"
): Request =>
  new Request("http://127.0.0.1:4317/mcp", {
    method,
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "127.0.0.1:4317",
      "mcp-protocol-version": REFNEST_MCP_PROTOCOL_VERSION,
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...additionalHeaders
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

const responseMessage = async (response: Response): Promise<Record<string, unknown>> => {
  const body = await response.text()
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = body
      .replaceAll("\r\n", "\n")
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
    return JSON.parse(data) as Record<string, unknown>
  }
  return JSON.parse(body) as Record<string, unknown>
}

describe("authenticated MCP Streamable HTTP", () => {
  it("enforces bearer and DNS-rebinding boundaries while keeping REST available", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { handler } = yield* authenticatedWebHandler
          const initialize = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "http-test", version: "1.0.0" }
            }
          }

          const unauthenticated = yield* Effect.promise(() =>
            handler(rpcRequest(initialize))
          )
          expect(unauthenticated.status).toBe(401)
          expect(yield* Effect.promise(() => unauthenticated.text())).toBe("")

          const wrongToken = yield* Effect.promise(() =>
            handler(rpcRequest(initialize, "incorrect-token"))
          )
          expect(wrongToken.status).toBe(401)

          const invalidHost = yield* Effect.promise(() =>
            handler(
              rpcRequest(initialize, TEST_BEARER_TOKEN, {
                host: "attacker.example"
              })
            )
          )
          expect(invalidHost.status).toBe(403)

          const invalidOrigin = yield* Effect.promise(() =>
            handler(
              rpcRequest(initialize, TEST_BEARER_TOKEN, {
                origin: "https://attacker.example"
              })
            )
          )
          expect(invalidOrigin.status).toBe(403)

          const initializedResponse = yield* Effect.promise(() =>
            handler(rpcRequest(initialize, TEST_BEARER_TOKEN))
          )
          expect(initializedResponse.status).toBe(200)
          expect(initializedResponse.headers.get("mcp-session-id")).toBeNull()
          const initialized = yield* Effect.promise(() =>
            responseMessage(initializedResponse)
          )
          expect(initialized).toMatchObject({
            jsonrpc: "2.0",
            id: 1,
            result: { protocolVersion: REFNEST_MCP_PROTOCOL_VERSION }
          })
          expect(JSON.stringify(initialized)).not.toContain(TEST_BEARER_TOKEN)

          const notificationResponse = yield* Effect.promise(() =>
            handler(
              rpcRequest(
                {
                  jsonrpc: "2.0",
                  method: "notifications/initialized",
                  params: {}
                },
                TEST_BEARER_TOKEN
              )
            )
          )
          expect(notificationResponse.status).toBe(202)

          const toolsResponse = yield* Effect.promise(() =>
            handler(
              rpcRequest(
                {
                  jsonrpc: "2.0",
                  id: 2,
                  method: "tools/list",
                  params: {}
                },
                TEST_BEARER_TOKEN
              )
            )
          )
          expect(toolsResponse.status).toBe(200)
          const toolsMessage = yield* Effect.promise(() =>
            responseMessage(toolsResponse)
          )
          const result = toolsMessage.result as {
            tools: Array<{ name: string }>
          }
          expect(result.tools.map(({ name }) => name)).toStrictEqual([
            ...REFNEST_MCP_TOOL_NAMES
          ])

          const getSession = yield* Effect.promise(() =>
            handler(rpcRequest(undefined, TEST_BEARER_TOKEN, {}, "GET"))
          )
          expect(getSession.status).toBe(405)

          const deleteSession = yield* Effect.promise(() =>
            handler(rpcRequest(undefined, TEST_BEARER_TOKEN, {}, "DELETE"))
          )
          expect(deleteSession.status).toBe(405)

          const health = yield* Effect.promise(() =>
            handler(authenticatedJsonRequest("GET", "/health"))
          )
          expect(health.status).toBe(200)
        })
      )
    )
  })
})
