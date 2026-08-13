import { describe, expect, it } from "bun:test"
import { PairedDeviceId, type Workspace } from "@refnest/contracts"
import { Effect, type Scope } from "effect"
import { join } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { PairingService, type PairingServiceShape } from "../src/features/sharing/pairing-service"
import { ShareListener } from "../src/features/sharing/share-listener"
import {
  ReferenceService,
  type ReferenceServiceShape
} from "../src/features/references/reference-service"
import {
  WorkspaceRepository,
  type WorkspaceRepositoryShape
} from "../src/features/workspaces/workspace-repository"
import { REFNEST_MCP_PROTOCOL_VERSION } from "../src/mcp/mcp-constants"
import {
  authenticatedJsonRequest,
  authenticatedWebHandler,
  TEST_BEARER_TOKEN
} from "../test/api-test-client"
import { temporaryDatabase } from "./temporary-database"

type SharedFixture = {
  readonly baseUrl: string
  readonly pairing: PairingServiceShape
  readonly references: ReferenceServiceShape
  readonly workspaces: WorkspaceRepositoryShape
}

/**
 * Binds the real LAN listener on an ephemeral loopback port. Loopback counts as
 * private, so the peer policy admits these requests exactly as it would admit a
 * device on the same network — which is the point of testing over a socket
 * rather than through a web handler with no peer at all.
 */
const withSharedListener = <A>(
  use: (fixture: SharedFixture) => Effect.Effect<A, never, Scope.Scope>
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const database = yield* temporaryDatabase

        return yield* Effect.gen(function* () {
          const listener = yield* ShareListener
          const pairing = yield* PairingService
          const references = yield* ReferenceService
          const workspaces = yield* WorkspaceRepository
          const port = yield* listener.start("127.0.0.1", 0)

          return yield* use({
            baseUrl: `http://127.0.0.1:${port}`,
            pairing,
            references,
            workspaces
          })
        }).pipe(Effect.provide(applicationServicesLive(database.path)))
      })
    )
  )

const redeem = (baseUrl: string, code: string) =>
  Effect.promise(() =>
    fetch(`${baseUrl}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        deviceName: "Test laptop",
        platform: "win32"
      })
    })
  )

const get = (baseUrl: string, path: string, token?: string) =>
  Effect.promise(() =>
    fetch(`${baseUrl}${path}`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` }
    })
  )

const mcpRequest = (
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
  additionalHeaders: Record<string, string> = {}
) =>
  Effect.promise(() =>
    fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "mcp-protocol-version": REFNEST_MCP_PROTOCOL_VERSION,
        ...additionalHeaders
      },
      body: JSON.stringify(body)
    })
  )

const responseMessage = (response: Response) =>
  Effect.promise(async () => {
    const body = await response.text()
    const serialized = response.headers
      .get("content-type")
      ?.includes("text/event-stream")
      ? body
          .replaceAll("\r\n", "\n")
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
      : body
    return JSON.parse(serialized) as Record<string, unknown>
  })

const localMcpRequest = (body: Record<string, unknown>) =>
  new Request("http://127.0.0.1:4317/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TEST_BEARER_TOKEN}`,
      "content-type": "application/json",
      host: "127.0.0.1:4317",
      "mcp-protocol-version": REFNEST_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify(body)
  })

const createVisibleReference = (
  references: ReferenceServiceShape,
  workspace: Workspace,
  marker: string
) =>
  Effect.gen(function* () {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const assetPath = join(workspace.path, `${marker}.png`)
    yield* Effect.promise(() => Bun.write(assetPath, bytes))
    return yield* references.createCaptured({
      workspaceId: workspace.id,
      folderId: null,
      title: `Visible from ${marker}`,
      description: "Regression fixture for the active remote library.",
      sourceUrl: `https://example.com/${marker}`,
      source: "website",
      kind: "image",
      assetPath,
      previewPath: null,
      mimeType: "image/png",
      width: 1,
      height: 1,
      durationSeconds: null,
      fileSizeBytes: bytes.byteLength,
      tags: [marker],
      colors: [],
      fileCreatedAt: null,
      fileModifiedAt: null
    }).pipe(Effect.orDie)
  })

