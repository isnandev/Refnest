import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { ReferenceExportService } from "./reference-export-service"
import { ReferenceImportService } from "./reference-import-service"
import { ReferenceService } from "./reference-service"
import { toPublicReference } from "./reference-model"

export const ReferencesHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "references",
  (handlers) =>
    Effect.gen(function* () {
      const references = yield* ReferenceService

      return handlers
        .handle("list", ({ urlParams }) =>
          references.list(urlParams).pipe(
            Effect.map((items) => items.map(toPublicReference))
          )
        )
        .handle("byId", ({ path }) =>
          references.get(path.id).pipe(Effect.map(toPublicReference))
        )
        .handle("update", ({ path, payload }) =>
          references.update(path.id, payload).pipe(
            Effect.map(toPublicReference)
          )
        )
        .handle("remove", ({ path }) => references.remove(path.id))
    })
)

export const SharedReferencesHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "references",
  (handlers) =>
    Effect.gen(function* () {
      const references = yield* ReferenceService

      return handlers
        .handle("list", ({ urlParams }) =>
          references.list(urlParams).pipe(
            Effect.map((items) => items.map(toPublicReference))
          )
        )
        .handle("byId", ({ path }) =>
          references.get(path.id).pipe(Effect.map(toPublicReference))
        )
        .handle("update", ({ path, payload }) =>
          references.update(path.id, payload).pipe(
            Effect.map(toPublicReference)
          )
        )
        .handle("remove", ({ path }) => references.remove(path.id))
    })
)

/**
 * Host-only: one endpoint names an absolute path on the machine running the
 * sidecar, and the other carries an upload the shared listener does not accept.
 */
export const ReferenceImportHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "referenceImport",
  (handlers) =>
    Effect.gen(function* () {
      const imports = yield* ReferenceImportService

      return handlers
        .handle("importLocal", ({ payload }) =>
          imports.importLocal(payload).pipe(Effect.map(toPublicReference))
        )
        .handle("importPasted", ({ payload }) =>
          imports.importPasted(payload).pipe(Effect.map(toPublicReference))
        )
    })
)

/** Host-only for the same reason: the destination is a path on this machine. */
export const ReferenceExportHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "referenceExport",
  (handlers) =>
    Effect.gen(function* () {
      const exports = yield* ReferenceExportService

      return handlers.handle("exportLocal", ({ path, payload }) =>
        exports.exportLocal(path.id, payload)
      )
    })
)
