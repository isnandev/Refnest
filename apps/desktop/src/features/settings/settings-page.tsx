import {
  SIDEBAR_BACKGROUND_OPACITY_MAX,
  SIDEBAR_BACKGROUND_OPACITY_MIN,
  UpdateDesktopSettings,
  type ThemePreference
} from "@starter/contracts"
import {
  Accessibility,
  Check,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  RotateCcw,
  Settings2,
  Sun
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Theme } from "@/features/theme/use-theme"
import type { AppSettings } from "./use-app-settings"

const THEME_OPTIONS: readonly {
  value: ThemePreference
  label: string
  icon: LucideIcon
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon }
]

function SettingRow({
  icon: Icon,
  title,
  description,
  children,
  separated = false
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
  separated?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${
        separated ? "border-t" : ""
      }`}
    >
      <div className="flex min-w-0 gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xs border bg-surface-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-h3">{title}</h3>
          <p className="mt-1 max-w-[520px] text-body-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-6">{children}</div>
    </div>
  )
}

function SettingToggle({
  checked,
  label,
  onCheckedChange
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Button
      type="button"
      variant="choice"
      size="sm"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="min-w-20"
    >
      {checked && <Check className="text-lime" aria-hidden="true" />}
      {checked ? "On" : "Off"}
    </Button>
  )
}

export function SettingsPage({
  resolvedTheme,
  themePreference,
  settings,
  saveError,
  onThemePreferenceChange,
  onSettingChange,
  onReset
}: {
  resolvedTheme: Theme
  themePreference: ThemePreference
  settings: AppSettings
  saveError: string | null
  onThemePreferenceChange: (preference: ThemePreference) => void
  onSettingChange: (patch: UpdateDesktopSettings) => void
  onReset: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
      <header id="settings" className="scroll-mt-20">
        <div className="flex size-12 items-center justify-center rounded-md border bg-surface">
          <Settings2 className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-h1">Settings</h1>
        <p className="mt-1 max-w-[620px] text-body-md text-muted-foreground">
          Tune the desktop shell. Changes save automatically to Bun SQLite on
          this device.
        </p>
        {saveError !== null ? (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-destructive/30 bg-destructive/8 px-3 py-2 text-body-sm text-destructive"
          >
            {saveError}
          </p>
        ) : null}
      </header>

      <section className="pt-10" aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="text-h2">
          Appearance
        </h2>
        <Card className="mt-3 gap-0 overflow-hidden p-0">
          <SettingRow
            icon={Monitor}
            title="Theme"
            description={`System follows Windows and currently resolves to ${resolvedTheme}. The scrollbar follows the same palette.`}
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="Theme preference">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                const selected = option.value === themePreference

                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="choice"
                    size="sm"
                    aria-pressed={selected}
                    onClick={() => onThemePreferenceChange(option.value)}
                  >
                    {selected ? (
                      <Check className="text-lime" aria-hidden="true" />
                    ) : (
                      <Icon aria-hidden="true" />
                    )}
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </SettingRow>

          <SettingRow
            icon={PanelLeft}
            title="Sidebar background"
            description="Set the translucent sidebar tint from 40% to 80%. Lower values reveal more of the desktop backdrop."
            separated
          >
            <div className="flex min-w-[220px] items-center gap-3">
              <input
                id="sidebar-background-opacity"
                type="range"
                min={SIDEBAR_BACKGROUND_OPACITY_MIN}
                max={SIDEBAR_BACKGROUND_OPACITY_MAX}
                step={1}
                value={settings.sidebarBackgroundOpacity}
                aria-label="Sidebar background opacity"
                aria-valuetext={`${settings.sidebarBackgroundOpacity}% opacity`}
                onChange={(event) =>
                  onSettingChange(
                    new UpdateDesktopSettings({
                      sidebarBackgroundOpacity: Number(
                        event.currentTarget.value
                      )
                    })
                  )
                }
                className="h-8 min-w-0 flex-1 cursor-pointer accent-primary"
              />
              <output
                htmlFor="sidebar-background-opacity"
                className="numeric w-11 text-right text-label"
              >
                {settings.sidebarBackgroundOpacity}%
              </output>
            </div>
          </SettingRow>
        </Card>
      </section>

      <section className="pt-10" aria-labelledby="behavior-title">
        <h2 id="behavior-title" className="text-h2">
          App behavior
        </h2>
        <Card className="mt-3 gap-0 overflow-hidden p-0">
          <SettingRow
            icon={PanelLeftClose}
            title="Auto-collapse sidebar"
            description="Switch to the compact icon rail when the window is narrower than 900px."
          >
            <SettingToggle
              checked={settings.autoCollapseSidebar}
              label="Auto-collapse sidebar"
              onCheckedChange={(checked) =>
                onSettingChange(
                  new UpdateDesktopSettings({ autoCollapseSidebar: checked })
                )
              }
            />
          </SettingRow>

          <SettingRow
            icon={Accessibility}
            title="Reduce motion"
            description="Disable smooth scrolling and shorten interface transitions. Your system preference is always respected."
            separated
          >
            <SettingToggle
              checked={settings.reduceMotion}
              label="Reduce motion"
              onCheckedChange={(checked) =>
                onSettingChange(
                  new UpdateDesktopSettings({ reduceMotion: checked })
                )
              }
            />
          </SettingRow>
        </Card>
      </section>

      <div className="flex justify-end py-10">
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          Restore defaults
        </Button>
      </div>
    </div>
  )
}
