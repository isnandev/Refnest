import type {
  CaptureJob,
  CaptureJobId,
  CaptureJobStatus
} from "@refnest/contracts"

export type CaptureTone = "active" | "success" | "warning" | "danger"

export type CaptureProgress = {
  readonly percent: number
  readonly label: string
  readonly tone: CaptureTone
}

const ACTIVE_STATUSES: ReadonlySet<CaptureJobStatus> = new Set([
  "queued",
  "capturing",
  "enriching"
])

/** A capture is active while the sidecar still has work left on it. */
export const isActiveCapture = (status: CaptureJobStatus) =>
  ACTIVE_STATUSES.has(status)

/**
 * The sidecar reports stages, not percentages, so each stage owns a fixed
 * width. The numbers are spaced by how long each stage usually takes.
 */
const STAGES: Readonly<Record<CaptureJobStatus, CaptureProgress>> = {
  queued: { percent: 8, label: "Queued", tone: "active" },
  capturing: { percent: 55, label: "Capturing page", tone: "active" },
  enriching: { percent: 85, label: "Writing metadata", tone: "active" },
  completed: { percent: 100, label: "Saved", tone: "success" },
  failed: { percent: 100, label: "Capture failed", tone: "danger" }
}

export const captureProgress = (
  job: Pick<CaptureJob, "status" | "warning">
): CaptureProgress =>
  job.status === "completed" && job.warning !== null
    ? { percent: 100, label: "Saved without metadata", tone: "warning" }
    : STAGES[job.status]

/** The hostname is the readable part of a capture URL; keep unparsable ones whole. */
export const captureHost = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Jobs that left an active status between two polls. */
export const settledCaptureJobs = (
  previous: ReadonlyMap<CaptureJobId, CaptureJobStatus>,
  jobs: ReadonlyArray<CaptureJob>
) =>
  jobs.filter((job) => {
    const previousStatus = previous.get(job.id)
    return (
      previousStatus !== undefined &&
      isActiveCapture(previousStatus) &&
      !isActiveCapture(job.status)
    )
  })

export const captureStatuses = (jobs: ReadonlyArray<CaptureJob>) =>
  new Map(jobs.map((job) => [job.id, job.status] as const))
