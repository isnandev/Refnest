import type { CaptureJob, CaptureJobId, CaptureJobStatus } from "@refnest/contracts"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  captureStatuses,
  isActiveCapture,
  settledCaptureJobs
} from "./capture-job"

const SUCCESS_DISMISS_MS = 6_000
const MAX_VISIBLE = 4

/**
 * Turns the polled capture list into a short-lived notification stack: live
 * jobs report progress, and a job that settles while the app is open announces
 * its outcome. Jobs already finished at mount stay silent — a result the user
 * never waited for is history, not news.
 */
export const useCaptureNotifications = (jobs: ReadonlyArray<CaptureJob>) => {
  const [settledIds, setSettledIds] = useState<ReadonlyArray<CaptureJobId>>([])
  const [dismissed, setDismissed] = useState<ReadonlySet<CaptureJobId>>(
    () => new Set()
  )
  const seen = useRef<ReadonlyMap<CaptureJobId, CaptureJobStatus> | null>(null)
  const timers = useRef(new Map<CaptureJobId, number>())

  const dismiss = useCallback((id: CaptureJobId) => {
    setDismissed((current) => new Set(current).add(id))
  }, [])

  useEffect(() => {
    const previous = seen.current

    if (jobs.length === 0) {
      seen.current = null
      setSettledIds((current) => (current.length === 0 ? current : []))
      setDismissed((current) => (current.size === 0 ? current : new Set()))
      return
    }

    seen.current = captureStatuses(jobs)
    if (previous === null) return

    const settled = settledCaptureJobs(previous, jobs)
    if (settled.length === 0) return

    setSettledIds((current) => [
      ...current,
      ...settled.map((job) => job.id).filter((id) => !current.includes(id))
    ])
    // Hiding a progress toast silences the progress, not the outcome.
    setDismissed((current) => {
      const next = new Set(current)
      for (const job of settled) next.delete(job.id)
      return next
    })
  }, [jobs])

  useEffect(() => {
    for (const id of settledIds) {
      if (timers.current.has(id)) continue

      const job = jobs.find((candidate) => candidate.id === id)
      if (job === undefined || job.status !== "completed" || job.warning !== null) {
        continue
      }

      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id)
          dismiss(id)
        }, SUCCESS_DISMISS_MS)
      )
    }
  }, [dismiss, jobs, settledIds])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const active = jobs.filter(
    (job) => isActiveCapture(job.status) && !dismissed.has(job.id)
  )
  const settled = settledIds.flatMap((id) => {
    const job = jobs.find((candidate) => candidate.id === id)
    return job === undefined ||
      dismissed.has(job.id) ||
      isActiveCapture(job.status)
      ? []
      : [job]
  })

  return {
    notifications: [...settled, ...active].slice(0, MAX_VISIBLE),
    dismiss
  } as const
}
