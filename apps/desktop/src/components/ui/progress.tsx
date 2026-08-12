import { cn } from "@/lib/utils"

/**
 * A hairline determinate bar. Work that reports stages rather than percentages
 * still gets a truthful width per stage instead of a fake continuous crawl.
 */
export function Progress({
  value,
  label,
  tone = "default",
  className
}: {
  readonly value: number
  readonly label: string
  readonly tone?: "default" | "danger"
  readonly className?: string
}) {
  const percent = Math.min(100, Math.max(0, Math.round(value)))

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-surface-hover",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          tone === "danger" ? "bg-danger" : "bg-primary"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
