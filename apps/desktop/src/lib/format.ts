import { DateTime } from "effect"

const timestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
})

export const formatTimestamp = (value: DateTime.Utc) =>
  timestamp.format(DateTime.toDate(value))

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const

export const formatFileSize = (bytes: number) => {
  if (bytes < 1_000) return `${bytes} B`

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1_000)),
    FILE_SIZE_UNITS.length - 1
  )
  const value = bytes / 1_000 ** unitIndex
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${FILE_SIZE_UNITS[unitIndex]}`
}
