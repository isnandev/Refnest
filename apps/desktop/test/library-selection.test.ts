import { ReferenceId } from "@refnest/contracts"
import { describe, expect, it } from "vitest"

import {
  COLUMN_MAX,
  COLUMN_MIN,
  boundedColumns
} from "@/features/library/library-columns"
import {
  retainVisible,
  selectionRange
} from "@/features/library/use-reference-selection"

const ids = ["a", "b", "c", "d"].map((id) => ReferenceId.make(id))
const [first, second, third, fourth] = ids as [
  ReferenceId,
  ReferenceId,
  ReferenceId,
  ReferenceId
]

describe("bulk selection", () => {
  it("takes the run between the anchor and the target in either direction", () => {
    expect(selectionRange(ids, second, fourth)).toEqual([second, third, fourth])
    expect(selectionRange(ids, fourth, second)).toEqual([second, third, fourth])
    expect(selectionRange(ids, third, third)).toEqual([third])
  })

  it("falls back to the target alone without a usable anchor", () => {
    expect(selectionRange(ids, null, third)).toEqual([third])
    expect(selectionRange(ids, ReferenceId.make("gone"), third)).toEqual([third])
    expect(selectionRange(ids, first, ReferenceId.make("gone"))).toEqual([])
  })

  it("drops selected references the current view no longer lists", () => {
    const selected = new Set([first, third])

    expect([...retainVisible(selected, [first, second])]).toEqual([first])
    expect(retainVisible(selected, ids)).toBe(selected)
    expect(retainVisible(new Set(), [])).toEqual(new Set())
  })
})

describe("masonry zoom", () => {
  it("clamps the column count to the documented 8-to-1 range", () => {
    expect(boundedColumns(0)).toBe(COLUMN_MIN)
    expect(boundedColumns(99)).toBe(COLUMN_MAX)
    expect(boundedColumns(3.4)).toBe(3)
  })
})
