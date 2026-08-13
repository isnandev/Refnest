import { DateTime } from "effect"
import { describe, expect, test } from "bun:test"

import type { StoredReference } from "../src/features/references/reference-model"
import { sortReferences } from "../src/features/references/reference-sort"

const at = (iso: string) => DateTime.unsafeMake(iso)

const reference = (
  id: string,
  overrides: Partial<StoredReference> = {}
): StoredReference =>
  ({
    id,
    title: "Untitled",
    rating: 0,
    fileSizeBytes: 1_000,
    createdAt: at("2026-01-01T00:00:00.000Z"),
    updatedAt: at("2026-01-01T00:00:00.000Z"),
    fileCreatedAt: null,
    fileModifiedAt: null,
    ...overrides
  }) as StoredReference

const ids = (
  references: ReadonlyArray<StoredReference>
): ReadonlyArray<string> => references.map((item) => String(item.id))

describe("reference sorting", () => {
  test("orders by the date the library added them, newest first by default", () => {
    const sorted = sortReferences([
      reference("old", { createdAt: at("2026-01-01T00:00:00.000Z") }),
      reference("new", { createdAt: at("2026-06-01T00:00:00.000Z") })
    ])

    expect(ids(sorted)).toStrictEqual(["new", "old"])
  })

  test("reverses on request", () => {
    const sorted = sortReferences(
      [
        reference("old", { createdAt: at("2026-01-01T00:00:00.000Z") }),
        reference("new", { createdAt: at("2026-06-01T00:00:00.000Z") })
      ],
      "date-added",
      "asc"
    )

    expect(ids(sorted)).toStrictEqual(["old", "new"])
  })

  test("sorts names without regard to case", () => {
    const sorted = sortReferences(
      [
        reference("b", { title: "banner" }),
        reference("a", { title: "Album" }),
        reference("c", { title: "Cover" })
      ],
      "name",
      "asc"
    )

    expect(ids(sorted)).toStrictEqual(["a", "b", "c"])
  })

  test("sorts by size and by rating", () => {
    const bySize = sortReferences(
      [
        reference("small", { fileSizeBytes: 10 }),
        reference("large", { fileSizeBytes: 900 })
      ],
      "size",
      "desc"
    )
    expect(ids(bySize)).toStrictEqual(["large", "small"])

    const byRating = sortReferences(
      [reference("unrated"), reference("rated", { rating: 4 })],
      "rating",
      "desc"
    )
    expect(ids(byRating)).toStrictEqual(["rated", "unrated"])
  })

  test("falls back to the library's own dates when the file carried none", () => {
    const sorted = sortReferences(
      [
        reference("captured", {
          createdAt: at("2026-06-01T00:00:00.000Z"),
          updatedAt: at("2026-06-01T00:00:00.000Z")
        }),
        reference("imported", {
          createdAt: at("2026-01-01T00:00:00.000Z"),
          updatedAt: at("2026-01-01T00:00:00.000Z"),
          fileModifiedAt: at("2026-12-01T00:00:00.000Z")
        })
      ],
      "date-modified",
      "desc"
    )

    expect(ids(sorted)).toStrictEqual(["imported", "captured"])
  })

  test("breaks ties by id so an unchanged library never reshuffles", () => {
    const tied = [reference("b"), reference("a"), reference("c")]

    expect(ids(sortReferences(tied, "rating", "desc"))).toStrictEqual(
      ids(sortReferences([...tied].reverse(), "rating", "desc"))
    )
  })
})
