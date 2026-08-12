import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi, RefNestSharedApi } from "@refnest/contracts"
import { Effect } from "effect"
import { WorkspaceRepository } from "./workspace-repository"

export const WorkspacesHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "workspaces",
  (handlers) =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceRepository

      return handlers.handle("list", () => workspaces.list)
    })
)

/**
 * Shared. Listing exposes each workspace's absolute host path, which a remote
 * device must treat as a label and never as somewhere it can read.
 */
export const SharedWorkspacesHttpLive = HttpApiBuilder.group(
  RefNestSharedApi,
  "workspaces",
  (handlers) =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceRepository

      return handlers.handle("list", () => workspaces.list)
    })
)

/**
 * Host-only, and absent from `RefNestSharedApi` rather than denied there:
 * `browse` enumerates the host filesystem and `create` writes a real directory
 * at a caller-supplied path.
 */
export const WorkspaceAdminHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "workspaceAdmin",
  (handlers) =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceRepository

      return handlers
        .handle("browse", ({ urlParams }) => workspaces.browse(urlParams))
        .handle("create", ({ payload }) => workspaces.create(payload))
    })
)
