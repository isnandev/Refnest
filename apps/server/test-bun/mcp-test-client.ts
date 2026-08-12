import {
  InMemoryTransport,
  isJSONRPCErrorResponse,
  isJSONRPCResponse,
  type JSONRPCMessage,
  type JSONRPCResponse,
  type McpServer,
  type RequestId
} from "@modelcontextprotocol/server"
import { REFNEST_MCP_PROTOCOL_VERSION } from "../src/mcp/mcp-constants"

export type RawMcpClient = {
  readonly initialize: () => Promise<Record<string, unknown>>
  readonly request: (
    method: string,
    params?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
  readonly requestMessage: (
    method: string,
    params?: Record<string, unknown>
  ) => Promise<JSONRPCResponse>
  readonly close: () => Promise<void>
}

/** Minimal JSON-RPC client harness; the project intentionally has no MCP client package. */
export const connectRawMcpClient = async (
  server: McpServer
): Promise<RawMcpClient> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const pending = new Map<
    RequestId,
    {
      readonly resolve: (message: JSONRPCResponse) => void
      readonly reject: (cause: unknown) => void
    }
  >()
  let nextId = 1

  clientTransport.onmessage = (message: JSONRPCMessage) => {
    if (!isJSONRPCResponse(message) || message.id === undefined) return
    const request = pending.get(message.id)
    if (request === undefined) return
    pending.delete(message.id)
    request.resolve(message)
  }
  clientTransport.onerror = (error) => {
    for (const request of pending.values()) {
      request.reject(error)
    }
    pending.clear()
  }

  await clientTransport.start()
  await server.connect(serverTransport)

  const requestMessage = (
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<JSONRPCResponse> => {
    const id = nextId
    nextId += 1
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      clientTransport.send({ jsonrpc: "2.0", id, method, params }).catch((cause) => {
        pending.delete(id)
        reject(cause)
      })
    })
  }

  const request = async (
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const response = await requestMessage(method, params)
    if (isJSONRPCErrorResponse(response)) {
      throw new Error(`MCP ${method} failed with ${response.error.code}.`)
    }
    return response.result
  }

  return {
    initialize: async () => {
      const result = await request("initialize", {
        protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "refnest-tests", version: "1.0.0" }
      })
      await clientTransport.send({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      })
      return result
    },
    request,
    requestMessage,
    close: async () => {
      pending.clear()
      await server.close()
      await clientTransport.close().catch(() => undefined)
    }
  }
}
