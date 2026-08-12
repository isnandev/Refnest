import { access } from "node:fs/promises"
import { join } from "node:path"
import { decodeHandshakeLine, HANDSHAKE_PREFIX } from "@refnest/contracts"
import { Effect } from "effect"
import { REFNEST_MCP_PROTOCOL_VERSION } from "../apps/server/src/mcp/mcp-constants"
import {
  resolveMcpStdioArtifact,
  resolveSidecarArtifact
} from "./sidecar-artifact"

/**
 * Boots the sidecar exactly the way the Rust shell does — spawn, read the
 * handshake off stdout, then talk to it over loopback with the bearer token —
 * so the contract can be proven without building the desktop app.
 */
const repoRoot = join(import.meta.dir, "..")
const artifact = resolveSidecarArtifact()
const stdioArtifact = resolveMcpStdioArtifact()

for (const executablePath of [
  artifact.executablePath,
  stdioArtifact.executablePath
]) {
  await access(executablePath).catch(() => {
    throw new Error(
      `compiled sidecar not found at ${executablePath}; run bun run sidecar:build first`
    )
  })
}

console.log(`smoke sidecar: ${artifact.executablePath}`)

const child = Bun.spawn([artifact.executablePath], {
  cwd: repoRoot,
  stdout: "pipe",
  stderr: "inherit"
})

const readHandshake = async () => {
  const decoder = new TextDecoder()
  let buffered = ""

  for await (const chunk of child.stdout) {
    buffered += decoder.decode(chunk)

    for (const line of buffered.split("\n")) {
      if (line.startsWith(HANDSHAKE_PREFIX)) {
        return Effect.runPromise(decodeHandshakeLine(line.trim()))
      }
    }
  }

  throw new Error("sidecar exited before it printed a handshake")
}

try {
  const handshake = await readHandshake()
  const baseUrl = `http://${handshake.host}:${handshake.port}`
  const authorized = { authorization: `Bearer ${handshake.token}` }

  const checks: Array<readonly [string, number, unknown]> = []

  const call = async (label: string, path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init)
    const body =
      response.status === 204
        ? null
        : await response.json().catch(() => null)
    checks.push([label, response.status, body])

    return response
  }

  const parseMcpResponse = async (response: Response) => {
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

  await call("health without token", "/health")
  await call("health", "/health", { headers: authorized })
  await call("create note", "/notes", {
    method: "POST",
    headers: { ...authorized, "content-type": "application/json" },
    body: JSON.stringify({ title: "Smoke", body: "bun -> rust -> app" })
  })
  await call("list notes", "/notes", { headers: authorized })
  await call("list workspaces", "/workspaces", { headers: authorized })
  await call("browse workspace folders", "/workspaces/directories", {
    headers: authorized
  })
  await call("load settings", "/settings", { headers: authorized })
  await call("save settings", "/settings", {
    method: "PATCH",
    headers: { ...authorized, "content-type": "application/json" },
    body: JSON.stringify({
      themePreference: "dark",
      activeSection: "settings",
      sidebarBackgroundOpacity: 64,
      windowPlacement: {
        x: 120,
        y: 80,
        width: 1040,
        height: 720,
        maximized: false
      }
    })
  })
  await call("reload settings", "/settings", { headers: authorized })

  const initializeRequest = {
    jsonrpc: "2.0",
    id: 101,
    method: "initialize",
    params: {
      protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "refnest-smoke", version: "1.0.0" }
    }
  }
  const mcpHeaders = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": REFNEST_MCP_PROTOCOL_VERSION
  }
  await call("MCP without token", "/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify(initializeRequest)
  })
  const initializedResponse = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { ...authorized, ...mcpHeaders },
    body: JSON.stringify(initializeRequest)
  })
  const initializedMessage = await parseMcpResponse(initializedResponse)
  checks.push(["MCP initialize", initializedResponse.status, initializedMessage])
  const negotiatedProtocol = (
    initializedMessage.result as { protocolVersion?: unknown } | undefined
  )?.protocolVersion

  console.log(`smoke stdio bridge: ${stdioArtifact.executablePath}`)
  const bridge = Bun.spawn([stdioArtifact.executablePath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      REFNEST_MCP_URL: `${baseUrl}/mcp`,
      REFNEST_MCP_TOKEN: handshake.token
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  })
  let bridgeInputEnded = false
  const endBridgeInput = () => {
    if (bridgeInputEnded) return
    bridgeInputEnded = true
    bridge.stdin.end()
  }
  const collectBridgeStdout = async () => {
    const decoder = new TextDecoder()
    let value = ""
    for await (const chunk of bridge.stdout) {
      value += decoder.decode(chunk, { stream: true })
      if (value.includes("\n")) endBridgeInput()
    }
    return value + decoder.decode()
  }
  const bridgeTimeout = setTimeout(() => {
    endBridgeInput()
    bridge.kill()
  }, 15_000)
  bridge.stdin.write(`${JSON.stringify(initializeRequest)}\n`)
  const [bridgeStdout, bridgeStderr, bridgeExitCode] = await Promise.all([
    collectBridgeStdout(),
    new Response(bridge.stderr).text(),
    bridge.exited
  ]).finally(() => {
    clearTimeout(bridgeTimeout)
    endBridgeInput()
  })
  const bridgeLines = bridgeStdout.trim().split("\n").filter(Boolean)
  const bridgeMessage =
    bridgeLines.length === 1
      ? JSON.parse(bridgeLines[0] ?? "{}") as Record<string, unknown>
      : null
  const bridgeProtocol = (
    bridgeMessage?.result as { protocolVersion?: unknown } | undefined
  )?.protocolVersion
  const bridgePassed =
    bridgeExitCode === 0 &&
    bridgeStderr.length === 0 &&
    bridgeLines.length === 1 &&
    bridgeProtocol === REFNEST_MCP_PROTOCOL_VERSION &&
    !bridgeStdout.includes(handshake.token)

  for (const [label, status] of checks) {
    console.log(`${status}  ${label}`)
  }

  const failed = checks.filter(([label, status]) =>
    label === "health without token" || label === "MCP without token"
      ? status !== 401
      : status >= 400
  )

  if (
    failed.length > 0 ||
    negotiatedProtocol !== REFNEST_MCP_PROTOCOL_VERSION ||
    !bridgePassed
  ) {
    const labels = [
      ...failed.map(([label]) => label),
      ...(negotiatedProtocol === REFNEST_MCP_PROTOCOL_VERSION
        ? []
        : ["MCP protocol negotiation"]),
      ...(bridgePassed ? [] : ["MCP stdio bridge"])
    ]
    console.error(`smoke failed: ${labels.join(", ")}`)
    process.exitCode = 1
  } else {
    console.log("sidecar smoke passed")
  }
} finally {
  try {
    child.kill()
  } catch {
    // The sidecar may already have exited after a startup failure.
  }
  await child.exited.catch(() => undefined)
}
