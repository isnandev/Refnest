import { describe, expect, it } from "vitest"
import { Schema } from "effect"

import {
  McpConnectionInfo,
  mcpAuthorizationHeader
} from "@/features/settings/mcp-connection"

describe("MCP connection details", () => {
  it("decodes the credentials supplied by the Tauri shell", () => {
    const decoded = Schema.decodeUnknownSync(McpConnectionInfo)({
      url: "http://127.0.0.1:4317/mcp",
      token: "local-secret"
    })

    expect(decoded.url).toBe("http://127.0.0.1:4317/mcp")
    expect(mcpAuthorizationHeader(decoded.token)).toBe("Bearer local-secret")
  })

  it("rejects incomplete connection details", () => {
    expect(() =>
      Schema.decodeUnknownSync(McpConnectionInfo)({ url: "", token: "" })
    ).toThrow()
  })
})
