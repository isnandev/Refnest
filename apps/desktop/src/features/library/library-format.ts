import type {
  InspirationReference,
  ReferenceItemInfo
} from "@refnest/contracts"
import { DateTime } from "effect"

import { formatFileSize } from "@/lib/format"

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short"
})

export const formatLibraryDate = (value: DateTime.Utc) =>
  date.format(DateTime.toDate(value))

/** A date the file may not carry reads as unknown rather than as an epoch. */
export const formatLibraryDateTime = (value: DateTime.Utc | null) =>
  value === null ? "Unknown" : dateTime.format(DateTime.toDate(value))

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

/**
 * The extension a saved file would carry, read from the stored MIME type — the
 * asset URL is a route, not a filename, so it cannot answer this.
 */
export const referenceExtension = (
  reference: Pick<InspirationReference, "mimeType">
) => {
  const subtype = reference.mimeType.split("/")[1]?.split("+")[0] ?? ""
  if (subtype.length === 0) return "FILE"
  return (subtype === "jpeg" ? "jpg" : subtype).toLocaleUpperCase()
}

export const formatReferenceItemInfo = (
  reference: InspirationReference,
  info: ReferenceItemInfo
) => {
  switch (info) {
    case "dimensions":
      return formatDimensions(reference)
    case "size":
      return formatFileSize(reference.fileSizeBytes)
    case "type":
      return referenceExtension(reference)
    case "date-added":
      return formatLibraryDate(reference.createdAt)
  }
}

/**
 * Every reference carries an absolute source URL, so a file imported from disk
 * gets a stand-in under a `.invalid` host — reserved by RFC 2606 and therefore
 * never a real address. The inspector offers an empty link field instead of
 * showing one.
 */
export const isPlaceholderSourceUrl = (sourceUrl: string) => {
  try {
    return new URL(sourceUrl).hostname.endsWith(".invalid")
  } catch {
    return false
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
