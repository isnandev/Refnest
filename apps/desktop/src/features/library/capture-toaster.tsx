import type { CaptureJob, ReferenceId } from "@refnest/contracts"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { captureHost, captureProgress, isActiveCapture } from "./capture-job"
import { CaptureStatusIcon } from "./capture-status-icon"
import { useCaptureNotifications } from "./use-capture-notifications"

/** Live capture progress and its outcome, stacked out of the way of the grid. */
export function CaptureToaster({
  jobs,
  onShowReference
}: {
  readonly jobs: ReadonlyArray<CaptureJob>
  readonly onShowReference: (id: ReferenceId) => void
}) {
  const { notifications, dismiss } = useCaptureNotifications(jobs)

  if (notifications.length === 0) return null

  return (
    <div
      aria-label="Capture activity"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2"
    >
      {notifications.map((job) => {
        const host = captureHost(job.url)
        const progress = captureProgress(job)
        const active = isActiveCapture(job.status)
        const detail = job.error ?? job.warning
        const referenceId = job.referenceId

        return (
          <div
            key={job.id}
            role={job.status === "failed" ? "alert" : "status"}
            className="capture-toast pointer-events-auto rounded-md border bg-popover p-3 text-popover-foreground"
          >
            <div className="flex items-start gap-2.5">
              <CaptureStatusIcon job={job} className="mt-0.5 size-4" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-label">{host}</p>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {progress.label}
                </p>

                {active && (
                  <Progress
                    className="mt-2"
                    value={progress.percent}
                    label={`Capture progress for ${host}`}
                  />
                )}

                {detail !== null && (
                  <p
                    className={cn(
                      "mt-1.5 line-clamp-3 text-caption",
                      job.status === "failed"
                        ? "text-danger"
                        : "text-muted-foreground"
                    )}
                  >
                    {detail}
                  </p>
                )}

                {job.status === "completed" && referenceId !== null && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5"
                    onClick={() => {
                      dismiss(job.id)
                      onShowReference(referenceId)
                    }}
                  >
                    Show reference
                  </Button>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Dismiss ${host} capture`}
                onClick={() => dismiss(job.id)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
