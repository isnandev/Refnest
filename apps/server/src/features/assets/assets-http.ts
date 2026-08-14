import { HttpApiBuilder, HttpServerResponse } from "@effect/platform"
import {
  ReferenceAssetDeliveryFailed,
  RefNestApi,
  RefNestSharedApi
} from "@refnest/contracts"
import { Effect } from "effect"
import { resolveAssetRange } from "./asset-range"
import { AssetService, type ReferenceAssetFile } from "./asset-service"

const responseHeaders = (file: ReferenceAssetFile) => ({
  "accept-ranges": "bytes",
  "cache-control": "private, no-store",
  "content-security-policy": "default-src 'none'; sandbox",
  "content-type": file.mimeType,
  "x-content-type-options": "nosniff"
})

const respond = (file: ReferenceAssetFile, rangeHeader: string | undefined) => {
  const range = resolveAssetRange(rangeHeader, file.size)
  const headers = responseHeaders(file)

  if (range._tag === "Unsatisfiable") {
    return Effect.succeed(
      HttpServerResponse.fromWeb(
        new Response(null, {
          status: 416,
          headers: { ...headers, "content-range": `bytes */${file.size}` }
        })
      )
    )
  }

  if (range._tag === "Partial") {
    const length = range.end - range.start + 1
    return Effect.tryPromise({
      try: async () => {
        const bytes = new Uint8Array(
          await Bun.file(file.path).slice(range.start, range.end + 1).arrayBuffer()
        )
        if (bytes.byteLength !== length) {
          throw new Error("the asset changed while its range was being read")
        }

        return HttpServerResponse.fromWeb(
          new Response(bytes, {
            status: 206,
            headers: {
              ...headers,
              "content-length": String(length),
              "content-range": `bytes ${range.start}-${range.end}/${file.size}`
            }
          })
        )
      },
      catch: () =>
        new ReferenceAssetDeliveryFailed({
          reason: "The requested asset range could not be read."
        })
    })
  }

  return Effect.succeed(
    HttpServerResponse.fromWeb(
      new Response(Bun.file(file.path), {
        headers: { ...headers, "content-length": String(file.size) }
      })
    )
  )
}

export const AssetsHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "assets",
  (handlers) =>
    Effect.gen(function* () {
      const assets = yield* AssetService

      return handlers.handleRaw("get", ({ path, request }) =>
        assets.get(path.workspaceId, path.id, path.variant).pipe(
          Effect.flatMap((file) => respond(file, request.headers["range"]))
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

      return handlers.handleRaw("get", ({ path, request }) =>
        assets.get(path.workspaceId, path.id, path.variant).pipe(
          Effect.flatMap((file) => respond(file, request.headers["range"]))
        )
      )
    })
)
