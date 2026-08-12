import type { CaptureJob } from "@refnest/contracts"
import { CheckCircle2, CircleAlert, Clock3, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/** Capture state is never colour alone — every state states its own glyph. */
export function CaptureStatusIcon({
  job,
  className
}: {
  readonly job: Pick<CaptureJob, "status" | "warning">
  readonly className?: string
}) {
  const size = cn("size-3.5", className)

  if (job.status === "completed") {
    return job.warning === null ? (
      <CheckCircle2 className={cn(size, "text-lime")} aria-hidden="true" />
    ) : (
      <CircleAlert className={cn(size, "text-muted-foreground")} aria-hidden="true" />
    )
  }
  if (job.status === "failed") {
    return <CircleAlert className={cn(size, "text-danger")} aria-hidden="true" />
  }
  if (job.status === "queued") {
    return <Clock3 className={cn(size, "text-muted-foreground")} aria-hidden="true" />
  }

  return <LoaderCircle className={cn(size, "animate-spin")} aria-hidden="true" />
}
