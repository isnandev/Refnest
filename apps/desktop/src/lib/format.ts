import { DateTime } from "effect"

const timestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
})

export const formatTimestamp = (value: DateTime.Utc) =>
  timestamp.format(DateTime.toDate(value))

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const RELATIVE_STEPS = [
  { unit: "second", millis: 1_000, limit: 60 },
  { unit: "minute", millis: 60_000, limit: 60 },
  { unit: "hour", millis: 3_600_000, limit: 24 },
  { unit: "day", millis: 86_400_000, limit: 30 },
  { unit: "month", millis: 2_592_000_000, limit: 12 }
] as const

/** "3 minutes ago" — used where an exact timestamp reads as noise. */
export const formatRelativeTime = (value: DateTime.Utc) => {
  const elapsed = Date.now() - DateTime.toDate(value).getTime()

  for (const step of RELATIVE_STEPS) {
    if (Math.abs(elapsed) < step.millis * step.limit) {
      return relative.format(-Math.round(elapsed / step.millis), step.unit)
    }
  }

  return relative.format(-Math.round(elapsed / 31_536_000_000), "year")
}
