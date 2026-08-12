import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { QuickSaveService } from "./quick-save-service"

export const QuickSaveHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "quickSave",
  (handlers) =>
    Effect.gen(function* () {
      const quickSave = yield* QuickSaveService

      return handlers
        .handle("create", ({ payload }) => quickSave.enqueue(payload))
        .handle("list", ({ urlParams }) =>
          quickSave.list(urlParams.workspaceId)
        )
        .handle("byId", ({ path }) => quickSave.get(path.id))
    })
)

/**
 * Shared, and the capture still runs on the host: a laptop posts a URL and the
 * host's browser and `yt-dlp` do the work.
 */
export const SharedQuickSaveHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "quickSave",
  (handlers) =>
    Effect.gen(function* () {
      const quickSave = yield* QuickSaveService

      return handlers
        .handle("create", ({ payload }) => quickSave.enqueue(payload))
        .handle("list", ({ urlParams }) =>
          quickSave.list(urlParams.workspaceId)
        )
        .handle("byId", ({ path }) => quickSave.get(path.id))
    })
)