describe("the shared listener's endpoint surface", () => {
  it("serves library items through MCP without exposing host-only tools", async () => {
    await withSharedListener(({ baseUrl, pairing, references, workspaces }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const granted = yield* redeem(baseUrl, invite.code)
        expect(granted.status).toBe(201)
        const { token } = (yield* Effect.promise(() => granted.json())) as {
          readonly token: string
        }

        // Shared: browsing the library is the whole point.
        expect((yield* get(baseUrl, "/workspaces", token)).status).toBe(200)
        expect((yield* get(baseUrl, "/health", token)).status).toBe(200)

        // Host-only. These are absent from `RefNestSharedApi` rather than
        // denied by middleware, so they cannot be re-exposed by a policy bug.
        expect(
          (yield* get(baseUrl, "/workspaces/directories", token)).status
        ).toBe(404)
        expect((yield* get(baseUrl, "/settings", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/ai/settings", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/environments", token)).status).toBe(404)
        expect((yield* get(baseUrl, "/sharing", token)).status).toBe(404)

        const workspace = (yield* workspaces.list.pipe(Effect.orDie))[0]
        expect(workspace).toBeDefined()
        if (workspace === undefined) return

        const reference = yield* createVisibleReference(
          references,
          workspace,
          "remote-mcp"
        )

        const initializedResponse = yield* mcpRequest(baseUrl, token, {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "shared-listener-test", version: "1.0.0" }
          }
        })
        expect(initializedResponse.status).toBe(200)

        const invalidHost = yield* mcpRequest(
          baseUrl,
          token,
          {
            jsonrpc: "2.0",
            id: 10,
            method: "tools/list",
            params: {}
          },
          { host: "attacker.example" }
        )
        expect(invalidHost.status).toBe(403)
        const invalidOrigin = yield* mcpRequest(
          baseUrl,
          token,
          {
            jsonrpc: "2.0",
            id: 11,
            method: "tools/list",
            params: {}
          },
          { origin: "https://attacker.example" }
        )
        expect(invalidOrigin.status).toBe(403)

        const toolsResponse = yield* mcpRequest(baseUrl, token, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {}
        })
        expect(toolsResponse.status).toBe(200)
        const toolsMessage = yield* responseMessage(toolsResponse)
        const toolNames = (toolsMessage.result as {
          readonly tools: ReadonlyArray<{ readonly name: string }>
        }).tools.map(({ name }) => name)
        expect(toolNames).toContain("refnest_search_references")
        expect(toolNames).not.toContain("refnest_create_workspace")
        expect(toolNames).not.toContain("refnest_get_ai_settings")
        expect(toolNames).not.toContain("refnest_update_ai_settings")

        const searchResponse = yield* mcpRequest(baseUrl, token, {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "refnest_search_references",
            arguments: {
              workspaceId: workspace.id,
              query: "remote-mcp"
            }
          }
        })
        expect(searchResponse.status).toBe(200)
        const searchMessage = yield* responseMessage(searchResponse)
        const searchResult = searchMessage.result as {
          readonly structuredContent: {
            readonly references: ReadonlyArray<{ readonly id: string }>
          }
        }
        expect(
          searchResult.structuredContent.references.map(({ id }) => id)
        ).toContain(reference.id)
      })
    )
  })

  it("routes the local MCP endpoint to the active paired library", async () => {
    await withSharedListener(({ baseUrl, pairing, references, workspaces }) =>
      Effect.gen(function* () {
        const workspace = (yield* workspaces.list.pipe(Effect.orDie))[0]
        expect(workspace).toBeDefined()
        if (workspace === undefined) return
        const reference = yield* createVisibleReference(
          references,
          workspace,
          "active-remote-mcp"
        )

        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const local = yield* authenticatedWebHandler.pipe(Effect.orDie)
        const remoteUrl = new URL(baseUrl)
        const connected = yield* Effect.promise(() =>
          local.handler(
            authenticatedJsonRequest("POST", "/environments", {
              host: remoteUrl.hostname,
              port: Number(remoteUrl.port),
              code: invite.code,
              name: "Remote MCP fixture"
            })
          )
        )
        expect(connected.status).toBe(201)
        const environment = (yield* Effect.promise(() => connected.json())) as {
          readonly id: string
        }

        const activated = yield* Effect.promise(() =>
          local.handler(
            authenticatedJsonRequest("PATCH", "/settings", {
              activeEnvironmentId: environment.id
            })
          )
        )
        expect(activated.status).toBe(200)

        const initialized = yield* Effect.promise(() =>
          local.handler(
            localMcpRequest({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: REFNEST_MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "local-proxy-test", version: "1.0.0" }
              }
            })
          )
        )
        expect(initialized.status).toBe(200)

        const search = yield* Effect.promise(() =>
          local.handler(
            localMcpRequest({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "refnest_search_references",
                arguments: {
                  workspaceId: workspace.id,
                  query: "active-remote-mcp"
                }
              }
            })
          )
        )
        expect(search.status).toBe(200)
        const message = yield* responseMessage(search)
        const result = message.result as {
          readonly structuredContent: {
            readonly references: ReadonlyArray<{ readonly id: string }>
          }
        }
        expect(
          result.structuredContent.references.map(({ id }) => id)
        ).toContain(reference.id)
      })
    )
  })

  it("refuses every request that carries no valid device token", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const granted = yield* redeem(baseUrl, invite.code)
        const { token } = (yield* Effect.promise(() => granted.json())) as {
          readonly token: string
        }

        expect((yield* get(baseUrl, "/workspaces")).status).toBe(401)
        expect((yield* get(baseUrl, "/workspaces", "not-a-token")).status).toBe(401)
        expect((yield* get(baseUrl, "/workspaces", `${token}x`)).status).toBe(401)
      })
    )
  })
})

