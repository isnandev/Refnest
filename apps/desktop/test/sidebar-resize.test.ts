import { describe, expect, it } from "vitest"

import { sidebarWidthFromDrag } from "@/features/shell/use-sidebar"

describe("sidebar resize direction", () => {
  it("grows a left sidebar when its divider moves right", () => {
    expect(sidebarWidthFromDrag(288, 400, 432, "left")).toBe(320)
  })

  it("grows a right sidebar when its divider moves left", () => {
    expect(sidebarWidthFromDrag(288, 400, 368, "right")).toBe(320)
  })
})
