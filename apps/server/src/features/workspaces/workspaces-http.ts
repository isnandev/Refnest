import { HttpApiBuilder } from "@effect/platform"
import { StarterApi } from "@starter/contracts"
import { Effect, Layer } from "effect"
import { WorkspaceRepository } from "./workspace-repository"

export const WorkspacesHttpLive = HttpApiBuilder.group(
  StarterApi,
  "workspaces",
  (handlers) =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceRepository

      return handlers
        .handle("list", () => workspaces.list)
        .handle("browse", ({ urlParams }) => workspaces.browse(urlParams))
        .handle("create", ({ payload }) => workspaces.create(payload))
    })
).pipe(Layer.provide(WorkspaceRepository.Default))
