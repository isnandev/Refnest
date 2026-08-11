import { describe, expect, it } from "@effect/vitest"
import {
  DEFAULT_DESKTOP_SETTINGS,
  DesktopSettings,
  UpdateDesktopSettings
} from "@starter/contracts"
import { Effect, Schema } from "effect"

describe("desktop settings contracts", () => {
  it.effect("round-trips the documented defaults", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(DesktopSettings)(
        DEFAULT_DESKTOP_SETTINGS
      )
      const decoded = yield* Schema.decodeUnknown(DesktopSettings)(encoded)

      expect(decoded.sidebarBackgroundOpacity).toBe(60)
      expect(decoded.windowPlacement).toBeNull()
    }))

  it.effect("accepts a bounded partial update", () =>
    Effect.gen(function* () {
      const update = yield* Schema.decodeUnknown(UpdateDesktopSettings)({
        sidebarBackgroundOpacity: 80,
        windowPlacement: {
          x: -1280,
          y: 40,
          width: 1040,
          height: 720,
          maximized: true
        }
      })

      expect(update.sidebarBackgroundOpacity).toBe(80)
      expect(update.windowPlacement?.x).toBe(-1280)
    }))

  it.effect("rejects opacity and window dimensions outside their bounds", () =>
    Effect.gen(function* () {
      const opacity = yield* Schema.decodeUnknown(UpdateDesktopSettings)({
        sidebarBackgroundOpacity: 20
      }).pipe(Effect.either)
      const window = yield* Schema.decodeUnknown(UpdateDesktopSettings)({
        windowPlacement: {
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          maximized: false
        }
      }).pipe(Effect.either)

      expect(opacity._tag).toBe("Left")
      expect(window._tag).toBe("Left")
    }))
})
