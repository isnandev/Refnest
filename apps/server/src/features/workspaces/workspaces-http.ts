import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { WorkspaceRepository } from "./workspace-repository"

export const WorkspacesHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "workspaces",
  (handlers) =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceRepository

      return handlers
        .handle("list", () => workspaces.list)
        .handle("browse", ({ urlParams }) => workspaces.browse(urlParams))
        .handle("create", ({ payload }) => workspaces.create(payload))
    })
)
