import {
  HttpApiBuilder,
  HttpServerRequest,
  HttpServerResponse
} from "@effect/platform"
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse
} from "@modelcontextprotocol/server"
import {
  LOCAL_ENVIRONMENT_ID,
  type EnvironmentConnection
} from "@refnest/contracts"
import { Effect } from "effect"
import { AiService } from "../features/ai/ai-service"
import { AssetService } from "../features/assets/asset-service"
import { EnvironmentService } from "../features/environments/environment-service"
import { FolderService } from "../features/folders/folder-service"
import { QuickSaveService } from "../features/quick-save/quick-save-service"
import { ReferenceService } from "../features/references/reference-service"
import { SettingsRepository } from "../features/settings/settings-repository"
import { SmartFolderService } from "../features/smart-folders/smart-folder-service"
import { WorkspaceRepository } from "../features/workspaces/workspace-repository"
import { isPrivateNetworkAddress } from "../security/private-network"
import {
  makeRefNestMcpServerFactory,
  makeRefNestSharedMcpServerFactory
} from "./refnest-mcp-server"

const allowedLocalMcpHostnames = localhostAllowedHostnames()
const allowedLocalMcpOrigins = localhostAllowedOrigins()
const REMOTE_MCP_TIMEOUT_MILLIS = 60_000

const internalErrorResponse = () =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "RefNest could not process the MCP request." }
    }),
    { status: 500, headers: { "content-type": "application/json" } }
  )

type McpRequestValidator = (request: Request) => Response | undefined

const validateLocalMcpRequest: McpRequestValidator = (request) =>
  hostHeaderValidationResponse(request, allowedLocalMcpHostnames) ??
  originValidationResponse(request, allowedLocalMcpOrigins)

const sharedAllowedHostnames = (request: Request): Array<string> => {
  const host = request.headers.get("host")
  if (host === null) return []

  try {
    const hostname = new URL(`http://${host}`).hostname
    const localName = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.local)?$/i
    return isPrivateNetworkAddress(hostname) || localName.test(hostname)
      ? [hostname]
      : []
  } catch {
    return []
  }
}

/**
 * LAN MCP accepts private IPs and local machine names, while rejecting every
 * browser Origin. Non-browser MCP clients omit Origin, as the protocol expects.
 */
const validateSharedMcpRequest: McpRequestValidator = (request) =>
  hostHeaderValidationResponse(request, sharedAllowedHostnames(request)) ??
  originValidationResponse(request, [])

const acquireMcpHandler = (makeFactory: typeof makeRefNestMcpServerFactory) =>
  Effect.gen(function* () {
    const services = {
      workspaces: yield* WorkspaceRepository,
      folders: yield* FolderService,
      smartFolders: yield* SmartFolderService,
      references: yield* ReferenceService,
      quickSave: yield* QuickSaveService,
      ai: yield* AiService,
      assets: yield* AssetService
    }
    return yield* Effect.acquireRelease(
      Effect.sync(() =>
        createMcpHandler(makeFactory(services), {
          legacy: "stateless"
        })
      ),
      (active) =>
        Effect.promise(() => active.close()).pipe(
          Effect.catchAll(() => Effect.void)
        )
    )
  })

type ActiveMcpHandler = Effect.Effect.Success<
  ReturnType<typeof acquireMcpHandler>
>

const fetchFromHandler = (handler: ActiveMcpHandler, request: Request) =>
  Effect.tryPromise({
    try: () => handler.fetch(request),
    catch: () => new Error("The MCP handler could not answer.")
  })

const forwardRemoteMcpRequest = (
  request: Request,
  connection: EnvironmentConnection
) =>
  Effect.tryPromise({
    try: async (signal) => {
      const headers = new Headers(request.headers)
      headers.delete("authorization")
      headers.delete("connection")
      headers.delete("content-length")
      headers.delete("host")
      headers.delete("origin")
      headers.delete("transfer-encoding")
      headers.set("authorization", `Bearer ${connection.token}`)

      const body =
        request.body === null ? undefined : await request.arrayBuffer()
      return fetch(`${connection.baseUrl.replace(/\/$/, "")}/mcp`, {
        method: request.method,
        headers,
        body,
        redirect: "error",
        signal
      })
    },
    catch: () => new Error("The active remote library did not answer MCP.")
  }).pipe(
    Effect.timeoutFail({
      duration: REMOTE_MCP_TIMEOUT_MILLIS,
      onTimeout: () => new Error("The active remote library timed out.")
    })
  )

const mcpRoute = (
  validateRequest: McpRequestValidator,
  respond: (request: Request) => Effect.Effect<Response, never>
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const webRequest = yield* HttpServerRequest.toWeb(request)
    const rejected = validateRequest(webRequest)
    if (rejected !== undefined) {
      return HttpServerResponse.fromWeb(rejected)
    }
    const response = yield* respond(webRequest)
    return HttpServerResponse.fromWeb(response)
  })

/**
 * The loopback MCP endpoint stays stable while following the library selected
 * in the app. Remote credentials remain inside the sidecar and Rust shell.
 */
export const McpHttpLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const handler = yield* acquireMcpHandler(makeRefNestMcpServerFactory)
    const settings = yield* SettingsRepository
    const environments = yield* EnvironmentService

    yield* router.all(
      "/mcp",
      mcpRoute(validateLocalMcpRequest, (request) =>
        settings.get().pipe(
          Effect.flatMap((current) =>
            current.activeEnvironmentId === LOCAL_ENVIRONMENT_ID
              ? fetchFromHandler(handler, request)
              : environments.connection(current.activeEnvironmentId).pipe(
                  Effect.flatMap((connection) =>
                    forwardRemoteMcpRequest(request, connection)
                  )
                )
          ),
          Effect.catchAll(() => Effect.succeed(internalErrorResponse()))
        )
      )
    )
  })
)

/** Mounts the remote-safe MCP surface behind paired-device authentication. */
export const SharedMcpHttpLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const handler = yield* acquireMcpHandler(makeRefNestSharedMcpServerFactory)

    yield* router.all(
      "/mcp",
      mcpRoute(validateSharedMcpRequest, (request) =>
        fetchFromHandler(handler, request).pipe(
          Effect.catchAll(() => Effect.succeed(internalErrorResponse()))
        )
      )
    )
  })
)
