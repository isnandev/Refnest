import {
  CreateQuickSave,
  type CaptureJob,
  type FolderId,
  type WorkspaceId
} from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useRef, useState } from "react"

import { ApiClient } from "@/lib/api/client"
import { toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"
import {
  captureStatuses,
  isActiveCapture,
  settledCaptureJobs
} from "./capture-job"

export type CaptureJobsState =
  | { readonly status: "loading"; readonly jobs: ReadonlyArray<CaptureJob> }
  | { readonly status: "ready"; readonly jobs: ReadonlyArray<CaptureJob> }
  | {
      readonly status: "failed"
      readonly jobs: ReadonlyArray<CaptureJob>
      readonly message: string
    }

const listCaptureJobs = (workspaceId: WorkspaceId) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.quickSave.list({ urlParams: { workspaceId } })
  }).pipe(Effect.mapError(toApiFailure))

const createQuickSave = (payload: CreateQuickSave) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.quickSave.create({ payload })
  }).pipe(Effect.mapError(toApiFailure))

/** Queues captures and polls only while the selected workspace has active jobs. */
export const useQuickSave = (
  workspaceId: WorkspaceId | null,
  onJobSettled: () => void
) => {
  const [state, setState] = useState<CaptureJobsState>({
    status: "loading",
    jobs: []
  })
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const jobs = useRef<ReadonlyArray<CaptureJob>>([])
  const request = useRef(0)
  const onJobSettledRef = useRef(onJobSettled)
  onJobSettledRef.current = onJobSettled

  const refresh = useCallback(async () => {
    const currentRequest = ++request.current
    if (workspaceId === null) {
      jobs.current = []
      setState({ status: "loading", jobs: [] })
      return
    }

    const result = await appRuntime.runPromise(
      Effect.either(listCaptureJobs(workspaceId))
    )
    if (currentRequest !== request.current) return

    if (result._tag === "Left") {
      setState({
        status: "failed",
        jobs: jobs.current,
        message: result.left.message
      })
      return
    }

    const settled = settledCaptureJobs(
      captureStatuses(jobs.current),
      result.right
    )
    jobs.current = result.right
    setState({ status: "ready", jobs: result.right })
    if (settled.length > 0) onJobSettledRef.current()
  }, [workspaceId])

  useEffect(() => {
    jobs.current = []
    setState({ status: "loading", jobs: [] })
    void refresh()
  }, [refresh])

  const hasActiveJobs = state.jobs.some((job) => isActiveCapture(job.status))

  useEffect(() => {
    if (!hasActiveJobs) return

    const timer = window.setInterval(() => {
      void refresh()
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [hasActiveJobs, refresh])

  const create = useCallback(
    async (
      url: string,
      folderId: FolderId | null,
      autoMetadata: boolean
    ) => {
      if (workspaceId === null) return null

      setPending(true)
      setActionError(null)
      try {
        const result = await appRuntime.runPromise(
          Effect.either(
            createQuickSave(
              new CreateQuickSave({
                workspaceId,
                folderId,
                url,
                autoMetadata
              })
            )
          )
        )
        if (result._tag === "Left") {
          setActionError(result.left.message)
          return null
        }

        jobs.current = [result.right, ...jobs.current]
        setState({ status: "ready", jobs: jobs.current })
        return result.right
      } finally {
        setPending(false)
      }
    },
    [workspaceId]
  )

  return {
    state,
    pending,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    create,
    refresh
  } as const
}
