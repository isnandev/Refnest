import { DateTime } from "effect"

const timestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
})

export const formatTimestamp = (value: DateTime.Utc) =>
  timestamp.format(DateTime.toDate(value))
