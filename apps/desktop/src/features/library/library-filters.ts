import type {
  FolderId,
  InspirationReference,
  ReferenceKind
} from "@refnest/contracts"

export type FilterMatchMode = "and" | "or"
export type TriFilter = "any" | "yes" | "no"

export type LibraryFilters = {
  readonly match: FilterMatchMode
  readonly includeTags: readonly string[]
  readonly excludeTags: readonly string[]
  readonly kinds: readonly ReferenceKind[]
  readonly ratingMin: number | null
  readonly ratingMax: number | null
  readonly dateFrom: string | null
  readonly dateTo: string | null
  readonly folderIds: readonly FolderId[]
  readonly includeUncategorized: boolean
  readonly hasNotes: TriFilter
  readonly hasAiMetadata: TriFilter
  readonly hasThumbnail: TriFilter
}

export type FilterPreset = {
  readonly id: string
  readonly name: string
  readonly filters: LibraryFilters
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  match: "and",
  includeTags: [],
  excludeTags: [],
  kinds: [],
  ratingMin: null,
  ratingMax: null,
  dateFrom: null,
  dateTo: null,
  folderIds: [],
  includeUncategorized: false,
  hasNotes: "any",
  hasAiMetadata: "any",
  hasThumbnail: "any"
}

const KINDS = new Set<ReferenceKind>(["web-capture", "image", "video", "pdf"])

export const libraryFilterStorageKey = (workspaceId: string) =>
  `refnest.library-filters.v1:${workspaceId}`

