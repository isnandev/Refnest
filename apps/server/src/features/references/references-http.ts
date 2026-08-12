import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
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
 * Host-only: the payload names an absolute path on the machine running the
 * sidecar, so it can only ever mean something to a caller sitting at it.
 */
export const ReferenceImportHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "referenceImport",
  (handlers) =>
    Effect.gen(function* () {
      const imports = yield* ReferenceImportService

      return handlers.handle("importLocal", ({ payload }) =>
        imports.importLocal(payload).pipe(Effect.map(toPublicReference))
      )
    })
)
