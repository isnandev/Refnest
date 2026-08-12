import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
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
