import { ReferenceId } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { join } from "node:path"
import { AppPaths } from "../../persistence/app-paths"
import { removeContainedFile, resolveContainedFile } from "../../persistence/path-policy"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { VideoThumbnailer } from "./video-thumbnailer"

type MissingVideoPreviewRow = {
  readonly id: string
  readonly workspace_path: string
  readonly asset_relative_path: string
}

type CurrentVideoPreviewRow = {
  readonly preview_path: string | null
}

/**
 * One startup pass upgrades videos created before automatic posters existed.
 * It runs behind startup and never holds the API open; failures are local to
 * one video so an unusual or damaged codec cannot block the library.
 */
export const VideoThumbnailBackfillLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    const { connection } = yield* SqliteDatabase
    const appPaths = yield* AppPaths
    const thumbnails = yield* VideoThumbnailer
    const missing = connection.query<MissingVideoPreviewRow, []>(`
      SELECT r.id, w.path AS workspace_path, r.asset_relative_path
      FROM inspiration_references r
      INNER JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.kind = 'video' AND r.preview_path IS NULL
      ORDER BY r.created_at ASC
    `)
    const savePreview = connection.query<
      never,
      [string, ReferenceId]
    >(`
      UPDATE inspiration_references
      SET preview_path = ?
      WHERE id = ? AND preview_path IS NULL
    `)
    const currentPreview = connection.query<
      CurrentVideoPreviewRow,
      [ReferenceId]
    >(`
      SELECT preview_path
      FROM inspiration_references
      WHERE id = ?
    `)

    const upgrade = Effect.gen(function* () {
      const rows = yield* Effect.try({
        try: () => missing.all(),
        catch: () => []
      })
      yield* Effect.forEach(
        rows,
        (row) =>
          Effect.gen(function* () {
            const referenceId = ReferenceId.make(row.id)
            const asset = yield* Effect.try({
              try: () =>
                resolveContainedFile(
                  row.workspace_path,
                  join(
                    row.workspace_path,
                    ...row.asset_relative_path.split("/")
                  )
                ),
              catch: () => null
            })
            if (asset === null) return

            const generated = yield* thumbnails
              .generate(asset.path, referenceId)
              .pipe(Effect.either)
            if (generated._tag === "Left") return

            const saved = yield* Effect.try({
              try: () => savePreview.run(generated.right, referenceId).changes,
              catch: () => 0
            })
            if (saved > 0) return

            // Another app instance may have won the same deterministic poster
            // path. Remove only when the database proves nobody adopted it.
            const current = yield* Effect.try({
              try: () => currentPreview.get(referenceId),
              catch: () => undefined
            })
            if (
              current === undefined ||
              current?.preview_path === generated.right
            ) {
              return
            }

            yield* Effect.sync(() => {
              try {
                removeContainedFile(appPaths.previewsDirectory, generated.right)
              } catch {
                // Cleanup never broadens beyond the preview directory.
              }
            })
          }),
        { concurrency: 1, discard: true }
      )
    })

    yield* Effect.forkScoped(upgrade)
  })
)
