import {
  ExportedReference,
  type ExportReference,
  type LibraryNotFound,
  LibraryOperationFailed,
  type ReferenceId
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { existsSync, lstatSync } from "node:fs"
import { copyFile, stat } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import {
  PathPolicyFailure,
  prepareContainedPath
} from "../../persistence/path-policy"
import { ReferenceService } from "./reference-service"

export type ReferenceExportServiceShape = {
  readonly exportLocal: (
    id: ReferenceId,
    input: ExportReference
  ) => Effect.Effect<
    ExportedReference,
    LibraryNotFound | LibraryOperationFailed
  >
}

export class ReferenceExportService extends Context.Tag(
  "ReferenceExportService"
)<ReferenceExportService, ReferenceExportServiceShape>() {}

const failure = (reason: string) =>
  new LibraryOperationFailed({ operation: "read", reason })

/**
 * The destination is the caller's own path, so it is checked the way the
 * converter checks its output folder: the chosen directory is the containment
 * root, and nothing may traverse out of it or replace a link on the way.
 */
const resolveExportTarget = (destinationPath: string) =>
  Effect.try({
    try: () => {
      if (!isAbsolute(destinationPath)) {
        throw failure("The export path is not absolute.")
      }

      const requested = resolve(destinationPath)
      const prepared = prepareContainedPath(dirname(requested), requested)
      if (existsSync(prepared.path) && lstatSync(prepared.path).isDirectory()) {
        throw failure("The export path is a folder, not a file.")
      }

      return prepared.path
    },
    catch: (cause) =>
      cause instanceof LibraryOperationFailed
        ? cause
        : cause instanceof PathPolicyFailure
          ? failure(cause.reason)
          : failure("The export folder does not exist or cannot be written to.")
  })

const makeReferenceExportService = Effect.gen(function* () {
  const references = yield* ReferenceService

  /**
   * A copy, never a move: exporting is how a reference leaves the library
   * without leaving the library.
   */
  const exportLocal = Effect.fn("ReferenceExportService.exportLocal")(
    function* (id: ReferenceId, input: ExportReference) {
      const reference = yield* references.peek(id)
      const target = yield* resolveExportTarget(input.destinationPath)

      const written = yield* Effect.tryPromise({
        try: async () => {
          await copyFile(reference.assetPath, target)
          return await stat(target)
        },
        catch: () =>
          failure("The reference could not be written to the chosen location.")
      })

      return new ExportedReference({
        path: target,
        fileSizeBytes: written.size
      })
    }
  )

  return ReferenceExportService.of({ exportLocal })
})

export const ReferenceExportServiceLive = Layer.effect(
  ReferenceExportService,
  makeReferenceExportService
)
