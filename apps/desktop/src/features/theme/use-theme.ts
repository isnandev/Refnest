import type { ThemePreference } from "@starter/contracts"
import { useCallback, useEffect, useState } from "react"

export type Theme = "light" | "dark"
export type { ThemePreference } from "@starter/contracts"

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

/** The design source ships both themes; `data-theme` is the documented switch. */
export const useTheme = (
  preference: ThemePreference,
  onPreferenceChange: (preference: ThemePreference) => void
) => {
  const [system, setSystem] = useState<Theme>(systemTheme)
  const theme = preference === "system" ? system : preference

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const syncSystemTheme = ({ matches }: MediaQueryListEvent | MediaQueryList) => {
      setSystem(matches ? "dark" : "light")
    }

    syncSystemTheme(query)
    query.addEventListener("change", syncSystemTheme)
    return () => query.removeEventListener("change", syncSystemTheme)
  }, [])

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme
  }, [theme])

  const toggle = useCallback(() => {
    onPreferenceChange(theme === "light" ? "dark" : "light")
  }, [onPreferenceChange, theme])

  return { theme, preference, setPreference: onPreferenceChange, toggle } as const
}
