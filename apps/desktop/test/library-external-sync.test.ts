import { describe, expect, it } from "vitest"

import { createLibrarySyncRunner } from "../src/features/library/use-library-sync"

describe("external library sync", () => {
  it("does not poll while the app is hidden", async () => {
    let refreshes = 0
    const run = createLibrarySyncRunner(async () => {
      refreshes += 1
    })

    await run(false)

    expect(refreshes).toBe(0)
  })

  it("coalesces ticks while a refresh is still running", async () => {
    let finish: (() => void) | undefined
    let refreshes = 0
    const run = createLibrarySyncRunner(
      () => {
        refreshes += 1
        return refreshes === 1
          ? new Promise<void>((resolve) => {
              finish = resolve
            })
          : Promise.resolve()
      }
    )

    const first = run(true)
    await run(true)
    expect(refreshes).toBe(1)

    finish?.()
    await first
    await run(true)
    expect(refreshes).toBe(2)
  })
})
