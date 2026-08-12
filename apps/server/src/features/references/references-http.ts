import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
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
      const imports = yield* ReferenceImportService

      return handlers
        .handle("list", ({ urlParams }) =>
          references.list(urlParams).pipe(
            Effect.map((items) => items.map(toPublicReference))
          )
        )
        .handle("importLocal", ({ payload }) =>
          imports.importLocal(payload).pipe(Effect.map(toPublicReference))
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
