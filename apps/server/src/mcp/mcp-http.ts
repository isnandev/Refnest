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
import { Effect } from "effect"
import { AiService } from "../features/ai/ai-service"
import { AssetService } from "../features/assets/asset-service"
import { FolderService } from "../features/folders/folder-service"
import { QuickSaveService } from "../features/quick-save/quick-save-service"
import { ReferenceService } from "../features/references/reference-service"
import { SmartFolderService } from "../features/smart-folders/smart-folder-service"
import { WorkspaceRepository } from "../features/workspaces/workspace-repository"
import { makeRefNestMcpServerFactory } from "./refnest-mcp-server"

const allowedMcpHostnames = localhostAllowedHostnames()
const allowedMcpOrigins = localhostAllowedOrigins()

const internalErrorResponse = () =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "RefNest could not process the MCP request." }
    }),
    { status: 500, headers: { "content-type": "application/json" } }
  )

/** Mounts stateless Streamable HTTP on the same authenticated sidecar router. */
export const McpHttpLive = HttpApiBuilder.Router.use((router) =>
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
    const handler = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createMcpHandler(makeRefNestMcpServerFactory(services), {
          legacy: "stateless"
        })
      ),
      (active) =>
        Effect.promise(() => active.close()).pipe(
          Effect.catchAll(() => Effect.void)
        )
    )

    yield* router.all("/mcp", Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const webRequest = yield* HttpServerRequest.toWeb(request)
      const rejected =
        hostHeaderValidationResponse(webRequest, allowedMcpHostnames) ??
        originValidationResponse(webRequest, allowedMcpOrigins)
      if (rejected !== undefined) {
        return HttpServerResponse.fromWeb(rejected)
      }
      const response = yield* Effect.tryPromise(() => handler.fetch(webRequest)).pipe(
        Effect.catchAll(() => Effect.succeed(internalErrorResponse()))
      )
      return HttpServerResponse.fromWeb(response)
    }))
  })
)
