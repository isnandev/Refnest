import { HttpApiBuilder, HttpServer } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { RefNestSharedApi } from "@refnest/contracts"
import { Context, Deferred, Effect, Layer } from "effect"
import { AiService } from "../features/ai/ai-service"
import { SharedAiEnrichHttpLive } from "../features/ai/ai-http"
import { AssetService } from "../features/assets/asset-service"
import { SharedAssetsHttpLive } from "../features/assets/assets-http"
import { FolderService } from "../features/folders/folder-service"
import { SharedFoldersHttpLive } from "../features/folders/folders-http"
import { HealthService } from "../features/health/health-service"
import { SharedHealthHttpLive } from "../features/health/health-http"
import { NoteRepository } from "../features/notes/note-repository"
import { SharedNotesHttpLive } from "../features/notes/notes-http"
import { QuickSaveService } from "../features/quick-save/quick-save-service"
import { SharedQuickSaveHttpLive } from "../features/quick-save/quick-save-http"
import { ReferenceService } from "../features/references/reference-service"
import { SharedReferencesHttpLive } from "../features/references/references-http"
import { PairingService } from "../features/sharing/pairing-service"
import { SharedPairingHttpLive } from "../features/sharing/sharing-http"
import { SmartFolderService } from "../features/smart-folders/smart-folder-service"
import { SharedSmartFoldersHttpLive } from "../features/smart-folders/smart-folders-http"
import { WorkspaceRepository } from "../features/workspaces/workspace-repository"
import { SharedWorkspacesHttpLive } from "../features/workspaces/workspaces-http"
import type { ShareBranch } from "../features/sharing/share-listener"
import { withSharedAuth } from "./shared-auth"

/**
 * Everything the LAN surface is allowed to touch, written out rather than
 * inferred. Adding a tag here is the deliberate act of widening what a remote
 * device can reach.
 */
export type SharedApiServices =
  | AiService
  | AssetService
  | FolderService
  | HealthService
  | NoteRepository
  | PairingService
  | QuickSaveService
  | ReferenceService
  | SmartFolderService
  | WorkspaceRepository

/**
 * Narrows a captured context to exactly the tags above.
 *
 * `Effect.context<SharedApiServices>()` returns the *whole* fiber context and
 * merely types it as this union — including, at the point the listener is
 * built, the device listener's own `HttpServer`. Handing that to the branch let
 * its `serve` resolve the device server and `reload()` away its handler, so
 * enabling sharing silently made every loopback request answer 401. Picking the
 * tags makes the runtime match the type.
 */
export const pickSharedApiServices = Context.pick(
  AiService,
  AssetService,
  FolderService,
  HealthService,
  NoteRepository,
  PairingService,
  QuickSaveService,
  ReferenceService,
  SmartFolderService,
  WorkspaceRepository
)

/**
 * The LAN contract. Workspace administration, local import, AI settings,
 * desktop settings, environments, sharing, and MCP are absent here rather than
 * denied, so a remote device cannot reach them even if the middleware is wrong.
 */
export const SharedContractApiLive = HttpApiBuilder.api(RefNestSharedApi).pipe(
  Layer.provide(SharedAiEnrichHttpLive),
  Layer.provide(SharedAssetsHttpLive),
  Layer.provide(SharedFoldersHttpLive),
  Layer.provide(SharedHealthHttpLive),
  Layer.provide(SharedNotesHttpLive),
  Layer.provide(SharedPairingHttpLive),
  Layer.provide(SharedQuickSaveHttpLive),
  Layer.provide(SharedReferencesHttpLive),
  Layer.provide(SharedSmartFoldersHttpLive),
  Layer.provide(SharedWorkspacesHttpLive)
)

/**
 * Builds one run of the LAN listener.
 *
 * `SharedContractApiLive` is composed *inside* the branch on purpose.
 * `HttpApiBuilder.Router` is one tag, and layer memoisation is per build: if
 * both APIs are built in the same graph they register into the same router and
 * the second `GET /workspaces` throws at boot. Building the shared API within
 * the listener's own `Layer.launch` gives it its own router.
 *
 * The services come the other way — as an already-built context — so starting
 * the listener never reopens the database.
 */
export const makeShareBranch = (
  services: Context.Context<SharedApiServices>
): ShareBranch =>
  ({ hostname, port, ready }) =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const server = yield* HttpServer.HttpServer

        if (server.address._tag !== "TcpAddress") {
          return yield* Effect.dieMessage(
            `the share listener expected a TCP address, got ${server.address._tag}`
          )
        }

        yield* Deferred.succeed(ready, server.address.port)
      })
    ).pipe(
      Layer.provide(
        HttpApiBuilder.serve(withSharedAuth).pipe(
          Layer.provide(SharedContractApiLive),
          Layer.provide(Layer.succeedContext(services)),
          Layer.provideMerge(BunHttpServer.layer({ hostname, port }))
        )
      )
    )
