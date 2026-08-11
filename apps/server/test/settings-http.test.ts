import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { jsonRequest, webHandler } from "./api-test-client"

describe("settings over HTTP", () => {
  it.scoped("loads defaults and merges typed updates", () =>
    Effect.gen(function* () {
      const { handler } = yield* webHandler

      const initial = yield* Effect.promise(() =>
        handler(jsonRequest("GET", "/settings"))
      )
      expect(initial.status).toBe(200)
      expect(yield* Effect.promise(() => initial.json())).toMatchObject({
        themePreference: "system",
        sidebarBackgroundOpacity: 60,
        windowPlacement: null
      })

      const updated = yield* Effect.promise(() =>
        handler(
          jsonRequest("PATCH", "/settings", {
            themePreference: "dark",
            activeSection: "settings",
            sidebarBackgroundOpacity: 80,
            windowPlacement: {
              x: 120,
              y: 80,
              width: 1040,
              height: 720,
              maximized: true
            }
          })
        )
      )
      expect(updated.status).toBe(200)
      expect(yield* Effect.promise(() => updated.json())).toMatchObject({
        themePreference: "dark",
        activeSection: "settings",
        sidebarBackgroundOpacity: 80,
        windowPlacement: { x: 120, y: 80, maximized: true }
      })

      const reloaded = yield* Effect.promise(() =>
        handler(jsonRequest("GET", "/settings"))
      )
      expect(yield* Effect.promise(() => reloaded.json())).toMatchObject({
        themePreference: "dark",
        sidebarBackgroundOpacity: 80
      })
    }))

  it.scoped("rejects an out-of-range update at the HTTP boundary", () =>
    Effect.gen(function* () {
      const { handler } = yield* webHandler
      const response = yield* Effect.promise(() =>
        handler(
          jsonRequest("PATCH", "/settings", {
            sidebarBackgroundOpacity: 20
          })
        )
      )

      expect(response.status).toBe(400)
    }))

})
