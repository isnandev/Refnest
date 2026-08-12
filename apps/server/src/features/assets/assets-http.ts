import { HttpApiBuilder, HttpServerResponse } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { AssetService, type ReferenceAssetFile } from "./asset-service"

const respond = (file: ReferenceAssetFile) =>
  HttpServerResponse.fromWeb(
    new Response(Bun.file(file.path), {
      headers: {
        "cache-control": "private, no-store",
        "content-length": String(file.size),
        "content-security-policy": "default-src 'none'; sandbox",
        "content-type": file.mimeType,
        "x-content-type-options": "nosniff"
      }
    })
  )

export const AssetsHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "assets",
  (handlers) =>
    Effect.gen(function* () {
      const assets = yield* AssetService

      return handlers.handleRaw("get", ({ path }) =>
        assets.get(path.workspaceId, path.id, path.variant).pipe(
          Effect.map(respond)
        )
      )
    })
)

/**
 * Shared. This is what makes a remote library usable at all: the render path
 * already reads asset bytes over HTTP rather than off the local disk.
 */
export const SharedAssetsHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "assets",
  (handlers) =>
    Effect.gen(function* () {
      const assets = yield* AssetService

      return handlers.handleRaw("get", ({ path }) =>
        assets.get(path.workspaceId, path.id, path.variant).pipe(
          Effect.map(respond)
        )
      )
    })
)
