import { Schema } from "effect"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CdpClient } from "./cdp-client"

const ChromiumTarget = Schema.Struct({
  webSocketDebuggerUrl: Schema.NonEmptyTrimmedString
})

const decodeChromiumTarget = Schema.decodeUnknownSync(ChromiumTarget)

const browserCandidates = () => {
  const configured = process.env["REFNEST_CHROMIUM_EXECUTABLE"]?.trim()
  const platformCandidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium"
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge"
          ]

  return configured === undefined
    ? platformCandidates
    : [configured, ...platformCandidates]
}

const resolveBrowserExecutable = () => {
  const executable = browserCandidates().find((candidate) => existsSync(candidate))
  if (executable === undefined) {
    throw new Error(
      "Chrome, Edge, or Chromium was not found. Set REFNEST_CHROMIUM_EXECUTABLE to its executable path."
    )
  }
  return executable
}

const readDevToolsPort = async (profileDirectory: string) => {
  const activePort = await readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")
  const firstLine = activePort.split(/\r?\n/, 1)[0]
  const port = Number.parseInt(firstLine ?? "", 10)

  return Number.isSafeInteger(port) && port > 0 && port <= 65_535 ? port : null
}

/** Launches an isolated local Chromium and connects through Bun's native WebSocket. */
export const launchChromiumSession = async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), "refnest-chromium-"))
  const browserProcess = Bun.spawn(
    [
      resolveBrowserExecutable(),
      "--headless",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-sync",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-default-browser-check",
      "--no-first-run",
      "--remote-allow-origins=*",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank"
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore" }
  )
  let client: CdpClient | undefined
  let closed = false

  const close = async () => {
    if (closed) return
    closed = true

    await client?.close().catch(() => undefined)
    if (browserProcess.exitCode === null) {
      try {
        browserProcess.kill()
      } catch {
        // The browser can exit between the exitCode check and kill call.
      }
    }
    await Promise.race([browserProcess.exited.then(() => undefined), Bun.sleep(3_000)])
    await rm(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100
    }).catch(() => undefined)
  }

  try {
    let port: number | null = null
    for (let attempt = 0; attempt < 200 && port === null; attempt += 1) {
      if (browserProcess.exitCode !== null) {
        throw new Error(`Chromium exited before DevTools was ready (code ${browserProcess.exitCode}).`)
      }
      port = await readDevToolsPort(profileDirectory).catch(() => null)
      if (port === null) await Bun.sleep(50)
    }
    if (port === null) {
      throw new Error("Chromium did not expose a DevTools endpoint within 10 seconds.")
    }

    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
      { method: "PUT" }
    )
    if (!targetResponse.ok) {
      throw new Error(`Chromium could not create a capture page (HTTP ${targetResponse.status}).`)
    }
    const targetPayload: unknown = await targetResponse.json()
    const target = decodeChromiumTarget(targetPayload)
    client = await CdpClient.connect(target.webSocketDebuggerUrl)

    return { client, close } as const
  } catch (cause) {
    await close()
    throw cause
  }
}
