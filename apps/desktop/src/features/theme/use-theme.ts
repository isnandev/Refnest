import { useCallback, useEffect, useState } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "starter.theme"

const preferredTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY)

  if (stored === "light" || stored === "dark") {
    return stored
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** The design source ships both themes; `data-theme` is the documented switch. */
export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(preferredTheme)

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"))
  }, [])

  return { theme, toggle } as const
}
