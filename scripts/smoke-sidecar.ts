import { join } from "node:path"
import { decodeHandshakeLine, HANDSHAKE_PREFIX } from "@starter/contracts"
import { Effect } from "effect"

/**
 * Boots the sidecar exactly the way the Rust shell does — spawn, read the
 * handshake off stdout, then talk to it over loopback with the bearer token —
 * so the contract can be proven without building the desktop app.
 */
const repoRoot = join(import.meta.dir, "..")

const child = Bun.spawn(["bun", "run", join(repoRoot, "apps/server/src/main.ts")], {
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

const handshake = await readHandshake()
const baseUrl = `http://${handshake.host}:${handshake.port}`
const authorized = { authorization: `Bearer ${handshake.token}` }

const checks: Array<readonly [string, number, unknown]> = []

const call = async (label: string, path: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${path}`, init)
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  checks.push([label, response.status, body])

  return response
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

child.kill()

for (const [label, status, body] of checks) {
  console.log(`${status}  ${label}  ${JSON.stringify(body)}`)
}

const failed = checks.filter(([label, status]) =>
  label === "health without token" ? status !== 401 : status >= 400
)

if (failed.length > 0) {
  console.error(`smoke failed: ${failed.map(([label]) => label).join(", ")}`)
  process.exit(1)
}

console.log("sidecar smoke passed")
