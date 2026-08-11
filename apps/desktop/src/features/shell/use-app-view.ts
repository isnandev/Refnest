import type { AppSection } from "@starter/contracts"
import { useEffect, useRef, useState } from "react"

export type { AppSection } from "@starter/contracts"
export type AppView = "notes" | "settings"
export type NotesSection = Exclude<AppSection, "settings">

export type AppLocation = {
  readonly view: AppView
  readonly activeSection: AppSection
}

export const APP_SECTION_LABELS: Readonly<Record<AppSection, string>> = {
  overview: "Notes",
  "new-note": "Create note",
  runtime: "Runtime",
  output: "Output",
  settings: "Settings"
}

const APP_SECTIONS: readonly AppSection[] = [
  "overview",
  "new-note",
  "runtime",
  "output",
  "settings"
]

const sectionFromHash = (hash: string): AppSection | null => {
  const value = hash.replace(/^#/, "")
  return APP_SECTIONS.find((section) => section === value) ?? null
}

const locationFromSection = (activeSection: AppSection): AppLocation => ({
  view: activeSection === "settings" ? "settings" : "notes",
  activeSection
})

export const getAppLocation = (hash: string): AppLocation =>
  locationFromSection(sectionFromHash(hash) ?? "overview")

/** Hash navigation with a persisted fallback for the last open section. */
export const useAppView = (
  savedSection: AppSection,
  settingsReady: boolean,
  onSectionChange: (section: AppSection) => void
) => {
  const [location, setLocation] = useState<AppLocation>(() =>
    getAppLocation(window.location.hash)
  )
  const restored = useRef(false)
  const onSectionChangeRef = useRef(onSectionChange)

  useEffect(() => {
    onSectionChangeRef.current = onSectionChange
  }, [onSectionChange])

  useEffect(() => {
    const syncLocation = () => {
      const section = sectionFromHash(window.location.hash)
      if (section === null) return

      setLocation(locationFromSection(section))
      onSectionChangeRef.current(section)
    }

    window.addEventListener("hashchange", syncLocation)
    return () => window.removeEventListener("hashchange", syncLocation)
  }, [])

  useEffect(() => {
    if (!settingsReady || restored.current) return
    restored.current = true

    const explicitSection = sectionFromHash(window.location.hash)
    const section = explicitSection ?? savedSection

    if (explicitSection === null) {
      window.history.replaceState(null, "", `#${section}`)
    } else if (explicitSection !== savedSection) {
      onSectionChangeRef.current(explicitSection)
    }

    setLocation(locationFromSection(section))
  }, [savedSection, settingsReady])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const main = document.getElementById("main-content")
      const target =
        location.view === "notes"
          ? document.getElementById(location.activeSection)
          : null

      if (target !== null) {
        target.scrollIntoView({ block: "start" })
      } else {
        main?.scrollTo({ top: 0 })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [location.activeSection, location.view])

  return location
}
