import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { SmartFolderService } from "./smart-folder-service"

export const SmartFoldersHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "smartFolders",
  (handlers) =>
    Effect.gen(function* () {
      const smartFolders = yield* SmartFolderService

      return handlers
        .handle("list", ({ urlParams }) =>
          smartFolders.list(urlParams.workspaceId)
        )
        .handle("create", ({ payload }) => smartFolders.create(payload))
        .handle("update", ({ path, payload }) =>
          smartFolders.update(path.id, payload)
        )
        .handle("remove", ({ path }) => smartFolders.remove(path.id))
    })
)

export const SharedSmartFoldersHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "smartFolders",
  (handlers) =>
    Effect.gen(function* () {
      const smartFolders = yield* SmartFolderService

      return handlers
        .handle("list", ({ urlParams }) =>
          smartFolders.list(urlParams.workspaceId)
        )
        .handle("create", ({ payload }) => smartFolders.create(payload))
        .handle("update", ({ path, payload }) =>
          smartFolders.update(path.id, payload)
        )
        .handle("remove", ({ path }) => smartFolders.remove(path.id))
    })
)
