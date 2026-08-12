import type { InspirationReference } from "@refnest/contracts"
import { DateTime } from "effect"

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

export const formatLibraryDate = (value: DateTime.Utc) =>
  date.format(DateTime.toDate(value))

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

export const formatTagList = (tags: ReadonlyArray<string>) => tags.join(", ")

/** Splits an edited tag string back into the contract's trimmed, unique tags. */
export const parseTagList = (value: string): ReadonlyArray<string> => {
  const tags = new Set<string>()
  for (const candidate of value.split(",")) {
    const tag = candidate.trim()
    if (tag.length > 0) tags.add(tag)
  }
  return [...tags]
}

/**
 * Masonry lives on real proportions, so a reference keeps its own ratio. The
 * bounds only stop a panorama or a full-page capture from taking a column
 * hostage.
 */
export const referenceAspectRatio = (
  reference: Pick<InspirationReference, "width" | "height">
) => {
  if (reference.width === null || reference.height === null) return 0.8
  return Math.min(2.5, Math.max(0.4, reference.width / reference.height))
}
