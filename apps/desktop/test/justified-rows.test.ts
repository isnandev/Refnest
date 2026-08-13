import { describe, expect, it } from "vitest"

import { packJustifiedRows } from "@/features/library/justified-rows"

const item = (key: string, ratio: number) => ({ key, ratio })

describe("justified row packing", () => {
  it("fills each row to the container width and keeps one height per row", () => {
    const rows = packJustifiedRows(
      [
        item("a", 1),
        item("b", 1),
        item("c", 1),
        item("d", 1),
        item("e", 1),
        item("f", 1)
      ],
      600,
      200,
      12
    )

    expect(rows.length).toBeGreaterThan(1)

    const [first] = rows
    if (first === undefined) throw new Error("expected a first row")

    const width =
      first.tiles.reduce((total, tile) => total + tile.width, 0) +
      12 * (first.tiles.length - 1)
    expect(width).toBeCloseTo(600, 5)
    expect(new Set(first.tiles.map((tile) => tile.height)).size).toBe(1)
  })

  it("leaves the last row at the target height instead of stretching it", () => {
    const rows = packJustifiedRows([item("a", 1), item("b", 1)], 900, 150, 12)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.height).toBe(150)
    expect(rows[0]?.tiles.map((tile) => tile.width)).toStrictEqual([150, 150])
  })

  it("keeps a wide panorama on its own row rather than overflowing", () => {
    const rows = packJustifiedRows(
      [item("wide", 6), item("tall", 0.5)],
      600,
      200,
      12
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]?.tiles).toHaveLength(1)
    expect(rows[0]?.tiles[0]?.width).toBeCloseTo(600, 5)
  })

  it("returns nothing to lay out before the container has been measured", () => {
    expect(packJustifiedRows([item("a", 1)], 0, 200, 12)).toStrictEqual([])
    expect(packJustifiedRows([], 600, 200, 12)).toStrictEqual([])
  })
})
