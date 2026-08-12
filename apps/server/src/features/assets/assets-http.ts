import { HttpApiBuilder, HttpServerResponse } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { AssetService } from "./asset-service"

export const AssetsHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "assets",
  (handlers) =>
    Effect.gen(function* () {
      const assets = yield* AssetService

      return handlers.handleRaw("get", ({ path }) =>
        assets.get(path.workspaceId, path.id, path.variant).pipe(
          Effect.map((file) =>
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
          )
        )
      )
    })
)