export const toggleListValue = <A>(
  list: readonly A[],
  value: A
): readonly A[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

export const countActiveFilters = (filters: LibraryFilters): number =>
  (filters.includeTags.length > 0 ? 1 : 0) +
  (filters.excludeTags.length > 0 ? 1 : 0) +
  (filters.kinds.length > 0 ? 1 : 0) +
  (filters.ratingMin !== null || filters.ratingMax !== null ? 1 : 0) +
  (filters.dateFrom !== null || filters.dateTo !== null ? 1 : 0) +
  (filters.folderIds.length > 0 || filters.includeUncategorized ? 1 : 0) +
  (filters.hasNotes !== "any" ? 1 : 0) +
  (filters.hasAiMetadata !== "any" ? 1 : 0) +
  (filters.hasThumbnail !== "any" ? 1 : 0)

const matchesTri = (present: boolean, flag: TriFilter) =>
  flag === "any" || (flag === "yes") === present

const inDateRange = (
  epochMillis: number,
  from: string | null,
  to: string | null
) => {
  if (from !== null && epochMillis < Date.parse(`${from}T00:00:00`)) return false
  if (to !== null && epochMillis > Date.parse(`${to}T23:59:59.999`)) return false
  return true
}

const matchesFolder = (
  folderId: FolderId | null,
  folderIds: readonly FolderId[],
  includeUncategorized: boolean
) => {
  if (folderIds.length === 0 && !includeUncategorized) return true
  if (folderId === null) return includeUncategorized
  return folderIds.includes(folderId)
}

/**
 * Client-side pass over the sidecar's already-sorted page. Excludes always
 * subtract; every other active clause joins with `match`.
 */
export const applyLibraryFilters = (
  references: ReadonlyArray<InspirationReference>,
  filters: LibraryFilters
): ReadonlyArray<InspirationReference> => {
  if (countActiveFilters(filters) === 0) return references

  return references.filter((reference) => {
    if (
      filters.excludeTags.some((tag) => reference.tags.includes(tag))
    ) {
      return false
    }

    const clauses: boolean[] = []

    if (filters.includeTags.length > 0) {
      clauses.push(
        filters.match === "and"
          ? filters.includeTags.every((tag) => reference.tags.includes(tag))
          : filters.includeTags.some((tag) => reference.tags.includes(tag))
      )
    }
    if (filters.kinds.length > 0) {
      clauses.push(filters.kinds.includes(reference.kind))
    }
    if (filters.ratingMin !== null || filters.ratingMax !== null) {
      const min = filters.ratingMin ?? 0
      const max = filters.ratingMax ?? 5
      clauses.push(reference.rating >= min && reference.rating <= max)
    }
    if (filters.dateFrom !== null || filters.dateTo !== null) {
      clauses.push(
        inDateRange(reference.createdAt.epochMillis, filters.dateFrom, filters.dateTo)
      )
    }
    if (filters.folderIds.length > 0 || filters.includeUncategorized) {
      clauses.push(
        matchesFolder(
          reference.folderId,
          filters.folderIds,
          filters.includeUncategorized
        )
      )
    }
    if (filters.hasNotes !== "any") {
      clauses.push(matchesTri(reference.description.trim().length > 0, filters.hasNotes))
    }
    if (filters.hasAiMetadata !== "any") {
      clauses.push(matchesTri(reference.colors.length > 0, filters.hasAiMetadata))
    }
    if (filters.hasThumbnail !== "any") {
      clauses.push(matchesTri(reference.previewUrl !== null, filters.hasThumbnail))
    }

    if (clauses.length === 0) return true
    return filters.match === "or" ? clauses.some(Boolean) : clauses.every(Boolean)
  })
}

const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

const asKinds = (value: unknown): readonly ReferenceKind[] =>
  asStringArray(value).filter((item): item is ReferenceKind =>
    KINDS.has(item as ReferenceKind)
  )

const asRating = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5
    ? value
    : null

const asDate = (value: unknown): string | null =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null

const asTri = (value: unknown): TriFilter =>
  value === "yes" || value === "no" ? value : "any"

export const normalizeLibraryFilters = (input: unknown): LibraryFilters => {
  if (input === null || typeof input !== "object") return EMPTY_LIBRARY_FILTERS
  const raw = input as Record<string, unknown>
  const ratingMin = asRating(raw.ratingMin)
  const ratingMax = asRating(raw.ratingMax)

  return {
    match: raw.match === "or" ? "or" : "and",
    includeTags: asStringArray(raw.includeTags),
    excludeTags: asStringArray(raw.excludeTags),
    kinds: asKinds(raw.kinds),
    ratingMin,
    ratingMax:
      ratingMin !== null && ratingMax !== null && ratingMax < ratingMin
        ? ratingMin
        : ratingMax,
    dateFrom: asDate(raw.dateFrom),
    dateTo: asDate(raw.dateTo),
    folderIds: asStringArray(raw.folderIds) as FolderId[],
    includeUncategorized: raw.includeUncategorized === true,
    hasNotes: asTri(raw.hasNotes),
    hasAiMetadata: asTri(raw.hasAiMetadata),
    hasThumbnail: asTri(raw.hasThumbnail)
  }
}

export type StoredFilterState = {
  readonly current: LibraryFilters
  readonly searchQuery: string
  readonly presets: readonly FilterPreset[]
}

const EMPTY_STORED_FILTER_STATE: StoredFilterState = {
  current: EMPTY_LIBRARY_FILTERS,
  searchQuery: "",
  presets: []
}

export const decodeStoredFilterState = (raw: string | null): StoredFilterState => {
  if (raw === null || raw.length === 0) return EMPTY_STORED_FILTER_STATE

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== "object") return EMPTY_STORED_FILTER_STATE
    const document = parsed as Record<string, unknown>
    const presets = Array.isArray(document.presets)
      ? document.presets.flatMap((entry): readonly FilterPreset[] => {
          if (entry === null || typeof entry !== "object") return []
          const preset = entry as Record<string, unknown>
          if (typeof preset.id !== "string" || typeof preset.name !== "string") {
            return []
          }
          const name = preset.name.trim()
          if (name.length === 0) return []
          return [
            {
              id: preset.id,
              name,
              filters: normalizeLibraryFilters(preset.filters)
            }
          ]
        })
      : []

    return {
      current: normalizeLibraryFilters(document.current),
      searchQuery:
        typeof document.searchQuery === "string" ? document.searchQuery : "",
      presets
    }
  } catch {
    return EMPTY_STORED_FILTER_STATE
  }
}

export const encodeStoredFilterState = (
  current: LibraryFilters,
  searchQuery: string,
  presets: readonly FilterPreset[]
) => JSON.stringify({ version: 1, current, searchQuery, presets })

export const loadLibraryFilterState = (workspaceId: string): StoredFilterState => {
  try {
    return decodeStoredFilterState(
      globalThis.localStorage?.getItem(libraryFilterStorageKey(workspaceId)) ?? null
    )
  } catch {
    return EMPTY_STORED_FILTER_STATE
  }
}

export const saveLibraryFilterState = (
  workspaceId: string,
  current: LibraryFilters,
  searchQuery: string,
  presets: readonly FilterPreset[]
) => {
  try {
    globalThis.localStorage?.setItem(
      libraryFilterStorageKey(workspaceId),
      encodeStoredFilterState(current, searchQuery, presets)
    )
  } catch {
    // Quota or a blocked store should not take the library down with it.
  }
}
