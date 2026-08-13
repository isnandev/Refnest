import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_LIBRARY_VIEW_PREFERENCES,
  decodeStoredDesktopSettings,
  mergeDesktopSettings,
  mergeLibraryViewPreferences,
  UpdateDesktopSettings
} from "@refnest/contracts"
import { describe, expect, it } from "vitest"

import { referenceImagePath } from "@/features/library/use-reference-assets"

describe("library view preferences", () => {
  it("merges one toggle without disturbing the rest of the document", () => {
    const merged = mergeLibraryViewPreferences(
      DEFAULT_LIBRARY_VIEW_PREFERENCES,
      { layout: "justified" }
    )

    expect(merged.layout).toBe("justified")
    expect(merged.columns).toBe(DEFAULT_LIBRARY_VIEW_PREFERENCES.columns)
    expect(merged.sort).toBe(DEFAULT_LIBRARY_VIEW_PREFERENCES.sort)
  })

  it("keeps the rest of the settings document when the view changes", () => {
    const merged = mergeDesktopSettings(
      DEFAULT_DESKTOP_SETTINGS,
      new UpdateDesktopSettings({ libraryView: { showName: false } })
    )

    expect(merged.libraryView.showName).toBe(false)
    expect(merged.libraryView.showItemInfo).toBe(true)
    expect(merged.themePreference).toBe(
      DEFAULT_DESKTOP_SETTINGS.themePreference
    )
  })

  it("opens a settings document written before the view options existed", () => {
    const restored = decodeStoredDesktopSettings({
      themePreference: "dark",
      sidebarWidth: 300
    })

    expect(restored.themePreference).toBe("dark")
    expect(restored.libraryView).toStrictEqual(
      DEFAULT_LIBRARY_VIEW_PREFERENCES
    )
  })

  it("keeps a saved view preference that a later build still understands", () => {
    const restored = decodeStoredDesktopSettings({
      libraryView: { layout: "grid", columns: 2 }
    })

    expect(restored.libraryView.layout).toBe("grid")
    expect(restored.libraryView.columns).toBe(2)
    expect(restored.libraryView.thumbnailQuality).toBe("speed")
  })
})

describe("thumbnail quality", () => {
  const image = {
    previewUrl: "/preview",
    assetUrl: "/asset",
    mimeType: "image/png"
  }

  it("prefers the stored preview for speed and the original for quality", () => {
    expect(referenceImagePath(image, "speed")).toBe("/preview")
    expect(referenceImagePath(image, "quality")).toBe("/asset")
  })

  it("keeps the preview for a file no browser would render directly", () => {
    const video = {
      previewUrl: "/preview",
      assetUrl: "/asset",
      mimeType: "video/mp4"
    }

    expect(referenceImagePath(video, "quality")).toBe("/preview")
  })
})
