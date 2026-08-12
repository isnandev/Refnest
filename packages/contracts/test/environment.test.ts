import { describe, expect, it } from "@effect/vitest"
import {
  DEFAULT_SHARE_PORT,
  formatConnectString,
  parseConnectString
} from "@refnest/contracts"

describe("connect strings", () => {
  it("round-trips what the host displays", () => {
    const parts = { host: "192.168.1.20", port: 4317, code: "K7M2QW9X" }

    expect(formatConnectString(parts)).toBe("refnest://192.168.1.20:4317/K7M2QW9X")
    expect(parseConnectString(formatConnectString(parts))).toEqual(parts)
  })

  it("accepts a retyped string without the scheme", () => {
    expect(parseConnectString("192.168.1.20:4317/K7M2QW9X")).toEqual({
      host: "192.168.1.20",
      port: 4317,
      code: "K7M2QW9X"
    })
  })

  it("upper-cases the code and assumes the default port", () => {
    expect(parseConnectString("refnest://studio-pc/k7m2qw9x")).toEqual({
      host: "studio-pc",
      port: DEFAULT_SHARE_PORT,
      code: "K7M2QW9X"
    })
  })

  it("rejects a code carrying an ambiguous character", () => {
    // I, L, O and U are outside the alphabet precisely so they cannot be misread.
    expect(parseConnectString("refnest://192.168.1.20:4317/K7M2QW9I")).toBeNull()
    expect(parseConnectString("refnest://192.168.1.20:4317/K7M2QW9")).toBeNull()
  })

  it("rejects junk, another scheme, and an out-of-range port", () => {
    expect(parseConnectString("")).toBeNull()
    expect(parseConnectString("not a connect string")).toBeNull()
    expect(parseConnectString("http://192.168.1.20:4317/K7M2QW9X")).toBeNull()
    expect(parseConnectString("refnest://192.168.1.20:99999/K7M2QW9X")).toBeNull()
  })
})
