import type {
  CreateWorkspace,
  Workspace,
  WorkspaceId
} from "@starter/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useMemo, useState } from "react"

import { ApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

export type WorkspacesState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly workspaces: ReadonlyArray<Workspace> }
  | { readonly status: "failed"; readonly message: string }

const listWorkspaces = Effect.gen(function* () {
  const api = yield* ApiClient

  return yield* api.workspaces.list()
}).pipe(Effect.mapError(toApiFailure))

const createWorkspace = (payload: CreateWorkspace) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    return yield* api.workspaces.create({ payload })
  }).pipe(Effect.mapError(toApiFailure))

/** Owns workspace API orchestration; the shared settings owner persists selection. */
export const useWorkspaces = (
  selectedId: WorkspaceId | null,
  settingsReady: boolean,
  onSelectedIdChange: (id: WorkspaceId) => void
) => {
  const [state, setState] = useState<WorkspacesState>({ status: "loading" })
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const clearActionError = useCallback(() => setActionError(null), [])

  const select = useCallback((workspace: Workspace) => {
    onSelectedIdChange(workspace.id)
  }, [onSelectedIdChange])

  const refresh = useCallback(async () => {
    const result = await appRuntime.runPromise(Effect.either(listWorkspaces))

    setState(
      result._tag === "Right"
        ? { status: "ready", workspaces: result.right }
        : { status: "failed", message: result.left.message }
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedWorkspace = useMemo(() => {
    if (state.status !== "ready") {
      return null
    }

    return (
      state.workspaces.find((workspace) => workspace.id === selectedId) ??
      state.workspaces[0] ??
      null
    )
  }, [selectedId, state])

  useEffect(() => {
    if (
      settingsReady &&
      selectedWorkspace !== null &&
      selectedWorkspace.id !== selectedId
    ) {
      select(selectedWorkspace)
    }
  }, [select, selectedId, selectedWorkspace, settingsReady])

  const create = useCallback(
    async (input: CreateWorkspace): Promise<Workspace | null> => {
      setPending(true)
      setActionError(null)

      const result = await appRuntime.runPromise(
        Effect.either(createWorkspace(input))
      )

      if (result._tag === "Left") {
        setActionError(result.left.message)
        setPending(false)
        return null
      }

      setState((current) => ({
        status: "ready",
        workspaces:
          current.status === "ready"
            ? [...current.workspaces, result.right]
            : [result.right]
      }))
      select(result.right)
      setPending(false)

      return result.right
    },
    [select]
  )

  return {
    state,
    selectedWorkspace,
    pending,
    actionError,
    select,
    create,
    clearActionError,
    refresh
  } as const
}
