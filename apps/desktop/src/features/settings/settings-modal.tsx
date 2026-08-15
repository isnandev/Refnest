import {
  LOCAL_ENVIRONMENT_ID,
  UpdateAiSettings,
  UpdateDesktopSettings,
  type DesktopSettings,
  type ThemePreference,
  type VideoDownloadResolution
} from "@refnest/contracts"
import {
  Accessibility,
  Bell,
  Cable,
  Check,
  Clapperboard,
  HardDrive,
  Monitor,
  Moon,
  Replace,
  RotateCcw,
  Sparkles,
  Sun,
  Wifi
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/ui/dialog"
import { LibrariesSection } from "@/features/environments/libraries-section"
import { SharingSection } from "@/features/environments/sharing-section"
import type { useEnvironments } from "@/features/environments/use-environments"
import type { useSharing } from "@/features/environments/use-sharing"
import type { Theme } from "@/features/theme/use-theme"
import { cn } from "@/lib/utils"
import { AiSettingsSection } from "./ai-settings-section"
import { McpSettingsSection } from "./mcp-settings-section"
import { SettingRow, SettingToggle } from "./setting-row"
import type { AppSettings } from "./use-app-settings"
import type { AiSettingsState } from "./use-ai-settings"

const THEME_OPTIONS: readonly {
  value: ThemePreference
  label: string
  icon: LucideIcon
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon }
]

const RESOLUTION_OPTIONS: readonly {
  value: VideoDownloadResolution
  label: string
}[] = [
  { value: 720, label: "720p" },
  { value: 1080, label: "1080p" },
  { value: 1440, label: "1440p" },
  { value: 2160, label: "4K" }
]

type SettingsSection =
  | "appearance"
  | "libraries"
  | "network"
  | "imports"
  | "mcp"
  | "ai"

const SECTIONS: readonly {
  id: SettingsSection
  label: string
  icon: LucideIcon
}[] = [
  { id: "appearance", label: "Appearance", icon: Monitor },
  { id: "libraries", label: "Libraries", icon: HardDrive },
  { id: "network", label: "Local network", icon: Wifi },
  { id: "imports", label: "Imports", icon: Replace },
  { id: "mcp", label: "MCP access", icon: Cable },
  { id: "ai", label: "AI provider", icon: Sparkles }
]

