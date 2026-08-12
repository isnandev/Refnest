import { WindowPlacement } from "@refnest/contracts"
import { describe, expect, it } from "vitest"

import { normalizeWindowPlacementForMonitors } from "@/features/window/window-placement"

const primary = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1040 }
}

describe("normalizeWindowPlacementForMonitors", () => {
  it("preserves reachable bounds", () => {
    const placement = new WindowPlacement({
      x: 240,
      y: 120,
      width: 1040,
      height: 720,
      maximized: false
    })

    expect(normalizeWindowPlacementForMonitors(placement, [primary])).toEqual(
      placement
    )
  })

  it("supports monitors with negative coordinates", () => {
    const placement = new WindowPlacement({
      x: -1450,
      y: 80,
      width: 1100,
      height: 760,
      maximized: true
    })
    const leftMonitor = {
      position: { x: -1920, y: 0 },
      size: { width: 1920, height: 1040 }
    }

    expect(
      normalizeWindowPlacementForMonitors(placement, [primary, leftMonitor])
    ).toEqual(placement)
  })

  it("rejects a placement left behind on a disconnected monitor", () => {
    const placement = new WindowPlacement({
      x: 2700,
      y: 100,
      width: 1040,
      height: 720,
      maximized: false
    })

    expect(normalizeWindowPlacementForMonitors(placement, [primary])).toBeNull()
  })

  it("caps oversized windows to the reachable work area", () => {
    const placement = new WindowPlacement({
      x: 0,
      y: 0,
      width: 4000,
      height: 3000,
      maximized: false
    })

    expect(normalizeWindowPlacementForMonitors(placement, [primary])).toEqual(
      new WindowPlacement({
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
        maximized: false
      })
    )
  })
})
