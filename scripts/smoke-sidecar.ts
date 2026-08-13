import { access, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
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

/**
 * A real 8x8 PNG. The image codecs are wasm modules embedded by
 * `bun build --compile`, so only the compiled binary can prove they load.
 */
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAABE0lEQVR4AQEIAff+AAAAyP8eD8j/PB7I/1otyP94PMj/lkvI/7RayP/Sacj/APB4yP8Oh8j/LJbI/0qlyP9otMj/hsPI/6TSyP/C4cj/AODwyP/+/8j/HA7I/zodyP9YLMj/djvI/5RKyP+yWcj/ANBoyP/ud8j/DIbI/yqVyP9IpMj/ZrPI/4TCyP+i0cj/AMDgyP/e78j//P7I/xoNyP84HMj/VivI/3Q6yP+SScj/ALBYyP/OZ8j/7HbI/wqFyP8olMj/RqPI/2SyyP+Cwcj/AKDQyP++38j/3O7I//r9yP8YDMj/NhvI/1QqyP9yOcj/AJBIyP+uV8j/zGbI/+p1yP8IhMj/JpPI/0SiyP9iscj/p8+wIUcV05UAAAAASUVORK5CYII=",
  "base64"
)

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
  await call("list libraries", "/environments", { headers: authorized })
  await call("read sharing status", "/sharing", { headers: authorized })

  // Turn the LAN listener on for real, pair a device against it, and use the
  // issued token — the whole cross-device path, in one compiled binary.
  const sharePort = 41_317
  await call("enable sharing", "/sharing", {
    method: "PUT",
    headers: { ...authorized, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, port: sharePort })
  })

  // Regression guard: the share listener must create its own server rather
  // than resolving the device listener's and reloading its handler. When it got
  // that wrong, every loopback request started answering 401.
  const deviceStillAuthorized = await call("device listener after sharing starts", "/environments", {
    headers: authorized
  })
  if (deviceStillAuthorized.status !== 200) {
    throw new Error(
      `enabling sharing broke the device listener (${deviceStillAuthorized.status})`
    )
  }

  const shareBaseUrl = `http://127.0.0.1:${sharePort}`
  const inviteResponse = await fetch(`${baseUrl}/sharing/invites`, {
    method: "POST",
    headers: authorized
  })
  const inviteBody = await inviteResponse.text()
  if (inviteResponse.status !== 201) {
    throw new Error(
      `pairing invite failed with ${inviteResponse.status}: ${inviteBody}`
    )
  }
  const invite = JSON.parse(inviteBody) as { readonly code: string }
  checks.push(["issue pairing code", inviteResponse.status, { code: invite.code }])

  const grantResponse = await fetch(`${shareBaseUrl}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: invite.code,
      deviceName: "Smoke laptop",
      platform: process.platform
    })
  })
  const grantBody = await grantResponse.text()
  if (grantResponse.status !== 201) {
    throw new Error(
      `pairing redemption failed with ${grantResponse.status}: ${grantBody}`
    )
  }
  const grant = JSON.parse(grantBody) as { readonly token: string }
  checks.push(["redeem pairing code", grantResponse.status, { paired: true }])

  const shared = { authorization: `Bearer ${grant.token}` }
  const sharedWorkspaces = await fetch(`${shareBaseUrl}/workspaces`, {
    headers: shared
  })
  if (sharedWorkspaces.status !== 200) {
    throw new Error(
      `the LAN listener refused a paired device (${sharedWorkspaces.status})`
    )
  }
  checks.push([
    "list workspaces over the LAN listener",
    sharedWorkspaces.status,
    await sharedWorkspaces.json()
  ])

  // Host-only, and absent from the shared contract rather than merely denied.
  const sharedSettings = await fetch(`${shareBaseUrl}/settings`, {
    headers: shared
  })
  if (sharedSettings.status !== 404) {
    throw new Error(
      `host-only settings answered over the LAN with ${sharedSettings.status}`
    )
  }
  checks.push([
    "host-only settings are unreachable over the LAN",
    sharedSettings.status,
    { expected: 404 }
  ])

  await call("disable sharing", "/sharing", {
    method: "PUT",
    headers: { ...authorized, "content-type": "application/json" },
    body: JSON.stringify({ enabled: false })
  })

  const conversionDirectory = await mkdtemp(join(tmpdir(), "refnest-smoke-"))
  const conversionSource = join(conversionDirectory, "sample.png")
  await Bun.write(conversionSource, SAMPLE_PNG)
  await call("convert image", "/converter/images", {
    method: "POST",
    headers: { ...authorized, "content-type": "application/json" },
    body: JSON.stringify({
      paths: [conversionSource],
      outputDirectory: conversionDirectory,
      format: "webp",
      quality: 80
    })
  })
  const conversionReport = checks.at(-1)?.[2] as
    | { converted?: ReadonlyArray<{ outputPath?: unknown }> }
    | undefined
  const convertedPath = conversionReport?.converted?.[0]?.outputPath
  const conversionProduced =
    typeof convertedPath === "string" &&
    (await Bun.file(convertedPath).exists())

  // Imports re-encode to JPEG and attach a downscaled preview for the AI.
  const workspaces = checks.find(([label]) => label === "list workspaces")?.[2] as
    | ReadonlyArray<{ id?: unknown }>
    | undefined
  const workspaceId = workspaces?.[0]?.id
  let importConverted = false
  let importDated = false
  let ratingStored = false
  let sortApplied = false
  let exportWritten = false
  if (typeof workspaceId === "string") {
    await call("import reference", "/references/import", {
      method: "POST",
      headers: { ...authorized, "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        folderId: null,
        path: conversionSource
      })
    })
    const imported = checks.at(-1)?.[2] as
      | {
          id?: unknown
          mimeType?: unknown
          previewUrl?: unknown
          rating?: unknown
          fileCreatedAt?: unknown
          fileModifiedAt?: unknown
        }
      | undefined
    importConverted =
      imported?.mimeType === "image/jpeg" &&
      typeof imported.previewUrl === "string"
    // The import carries the source file's own timestamps, and starts unrated.
    importDated =
      imported?.rating === 0 && typeof imported.fileModifiedAt === "string"

    const referenceId = imported?.id
    if (typeof referenceId === "string") {
      await call("rate reference", `/references/${referenceId}`, {
        method: "PATCH",
        headers: { ...authorized, "content-type": "application/json" },
        body: JSON.stringify({ rating: 4 })
      })
      ratingStored =
        (checks.at(-1)?.[2] as { rating?: unknown } | undefined)?.rating === 4

      await call(
        "list references sorted",
        `/references?workspaceId=${encodeURIComponent(workspaceId)}&sort=rating&direction=desc`,
        { headers: authorized }
      )
      const sorted = checks.at(-1)?.[2] as
        | ReadonlyArray<{ rating?: unknown }>
        | undefined
      sortApplied = sorted !== undefined && sorted[0]?.rating === 4

      const exportPath = join(conversionDirectory, "exported.jpg")
      await call("export reference", `/references/${referenceId}/export`, {
        method: "POST",
        headers: { ...authorized, "content-type": "application/json" },
        body: JSON.stringify({ destinationPath: exportPath })
      })
      exportWritten = await Bun.file(exportPath).exists()
    }
  }

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

  // Checks that are only meaningful when they are refused. Everything else
  // simply has to succeed.
  const expectedStatus: Record<string, number> = {
    "health without token": 401,
    "MCP without token": 401,
    "host-only settings are unreachable over the LAN": 404
  }

  const failed = checks.filter(([label, status]) => {
    const expected = expectedStatus[label]
    return expected === undefined ? status >= 400 : status !== expected
  })

  if (
    failed.length > 0 ||
    negotiatedProtocol !== REFNEST_MCP_PROTOCOL_VERSION ||
    !bridgePassed ||
    !conversionProduced ||
    !importConverted ||
    !importDated ||
    !ratingStored ||
    !sortApplied ||
    !exportWritten
  ) {
    const labels = [
      ...failed.map(([label]) => label),
      ...(negotiatedProtocol === REFNEST_MCP_PROTOCOL_VERSION
        ? []
        : ["MCP protocol negotiation"]),
      ...(bridgePassed ? [] : ["MCP stdio bridge"]),
      ...(conversionProduced ? [] : ["image conversion output"]),
      ...(importConverted ? [] : ["import conversion and preview"]),
      ...(importDated ? [] : ["imported file timestamps"]),
      ...(ratingStored ? [] : ["stored rating"]),
      ...(sortApplied ? [] : ["sorted listing"]),
      ...(exportWritten ? [] : ["exported file"])
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