/** Device preferences in a sidebar modal so the library stays underneath. */
export function SettingsModal({
  open,
  resolvedTheme,
  themePreference,
  settings,
  saveError,
  environments,
  sharing,
  aiState,
  aiPending,
  aiActionError,
  onOpenChange,
  onThemePreferenceChange,
  onSettingChange,
  onRetryAiSettings,
  onSaveAiSettings,
  onReset
}: {
  readonly open: boolean
  readonly resolvedTheme: Theme
  readonly themePreference: ThemePreference
  readonly settings: AppSettings & Pick<DesktopSettings, "activeEnvironmentId">
  readonly saveError: string | null
  readonly environments: ReturnType<typeof useEnvironments>
  readonly sharing: ReturnType<typeof useSharing>
  readonly aiState: AiSettingsState
  readonly aiPending: boolean
  readonly aiActionError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onThemePreferenceChange: (preference: ThemePreference) => void
  readonly onSettingChange: (patch: UpdateDesktopSettings) => void
  readonly onRetryAiSettings: () => void
  readonly onSaveAiSettings: (patch: UpdateAiSettings) => Promise<boolean>
  readonly onReset: () => void
}) {
  const [section, setSection] = useState<SettingsSection>("appearance")
  const onLocalLibrary = settings.activeEnvironmentId === LOCAL_ENVIRONMENT_ID
  const active = SECTIONS.find((item) => item.id === section) ?? {
    id: "appearance" as const,
    label: "Appearance",
    icon: Monitor
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="h-[min(40rem,calc(100vh-2rem))] max-w-[880px] flex-row overflow-hidden p-0"
      >
        <aside className="flex w-52 shrink-0 flex-col border-r bg-surface-muted">
          <div className="px-4 pb-3 pt-5">
            <DialogTitle className="pr-0 text-h3">Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Appearance, libraries, imports, and integrations for this device.
            </DialogDescription>
          </div>

          <nav aria-label="Settings sections" className="flex flex-col gap-0.5 px-2">
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const selected = item.id === section

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex h-[34px] w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-label transition-colors",
                    selected
                      ? "bg-surface font-medium text-primary"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-auto border-t p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={onReset}
            >
              <RotateCcw aria-hidden="true" />
              Restore defaults
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b px-6 py-4 pr-14">
            <h2 className="text-h2">{active.label}</h2>
            {saveError !== null ? (
              <p
                role="alert"
                className="mt-3 rounded-sm border border-destructive/30 bg-destructive/8 px-3 py-2 text-body-sm text-destructive"
              >
                {saveError}
              </p>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-none px-6 py-5">
            {section === "appearance" ? (
              <Card className="gap-0 overflow-hidden p-0">
                <SettingRow
                  icon={Monitor}
                  title="Theme"
                  description={`System follows Windows and currently resolves to ${resolvedTheme}. The scrollbar follows the same palette.`}
                >
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Theme preference"
                  >
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
                  icon={Bell}
                  title="Desktop notifications"
                  description="Show an OS toast when a capture or import finishes in the background. Clicking the toast brings RefNest forward."
                  separated
                >
                  <SettingToggle
                    checked={settings.desktopNotifications}
                    label="Desktop notifications"
                    onCheckedChange={(checked) =>
                      onSettingChange(
                        new UpdateDesktopSettings({
                          desktopNotifications: checked
                        })
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
            ) : null}

            {section === "libraries" ? (
              <>
                <p className="mb-3 max-w-[620px] text-body-sm text-muted-foreground">
                  Which library this device is browsing. Appearance and window
                  settings always stay on this device.
                </p>
                <LibrariesSection
                  environments={environments}
                  activeEnvironmentId={settings.activeEnvironmentId}
                />
              </>
            ) : null}

            {section === "network" ? (
              <>
                <p className="mb-3 max-w-[620px] text-body-sm text-muted-foreground">
                  Let another device on this network open the library stored here.
                </p>
                <SharingSection sharing={sharing} />
              </>
            ) : null}

            {section === "imports" ? (
              <>
                <p className="mb-3 max-w-[620px] text-body-sm text-muted-foreground">
                  Applies to files imported into the library stored on this device.
                </p>
                <Card className="gap-0 overflow-hidden p-0">
                  <SettingRow
                    icon={Replace}
                    title="Auto-convert imported images"
                    description="Re-encode imported PNG and WebP files to JPEG, which every AI provider reads and which keeps the library smaller. Transparency is flattened onto white and the original file is not kept, so turn this off to import images exactly as they are. Downscaled AI previews are generated either way."
                  >
                    <SettingToggle
                      checked={settings.autoConvertImports}
                      label="Auto-convert imported images"
                      onCheckedChange={(checked) =>
                        onSettingChange(
                          new UpdateDesktopSettings({
                            autoConvertImports: checked
                          })
                        )
                      }
                    />
                  </SettingRow>

                  <SettingRow
                    icon={Clapperboard}
                    title="Default download resolution"
                    description="Preferred height for YouTube and other social video captures. If that quality is not available, the next best stream is saved instead."
                    separated
                  >
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label="Default download resolution"
                    >
                      {RESOLUTION_OPTIONS.map((option) => {
                        const selected =
                          option.value === settings.videoDownloadResolution

                        return (
                          <Button
                            key={option.value}
                            type="button"
                            variant="choice"
                            size="sm"
                            aria-pressed={selected}
                            onClick={() =>
                              onSettingChange(
                                new UpdateDesktopSettings({
                                  videoDownloadResolution: option.value
                                })
                              )
                            }
                          >
                            {selected ? (
                              <Check className="text-lime" aria-hidden="true" />
                            ) : null}
                            {option.label}
                          </Button>
                        )
                      })}
                    </div>
                  </SettingRow>
                </Card>
              </>
            ) : null}

            {section === "mcp" ? (
              <>
                <p className="mb-3 max-w-[620px] text-body-sm text-muted-foreground">
                  Connect an AI assistant directly to RefNest through its local,
                  authenticated MCP server.
                </p>
                <McpSettingsSection />
              </>
            ) : null}

            {section === "ai" ? (
              <>
                <p className="mb-3 max-w-[620px] text-body-sm text-muted-foreground">
                  {onLocalLibrary
                    ? "RefNest talks to any OpenAI-compatible endpoint to write metadata for saved references."
                    : "The provider belongs to the library you are browsing, and is managed on the device that stores it."}
                </p>
                {onLocalLibrary ? (
                  <AiSettingsSection
                    state={aiState}
                    pending={aiPending}
                    actionError={aiActionError}
                    onRetry={onRetryAiSettings}
                    onSave={onSaveAiSettings}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
