import { describe, expect, it } from "vitest"

import { getAppLocation } from "@/features/shell/use-app-view"

describe("getAppLocation", () => {
  it.each([
    ["", { view: "notes", activeSection: "overview" }],
    ["#overview", { view: "notes", activeSection: "overview" }],
    ["#new-note", { view: "notes", activeSection: "new-note" }],
    ["#runtime", { view: "notes", activeSection: "runtime" }],
    ["#output", { view: "notes", activeSection: "output" }],
    ["#settings", { view: "settings", activeSection: "settings" }],
    ["#unknown", { view: "notes", activeSection: "overview" }]
  ] as const)("maps %s to the active shell location", (hash, expected) => {
    expect(getAppLocation(hash)).toEqual(expected)
  })
})
