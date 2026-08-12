import type { WorkspaceDirectoryListing } from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useState } from "react"

import { ApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

export type WorkspaceBrowserState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly previous: WorkspaceDirectoryListing | null }
  | { readonly status: "ready"; readonly listing: WorkspaceDirectoryListing }
  | { readonly status: "failed"; readonly message: string; readonly path?: string }

const browseWorkspaceDirectory = (path?: string) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    return yield* api.workspaces.browse({
      urlParams: path === undefined ? {} : { path }
    })
  }).pipe(Effect.mapError(toApiFailure))

/** Loads directory listings exclusively through the Bun sidecar API. */
export const useWorkspaceBrowser = () => {
  const [state, setState] = useState<WorkspaceBrowserState>({ status: "idle" })

  const browse = useCallback(async (path?: string) => {
    setState((current) => ({
      status: "loading",
      previous:
        current.status === "ready"
          ? current.listing
          : current.status === "loading"
            ? current.previous
            : null
    }))

    const result = await appRuntime.runPromise(
      Effect.either(browseWorkspaceDirectory(path))
    )

    setState(
      result._tag === "Right"
        ? { status: "ready", listing: result.right }
        : {
            status: "failed",
            message: result.left.message,
            ...(path === undefined ? {} : { path })
          }
    )
  }, [])

  return { state, browse } as const
}
