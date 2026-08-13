import type {
  ReferenceSortDirection,
  ReferenceSortField
} from "@refnest/contracts"
import { DateTime } from "effect"
import type { StoredReference } from "./reference-model"

export const DEFAULT_REFERENCE_SORT: ReferenceSortField = "date-added"
export const DEFAULT_REFERENCE_SORT_DIRECTION: ReferenceSortDirection = "desc"

const epochMillis = (value: DateTime.Utc | null) =>
  value === null ? null : DateTime.toEpochMillis(value)

/**
 * A reference the library imported has no file timestamps of its own until one
 * is recorded, so those sorts fall back to the library's own dates rather than
 * dropping the row to the bottom.
 */
const sortKey = (
  reference: StoredReference,
  field: ReferenceSortField
): number | string => {
  switch (field) {
    case "date-added":
      return DateTime.toEpochMillis(reference.createdAt)
    case "date-modified":
      return (
        epochMillis(reference.fileModifiedAt) ??
        DateTime.toEpochMillis(reference.updatedAt)
      )
    case "date-created":
      return (
        epochMillis(reference.fileCreatedAt) ??
        DateTime.toEpochMillis(reference.createdAt)
      )
    case "name":
      return reference.title.toLocaleLowerCase()
    case "size":
      return reference.fileSizeBytes
    case "rating":
      return reference.rating
  }
}

const compareKeys = (left: number | string, right: number | string) => {
  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right)
  }
  return Number(left) - Number(right)
}

/**
 * Sorting is stable and total: equal keys fall back to the import order and
 * then to the id, so paging over an unchanged library never reshuffles.
 */
export const sortReferences = (
  references: ReadonlyArray<StoredReference>,
  field: ReferenceSortField = DEFAULT_REFERENCE_SORT,
  direction: ReferenceSortDirection = DEFAULT_REFERENCE_SORT_DIRECTION
): ReadonlyArray<StoredReference> => {
  const sign = direction === "asc" ? 1 : -1

  return [...references].sort((left, right) => {
    const primary = compareKeys(sortKey(left, field), sortKey(right, field))
    if (primary !== 0) return primary * sign

    const added =
      DateTime.toEpochMillis(left.createdAt) -
      DateTime.toEpochMillis(right.createdAt)
    if (added !== 0) return added * sign

    return left.id.localeCompare(right.id)
  })
}
