import type { InspirationReference } from "@refnest/contracts"
import { DateTime } from "effect"

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const

export const formatLibraryDate = (value: DateTime.Utc) =>
  date.format(DateTime.toDate(value))

export const formatFileSize = (bytes: number) => {
  if (bytes < 1_000) return `${bytes} B`

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1_000)),
    FILE_SIZE_UNITS.length - 1
  )
  const value = bytes / 1_000 ** unitIndex
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${FILE_SIZE_UNITS[unitIndex]}`
}

export const formatDimensions = (
  reference: Pick<InspirationReference, "width" | "height">
) =>
  reference.width === null || reference.height === null
    ? "Unknown"
    : `${reference.width.toLocaleString()} × ${reference.height.toLocaleString()}`

export const formatReferenceKind = (
  kind: InspirationReference["kind"]
) => {
  switch (kind) {
    case "web-capture":
      return "Web capture"
    case "image":
      return "Image"
    case "video":
      return "Video"
    case "pdf":
      return "PDF"
  }
}

export const formatReferenceSource = (
  source: InspirationReference["source"]
) => {
  switch (source) {
    case "local-file":
      return "Local file"
    case "x":
      return "X"
    case "youtube":
      return "YouTube"
    case "instagram":
      return "Instagram"
    case "pinterest":
      return "Pinterest"
    case "dribbble":
      return "Dribbble"
    case "website":
      return "Website"
  }
}

export const referenceAspectRatio = (
  reference: Pick<InspirationReference, "width" | "height">
) => {
  if (reference.width === null || reference.height === null) return 0.8
  return Math.min(1.25, Math.max(0.5, reference.width / reference.height))
}