describe("pairing", () => {
  it("is unreachable unless an invite is outstanding", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        // The unauthenticated surface exists only during the pairing window.
        expect((yield* redeem(baseUrl, "K7M2QW9X")).status).toBe(404)

        const invite = yield* pairing.issue.pipe(Effect.orDie)
        expect((yield* redeem(baseUrl, invite.code)).status).toBe(201)

        // Consuming the invite closes the window again.
        expect((yield* redeem(baseUrl, invite.code)).status).toBe(404)
      })
    )
  })

  it("burns an invite after repeated wrong guesses", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const wrong = invite.code === "AAAAAAAA" ? "BBBBBBBB" : "AAAAAAAA"

        for (let attempt = 0; attempt < 5; attempt += 1) {
          expect((yield* redeem(baseUrl, wrong)).status).toBe(403)
        }

        // The right code no longer helps: the attempt budget is spent, and the
        // endpoint is gone rather than answering "correct but too late".
        expect((yield* redeem(baseUrl, invite.code)).status).toBe(404)
      })
    )
  })

  it("stops answering a revoked device", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const invite = yield* pairing.issue.pipe(Effect.orDie)
        const granted = yield* redeem(baseUrl, invite.code)
        const grant = (yield* Effect.promise(() => granted.json())) as {
          readonly token: string
          readonly deviceId: string
        }

        expect((yield* get(baseUrl, "/workspaces", grant.token)).status).toBe(200)

        yield* pairing
          .revoke(PairedDeviceId.make(grant.deviceId))
          .pipe(Effect.orDie)

        expect((yield* get(baseUrl, "/workspaces", grant.token)).status).toBe(401)
      })
    )
  })

  it("issues a distinct token per device", async () => {
    await withSharedListener(({ baseUrl, pairing }) =>
      Effect.gen(function* () {
        const first = yield* pairing.issue.pipe(Effect.orDie)
        const firstResponse = yield* redeem(baseUrl, first.code)
        const firstGrant = (yield* Effect.promise(() =>
          firstResponse.json()
        )) as { readonly token: string }

        const second = yield* pairing.issue.pipe(Effect.orDie)
        const secondResponse = yield* redeem(baseUrl, second.code)
        const secondGrant = (yield* Effect.promise(() =>
          secondResponse.json()
        )) as { readonly token: string }

        expect(firstGrant.token).not.toBe(secondGrant.token)

        const devices = yield* pairing.devices.pipe(Effect.orDie)
        expect(devices).toHaveLength(2)
      })
    )
  })
})

describe("the share listener's lifecycle", () => {
  it("releases its port on stop and rebinds afterwards", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          return yield* Effect.gen(function* () {
            const listener = yield* ShareListener

            const first = yield* listener.start("127.0.0.1", 0)
            expect(yield* listener.runningPort).toBe(first)

            yield* listener.stop
            expect(yield* listener.runningPort).toBeNull()

            // Reachable again on a fresh port: stopping must actually close
            // the socket, not just forget about it.
            const second = yield* listener.start("127.0.0.1", 0)
            expect(yield* listener.runningPort).toBe(second)

            const response = yield* Effect.promise(() =>
              fetch(`http://127.0.0.1:${second}/workspaces`)
            )
            expect(response.status).toBe(401)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })

  it("reports a taken port instead of hanging", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* temporaryDatabase

          return yield* Effect.gen(function* () {
            const listener = yield* ShareListener
            const port = yield* listener.start("127.0.0.1", 0)

            const blocker = Bun.serve({ port: 0, fetch: () => new Response("busy") })
            yield* Effect.addFinalizer(() => Effect.sync(() => blocker.stop(true)))
            const takenPort = Number(blocker.port)

            const conflict = yield* listener
              .start("127.0.0.1", takenPort)
              .pipe(Effect.either)

            expect(conflict._tag).toBe("Left")
            if (conflict._tag === "Left") {
              expect(conflict.left.reason).toContain(String(takenPort))
              expect(conflict.left.reason).toContain("already in use")
            }
            // The failed start does not leave a phantom listener behind.
            expect(yield* listener.runningPort).toBeNull()
            expect(port).not.toBe(takenPort)
          }).pipe(Effect.provide(applicationServicesLive(database.path)))
        })
      )
    )
  })
})
