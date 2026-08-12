import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { FolderService } from "./folder-service"

export const FoldersHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "folders",
  (handlers) =>
    Effect.gen(function* () {
      const folders = yield* FolderService

      return handlers
        .handle("list", ({ urlParams }) =>
          folders.list(urlParams.workspaceId)
        )
        .handle("create", ({ payload }) => folders.create(payload))
        .handle("update", ({ path, payload }) =>
          folders.update(path.id, payload)
        )
        .handle("remove", ({ path }) => folders.remove(path.id))
    })
)
