import {
  UpdateDesktopSettings,
  type AppSection,
  type ThemePreference,
  type WorkspaceId
} from "@starter/contracts"
import { Moon, Sun } from "lucide-react"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { AppCommandMenu } from "@/features/commands/app-command-menu"
import { NotesPage } from "@/features/notes/notes-page"
import { SettingsPage } from "@/features/settings/settings-page"
import { useAppSettings } from "@/features/settings/use-app-settings"
import { AppBreadcrumb } from "@/features/shell/app-breadcrumb"
import { AppShell } from "@/features/shell/app-shell"
import { useAppView } from "@/features/shell/use-app-view"
import { useTheme } from "@/features/theme/use-theme"
import { TitleBar } from "@/features/window/title-bar"
import { useWindowPersistence } from "@/features/window/use-window-persistence"
import { WorkspaceCreateModal } from "@/features/workspaces/workspace-create-modal"
import { useWorkspaces } from "@/features/workspaces/use-workspaces"

export default function App() {
  const appSettings = useAppSettings()
  const settings = appSettings.settings
  const settingsReady = appSettings.status !== "loading"

  useWindowPersistence(
    settings.windowPlacement,
    settingsReady,
    appSettings.flush
  )

  const persistTheme = useCallback(
    (themePreference: ThemePreference) => {
      appSettings.update(new UpdateDesktopSettings({ themePreference }))
    },
    [appSettings.update]
  )
  const persistSection = useCallback(
    (activeSection: AppSection) => {
      appSettings.update(new UpdateDesktopSettings({ activeSection }))
    },
    [appSettings.update]
  )
  const persistWorkspace = useCallback(
    (selectedWorkspaceId: WorkspaceId) => {
      appSettings.update(new UpdateDesktopSettings({ selectedWorkspaceId }))
    },
    [appSettings.update]
  )
  const persistSidebar = useCallback(
    ({ width, collapsed }: { readonly width: number; readonly collapsed: boolean }) => {
      appSettings.update(
        new UpdateDesktopSettings({
          sidebarWidth: Math.round(width),
          sidebarCollapsed: collapsed
        })
      )
    },
    [appSettings.update]
  )

  const location = useAppView(
    settings.activeSection,
    settingsReady,
    persistSection
  )
  const theme = useTheme(settings.themePreference, persistTheme)
  const workspaces = useWorkspaces(
    settings.selectedWorkspaceId,
    settingsReady,
    persistWorkspace
  )
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)

  const openWorkspaceCreation = useCallback(() => {
    workspaces.clearActionError()
    setWorkspaceModalOpen(true)
  }, [workspaces.clearActionError])

  return (
    <div className="h-screen overflow-hidden bg-transparent">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-full bg-primary px-4 py-2 text-label text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <AppShell
        activeSection={location.activeSection}
        autoCollapseSidebar={settings.autoCollapseSidebar}
        sidebarBackgroundOpacity={settings.sidebarBackgroundOpacity}
        sidebarWidth={settings.sidebarWidth}
        sidebarCollapsed={settings.sidebarCollapsed}
        settingsReady={settingsReady}
        workspaceState={workspaces.state}
        selectedWorkspace={workspaces.selectedWorkspace}
        onSelectWorkspace={workspaces.select}
        onOpenCommandMenu={() => setCommandMenuOpen(true)}
        onCreateWorkspace={openWorkspaceCreation}
        onSidebarPreferencesChange={persistSidebar}
        header={
          <TitleBar leading={<AppBreadcrumb activeSection={location.activeSection} />}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={theme.toggle}
              aria-label={
                theme.theme === "light"
                  ? "Switch to dark theme"
                  : "Switch to light theme"
              }
            >
              {theme.theme === "light" ? (
                <Moon aria-hidden="true" />
              ) : (
                <Sun aria-hidden="true" />
              )}
            </Button>
          </TitleBar>
        }
      >
        {location.view === "settings" ? (
          <SettingsPage
            resolvedTheme={theme.theme}
            themePreference={theme.preference}
            settings={settings}
            saveError={appSettings.saveError}
            onThemePreferenceChange={theme.setPreference}
            onSettingChange={appSettings.update}
            onReset={appSettings.resetPreferences}
          />
        ) : (
          <NotesPage />
        )}
      </AppShell>

      <AppCommandMenu
        open={commandMenuOpen}
        workspaceState={workspaces.state}
        selectedWorkspace={workspaces.selectedWorkspace}
        onOpenChange={setCommandMenuOpen}
        onSelectWorkspace={workspaces.select}
        onCreateWorkspace={openWorkspaceCreation}
      />

      <WorkspaceCreateModal
        open={workspaceModalOpen}
        pending={workspaces.pending}
        actionError={workspaces.actionError}
        onOpenChange={setWorkspaceModalOpen}
        onCreate={workspaces.create}
      />
    </div>
  )
}
