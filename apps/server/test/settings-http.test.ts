import { describe, expect, it } from "bun:test"
import { DesktopSettings } from "@refnest/contracts"
import { Effect, Schema } from "effect"
import { jsonRequest, webHandler } from "./api-test-client"

describe("settings over HTTP", () => {
  it("loads defaults and merges typed updates", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const { handler } = yield* webHandler

      const initial = yield* Effect.promise(() =>
        handler(jsonRequest("GET", "/settings"))
      )
      expect(initial.status).toBe(200)
      const initialSettings = yield* Effect.promise(() => initial.json()).pipe(
        Effect.flatMap(Schema.decodeUnknown(DesktopSettings))
      )
      expect(initialSettings).toMatchObject({
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
      const updatedSettings = yield* Effect.promise(() => updated.json()).pipe(
        Effect.flatMap(Schema.decodeUnknown(DesktopSettings))
      )
      expect(updatedSettings).toMatchObject({
        themePreference: "dark",
        activeSection: "settings",
        sidebarBackgroundOpacity: 80,
        windowPlacement: { x: 120, y: 80, maximized: true }
      })

      const reloaded = yield* Effect.promise(() =>
        handler(jsonRequest("GET", "/settings"))
      )
      const reloadedSettings = yield* Effect.promise(() => reloaded.json()).pipe(
        Effect.flatMap(Schema.decodeUnknown(DesktopSettings))
      )
      expect(reloadedSettings).toMatchObject({
        themePreference: "dark",
        sidebarBackgroundOpacity: 80
      })
    })))
  })

  it("rejects an out-of-range update at the HTTP boundary", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const { handler } = yield* webHandler
      const response = yield* Effect.promise(() =>
        handler(
          jsonRequest("PATCH", "/settings", {
            sidebarBackgroundOpacity: 20
          })
        )
      )

      expect(response.status).toBe(400)
    })))
  })

})
