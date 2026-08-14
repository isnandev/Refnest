import { describe, expect, it } from "@effect/vitest"
import {
  DEFAULT_DESKTOP_SETTINGS,
  decodeStoredDesktopSettings,
  DesktopSettings,
  EnvironmentId,
  LOCAL_ENVIRONMENT_ID,
  mergeDesktopSettings,
  selectedWorkspaceId,
  UpdateDesktopSettings,
  WorkspaceId
} from "@refnest/contracts"
import { Effect, Schema } from "effect"

describe("desktop settings contracts", () => {
  it.effect("round-trips the documented defaults", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(DesktopSettings)(
        DEFAULT_DESKTOP_SETTINGS
      )
      const decoded = yield* Schema.decodeUnknown(DesktopSettings)(encoded)

      expect(decoded.sidebarBackgroundOpacity).toBe(60)
      expect(decoded.videoDownloadResolution).toBe(1080)
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

  it.effect("accepts only bounded inspector widths", () =>
    Effect.gen(function* () {
      const accepted = yield* Schema.decodeUnknown(UpdateDesktopSettings)({
        libraryView: { inspectorWidth: 344 }
      })
      const rejected = yield* Schema.decodeUnknown(UpdateDesktopSettings)({
        libraryView: { inspectorWidth: 700 }
      }).pipe(Effect.either)

      expect(accepted.libraryView?.inspectorWidth).toBe(344)
      expect(rejected._tag).toBe("Left")
    }))
})

describe("workspace selection is per environment", () => {
  const studio = EnvironmentId.make("env-studio")
  const laptopWorkspace = WorkspaceId.make("ws-laptop")
  const studioWorkspace = WorkspaceId.make("ws-studio")

  it("keeps one selection per library", () => {
    const withLocal = mergeDesktopSettings(
      DEFAULT_DESKTOP_SETTINGS,
      new UpdateDesktopSettings({ selectedWorkspaceId: laptopWorkspace })
    )
    const onStudio = mergeDesktopSettings(
      withLocal,
      new UpdateDesktopSettings({
        activeEnvironmentId: studio,
        selectedWorkspaceId: studioWorkspace
      })
    )

    expect(selectedWorkspaceId(onStudio)).toBe(studioWorkspace)
    expect(selectedWorkspaceId(mergeDesktopSettings(
      onStudio,
      new UpdateDesktopSettings({ activeEnvironmentId: LOCAL_ENVIRONMENT_ID })
    ))).toBe(laptopWorkspace)
  })

  it("clears only the active library's selection", () => {
    const seeded = mergeDesktopSettings(
      DEFAULT_DESKTOP_SETTINGS,
      new UpdateDesktopSettings({ selectedWorkspaceId: laptopWorkspace })
    )
    const cleared = mergeDesktopSettings(
      seeded,
      new UpdateDesktopSettings({ selectedWorkspaceId: null })
    )

    expect(selectedWorkspaceId(cleared)).toBeNull()
  })
})

describe("stored settings migration", () => {
  it("moves a pre-environments selection onto the local library", () => {
    const migrated = decodeStoredDesktopSettings({
      themePreference: "dark",
      autoCollapseSidebar: true,
      reduceMotion: false,
      sidebarBackgroundOpacity: 60,
      sidebarWidth: 272,
      sidebarCollapsed: false,
      selectedWorkspaceId: "ws-legacy",
      activeSection: "overview",
      windowPlacement: null
    })

    expect(migrated.activeEnvironmentId).toBe(LOCAL_ENVIRONMENT_ID)
    expect(selectedWorkspaceId(migrated)).toBe("ws-legacy")
    expect(migrated.themePreference).toBe("dark")
  })

  it("fills absent fields from the documented defaults", () => {
    const migrated = decodeStoredDesktopSettings({ themePreference: "light" })

    expect(migrated.themePreference).toBe("light")
    expect(migrated.sidebarWidth).toBe(DEFAULT_DESKTOP_SETTINGS.sidebarWidth)
    expect(migrated.videoDownloadResolution).toBe(1080)
    expect(selectedWorkspaceId(migrated)).toBeNull()
  })

  it("falls back to defaults rather than failing on an unreadable document", () => {
    expect(decodeStoredDesktopSettings("not an object")).toEqual(
      DEFAULT_DESKTOP_SETTINGS
    )
    expect(decodeStoredDesktopSettings(null)).toEqual(DEFAULT_DESKTOP_SETTINGS)
  })
})
