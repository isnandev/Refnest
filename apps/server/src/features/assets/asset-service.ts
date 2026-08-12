import {
  ReferenceAssetDeliveryFailed,
  ReferenceAssetNotFound,
  type ReferenceAssetVariant,
  type ReferenceId,
  type WorkspaceId
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { join } from "node:path"
import { AppPaths } from "../../persistence/app-paths"
import { resolveContainedFile } from "../../persistence/path-policy"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { MAX_CAPTURE_OUTPUT_BYTES } from "../quick-save/capture-limits"
import { detectAssetMimeType, mimeTypeMatches } from "./asset-mime"

type ReferenceAssetRow = {
  readonly workspace_id: string
  readonly workspace_path: string
  readonly asset_relative_path: string
  readonly preview_path: string | null
  readonly mime_type: string
  readonly file_size_bytes: number
}

export type ReferenceAssetFile = {
  readonly path: string
  readonly mimeType: string
  readonly size: number
}

export type ReferenceAssetData = {
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly size: number
}

export const ASSET_READ_LIMIT_EXCEEDED_REASON =
  "The requested asset exceeds the configured delivery limit."

export type AssetServiceShape = {
  readonly get: (
    workspaceId: WorkspaceId,
    referenceId: ReferenceId,
    variant: ReferenceAssetVariant
  ) => Effect.Effect<
    ReferenceAssetFile,
    ReferenceAssetNotFound | ReferenceAssetDeliveryFailed
  >
  readonly read: (
    workspaceId: WorkspaceId,
    referenceId: ReferenceId,
    variant: ReferenceAssetVariant,
    maxBytes: number
  ) => Effect.Effect<
    ReferenceAssetData,
    ReferenceAssetNotFound | ReferenceAssetDeliveryFailed
  >
}

export class AssetService extends Context.Tag("AssetService")<
  AssetService,
  AssetServiceShape
>() {}

const notFound = (
  workspaceId: WorkspaceId,
  referenceId: ReferenceId,
  variant: ReferenceAssetVariant
) => new ReferenceAssetNotFound({ workspaceId, referenceId, variant })

const failed = (reason: string) => new ReferenceAssetDeliveryFailed({ reason })

const makeAssetService = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const appPaths = yield* AppPaths
  const selectAsset = connection.query<ReferenceAssetRow, [ReferenceId]>(`
    SELECT
      r.workspace_id,
      w.path AS workspace_path,
      r.asset_relative_path,
      r.preview_path,
      r.mime_type,
      r.file_size_bytes
    FROM inspiration_references r
    INNER JOIN workspaces w ON w.id = r.workspace_id
    WHERE r.id = ?
  `)

  const get = Effect.fn("AssetService.get")(function* (
    workspaceId: WorkspaceId,
    referenceId: ReferenceId,
    variant: ReferenceAssetVariant
  ) {
    const reference = yield* Effect.try({
      try: () => selectAsset.get(referenceId),
      catch: () => failed("The requested asset metadata could not be loaded.")
    })
    if (reference === null || reference.workspace_id !== workspaceId) {
      return yield* notFound(workspaceId, referenceId, variant)
    }

    const requestedPath =
      variant === "asset"
        ? join(
            reference.workspace_path,
            ...reference.asset_relative_path.split("/")
          )
        : reference.preview_path
    if (requestedPath === null) {
      return yield* notFound(workspaceId, referenceId, variant)
    }

    const file = yield* Effect.try({
      try: () =>
        resolveContainedFile(
          variant === "asset" ? reference.workspace_path : appPaths.previewsDirectory,
          requestedPath
        ),
      catch: () => notFound(workspaceId, referenceId, variant)
    })

    if (file.size <= 0 || file.size > MAX_CAPTURE_OUTPUT_BYTES) {
      return yield* failed("The requested asset has an invalid size.")
    }
    if (variant === "asset" && file.size !== reference.file_size_bytes) {
      return yield* failed("The requested asset size does not match its stored metadata.")
    }

    const header = yield* Effect.tryPromise({
      try: async () =>
        new Uint8Array(
          await Bun.file(file.path)
            .slice(0, Math.min(file.size, 65_536))
            .arrayBuffer()
        ),
      catch: () => failed("The requested asset could not be inspected.")
    })
    const detectedMimeType = detectAssetMimeType(header)
    if (detectedMimeType === null) {
      return yield* failed("The requested asset type could not be verified.")
    }
    if (variant === "asset" && !mimeTypeMatches(reference.mime_type, detectedMimeType)) {
      return yield* failed("The requested asset type does not match its stored metadata.")
    }
    if (variant === "preview" && !detectedMimeType.startsWith("image/")) {
      return yield* failed("The requested preview is not a verified image.")
    }

    return {
      path: file.path,
      mimeType: detectedMimeType,
      size: file.size
    }
  })

  const read = Effect.fn("AssetService.read")(function* (
    workspaceId: WorkspaceId,
    referenceId: ReferenceId,
    variant: ReferenceAssetVariant,
    maxBytes: number
  ) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      return yield* failed("The requested asset delivery limit is invalid.")
    }

    const file = yield* get(workspaceId, referenceId, variant)
    if (file.size > maxBytes) {
      return yield* failed(ASSET_READ_LIMIT_EXCEEDED_REASON)
    }

    const bytes = yield* Effect.tryPromise({
      try: async () => new Uint8Array(await Bun.file(file.path).arrayBuffer()),
      catch: () => failed("The requested asset could not be read.")
    })
    if (bytes.byteLength !== file.size || bytes.byteLength > maxBytes) {
      return yield* failed("The requested asset changed while it was being read.")
    }

    return { bytes, mimeType: file.mimeType, size: file.size }
  })

  return AssetService.of({ get, read })
})

export const AssetServiceLive = Layer.effect(AssetService, makeAssetService)
