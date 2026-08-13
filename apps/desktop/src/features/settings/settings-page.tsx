import {
  LOCAL_ENVIRONMENT_ID,
  UpdateAiSettings,
  UpdateDesktopSettings,
  type DesktopSettings,
  type ThemePreference
} from "@refnest/contracts"
import {
  Accessibility,
  ArrowLeft,
  Check,
  Monitor,
  Moon,
  Replace,
  RotateCcw,
  Settings2,
  Sun
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LibrariesSection } from "@/features/environments/libraries-section"
import { SharingSection } from "@/features/environments/sharing-section"
import type { useEnvironments } from "@/features/environments/use-environments"
import type { useSharing } from "@/features/environments/use-sharing"
import type { Theme } from "@/features/theme/use-theme"
import { TitleBar } from "@/features/window/title-bar"
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

/** The one destination for app-wide preferences and local integrations. */
export function SettingsPage({
  resolvedTheme,
  themePreference,
  settings,
  saveError,
  environments,
  sharing,
  aiState,
  aiPending,
  aiActionError,
  onThemePreferenceChange,
  onSettingChange,
  onRetryAiSettings,
  onSaveAiSettings,
  onReset,
  onClose
}: {
  readonly resolvedTheme: Theme
  readonly themePreference: ThemePreference
  readonly settings: AppSettings & Pick<DesktopSettings, "activeEnvironmentId">
  readonly saveError: string | null
  readonly environments: ReturnType<typeof useEnvironments>
  readonly sharing: ReturnType<typeof useSharing>
  readonly aiState: AiSettingsState
  readonly aiPending: boolean
  readonly aiActionError: string | null
  readonly onThemePreferenceChange: (preference: ThemePreference) => void
  readonly onSettingChange: (patch: UpdateDesktopSettings) => void
  readonly onRetryAiSettings: () => void
  readonly onSaveAiSettings: (patch: UpdateAiSettings) => Promise<boolean>
  readonly onReset: () => void
  readonly onClose: () => void
}) {
  const onLocalLibrary = settings.activeEnvironmentId === LOCAL_ENVIRONMENT_ID

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stage text-foreground">
      <TitleBar
        leading={
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5"
            data-tauri-drag-region
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <ArrowLeft aria-hidden="true" />
              Library
            </Button>
            <p className="min-w-0 truncate px-1 text-label text-muted-foreground">
              <span className="text-foreground">Settings</span>
            </p>
          </div>
        }
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-none bg-stage"
      >
        <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
          <header id="settings" className="scroll-mt-20">
            <div className="flex size-12 items-center justify-center rounded-md border bg-surface">
              <Settings2 className="size-5" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-h1">Settings</h1>
            <p className="mt-1 max-w-[620px] text-body-md text-muted-foreground">
              Manage this device's appearance, local integrations, and AI
              provider.
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

          <section className="pt-10" aria-labelledby="libraries-title">
            <h2 id="libraries-title" className="text-h2">
              Libraries
            </h2>
            <p className="mt-1 max-w-[620px] text-body-sm text-muted-foreground">
              Which library this device is browsing. Appearance and window
              settings always stay on this device.
            </p>
            <LibrariesSection
              environments={environments}
              activeEnvironmentId={settings.activeEnvironmentId}
            />
          </section>

          <section className="pt-10" aria-labelledby="sharing-title">
            <h2 id="sharing-title" className="text-h2">
              Local network
            </h2>
            <p className="mt-1 max-w-[620px] text-body-sm text-muted-foreground">
              Let another device on this network open the library stored here.
            </p>
            <SharingSection sharing={sharing} />
          </section>

          <section className="pt-10" aria-labelledby="imports-title">
            <h2 id="imports-title" className="text-h2">
              Imports
            </h2>
            <p className="mt-1 max-w-[620px] text-body-sm text-muted-foreground">
              Applies to files imported into the library stored on this device.
            </p>
            <Card className="mt-3 gap-0 overflow-hidden p-0">
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
                      new UpdateDesktopSettings({ autoConvertImports: checked })
                    )
                  }
                />
              </SettingRow>
            </Card>
          </section>

          <section className="pt-10" aria-labelledby="mcp-title">
            <h2 id="mcp-title" className="text-h2">
              MCP access
            </h2>
            <p className="mt-1 max-w-[620px] text-body-sm text-muted-foreground">
              Connect an AI assistant directly to RefNest through its local,
              authenticated MCP server.
            </p>
            <McpSettingsSection />
          </section>

          <section className="pt-10" aria-labelledby="ai-provider-title">
            <h2 id="ai-provider-title" className="text-h2">
              AI provider
            </h2>
            <p className="mt-1 max-w-[620px] text-body-sm text-muted-foreground">
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
          </section>

          <div className="flex justify-end py-10">
            <Button type="button" variant="outline" onClick={onReset}>
              <RotateCcw aria-hidden="true" />
              Restore defaults
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
