import { describe, expect, it } from "vitest"

import {
  emptyConnectEnvironmentDraft,
  resolveConnectEnvironmentDraft,
  updateConnectEnvironmentPart,
  updateConnectString
} from "../src/features/environments/connect-environment-draft"

describe("connect environment draft", () => {
  it("populates the individual fields from a pasted connect string", () => {
    const draft = updateConnectString(
      emptyConnectEnvironmentDraft(),
      "refnest://172.31.128.1:4317/EZ5DZG0R"
    )

    expect(draft).toEqual({
      connectString: "refnest://172.31.128.1:4317/EZ5DZG0R",
      host: "172.31.128.1",
      port: "4317",
      code: "EZ5DZG0R"
    })
  })

  it("uses an address edited after paste instead of the stale pasted address", () => {
    const pasted = updateConnectString(
      emptyConnectEnvironmentDraft(),
      "refnest://172.31.128.1:4317/EZ5DZG0R"
    )
    const corrected = updateConnectEnvironmentPart(pasted, {
      host: "192.168.1.20"
    })

    expect(corrected.connectString).toBe("")
    expect(corrected.code).toBe("EZ5DZG0R")
    expect(resolveConnectEnvironmentDraft(corrected)).toEqual({
      host: "192.168.1.20",
      port: 4317,
      code: "EZ5DZG0R"
    })
  })
})
