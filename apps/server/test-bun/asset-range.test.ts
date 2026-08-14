import { describe, expect, it } from "bun:test"

import {
  ASSET_RANGE_CHUNK_BYTES,
  resolveAssetRange
} from "../src/features/assets/asset-range"

describe("asset byte ranges", () => {
  it("resolves explicit, suffix, and bounded open-ended ranges", () => {
    expect(resolveAssetRange("bytes=2-5", 16)).toStrictEqual({
      _tag: "Partial",
      start: 2,
      end: 5
    })
    expect(resolveAssetRange("bytes=-4", 16)).toStrictEqual({
      _tag: "Partial",
      start: 12,
      end: 15
    })
    expect(
      resolveAssetRange("bytes=0-", ASSET_RANGE_CHUNK_BYTES * 2)
    ).toStrictEqual({
      _tag: "Partial",
      start: 0,
      end: ASSET_RANGE_CHUNK_BYTES - 1
    })
  })

  it("rejects malformed, multiple, and out-of-bounds ranges", () => {
    expect(resolveAssetRange("bytes=", 16)._tag).toBe("Unsatisfiable")
    expect(resolveAssetRange("bytes=0-1,4-5", 16)._tag).toBe(
      "Unsatisfiable"
    )
    expect(resolveAssetRange("bytes=16-20", 16)._tag).toBe("Unsatisfiable")
  })
})
